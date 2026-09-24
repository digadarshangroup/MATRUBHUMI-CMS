package com.matrubhoomi.field.data

import android.content.Context
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.sync.SyncScheduler
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * What the screens talk to. Nothing above this line knows the network exists.
 *
 * THE RULE THIS FILE ENFORCES
 * ---------------------------
 * A record the employee has finished is COMMITTED LOCALLY before the function
 * returns, and delivered afterwards by a worker. So "Saved" on screen means
 * saved — on this handset, surviving a dead battery and a killed process — and
 * never "we started a request and hope". FieldDb's header sets out why that
 * distinction is the difference between a working field app and one that
 * quietly loses an afternoon.
 */
class Repository(private val context: Context) {

    private val api = Api.get(context)
    private val db = FieldDb.get(context)
    private val prefs = Prefs.get(context)

    /* ── Reading ──────────────────────────────────────────────────── */

    fun bootstrap(): ApiResult<Bootstrap> {
        val fresh = api.bootstrap()
        // A cold start on a village road must still open on the last known
        // truth rather than an error page. It is stale by definition, and the
        // home screen says when it was last refreshed.
        if (fresh is ApiResult.Offline) {
            cachedBootstrap()?.let { return ApiResult.Ok(it) }
        }
        return fresh
    }

    fun cachedBootstrap(): Bootstrap? =
        prefs.lastBootstrapJson?.let { runCatching { Bootstrap.from(JSONObject(it)) }.getOrNull() }

    fun templateFor(task: FieldTask, bootstrap: Bootstrap?): FormTemplate? {
        val boot = bootstrap ?: cachedBootstrap()
        val templates = boot?.templates ?: return null
        task.templateId?.let { id -> templates.firstOrNull { it.id == id }?.let { return it } }
        // A New Customer task with no form of its own uses THE registration
        // form — the one the desk configured under Configuration → New customer.
        // It belongs to no stage, so the fallback below would never find it.
        if (task.isQuota) {
            boot.newCustomerTemplateId?.let { id -> templates.firstOrNull { it.id == id }?.let { return it } }
            templates.firstOrNull { it.purpose == "new_customer" }?.let { return it }
        }
        // Falls back to the stage's own form, mirroring resolveTemplate() on
        // the server — so what the app opens is what the server will accept.
        val stageTemplateId = (bootstrap?.stages ?: emptyList()).firstOrNull { it.key == task.stageKey }?.templateId
        return templates.firstOrNull { it.id == stageTemplateId }
    }

    /* ── Writing ──────────────────────────────────────────────────── */

    /**
     * Record a filled form.
     *
     * @param photos local JPEGs, already captured, each tagged with the field
     *               it answers. They are uploaded by the worker, not here.
     * @return the client reference this record will always be known by. It is
     *         what makes a retry idempotent on the server — see the note on
     *         SalesFormSubmission.clientRef.
     */
    fun queueSubmission(
        task: FieldTask?,
        leadId: String?,
        newLead: JSONObject?,
        template: FormTemplate,
        values: JSONObject,
        photos: List<PendingPhoto>,
        location: LocationFix?,
        otpId: String?,
        outcome: String,
        note: String,
        dealValue: Double? = null,
        amountCollected: Double? = null,
    ): String {
        val clientRef = UUID.randomUUID().toString()

        val payload = JSONObject().apply {
            put("clientRef", clientRef)
            put("templateId", template.id)
            task?.let { put("taskId", it.id) }
            leadId?.let { put("leadId", it) }
            newLead?.let { put("newLead", it) }
            put("stageKey", task?.stageKey ?: template.stageKey)
            put("values", values)
            put("outcome", outcome)
            put("note", note)
            otpId?.let { put("otpId", it) }
            dealValue?.let { put("dealValue", it) }
            amountCollected?.let { put("amountCollected", it) }
            // The moment the employee pressed save, which on a bad-signal day
            // is hours before this arrives. The server keeps both.
            put("capturedAt", FieldDb.isoUtc(System.currentTimeMillis()))
            put("wasQueued", true)
            location?.let { put("location", it.toJson()) }
            put(
                "device",
                JSONObject()
                    .put("model", android.os.Build.MODEL)
                    .put("osVersion", android.os.Build.VERSION.RELEASE)
                    .put("appVersion", com.matrubhoomi.field.BuildConfig.VERSION_NAME),
            )
        }

        val photoArray = JSONArray().apply {
            photos.forEach {
                put(
                    JSONObject()
                        .put("path", it.file.absolutePath)
                        .put("fieldKey", it.fieldKey)
                        .apply {
                            it.lat?.let { v -> put("lat", v) }
                            it.lng?.let { v -> put("lng", v) }
                        },
                )
            }
        }

        db.enqueueSubmission(clientRef, payload, photoArray, prefs.employeeId)
        SyncScheduler.now(context)
        return clientRef
    }

    /** Pin a lead's location the moment it is created, from the field. */
    fun createLead(payload: JSONObject): ApiResult<String> = api.createLead(payload)

    fun lookupPhone(phone: String) = api.lookupPhone(phone)
    fun myDay() = api.myDay()
    fun attendanceToday() = api.attendanceToday()
    fun attendanceMonth(year: Int, month: Int) = api.attendanceMonth(year, month)
    fun leaveBalance() = api.leaveBalance()
    fun leaveApplications() = api.leaveApplications()
    fun leadDetail(id: String) = api.leadDetail(id)
    fun leads(query: String, mineOnly: Boolean) = api.leads(query, mineOnly)
    fun tasks(scope: String) = api.tasks(scope)
    fun acceptTask(id: String) = api.acceptTask(id)
    fun sendOtp(phone: String, leadId: String?, taskId: String?) = api.sendOtp(phone, leadId, taskId)
    fun verifyOtp(otpId: String, phone: String, code: String, leadId: String?) =
        api.verifyOtp(otpId, phone, code, leadId)

