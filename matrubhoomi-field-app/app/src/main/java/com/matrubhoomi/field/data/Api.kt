package com.matrubhoomi.field.data

import android.content.Context
import com.matrubhoomi.field.BuildConfig
import com.matrubhoomi.field.core.Prefs
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * The one place this app talks to the server.
 *
 * TIMEOUTS ARE LONG ON PURPOSE
 * ----------------------------
 * Sixty seconds, not the usual ten. A village edge on 2G takes that long to
 * push a compressed photograph, and a client that gives up at ten seconds
 * turns a slow upload into a failed one — which the queue then retries, from
 * the beginning, over the same slow link. Being patient is cheaper than
 * retrying.
 *
 * FAILURES ARE TYPED, BECAUSE THE QUEUE HAS TO DECIDE
 * ---------------------------------------------------
 * A network failure means "hold this and try later". A 4xx means "this will
 * never succeed — stop retrying and tell somebody". A 401 means "the session
 * died, sign in again". Collapsing all three into one exception is what
 * produces a queue that retries a malformed record forever.
 */
sealed class ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>()

    /** No route to the server. Keep the work and try again later. */
    data class Offline(val cause: IOException) : ApiResult<Nothing>()

    /** The server answered, and said no. `permanent` means do not retry. */
    data class Failed(val status: Int, val message: String, val permanent: Boolean) : ApiResult<Nothing>()

    /** The session is gone. Everything stops until somebody signs in. */
    object Unauthorised : ApiResult<Nothing>()
}

class Api(context: Context) {

    private val prefs = Prefs.get(context)
    /**
     * Resolved on EVERY request, not cached in a field.
     *
     * The address can change while the app is running — somebody fixes a typo
     * on the sign-in screen — and a base URL captured once at construction
     * would keep the old one until the process restarted, which looks exactly
     * like "the fix did not work".
     */
    private val base: String
        get() = (prefs.serverUrl ?: BuildConfig.API_URL).trimEnd('/')

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val json = "application/json; charset=utf-8".toMediaType()

    /* ── The one request path ─────────────────────────────────────── */

