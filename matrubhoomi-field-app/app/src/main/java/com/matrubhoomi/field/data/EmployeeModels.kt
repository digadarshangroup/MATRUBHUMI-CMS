package com.matrubhoomi.field.data

import org.json.JSONObject

/**
 * Everything the employee app shows that is not field work: who you are, what
 * the app lets you do, and the HR records every employee has.
 *
 * The same rule as Models.kt applies — parsed by hand from org.json, because
 * half of these are documents whose optional fields vary by age, and a
 * generated serializer would turn every one of them into a nullable cast.
 */

/* ── Who this is, and what the app shows them ──────────────────────── */

data class ManagerRef(val id: String, val name: String)

data class Profile(
    val id: String,
    val name: String,
    val firstName: String,
    val code: String,
    val designation: String,
    val department: String,
    val phone: String,
    val workPhone: String,
    val email: String,
    val photo: String,
    val joinedOn: String,
    val employmentType: String,
    val manager: ManagerRef?,
) {
    companion object {
        val EMPTY = Profile("", "", "", "", "", "", "", "", "", "", "", "", null)

        fun from(o: JSONObject?): Profile {
            if (o == null) return EMPTY
            val m = o.optJSONObject("manager")
            return Profile(
                id = o.optString("id"),
                name = o.optString("name"),
                firstName = o.optString("firstName"),
                code = o.optString("code"),
                designation = o.optString("designation"),
                department = o.optString("department"),
                phone = o.optString("phone"),
                workPhone = o.optString("workPhone"),
                email = o.optString("email"),
                photo = o.optString("photo"),
                joinedOn = o.optString("joinedOn").takeUnless { it == "null" }.orEmpty(),
                employmentType = o.optString("employmentType"),
                manager = m?.let { ManagerRef(it.optString("id"), it.optString("name")) },
            )
        }
    }
}

/**
 * What the app shows this person — decided on the SERVER.
 *
 * The app never works out from a department name whether somebody is field
 * staff. `tracking` false means no location prompt, no duty switch and no
 * service, ever; an accountant's phone is never asked where it is.
 */
data class Capabilities(
    val field: Boolean,
    val tracking: Boolean,
    val fieldAttendance: Boolean,
    val manager: Boolean,
    val teamSize: Int,
    val overtime: Boolean,
    val standings: Boolean,
) {
    companion object {
        /** Before the first bootstrap: show nothing that needs a role. */
        val NONE = Capabilities(false, false, false, false, 0, false, false)

        /**
         * An OLDER server sends no capabilities block. Everybody signed into
         * the field app then was field staff, so that is what it means.
         */
        val LEGACY_FIELD = Capabilities(true, true, false, false, 0, false, false)

        fun from(o: JSONObject?): Capabilities {
            if (o == null) return LEGACY_FIELD
            return Capabilities(
                field = o.optBoolean("field"),
                tracking = o.optBoolean("tracking"),
                fieldAttendance = o.optBoolean("fieldAttendance"),
                manager = o.optBoolean("manager"),
                teamSize = o.optInt("teamSize"),
                overtime = o.optBoolean("overtime", true),
                standings = o.optBoolean("standings", true),
            )
        }
    }
}

data class Counts(val approvals: Int, val unreadNotifications: Int) {
    companion object {
        val ZERO = Counts(0, 0)
        fun from(o: JSONObject?) = if (o == null) ZERO else Counts(
            approvals = o.optInt("approvals"),
            unreadNotifications = o.optInt("unreadNotifications"),
        )
    }
}

/* ── Leave ──────────────────────────────────────────────────────────── */

data class LeaveDecision(val managerName: String, val decision: String, val remarks: String, val decidedAt: String)

/**
 * One leave application, with enough of its history to say where it is.
 *
 * `status` is the server's word; [statusLabel] is the employee's. "manager
 * approved" and "hr approved" are internal stages — with one reporting manager
 * the manager's approval IS final and reads as "Approved".
 */