    /* ── Everybody's HR records ───────────────────────────────────── */
    //
    // Online-only by design. Leave, corrections and overtime carry rules only
    // the server can check — balances, caps, windows — and queuing one would
    // tell somebody they had booked a day the server was always going to
    // refuse. The screens say so when there is no connection.

    fun leaveBook() = api.leaveBook()
    fun myLeaves() = api.myLeaves()
    fun applyLeave(type: String, from: String, to: String, reason: String, halfDay: Boolean, slot: String? = null) =
        api.applyLeave(type, from, to, reason, halfDay, slot)
    fun quickLeave(target: String, halfDay: Boolean, slot: String, reason: String) =
        api.quickLeave(target, halfDay, slot, reason)
    fun cancelLeave(id: String, reason: String) = api.cancelLeave(id, reason)
    fun uploadLeaveDocument(id: String, file: java.io.File, mime: String) = api.uploadLeaveDocument(id, file, mime)
    fun holidays(year: Int) = api.holidays(year)

    fun myRegularizations() = api.myRegularizations()
    fun requestRegularization(date: String, type: String, reason: String, inTime: String?, outTime: String?, status: String?) =
        api.requestRegularization(date, type, reason, inTime, outTime, status)
    fun cancelRegularization(id: String) = api.cancelRegularization(id)

    fun overtimeDue() = api.overtimeDue()
    fun myOvertime() = api.myOvertime()
    fun submitOvertime(date: String, description: String, proof: File?, mime: String = "image/jpeg") =
        api.submitOvertime(date, description, proof, mime)

    fun payslips() = api.payslips()
    fun downloadPayslip(month: Int, year: Int): ApiResult<File> =
        api.downloadPayslip(month, year, File(File(context.cacheDir, "payslips"), "payslip-$year-${month.toString().padStart(2, '0')}.pdf"))
    fun documents() = api.documents()
    fun documentTypes() = api.documentTypes()
    fun requestDocument(type: String, otherLabel: String, reason: String) = api.requestDocument(type, otherLabel, reason)
    fun documentLink(id: String) = api.documentLink(id)
    fun cancelDocument(id: String) = api.cancelDocument(id)

    fun standings(period: String) = api.standings(period)
    fun contactDetails() = api.contactDetails()
    fun updateContact(alt: String, email: String, blood: String, street: String, city: String, state: String, pin: String) =
        api.updateContact(alt, email, blood, street, city, state, pin)
    fun changePassword(current: String, next: String) = api.changePassword(current, next)
    fun latestRelease() = api.latestRelease()

    fun inbox(limit: Int = 40, since: String? = null) = api.inbox(limit, since)
    fun markInboxRead(ids: List<String>? = null) = api.markInboxRead(ids)

    /* ── A manager's queues ───────────────────────────────────────── */

    fun approvalsSummary() = api.approvalsSummary()
    fun teamLeaves() = api.teamLeaves()
    fun teamWithdrawals() = api.teamWithdrawals()
    fun approveLeave(id: String, remarks: String) = api.approveLeave(id, remarks)
    fun rejectLeave(id: String, remarks: String) = api.rejectLeave(id, remarks)
    fun classifyQuickLeave(id: String, type: String, forceLop: String?) = api.classifyQuickLeave(id, type, forceLop)
    fun approveWithdrawal(id: String) = api.approveWithdrawal(id)
    fun rejectWithdrawal(id: String, remarks: String) = api.rejectWithdrawal(id, remarks)
    fun teamRegularizations() = api.teamRegularizations()
    fun approveRegularization(id: String, remarks: String) = api.approveRegularization(id, remarks)
    fun rejectRegularization(id: String, reason: String) = api.rejectRegularization(id, reason)
    fun teamOvertime() = api.teamOvertime()
    fun approveOvertime(id: String, remarks: String) = api.approveOvertime(id, remarks)
    fun rejectOvertime(id: String, remarks: String) = api.rejectOvertime(id, remarks)

    /* ── What is still waiting to go ──────────────────────────────── */
    //
    // Counted for the SIGNED-IN employee only — see FieldDb's header.

    fun pendingCount() = db.pendingCount(prefs.employeeId)
    fun rejectedCount() = db.rejectedCount(prefs.employeeId)
    fun queuedPings() = db.pingCount(prefs.employeeId)

    companion object {
        @Volatile private var instance: Repository? = null
        fun get(context: Context): Repository =
            instance ?: synchronized(this) {
                instance ?: Repository(context.applicationContext).also { instance = it }
            }
    }
}

/** A photograph taken but not yet uploaded. */
data class PendingPhoto(
    val file: File,
    val fieldKey: String,
    val lat: Double?,
    val lng: Double?,
)

/** Where the phone was, as the form was filled. */
data class LocationFix(
    val lat: Double,
    val lng: Double,
    val accuracy: Float?,
    val isMock: Boolean,
    val capturedAt: Long,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("lat", lat)
        put("lng", lng)
        accuracy?.let { put("accuracy", it.toDouble()) }
        put("isMock", isMock)
        put("capturedAt", FieldDb.isoUtc(capturedAt))
    }
}