    private fun <T> call(request: Request, parse: (JSONObject) -> T): ApiResult<T> = try {
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()

            // WHAT COUNTS AS "the session is over".
            //
            // A 401 obviously. But also the two answers that mean the token is
            // valid and the IDENTITY behind it is gone: an employee record that
            // no longer exists, and one that has been deactivated. Treated as
            // ordinary failures, those left the app showing the same error on
            // every screen forever, with no way out except clearing the app's
            // data — because every route needs the identity the token names.
            //
            // Reported as Unauthorised, the app signs out and offers the one
            // thing that can actually fix it: signing in again.
            val identityGone =
                (response.code == 404 && body.contains("EMPLOYEE_NOT_FOUND")) ||
                    (response.code == 403 && body.contains("EMPLOYEE_INACTIVE")) ||
                    (response.code == 403 && body.contains("INTERN_NO_APP_ACCESS"))

            if (response.code == 401 || identityGone || (response.code == 403 && body.contains("token", true))) {
                return ApiResult.Unauthorised
            }

            val root = if (body.isBlank()) JSONObject() else runCatching { JSONObject(body) }.getOrElse { JSONObject() }

            if (!response.isSuccessful || !root.optBoolean("success", response.isSuccessful)) {
                val message = root.optString("message").ifBlank { "The server said ${response.code}" }
                // 4xx is the caller's fault and will be the caller's fault
                // forever; 5xx and 502/504 are worth another go later.
                val permanent = response.code in 400..499 && response.code != 408 && response.code != 429
                return ApiResult.Failed(response.code, message, permanent)
            }

            ApiResult.Ok(parse(root))
        }
    } catch (e: IOException) {
        ApiResult.Offline(e)
    }

    private fun builder(path: String): Request.Builder {
        val b = Request.Builder().url("$base$path")
        prefs.token?.let { b.header("Authorization", "Bearer $it") }
        return b
    }

    private fun get(path: String) = builder(path).get().build()
    private fun post(path: String, body: JSONObject) =
        builder(path).post(body.toString().toRequestBody(json)).build()

    /* ── Sign in ──────────────────────────────────────────────────── */

    /**
     * Uses the EMPLOYEE login the portal app already has, not a sales-specific
     * one. There is one workforce and one set of credentials; a second login
     * for the same people would be a second password to forget.
     *
     * The field is `phoneNumber` and it must be TEN DIGITS — that endpoint
     * looks an employee up by phone and rejects anything else before it reaches
     * the password. An email address here is not a slower path, it is a 400.
     */
    fun login(phoneNumber: String, password: String): ApiResult<Unit> {
        val digits = phoneNumber.filter(Char::isDigit).takeLast(10)
        val body = JSONObject()
            .put("phoneNumber", digits)
            .put("password", password)
            // A field handset is one person's, carried daily. Signing them out
            // every seventh day in a village with no signal to sign back in
            // with is the failure this avoids.
            .put("rememberMe", true)

        return call(post("/api/employee/auth/login", body)) { root ->
            val data = root.optJSONObject("data") ?: root
            val token = data.optString("token").ifBlank { root.optString("token") }
            val employee = data.optJSONObject("employee") ?: data.optJSONObject("user") ?: JSONObject()

            prefs.token = token
            prefs.employeeId = employee.optString("_id").ifBlank { employee.optString("id") }
            prefs.employeeName = listOfNotNull(
                employee.optString("firstName").ifBlank { null },
                employee.optString("lastName").ifBlank { null },
            ).joinToString(" ").ifBlank { employee.optString("name") }
            prefs.employeeCode = employee.optString("biometricId")
        }
    }

    /* ── The working set ──────────────────────────────────────────── */

    fun bootstrap(): ApiResult<Bootstrap> = call(get("/api/field/bootstrap")) { root ->
        // Kept verbatim so the app opens on the last known truth after a cold
        // start with no signal — see Repository.cachedBootstrap().
        prefs.lastBootstrapJson = root.toString()
        Bootstrap.from(root).also { b ->
            prefs.trackingEnabled = b.trackingEnabled
            prefs.pingIntervalSeconds = b.pingIntervalSeconds
            prefs.idleIntervalSeconds = b.idleIntervalSeconds
            prefs.minDistanceMeters = b.minDistanceMeters
            prefs.batchSize = b.batchSize
            if (b.employeeName.isNotBlank()) prefs.employeeName = b.employeeName
            if (b.employeeCode.isNotBlank()) prefs.employeeCode = b.employeeCode
            if (b.employeeId.isNotBlank()) prefs.employeeId = b.employeeId
        }
    }

    fun tasks(scope: String = "open"): ApiResult<List<FieldTask>> =
        call(get("/api/field/tasks?scope=$scope")) { root ->
            root.optJSONArray("data").mapObjects { FieldTask.from(it) }
        }

    fun acceptTask(taskId: String): ApiResult<Unit> =
        call(post("/api/field/tasks/$taskId/accept", JSONObject())) { }

    /* ── Leads ────────────────────────────────────────────────────── */

    fun leads(query: String = "", mineOnly: Boolean = true): ApiResult<List<LeadSummary>> {
        val q = buildString {
            append("/api/field/leads?limit=100")
            if (query.isNotBlank()) append("&q=").append(java.net.URLEncoder.encode(query, "UTF-8"))
            if (!mineOnly) append("&all=true")
        }
        return call(get(q)) { root -> root.optJSONArray("data").mapObjects { LeadSummary.from(it) } }
    }

    /** The duplicate check, run as the employee types a phone number. */
    fun lookupPhone(phone: String): ApiResult<LeadSummary?> =
        call(get("/api/field/leads/lookup/$phone")) { root ->
            if (!root.optBoolean("found")) null
            else root.optJSONObject("data")?.let {
                LeadSummary(
                    id = it.optString("id"),
                    code = it.optString("code"),
                    name = it.optString("name"),
                    phone = it.optString("phone"),
                    stageKey = it.optString("stageKey"),
                    status = it.optString("status"),
                    village = "",
                    isCustomer = it.optBoolean("isCustomer"),
                )
            }
        }

    fun createLead(payload: JSONObject): ApiResult<String> =
        call(post("/api/field/leads", payload)) { root ->
            root.optJSONObject("data")?.optString("_id").orEmpty()
        }

    /* ── OTP ──────────────────────────────────────────────────────── */

    fun sendOtp(phone: String, leadId: String?, taskId: String?): ApiResult<JSONObject> {
        val body = JSONObject().put("phone", phone)
        leadId?.let { body.put("leadId", it) }
        taskId?.let { body.put("taskId", it) }
        return call(post("/api/field/otp/send", body)) { it.optJSONObject("data") ?: JSONObject() }
    }

    fun verifyOtp(otpId: String, phone: String, code: String, leadId: String?): ApiResult<Unit> {
        val body = JSONObject().put("otpId", otpId).put("phone", phone).put("code", code)
        leadId?.let { body.put("leadId", it) }
        return call(post("/api/field/otp/verify", body)) { }
    }

    /* ── Photographs ──────────────────────────────────────────────── */

    /**
     * Uploaded BEFORE the submission that references them.
     *
     * A form with four photos on a bad line becomes four small independent
     * attempts rather than one large all-or-nothing one — and a photo that got
     * through stays through, even if the next one fails and the employee walks
     * to higher ground before finishing.
     */
    fun uploadPhoto(file: File, fieldKey: String, lat: Double?, lng: Double?): ApiResult<UploadedPhoto> {
        val part = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("photos", file.name, file.asRequestBody("image/jpeg".toMediaType()))
            .addFormDataPart("fieldKey", fieldKey)
            .apply {
                lat?.let { addFormDataPart("lat", it.toString()) }
                lng?.let { addFormDataPart("lng", it.toString()) }
            }
            .build()

        return call(builder("/api/field/uploads").post(part).build()) { root ->
            val first = root.optJSONArray("data")?.optJSONObject(0) ?: JSONObject()
            UploadedPhoto.from(first)
        }
    }

    /* ── The record itself ────────────────────────────────────────── */

    fun submit(payload: JSONObject): ApiResult<JSONObject> =
        call(post("/api/field/submissions", payload)) { it.optJSONObject("data") ?: JSONObject() }

    /* ── Location ─────────────────────────────────────────────────── */

    fun sendPings(pings: JSONArray, batchId: String): ApiResult<Int> {
        val body = JSONObject().put("pings", pings).put("batchId", batchId)
        return call(post("/api/field/location/batch", body)) { root ->
            // The server echoes the cadence back, so a retune reaches a handset
            // that is out all day without it ever calling /bootstrap again.
            root.optJSONObject("tracking")?.let {
                prefs.pingIntervalSeconds = it.optInt("intervalSeconds", prefs.pingIntervalSeconds)
                prefs.idleIntervalSeconds = it.optInt("idleIntervalSeconds", prefs.idleIntervalSeconds)
            }
            root.optJSONObject("data")?.optInt("accepted") ?: 0
        }
    }

    fun myDay(): ApiResult<MyDay> =
        call(get("/api/field/me/day")) { MyDay.from(it.optJSONObject("data")) }

    fun leadDetail(id: String): ApiResult<LeadDetail?> =
        call(get("/api/field/leads/$id")) { LeadDetail.from(it) }

    /* ── HR: attendance and leave ─────────────────────────────────── */
    //
    // The EMPLOYEE portal's endpoints, not the sales module's. Same rolls, same
    // records — see the note in Models.kt.

    fun attendanceToday(): ApiResult<AttendanceDay?> =
        call(get("/api/employee/attendance/today")) { root ->
            root.optJSONObject("data")?.let { AttendanceDay.from(it) }
        }

    fun attendanceMonth(year: Int, month: Int): ApiResult<AttendanceMonth> =
        call(get("/api/employee/attendance/monthly?year=$year&month=${month.toString().padStart(2, '0')}")) {
            AttendanceMonth.from(it)
        }

    fun leaveBalance(): ApiResult<LeaveBalance> =
        call(get("/api/employee/leave-applications/balance")) { LeaveBalance.from(it) }

    fun leaveApplications(): ApiResult<List<LeaveApplication>> =
        call(get("/api/employee/leave-applications")) { root ->
            root.optJSONArray("data").mapObjects { LeaveApplication.from(it) }
        }

    fun applyLeave(
        leaveType: String,
        fromDate: String,
        toDate: String,
        reason: String,
        isHalfDay: Boolean,
    ): ApiResult<Unit> {
        val today = FieldDb.isoUtc(System.currentTimeMillis()).take(10)
        val body = JSONObject()
            .put("leaveType", leaveType)
            .put("applicationDate", today)
            .put("fromDate", fromDate)
            .put("toDate", toDate)
            .put("reason", reason)
            .put("isHalfDay", isHalfDay)
        return call(post("/api/employee/leave-applications", body)) { }
    }

    companion object {
        @Volatile private var instance: Api? = null
        fun get(context: Context): Api =
            instance ?: synchronized(this) {
                instance ?: Api(context.applicationContext).also { instance = it }
            }
    }
}