data class LeaveItem(
    val id: String,
    val employeeName: String,
    val department: String,
    val leaveType: String,
    val fromDate: String,
    val toDate: String,
    val totalDays: Double,
    val paidDays: Double?,
    val lwpDays: Double,
    val isHalfDay: Boolean,
    val halfDaySlot: String,
    val status: String,
    val reason: String,
    val appliedOn: String,
    val isQuick: Boolean,
    val resolvedType: String,
    val rejectionReason: String,
    val hrRemarks: String,
    val cancelReason: String,
    val decisions: List<LeaveDecision>,
    /** Who it went to. None means nobody is set as this person's manager: HR decides. */
    val managerCount: Int = 1,
    val requiresDocument: Boolean = false,
    val hasDocument: Boolean = false,
    /** Where the certificate opens — a photo's URL, or the server's /api/files link. */
    val documentUrl: String = "",
) {
    val isOpen: Boolean get() = status == "pending" || status == "manager_approved"
    val isApproved: Boolean get() = status == "hr_approved"
    val canWithdraw: Boolean get() = isOpen || isApproved
    /** A sick leave that asked for a certificate and has not had one yet. */
    val needsCertificate: Boolean get() = requiresDocument && !hasDocument && status != "cancelled" &&
        status != "manager_rejected" && status != "hr_rejected"
    /** The status the way this person should read it — "Waiting for HR" when there is no manager. */
    val statusText: String get() = if (status == "pending" && managerCount == 0) "Waiting for HR" else requestStatusLabel(status)

    companion object {
        fun from(o: JSONObject) = LeaveItem(
            id = o.optString("_id"),
            employeeName = o.optString("employeeName"),
            department = o.optString("department"),
            leaveType = o.optString("leaveType"),
            fromDate = o.optString("fromDate").take(10),
            toDate = o.optString("toDate").take(10),
            totalDays = o.optDouble("totalDays", 0.0).takeUnless { it.isNaN() } ?: 0.0,
            paidDays = o.optDoubleOrNull("paidDays"),
            lwpDays = o.optDouble("lwpDays", 0.0).takeUnless { it.isNaN() } ?: 0.0,
            isHalfDay = o.optBoolean("isHalfDay"),
            halfDaySlot = o.optString("halfDaySlot"),
            status = o.optString("status"),
            reason = o.optString("reason"),
            appliedOn = o.optString("applicationDate").ifBlank { o.optString("createdAt") }.take(10),
            isQuick = o.optBoolean("isQuickApply") || o.optString("leaveType") == "QUICK",
            resolvedType = o.optJSONObject("quickApply")?.optString("resolvedType").orEmpty(),
            rejectionReason = o.optString("rejectionReason"),
            hrRemarks = o.optString("hrRemarks"),
            cancelReason = o.optString("cancelReason"),
            decisions = o.optJSONArray("managerDecisions").mapObjects {
                LeaveDecision(
                    managerName = it.optString("managerName"),
                    decision = it.optString("decision"),
                    remarks = it.optString("remarks"),
                    decidedAt = it.optString("decidedAt"),
                )
            },
            managerCount = o.optJSONArray("managersNotified")?.length() ?: 1,
            requiresDocument = o.optBoolean("requiresDocument"),
            hasDocument = o.optBoolean("documentSubmitted") ||
                (!o.isNull("documentUrl") && o.optString("documentUrl").isNotBlank()),
            documentUrl = if (o.isNull("documentUrl")) "" else o.optString("documentUrl"),
        )
    }
}

/** The whole balance screen's worth: left, total, used and held by pending requests. */
data class LeaveBook(
    val left: Map<String, Double>,
    val total: Map<String, Double>,
    val used: Map<String, Double>,
    val pending: Map<String, Double>,
    val plEligible: Boolean,
    val waitingComplete: Boolean,
    val slDocumentThreshold: Int,
) {
    fun left(type: String) = left[type] ?: 0.0

    companion object {
        val EMPTY = LeaveBook(emptyMap(), emptyMap(), emptyMap(), emptyMap(), false, true, 2)

        private fun triple(o: JSONObject?): Map<String, Double> = buildMap {
            listOf("CL", "SL", "PL").forEach { k ->
                put(k, o?.optDouble(k, 0.0)?.takeUnless { it.isNaN() } ?: 0.0)
            }
        }

        fun from(root: JSONObject): LeaveBook {
            val d = root.optJSONObject("data") ?: return EMPTY
            val elig = d.optJSONObject("eligibility")
            return LeaveBook(
                // effectiveAvailable, never `available` — see LeaveScreen's note.
                left = triple(d.optJSONObject("effectiveAvailable") ?: d.optJSONObject("available")),
                total = triple(d.optJSONObject("entitlement")),
                used = triple(d.optJSONObject("consumed")),
                pending = triple(d.optJSONObject("reserved")),
                plEligible = elig?.optBoolean("plComplete") ?: d.optJSONObject("balance")?.optBoolean("plEligible") ?: false,
                waitingComplete = elig?.optBoolean("waitingComplete", true) ?: true,
                slDocumentThreshold = d.optJSONObject("config")?.optInt("slDocumentThreshold", 2) ?: 2,
            )
        }
    }
}

