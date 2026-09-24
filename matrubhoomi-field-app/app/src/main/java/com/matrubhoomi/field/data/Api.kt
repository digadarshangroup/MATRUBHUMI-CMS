package com.matrubhoomi.field.data

import android.content.Context
import com.matrubhoomi.field.BuildConfig
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.core.formatMinutes
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

    private val appContext = context.applicationContext
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

    /**
     * @param sessionBound  true for every request made AS a signed-in employee.
     *                      When the server ends that session — expired, or HR
     *                      deactivated them — the whole app is signed out and
     *                      the recording stopped, from whichever request noticed
     *                      first (see core/Session.kt). False only for sign-in,
     *                      where a 401 means "wrong password", not "fired".
     */
    private fun <T> call(request: Request, sessionBound: Boolean = true, parse: (JSONObject) -> T): ApiResult<T> = try {
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
                if (sessionBound) com.matrubhoomi.field.core.Session.endedByServer(appContext, com.matrubhoomi.field.core.Session.reasonFor(body))
                return ApiResult.Unauthorised
            }

            // Moved out of Sales since the last bootstrap: the session is fine,
            // but this handset must stop recording and stop offering field work
            // now, not at the next sign-in.
            if (response.code == 403 && body.contains("NOT_FIELD_STAFF")) {
                com.matrubhoomi.field.core.Session.noLongerFieldStaff(appContext)
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
        // Which app, which build, which handset — so HR can see who has the
        // app and who is on an old version (Employee.appInfo on the server).
        // Nothing here identifies more than the phone's make and model.
        b.header("X-App-Version", BuildConfig.VERSION_NAME)
        b.header("X-App-Build", BuildConfig.VERSION_CODE.toString())
        b.header("X-Device", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".take(80))
        b.header("X-OS", "Android ${android.os.Build.VERSION.RELEASE}")
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

        return call(post("/api/employee/auth/login", body), sessionBound = false) { root ->
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
            prefs.mustChangePassword = data.optBoolean("mustChangePassword")
        }
    }

    /**
     * The newest release HR has published for THIS app (the old Expo app's
     * releases are a different `app`). Public on the server, and not
     * session-bound: a refusal here must never sign anybody out.
     */
    fun latestRelease(): ApiResult<AppRelease?> =
        call(get("/api/hr/app/latest?app=employee"), sessionBound = false) { root ->
            root.optJSONObject("data")?.let { AppRelease.from(it) }
        }

    /* ── The working set ──────────────────────────────────────────── */

    fun bootstrap(): ApiResult<Bootstrap> = call(get("/api/field/bootstrap")) { root ->
        // Kept verbatim so the app opens on the last known truth after a cold
        // start with no signal — see Repository.cachedBootstrap().
        prefs.lastBootstrapJson = root.toString()
        Bootstrap.from(root).also { b ->
            // The role, as the server decided it. Recording is allowed only for
            // field staff AND while the server's switch is on — an accountant's
            // phone gets `false` here and no location service can start.
            prefs.isFieldStaff = b.capabilities.field
            prefs.trackingEnabled = b.capabilities.tracking && b.trackingEnabled
            if (!prefs.trackingEnabled && prefs.onDuty) {
                com.matrubhoomi.field.location.Tracking.stopDuty(
                    appContext,
                    reason = com.matrubhoomi.field.location.Tracking.StopReason.RoleChanged,
                )
            }
            prefs.heartbeatSeconds = b.heartbeatSeconds
            prefs.pingIntervalSeconds = b.pingIntervalSeconds
            prefs.idleIntervalSeconds = b.idleIntervalSeconds
            prefs.minDistanceMeters = b.minDistanceMeters
            prefs.batchSize = b.batchSize
            prefs.uploadEverySeconds = b.uploadEverySeconds
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
                if (it.has("heartbeatSeconds")) prefs.heartbeatSeconds = it.optInt("heartbeatSeconds")
                if (it.has("batchIntervalSeconds")) prefs.uploadEverySeconds = it.optInt("batchIntervalSeconds")
            }
            // The office's reading of where they are, for the notification —
            // the same words the desk's board shows.
            root.optJSONObject("now")?.let {
                prefs.nowLine = nowLineOf(it)
                it.optDoubleOrNull("distanceKm")?.let { km ->
                    prefs.serverDayKm = "${java.time.LocalDate.now()}|$km"
                }
            }
            root.optJSONObject("data")?.optInt("accepted") ?: 0
        }
    }

    /** "At Kalmeshwar · 25 min" / "Moving · 28 km/h" / "" — from a `now` block. */
    private fun nowLineOf(now: JSONObject): String {
        // The village first — "At Kalmeshwar" — and the road only when the
        // village is not known.
        val place = now.optString("locality").ifBlank { now.optString("place") }
        return when (now.optString("state")) {
            "stopped" -> {
                val mins = if (now.isNull("minutes")) null else now.optInt("minutes")
                listOfNotNull(
                    if (place.isNotBlank()) "At $place" else "Stopped",
                    mins?.let { formatMinutes(it) },
                ).joinToString(" · ")
            }
            "moving" -> {
                val kmh = now.optDoubleOrNull("speedKmh")
                listOfNotNull(
                    "Moving",
                    kmh?.takeIf { it >= 1 }?.let { "${it.toInt()} km/h" },
                    place.takeIf { it.isNotBlank() }?.let { "near $it" },
                ).joinToString(" · ")
            }
            else -> ""
        }
    }

    /* ── Duty ─────────────────────────────────────────────────────── */

    /**
     * Duty switched on/off, from the outbox. The answer for an "off" says what
     * happened to the day's field attendance — filed for the manager, or why
     * not — and is kept for the home screen to say.
     */
    fun sendDutyEvents(events: JSONArray): ApiResult<Unit> =
        call(post("/api/field/duty", JSONObject().put("events", events))) { root ->
            val att = root.optJSONObject("data")?.optJSONArray("attendance")
            if (att != null && att.length() > 0) {
                val last = att.optJSONObject(att.length() - 1)
                prefs.attendanceNote = attendanceNoteOf(last)
            }
        }

    private fun attendanceNoteOf(o: JSONObject?): String {
        if (o == null) return ""
        val day = o.optString("day")
        return when (o.optString("status")) {
            "filed" -> "$day|Today's field attendance was sent to your manager to confirm."
            "updated" -> "$day|Your field attendance was updated to cover the later duty."
            else -> when (o.optString("reason")) {
                "already_present" -> "$day|The fingerprint machine already marked you present."
                "no_manager" -> "$day|No manager is set for you, so field attendance could not be sent. Ask HR."
                "too_short" -> "$day|That duty was under ${o.optInt("minMinutes", 30)} minutes, so it was not sent as a field day. Keep duty on from when you set off until you finish."
                "already_requested" -> "$day|A correction for today is already with your manager."
                "already_decided" -> "$day|Today's field attendance was already decided."
                else -> ""
            }
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
            // A placeholder is "nothing yet", not a record — see hasRecord.
            root.optJSONObject("data")?.let { AttendanceDay.from(it) }?.takeIf { it.hasRecord }
        }

    fun attendanceMonth(year: Int, month: Int): ApiResult<AttendanceMonth> =
        call(get("/api/employee/attendance/monthly?year=$year&month=${month.toString().padStart(2, '0')}")) {
            AttendanceMonth.from(it)
        }

    fun leaveBalance(): ApiResult<LeaveBalance> =
        call(get("/api/employee/leave-applications/balance")) { LeaveBalance.from(it) }

    fun leaveBook(): ApiResult<LeaveBook> =
        call(get("/api/employee/leave-applications/balance")) { LeaveBook.from(it) }

    fun leaveApplications(): ApiResult<List<LeaveApplication>> =
        call(get("/api/employee/leave-applications")) { root ->
            root.optJSONArray("data").mapObjects { LeaveApplication.from(it) }
        }

    fun myLeaves(): ApiResult<List<LeaveItem>> =
        call(get("/api/employee/leave-applications")) { root ->
            root.optJSONArray("data").mapObjects { LeaveItem.from(it) }
        }

    /**
     * Apply for leave. The server is the authority on every rule — balances,
     * waiting periods, monthly caps — and its refusal comes back verbatim.
     */
    fun applyLeave(
        leaveType: String,
        fromDate: String,
        toDate: String,
        reason: String,
        isHalfDay: Boolean,
        halfDaySlot: String? = null,
    ): ApiResult<String> {
        // The PHONE's date, not UTC's: an application made at 8pm in India is
        // still today's, and UTC would call it tomorrow's morning of yesterday.
        val today = java.time.LocalDate.now().toString()
        val body = JSONObject()
            .put("leaveType", leaveType)
            .put("applicationDate", today)
            .put("fromDate", fromDate)
            .put("toDate", if (isHalfDay) fromDate else toDate)
            .put("reason", reason)
            .put("isHalfDay", isHalfDay)
        if (isHalfDay) body.put("halfDaySlot", halfDaySlot ?: "first_half")
        if (leaveType == "LOP") body.put("paidDays", 0)
        return call(post("/api/employee/leave-applications", body)) { root ->
            root.optString("message")
        }
    }

    /** Leave for today or tomorrow in one tap — the manager decides CL, SL or unpaid. */
    fun quickLeave(target: String, halfDay: Boolean, halfDaySlot: String, reason: String): ApiResult<String> {
        val body = JSONObject()
            .put("targetDate", target)
            .put("isHalfDay", halfDay)
            .put("reason", reason)
        if (halfDay) body.put("halfDaySlot", halfDaySlot)
        return call(post("/api/employee/leave-applications/quick-apply", body)) { it.optString("message") }
    }

    /** Pending → cancelled; approved → a withdrawal request for the manager. */
    /** A medical certificate for a sick leave that asked for one — a photograph or a PDF. */
    fun uploadLeaveDocument(id: String, file: File, mime: String): ApiResult<String> {
        val form = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("document", file.name, file.asRequestBody(mime.toMediaType()))
            .build()
        return call(builder("/api/employee/leave-applications/$id/upload-document").post(form).build()) {
            it.optString("message")
        }
    }

    fun cancelLeave(id: String, reason: String): ApiResult<String> =
        call(patch("/api/employee/leave-applications/$id/cancel", JSONObject().put("cancelReason", reason))) {
            it.optString("message")
        }

    fun holidays(year: Int): ApiResult<List<Holiday>> =
        call(get("/api/employee/leave-applications/holidays?year=$year")) { root ->
            root.optJSONArray("data").mapObjects { Holiday.from(it) }.sortedBy { it.date }
        }

    /* ── Attendance corrections ───────────────────────────────────── */

    fun myRegularizations(): ApiResult<List<Regularization>> =
        call(get("/api/employee/regularizations")) { root ->
            root.optJSONArray("data").mapObjects { Regularization.from(it) }
        }

    fun requestRegularization(
        dateStr: String,
        type: String,
        reason: String,
        inTime: String?,
        outTime: String?,
        requestedStatus: String?,
    ): ApiResult<Unit> {
        val body = JSONObject().put("dateStr", dateStr).put("type", type).put("reason", reason)
        inTime?.takeIf { it.isNotBlank() }?.let { body.put("inTime", it) }
        outTime?.takeIf { it.isNotBlank() }?.let { body.put("outTime", it) }
        requestedStatus?.takeIf { it.isNotBlank() }?.let { body.put("requestedStatus", it) }
        return call(post("/api/employee/regularizations", body)) { }
    }

    fun cancelRegularization(id: String): ApiResult<Unit> =
        call(patch("/api/employee/regularizations/$id/cancel", JSONObject())) { }

    /* ── Overtime ─────────────────────────────────────────────────── */

    fun overtimeDue(): ApiResult<List<OvertimeDue>> =
        call(get("/api/employee/overtime/check")) { root ->
            root.optJSONArray("data").mapObjects { OvertimeDue.from(it) }
        }

    fun myOvertime(): ApiResult<List<OvertimeReport>> =
        call(get("/api/employee/overtime/my")) { root ->
            root.optJSONArray("data").mapObjects { OvertimeReport.from(it) }
        }

    /** Multipart, because the report may carry a photograph of the proof. */
    fun submitOvertime(dateStr: String, description: String, proof: File?, mime: String = "image/jpeg"): ApiResult<String> {
        val form = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("dateStr", dateStr)
            .addFormDataPart("description", description)
            .apply {
                proof?.let { addFormDataPart("document", it.name, it.asRequestBody(mime.toMediaType())) }
            }
            .build()
        return call(builder("/api/employee/overtime/submit").post(form).build()) { it.optString("message") }
    }

    /* ── Pay and papers ───────────────────────────────────────────── */

    fun payslips(): ApiResult<List<PayslipItem>> =
        call(get("/api/employee/payslip/${prefs.employeeId}/history")) { root ->
            root.optJSONArray("data").mapObjects { PayslipItem.from(it) }
        }

    /**
     * Download one payslip PDF into the app's cache, where the viewer can
     * open it through the FileProvider. A payslip is private — it is never
     * written anywhere another app can read it without being handed it.
     */
    fun downloadPayslip(month: Int, year: Int, into: File): ApiResult<File> =
        download("/api/employee/payslip/${prefs.employeeId}/pdf?month=$month&year=$year", into)

    fun documents(): ApiResult<List<DocumentItem>> =
        call(get("/api/employee/documents")) { root ->
            root.optJSONArray("data").mapObjects { DocumentItem.from(it) }
        }

    fun documentTypes(): ApiResult<List<Pair<String, String>>> =
        call(get("/api/employee/documents/types")) { root ->
            root.optJSONArray("data").mapObjects { it.optString("value") to it.optString("label") }
        }

    fun requestDocument(type: String, otherLabel: String, reason: String): ApiResult<Unit> =
        call(
            post(
                "/api/employee/documents/requests",
                JSONObject().put("type", type).put("otherTypeLabel", otherLabel).put("reason", reason),
            ),
        ) { }

    /** A short-lived signed link, fetched at the moment of opening so access is re-checked each time. */
    fun documentLink(id: String): ApiResult<String> =
        call(get("/api/employee/documents/$id/file")) { root ->
            root.optJSONObject("data")?.optString("fileUrl").orEmpty()
        }

    fun cancelDocument(id: String): ApiResult<Unit> =
        call(patch("/api/employee/documents/$id/cancel", JSONObject().put("reason", ""))) { }

    /* ── Standings ────────────────────────────────────────────────── */

    fun standings(period: String): ApiResult<StandingsBoard> =
        call(get("/api/employee/leaderboard?period=$period")) { StandingsBoard.from(it) }

    /* ── Me ───────────────────────────────────────────────────────── */

    fun contactDetails(): ApiResult<ContactDetails> =
        call(get("/api/employee/profile/edit")) { ContactDetails.from(it) }

    /** Only the fields the server lets an employee change about themselves. */
    fun updateContact(alternatePhone: String, personalEmail: String, bloodGroup: String,
                      street: String, city: String, state: String, pincode: String): ApiResult<Unit> {
        val body = JSONObject()
            .put("alternatePhone", alternatePhone)
            .put("personalEmail", personalEmail)
            .put("bloodGroup", bloodGroup)
            .put(
                "address",
                JSONObject().put(
                    "current",
                    JSONObject().put("street", street).put("city", city).put("state", state).put("pincode", pincode),
                ),
            )
        return call(builder("/api/employee/profile").put(body.toString().toRequestBody(json)).build()) { }
    }

    fun changePassword(current: String, next: String): ApiResult<Unit> =
        call(
            builder("/api/employee/change-password")
                .put(JSONObject().put("currentPassword", current).put("newPassword", next).toString().toRequestBody(json))
                .build(),
        ) { }

    /* ── The inbox ────────────────────────────────────────────────── */

    fun inbox(limit: Int = 40, since: String? = null): ApiResult<Inbox> {
        val q = buildString {
            append("/api/employee/notifications?limit=$limit")
            if (!since.isNullOrBlank()) append("&since=").append(java.net.URLEncoder.encode(since, "UTF-8"))
        }
        return call(get(q)) { root ->
            Inbox(root.optJSONArray("data").mapObjects { InboxItem.from(it) }, root.optInt("unread"))
        }
    }

    fun markInboxRead(ids: List<String>? = null): ApiResult<Unit> {
        val body = if (ids == null) JSONObject().put("all", true) else JSONObject().put("ids", JSONArray(ids))
        return call(post("/api/employee/notifications/read", body)) { }
    }

    /* ── A manager's queues ───────────────────────────────────────── */
    //
    // The same endpoints for everybody with people reporting to them. With one
    // reporting manager every decision here is FINAL — there is no second
    // approver after them.

    fun approvalsSummary(): ApiResult<ApprovalsSummary> =
        call(get("/api/employee/approvals/summary")) { ApprovalsSummary.from(it.optJSONObject("data")) }

    fun teamLeaves(): ApiResult<List<LeaveItem>> =
        call(get("/api/employee/leave-applications/manager/pending")) { root ->
            root.optJSONArray("data").mapObjects { LeaveItem.from(it) }
        }

    fun teamWithdrawals(): ApiResult<List<LeaveItem>> =
        call(get("/api/employee/leave-applications/manager/withdraw-pending")) { root ->
            root.optJSONArray("data").mapObjects { LeaveItem.from(it) }
        }

    fun approveLeave(id: String, remarks: String): ApiResult<String> =
        call(patch("/api/employee/leave-applications/manager/$id/approve", JSONObject().put("remarks", remarks))) {
            it.optString("message")
        }

    fun rejectLeave(id: String, remarks: String): ApiResult<String> =
        call(patch("/api/employee/leave-applications/manager/$id/reject", JSONObject().put("remarks", remarks))) {
            it.optString("message")
        }

    /** A quick leave is classified, not just approved: CL, SL or LOP. */
    fun classifyQuickLeave(id: String, type: String, forceLopReason: String?): ApiResult<String> {
        val body = JSONObject().put("resolvedType", type)
        forceLopReason?.takeIf { it.isNotBlank() }?.let { body.put("forceLOPReason", it) }
        return call(patch("/api/employee/leave-applications/quick-apply/$id/resolve", body)) { it.optString("message") }
    }

    fun approveWithdrawal(id: String): ApiResult<String> =
        call(patch("/api/employee/leave-applications/manager/$id/approve-withdraw", JSONObject())) { it.optString("message") }

    fun rejectWithdrawal(id: String, remarks: String): ApiResult<String> =
        call(patch("/api/employee/leave-applications/manager/$id/reject-withdraw", JSONObject().put("remarks", remarks))) {
            it.optString("message")
        }

    fun teamRegularizations(): ApiResult<List<Regularization>> =
        call(get("/api/employee/regularizations/manager/pending")) { root ->
            root.optJSONArray("data").mapObjects { Regularization.from(it) }
        }

    fun approveRegularization(id: String, remarks: String): ApiResult<String> =
        call(patch("/api/employee/regularizations/manager/$id/approve", JSONObject().put("remarks", remarks))) {
            it.optString("message")
        }

    /** NB the field is `rejectionReason` here, `remarks` on leave and overtime. */
    fun rejectRegularization(id: String, reason: String): ApiResult<String> =
        call(patch("/api/employee/regularizations/manager/$id/reject", JSONObject().put("rejectionReason", reason))) {
            it.optString("message")
        }

    fun teamOvertime(): ApiResult<List<OvertimeReport>> =
        call(get("/api/employee/overtime/manager/pending")) { root ->
            root.optJSONArray("data").mapObjects { OvertimeReport.from(it) }
        }

    fun approveOvertime(id: String, remarks: String): ApiResult<String> =
        call(patch("/api/employee/overtime/manager/$id/approve", JSONObject().put("remarks", remarks))) {
            it.optString("message")
        }

    fun rejectOvertime(id: String, remarks: String): ApiResult<String> =
        call(patch("/api/employee/overtime/manager/$id/reject", JSONObject().put("remarks", remarks))) {
            it.optString("message")
        }

    /* ── Plumbing ─────────────────────────────────────────────────── */

    private fun patch(path: String, body: JSONObject) =
        builder(path).patch(body.toString().toRequestBody(json)).build()

    /**
     * Fetch a file with the session attached. A JSON body instead of the file
     * is the server refusing — its message comes back as a Failed.
     */
    private fun download(path: String, into: File): ApiResult<File> = try {
        client.newCall(builder(path).get().build()).execute().use { response ->
            val type = response.header("Content-Type").orEmpty()
            if (response.code == 401 || (response.code == 403 && !type.contains("pdf"))) {
                val body = response.body?.string().orEmpty()
                if (response.code == 401 || body.contains("EMPLOYEE_INACTIVE")) {
                    com.matrubhoomi.field.core.Session.endedByServer(appContext, com.matrubhoomi.field.core.Session.reasonFor(body))
                    return ApiResult.Unauthorised
                }
                val message = runCatching { JSONObject(body).optString("message") }.getOrNull().orEmpty()
                return ApiResult.Failed(response.code, message.ifBlank { "Not available" }, true)
            }
            if (!response.isSuccessful || type.contains("json")) {
                val body = response.body?.string().orEmpty()
                val message = runCatching { JSONObject(body).optString("message") }.getOrNull().orEmpty()
                return ApiResult.Failed(
                    response.code,
                    message.ifBlank { "The server said ${response.code}" },
                    response.code in 400..499,
                )
            }
            into.parentFile?.mkdirs()
            response.body?.byteStream()?.use { input -> into.outputStream().use { input.copyTo(it) } }
            ApiResult.Ok(into)
        }
    } catch (e: IOException) {
        ApiResult.Offline(e)
    }

    companion object {
        @Volatile private var instance: Api? = null
        fun get(context: Context): Api =
            instance ?: synchronized(this) {
                instance ?: Api(context.applicationContext).also { instance = it }
            }
    }
}