/** A published build of this app — what the update prompt offers. */
data class AppRelease(
    val version: String,
    val versionCode: Int,
    val notes: String,
    val url: String,
) {
    fun toJson(): String = JSONObject()
        .put("version", version).put("versionCode", versionCode)
        .put("releaseNotes", notes).put("driveDownloadUrl", url).toString()

    companion object {
        fun from(o: JSONObject) = AppRelease(
            version = o.optString("version"),
            versionCode = o.optInt("versionCode", 0),
            notes = o.optString("releaseNotes"),
            url = o.optString("driveDownloadUrl").ifBlank { o.optString("driveViewUrl") },
        )
    }
}

data class Holiday(val date: String, val name: String, val type: String, val description: String) {
    /**
     * A Sunday HR has made a WORKING day. It lives in the same table as the
     * holidays, and listed among them it told people the opposite of the truth.
     */
    val isWorkingSunday: Boolean get() = type == "working_sunday"

    companion object {
        fun from(o: JSONObject) = Holiday(
            date = o.optString("date").take(10),
            name = o.optString("name"),
            type = o.optString("type"),
            description = o.optString("description"),
        )
    }
}

/* ── Attendance corrections ─────────────────────────────────────────── */

data class FieldSummary(val distanceKm: Double, val visits: Int, val stops: Int)

data class Regularization(
    val id: String,
    val employeeName: String,
    val dateStr: String,
    val type: String,
    val reason: String,
    val inTime: String,
    val outTime: String,
    val requestedStatus: String,
    val status: String,
    val source: String,
    val fieldSummary: FieldSummary?,
    val rejectionReason: String,
    val decidedBy: String,
) {
    val isFieldDay: Boolean get() = source == "field_duty"
    val isOpen: Boolean get() = status == "pending" || status == "manager_approved"

    companion object {
        fun from(o: JSONObject): Regularization {
            val fs = o.optJSONObject("fieldSummary")
            return Regularization(
                id = o.optString("_id"),
                employeeName = o.optString("employeeName"),
                dateStr = o.optString("dateStr"),
                type = o.optString("type"),
                reason = o.optString("reason"),
                inTime = isoToClock(o.optString("proposedInTime")),
                outTime = isoToClock(o.optString("proposedOutTime")),
                requestedStatus = o.optString("requestedStatus").takeUnless { it == "null" }.orEmpty(),
                status = o.optString("status"),
                source = o.optString("source", "employee"),
                fieldSummary = fs?.takeIf { it.has("distanceKm") && !it.isNull("distanceKm") }?.let {
                    FieldSummary(it.optDouble("distanceKm", 0.0), it.optInt("visits"), it.optInt("stops"))
                },
                rejectionReason = o.optString("rejectionReason"),
                decidedBy = o.optString("finalApprovedByName"),
            )
        }
    }
}

/* ── Overtime ───────────────────────────────────────────────────────── */

/** A late stay the employee has not reported yet. */
data class OvertimeDue(
    val dateStr: String,
    val scheduledOut: String,
    val actualOut: String,
    val stayOverMins: Int,
    val graceMinutes: Int,
    val adjustedReportTime: String,
) {
    companion object {
        fun from(o: JSONObject) = OvertimeDue(
            dateStr = o.optString("dateStr"),
            scheduledOut = o.optString("scheduledOutTime"),
            actualOut = o.optString("actualOutTime"),
            stayOverMins = o.optInt("stayOverMins"),
            graceMinutes = o.optInt("graceMinutes"),
            adjustedReportTime = o.optString("adjustedReportTime"),
        )
    }
}

data class OvertimeReport(
    val id: String,
    val employeeName: String,
    val department: String,
    val dateStr: String,
    val status: String,
    val actualOut: String,
    val stayOverMins: Int,
    val graceMinutes: Int,
    val description: String,
    val rejectionReason: String,
    /** The photographed proof, when one was attached — a manager may open it. */
    val proofUrl: String,
) {
    val hasProof: Boolean get() = proofUrl.isNotBlank()

    companion object {
        fun from(o: JSONObject) = OvertimeReport(
            id = o.optString("_id"),
            employeeName = o.optString("employeeName"),
            department = o.optString("department"),
            dateStr = o.optString("dateStr"),
            status = o.optString("status"),
            actualOut = o.optString("actualOutTime"),
            stayOverMins = o.optInt("stayOverMins"),
            graceMinutes = o.optInt("graceMinutes"),
            description = o.optString("description"),
            rejectionReason = o.optString("rejectionReason"),
            proofUrl = o.optString("documentUrl").takeUnless { it == "null" }.orEmpty(),
        )
    }
}

/* ── Pay and papers ─────────────────────────────────────────────────── */

data class PayslipItem(
    val month: Int,
    val year: Int,
    val label: String,
    val netPay: Double,
    val gross: Double,
    val deductions: Double,
    val paidOn: String,
) {
    companion object {
        fun from(o: JSONObject) = PayslipItem(
            month = o.optInt("month"),
            year = o.optInt("year"),
            label = o.optString("label"),
            netPay = o.optDouble("netPay", 0.0).takeUnless { it.isNaN() } ?: 0.0,
            gross = o.optDouble("gross", 0.0).takeUnless { it.isNaN() } ?: 0.0,
            deductions = o.optDouble("deductions", 0.0).takeUnless { it.isNaN() } ?: 0.0,
            paidOn = o.optString("paymentDate").takeUnless { it == "null" }.orEmpty().take(10),
        )
    }
}

data class DocumentItem(
    val id: String,
    val type: String,
    val otherLabel: String,
    val title: String,
    val status: String,
    val requestedAt: String,
    val releasedAt: String,
    val declineReason: String,
) {
    val isAvailable: Boolean get() = status == "available"
    val displayName: String
        get() = title.ifBlank { if (type == "other") otherLabel.ifBlank { "Document" } else documentTypeName(type) }

    companion object {
        fun from(o: JSONObject) = DocumentItem(
            id = o.optString("_id"),
            type = o.optString("type"),
            otherLabel = o.optString("otherTypeLabel"),
            title = o.optString("title"),
            status = o.optString("status"),
            requestedAt = o.optString("requestedAt").takeUnless { it == "null" }.orEmpty().take(10),
            releasedAt = o.optString("releasedAt").takeUnless { it == "null" }.orEmpty().take(10),
            declineReason = o.optString("declineReason"),
        )
    }
}

fun documentTypeName(type: String): String = when (type) {
    "appointment" -> "Appointment letter"
    "offer" -> "Offer letter"
    "experience" -> "Experience letter"
    "relieving" -> "Relieving letter"
    "salary_certificate" -> "Salary certificate"
    "warning" -> "Letter"
    else -> "Document"
}

/* ── Standings ──────────────────────────────────────────────────────── */

data class Standing(
    val rank: Int,
    val employeeId: String,
    val name: String,
    val designation: String,
    val department: String,
    val worked: String,
    val present: Int,
    val onTime: Int,
) {
    companion object {
        fun from(o: JSONObject) = Standing(
            rank = o.optInt("rank"),
            employeeId = o.optString("employeeId"),
            name = o.optString("name"),
            designation = o.optString("designation").takeUnless { it == "null" }.orEmpty(),
            department = o.optString("department").takeUnless { it == "null" }.orEmpty(),
            worked = o.optString("worked"),
            present = o.optInt("present"),
            onTime = o.optInt("onTime"),
        )
    }
}

data class StandingsBoard(val entries: List<Standing>, val me: Standing?) {
    companion object {
        val EMPTY = StandingsBoard(emptyList(), null)
        fun from(root: JSONObject): StandingsBoard {
            val d = root.optJSONObject("data") ?: return EMPTY
            return StandingsBoard(
                entries = d.optJSONArray("entries").mapObjects { Standing.from(it) },
                me = d.optJSONObject("me")?.let { Standing.from(it) },
            )
        }
    }
}

/* ── The inbox ──────────────────────────────────────────────────────── */

data class InboxItem(
    val id: String,
    val title: String,
    val body: String,
    val kind: String,
    val screen: String,
    val refId: String,
    val createdAt: String,
    val read: Boolean,
) {
    companion object {
        fun from(o: JSONObject) = InboxItem(
            id = o.optString("id"),
            title = o.optString("title"),
            body = o.optString("body"),
            kind = o.optString("kind"),
            screen = o.optString("screen"),
            refId = o.optString("refId"),
            createdAt = o.optString("createdAt"),
            read = o.optBoolean("read"),
        )
    }
}

data class Inbox(val items: List<InboxItem>, val unread: Int)

data class ApprovalsSummary(
    val leave: Int,
    val withdrawals: Int,
    val regularization: Int,
    val overtime: Int,
    val total: Int,
    val teamSize: Int,
    val isManager: Boolean,
) {
    companion object {
        val ZERO = ApprovalsSummary(0, 0, 0, 0, 0, 0, false)
        fun from(o: JSONObject?) = if (o == null) ZERO else ApprovalsSummary(
            leave = o.optInt("leave"),
            withdrawals = o.optInt("withdrawals"),
            regularization = o.optInt("regularization"),
            overtime = o.optInt("overtime"),
            total = o.optInt("total"),
            teamSize = o.optInt("teamSize"),
            isManager = o.optBoolean("isManager"),
        )
    }
}

/** Contact details the employee may change themselves — everything else is HR's. */
data class ContactDetails(
    val alternatePhone: String,
    val personalEmail: String,
    val bloodGroup: String,
    val street: String,
    val city: String,
    val state: String,
    val pincode: String,
    val dateOfBirth: String,
    val gender: String,
    val maskedAccount: String,
    val bankName: String,
) {
    companion object {
        val EMPTY = ContactDetails("", "", "", "", "", "", "", "", "", "", "")

        fun from(root: JSONObject): ContactDetails {
            val d = root.optJSONObject("data") ?: return EMPTY
            val cur = d.optJSONObject("address")?.optJSONObject("current")
            val bank = d.optJSONObject("bankDetails")
            val acct = bank?.optString("accountNumber").orEmpty()
            return ContactDetails(
                alternatePhone = d.optString("alternatePhone"),
                personalEmail = d.optString("personalEmail"),
                bloodGroup = d.optString("bloodGroup"),
                street = cur?.optString("street").orEmpty(),
                city = cur?.optString("city").orEmpty(),
                state = cur?.optString("state").orEmpty(),
                pincode = cur?.optString("pincode").orEmpty(),
                dateOfBirth = d.optString("dateOfBirth").takeUnless { it == "null" }.orEmpty().take(10),
                gender = d.optString("gender"),
                // Only the last four digits ever reach the screen.
                maskedAccount = if (acct.length >= 4) "•••• " + acct.takeLast(4) else "",
                bankName = bank?.optString("bankName").orEmpty(),
            )
        }
    }
}

/* ── Small shared helpers ──────────────────────────────────────────── */

/** "2026-09-24T09:32:00.000Z" → "15:02" in the phone's own zone; "" when absent. */
fun isoToClock(iso: String): String {
    if (iso.isBlank() || iso == "null") return ""
    return runCatching {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        val date = f.parse(iso.take(19)) ?: return ""
        java.text.SimpleDateFormat("HH:mm", java.util.Locale.US).format(date)
    }.getOrDefault("")
}

/** The employee-facing word for a request's status — one vocabulary for every screen. */
fun requestStatusLabel(status: String): String = when (status) {
    "pending" -> "Waiting for manager"
    // With one reporting manager this is a transient state of older requests.
    "manager_approved" -> "Manager approved"
    "hr_approved" -> "Approved"
    "manager_rejected", "hr_rejected", "rejected" -> "Not approved"
    "withdraw_pending" -> "Withdrawal requested"
    "cancelled" -> "Cancelled"
    "expired" -> "Expired"
    "requested" -> "Requested"
    "available" -> "Ready to open"
    "declined" -> "Not approved"
    "withdrawn" -> "Withdrawn"
    else -> status.replace('_', ' ')
}

fun leaveTypeName(code: String): String = when (code) {
    "CL" -> "Casual leave"
    "SL" -> "Sick leave"
    "PL" -> "Privilege leave"
    "LOP" -> "Unpaid leave"
    "QUICK" -> "Quick leave"
    else -> code
}

fun regularizationTypeName(type: String): String = when (type) {
    "miss_punch" -> "Missed punch"
    "forgot_punch" -> "Forgot to punch"
    "wrong_status" -> "Wrong status"
    "client_visit" -> "Client visit"
    else -> "Other"
}
