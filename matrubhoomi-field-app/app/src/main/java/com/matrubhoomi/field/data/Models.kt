package com.matrubhoomi.field.data

import org.json.JSONArray
import org.json.JSONObject

/**
 * The shapes the API speaks, parsed by hand from org.json.
 *
 * WHY NO SERIALIZATION LIBRARY
 * ----------------------------
 * The central object here is a FORM the sales desk designed — a list of fields
 * of arbitrary types, answered with arbitrary values. That is exactly the case
 * a compile-time serializer is worst at: every answer would be a
 * `Map<String, JsonElement>` and every read of it a cast, so the type safety
 * would be a fiction maintained at the boundary and abandoned one line later.
 *
 * org.json ships with Android, needs no plugin, no codegen and no keep rules,
 * and reads dynamic JSON as what it is. The cost is that parsing is written out
 * below rather than generated, and that cost is paid once, here.
 */

/* ── Form templates ────────────────────────────────────────────────── */

data class FieldOption(val label: String, val value: String)

data class FormField(
    val key: String,
    val label: String,
    val type: String,
    val required: Boolean,
    val placeholder: String,
    val helpText: String,
    val options: List<FieldOption>,
    val min: Double?,
    val max: Double?,
    val maxLength: Int?,
    val maxPhotos: Int,
    val cameraOnly: Boolean,
    val unit: String,
    val showWhenField: String?,
    val showWhenEquals: String?,
) {
    companion object {
        fun from(o: JSONObject) = FormField(
            key = o.optString("key"),
            label = o.optString("label"),
            type = o.optString("type", "text"),
            required = o.optBoolean("required"),
            placeholder = o.optString("placeholder"),
            helpText = o.optString("helpText"),
            options = o.optJSONArray("options").mapObjects {
                FieldOption(it.optString("label"), it.optString("value"))
            },
            min = o.optDoubleOrNull("min"),
            max = o.optDoubleOrNull("max"),
            maxLength = o.optIntOrNull("maxLength"),
            maxPhotos = o.optInt("maxPhotos", 3),
            cameraOnly = o.optBoolean("cameraOnly", true),
            unit = o.optString("unit"),
            showWhenField = o.optJSONObject("showWhen")?.optString("field")?.ifBlank { null },
            showWhenEquals = o.optJSONObject("showWhen")?.opt("equals")?.toString(),
        )
    }
}

data class FormTemplate(
    val id: String,
    val name: String,
    val description: String,
    val stageKey: String,
    /** Where this form hangs: new_customer, scheme_step or standalone. */
    val purpose: String,
    val version: Int,
    val requiresOtp: Boolean,
    val requiresPhoto: Boolean,
    val requiresLocation: Boolean,
    val fields: List<FormField>,
) {
    companion object {
        fun from(o: JSONObject) = FormTemplate(
            id = o.optString("id"),
            name = o.optString("name"),
            description = o.optString("description"),
            stageKey = o.optString("stageKey"),
            purpose = o.optString("purpose", "standalone"),
            version = o.optInt("version", 1),
            requiresOtp = o.optBoolean("requiresOtp"),
            requiresPhoto = o.optBoolean("requiresPhoto"),
            requiresLocation = o.optBoolean("requiresLocation", true),
            fields = o.optJSONArray("fields").mapObjects { FormField.from(it) },
        )
    }
}

/* ── Work ──────────────────────────────────────────────────────────── */

data class TaskTarget(
    val leadId: String,
    val code: String,
    val name: String,
    val phone: String,
    val village: String,
    val status: String,
    /** Why the last attempt came back, so the redo screen can say what to fix. */
    val rejectionNote: String,
    val attempts: Int,
) {
    /**
     * ACCEPTED by the desk. Submitting is not finishing — a target whose form
     * is filled but not yet approved is `isWaiting`, and the employee must not
     * be told it is done until the organisation agrees.
     */
    val isDone: Boolean get() = status == "done"
    val isWaiting: Boolean get() = status == "pending_approval"
    val isRework: Boolean get() = status == "rework"
    /** Closed without becoming a customer: not interested, unreachable, rescheduled. */
    val isClosedOut: Boolean get() = status == "rejected" || status == "unreachable" || status == "rescheduled"
    /** Something the employee can still act on. */
    val isOpen: Boolean get() = !isDone && !isWaiting && !isClosedOut

    companion object {
        fun from(o: JSONObject) = TaskTarget(
            leadId = o.optString("leadId"),
            code = o.optString("code"),
            name = o.optString("name"),
            phone = o.optString("phone"),
            village = o.optString("village"),
            status = o.optString("status", "pending"),
            rejectionNote = o.optString("rejectionNote"),
            attempts = o.optInt("attempts"),
        )
    }
}

data class FieldTask(
    val id: String,
    val code: String,
    val title: String,
    val instructions: String,
    val type: String,
    val stageKey: String,
    /**
     * The workflow this task was assigned against, frozen on the server at
     * assignment. SHOWN, never resolved here: the employee is told the customer,
     * the scheme and the step, and chooses none of them.
     */
    val schemeName: String,
    val stageName: String,
    val templateId: String?,
    val templateName: String,
    val templateVersion: Int?,
    /** The quota. Never grows with attempts. */
    val targetCount: Int,
    /** APPROVED units. */
    val doneCount: Int,
    /** Submitted and still waiting on the desk. */
    val pendingCount: Int,
    /** Refused and not yet redone. */
    val rejectedCount: Int,
    val status: String,
    val priority: String,
    val scheduledFor: String,
    val dueAt: String?,
    val requireOtp: Boolean,
    val requirePhoto: Boolean,
    val requireLocation: Boolean,
    val assignedByName: String,
    val targets: List<TaskTarget>,
) {
    val isQuota: Boolean get() = type == "lead_generation"
    val isFollowUp: Boolean get() = type == "follow_up"
    /** Approved plus waiting: what is still left for the employee to bring in. */
    val remaining: Int get() = (targetCount - doneCount - pendingCount).coerceAtLeast(0)
    /** Nothing more for the employee to do — the rest is the desk's. */
    val allSubmitted: Boolean get() = targetCount > 0 && doneCount + pendingCount >= targetCount
    val isWaitingOnDesk: Boolean get() = status == "pending_approval"
    val hasRework: Boolean get() = status == "rework" || rejectedCount > 0
    /** The one customer a follow-up is about. */
    val customer: TaskTarget? get() = if (isFollowUp) targets.firstOrNull() else null

    companion object {
        fun from(o: JSONObject) = FieldTask(
            id = o.optString("id"),
            code = o.optString("code"),
            title = o.optString("title"),
            instructions = o.optString("instructions"),
            type = o.optString("type"),
            stageKey = o.optString("stageKey"),
            schemeName = o.optString("schemeName"),
            stageName = o.optString("stageName"),
            templateId = o.optString("templateId").ifBlank { null },
            templateName = o.optString("templateName"),
            templateVersion = if (o.isNull("templateVersion")) null else o.optInt("templateVersion"),
            targetCount = o.optInt("targetCount"),
            doneCount = o.optInt("doneCount"),
            pendingCount = o.optInt("pendingCount"),
            rejectedCount = o.optInt("rejectedCount"),
            status = o.optString("status"),
            priority = o.optString("priority", "normal"),
            scheduledFor = o.optString("scheduledFor"),
            dueAt = o.optString("dueAt").ifBlank { null },
            requireOtp = o.optBoolean("requireOtp"),
            requirePhoto = o.optBoolean("requirePhoto"),
            requireLocation = o.optBoolean("requireLocation", true),
            assignedByName = o.optString("assignedByName"),
            targets = o.optJSONArray("targets").mapObjects { TaskTarget.from(it) },
        )
    }
}

data class Stage(
    val key: String,
    val name: String,
    val order: Int,
    val requiresOtp: Boolean,
    val requiresPhoto: Boolean,
    val requiresLocation: Boolean,
    val requiresApproval: Boolean,
    val isTerminal: Boolean,
    val templateId: String?,
) {
    companion object {
        fun from(o: JSONObject) = Stage(
            key = o.optString("key"),
            name = o.optString("name"),
            order = o.optInt("order"),
            requiresOtp = o.optBoolean("requiresOtp"),
            requiresPhoto = o.optBoolean("requiresPhoto"),
            requiresLocation = o.optBoolean("requiresLocation", true),
            requiresApproval = o.optBoolean("requiresApproval", true),
            isTerminal = o.optBoolean("isTerminal"),
            templateId = o.optString("templateId").ifBlank { null },
        )
    }
}

/**
 * A workflow a new customer can be put into, with its steps. The names come
 * from the server and are never hardcoded here — the whole point of schemes is
 * that the desk invents them without an APK.
 */
data class Scheme(
    val id: String,
    val key: String,
    val name: String,
    val description: String,
    val version: Int,
    val steps: List<Stage>,
) {
    companion object {
        fun from(o: JSONObject) = Scheme(
            id = o.optString("id"),
            key = o.optString("key"),
            name = o.optString("name"),
            description = o.optString("description"),
            version = o.optInt("version", 1),
            steps = o.optJSONArray("steps").mapObjects { Stage.from(it) },
        )
    }
}

data class LeadSummary(
    val id: String,
    val code: String,
    val name: String,
    val phone: String,
    val stageKey: String,
    val status: String,
    val village: String,
    val isCustomer: Boolean,
) {
    companion object {
        fun from(o: JSONObject) = LeadSummary(
            id = o.optString("_id"),
            code = o.optString("code"),
            name = o.optString("name"),
            phone = o.optString("phone"),
            stageKey = o.optString("stageKey"),
            status = o.optString("status"),
            village = o.optJSONObject("address")?.optString("village") ?: "",
            isCustomer = o.optBoolean("isCustomer"),
        )
    }
}

data class DaySummary(
    val distanceKm: Double,
    val submissions: Int,
    val leadsCreated: Int,
    /** YYYY-MM-DD. Empty on the `today` summary, which is always today. */
    val day: String = "",
) {
    companion object {
        fun from(o: JSONObject?) = DaySummary(
            distanceKm = o?.optDouble("distanceKm", 0.0) ?: 0.0,
            submissions = o?.optInt("submissions") ?: 0,
            leadsCreated = o?.optInt("leadsCreated") ?: 0,
            day = o?.optString("day").orEmpty(),
        )
    }
}

/** Everything one /bootstrap call brings back — the app's whole working set. */
data class Bootstrap(
    val employeeName: String,
    val employeeCode: String,
    val employeeId: String,
    val tasks: List<FieldTask>,
    val stages: List<Stage>,
    val templates: List<FormTemplate>,
    /** The schemes a NEW customer may be registered into. Empty on an older server. */
    val schemes: List<Scheme>,
    /** The one registration form, named so the app does not have to guess which template it is. */
    val newCustomerTemplateId: String?,
    val today: DaySummary,
    /**
     * The last seven days including today, oldest first, gaps already filled by
     * the server. Powers the strip on the home screen — the employee's own
     * week, which is the only thing that makes a single day's figure mean
     * anything.
     */
    val recentDays: List<DaySummary>,
    val trackingEnabled: Boolean,
    val pingIntervalSeconds: Int,
    val idleIntervalSeconds: Int,
    val minDistanceMeters: Int,
    val batchSize: Int,
) {
    companion object {
        fun from(root: JSONObject): Bootstrap {
            val d = root.optJSONObject("data") ?: JSONObject()
            val emp = d.optJSONObject("employee") ?: JSONObject()
            val tracking = d.optJSONObject("tracking") ?: JSONObject()
            return Bootstrap(
                employeeName = emp.optString("name"),
                employeeCode = emp.optString("code"),
                employeeId = emp.optString("id"),
                tasks = d.optJSONArray("tasks").mapObjects { FieldTask.from(it) },
                stages = d.optJSONArray("stages").mapObjects { Stage.from(it) },
                templates = d.optJSONArray("templates").mapObjects { FormTemplate.from(it) },
                schemes = d.optJSONArray("schemes").mapObjects { Scheme.from(it) },
                newCustomerTemplateId = d.optString("newCustomerTemplateId").ifBlank { null },
                today = DaySummary.from(d.optJSONObject("today")),
                recentDays = d.optJSONArray("recentDays").let { arr ->
                    // An older server has no such field. An empty list is the
                    // right answer — the strip simply does not draw.
                    if (arr == null) emptyList()
                    else (0 until arr.length()).map { DaySummary.from(arr.optJSONObject(it)) }
                },
                trackingEnabled = tracking.optBoolean("enabled", true),
                pingIntervalSeconds = tracking.optInt("intervalSeconds", 20),
                idleIntervalSeconds = tracking.optInt("idleIntervalSeconds", 120),
                minDistanceMeters = tracking.optInt("minDistanceMeters", 15),
                batchSize = tracking.optInt("batchSize", 20),
            )
        }
    }
}

/** An uploaded photograph, as the API hands it back. */
data class UploadedPhoto(
    val url: String,
    val publicId: String,
    val fieldKey: String,
    val lat: Double?,
    val lng: Double?,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("url", url)
        put("publicId", publicId)
        put("fieldKey", fieldKey)
        lat?.let { put("lat", it) }
        lng?.let { put("lng", it) }
    }

    companion object {
        fun from(o: JSONObject) = UploadedPhoto(
            url = o.optString("url"),
            publicId = o.optString("publicId"),
            fieldKey = o.optString("fieldKey"),
            lat = o.optDoubleOrNull("lat"),
            lng = o.optDoubleOrNull("lng"),
        )
    }
}


/* ── One employee's own day ────────────────────────────────────────── */

data class PathPoint(val lat: Double, val lng: Double)

data class Stop(val lat: Double, val lng: Double, val minutes: Int, val label: String)

/**
 * What the phone has recorded today, as the server counted it.
 *
 * Read back from the server rather than counted on the handset on purpose: the
 * distance an employee is judged on is the one the DESK sees, and a second
 * number computed locally by different rules would differ — and the employee
 * would be right to trust neither.
 */
data class MyDay(
    val distanceKm: Double,
    val movingMinutes: Int,
    val idleMinutes: Int,
    val stopCount: Int,
    val submissions: Int,
    val leadsCreated: Int,
    val firstPingAt: String,
    val lastPingAt: String,
    val path: List<PathPoint>,
    val stops: List<Stop>,
) {
    companion object {
        val EMPTY = MyDay(0.0, 0, 0, 0, 0, 0, "", "", emptyList(), emptyList())

        fun from(o: JSONObject?): MyDay {
            if (o == null) return EMPTY
            return MyDay(
                distanceKm = o.optDouble("distanceKm", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                movingMinutes = o.optInt("movingMinutes"),
                idleMinutes = o.optInt("idleMinutes"),
                stopCount = o.optInt("stops"),
                submissions = o.optInt("submissions"),
                leadsCreated = o.optInt("leadsCreated"),
                firstPingAt = o.optString("firstPingAt"),
                lastPingAt = o.optString("lastPingAt"),
                path = o.optJSONArray("path").mapObjects {
                    PathPoint(it.optDouble("lat"), it.optDouble("lng"))
                }.filter { !it.lat.isNaN() && !it.lng.isNaN() },
                stops = emptyList(),
            )
        }
    }
}

/* ── One lead, in full ─────────────────────────────────────────────── */

data class TimelineEntry(val at: String, val kind: String, val message: String, val byName: String) {
    companion object {
        fun from(o: JSONObject) = TimelineEntry(
            at = o.optString("at"),
            kind = o.optString("kind"),
            message = o.optString("message"),
            byName = o.optString("byName"),
        )
    }
}

data class PastVisit(
    val templateName: String,
    val stageKey: String,
    val capturedAt: String,
    val outcome: String,
    val note: String,
    val submittedByName: String,
    val photoUrls: List<String>,
    val answers: List<Pair<String, String>>,
) {
    companion object {
        fun from(o: JSONObject): PastVisit {
            val labels = o.optJSONObject("labels")
            val values = o.optJSONObject("values")
            val answers = mutableListOf<Pair<String, String>>()
            values?.keys()?.forEach { key ->
                val label = labels?.optString(key)?.ifBlank { key } ?: key
                val value = values.opt(key)?.toString().orEmpty()
                if (value.isNotBlank() && value != "null") answers.add(label to value)
            }
            val photos = mutableListOf<String>()
            o.optJSONArray("photos")?.let { arr ->
                for (i in 0 until arr.length()) arr.optJSONObject(i)?.optString("url")?.let(photos::add)
            }
            return PastVisit(
                templateName = o.optString("templateName"),
                stageKey = o.optString("stageKey"),
                capturedAt = o.optString("capturedAt"),
                outcome = o.optString("outcome"),
                note = o.optString("note"),
                submittedByName = o.optString("submittedByName"),
                photoUrls = photos,
                answers = answers,
            )
        }
    }
}

data class LeadDetail(
    val id: String,
    val code: String,
    val name: String,
    val phone: String,
    val village: String,
    val district: String,
    val stageKey: String,
    val status: String,
    val isCustomer: Boolean,
    val phoneVerified: Boolean,
    val assignedToName: String,
    val visitCount: Int,
    val lastContactedAt: String,
    val nextFollowUpAt: String,
    val estimatedValue: Double,
    val dealValue: Double,
    val amountCollected: Double,
    val notes: String,
    val lat: Double?,
    val lng: Double?,
    val timeline: List<TimelineEntry>,
    val visits: List<PastVisit>,
) {
    companion object {
        fun from(root: JSONObject): LeadDetail? {
            val d = root.optJSONObject("data") ?: return null
            val l = d.optJSONObject("lead") ?: return null
            val address = l.optJSONObject("address")
            val geo = l.optJSONObject("geo")
            return LeadDetail(
                id = l.optString("_id"),
                code = l.optString("code"),
                name = l.optString("name"),
                phone = l.optString("phone"),
                village = address?.optString("village").orEmpty(),
                district = address?.optString("district").orEmpty(),
                stageKey = l.optString("stageKey"),
                status = l.optString("status"),
                isCustomer = l.optBoolean("isCustomer"),
                phoneVerified = l.optBoolean("phoneVerified"),
                assignedToName = l.optString("assignedToName"),
                visitCount = l.optInt("visitCount"),
                lastContactedAt = l.optString("lastContactedAt"),
                nextFollowUpAt = l.optString("nextFollowUpAt"),
                estimatedValue = l.optDouble("estimatedValue", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                dealValue = l.optDouble("dealValue", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                amountCollected = l.optDouble("amountCollected", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                notes = l.optString("notes"),
                lat = geo?.optDoubleOrNull("lat"),
                lng = geo?.optDoubleOrNull("lng"),
                timeline = l.optJSONArray("timeline").mapObjects { TimelineEntry.from(it) },
                visits = d.optJSONArray("submissions").mapObjects { PastVisit.from(it) },
            )
        }
    }
}

/* ── org.json, made less painful ───────────────────────────────────── */


inline fun <T> JSONArray?.mapObjects(transform: (JSONObject) -> T): List<T> {
    if (this == null) return emptyList()
    val out = ArrayList<T>(length())
    for (i in 0 until length()) optJSONObject(i)?.let { out.add(transform(it)) }
    return out
}

/**
 * `optDouble` returns NaN for a missing key and org.json has no nullable
 * variant, so every optional number would silently become NaN and then render
 * as "NaN" three screens away. These two ask first.
 */
fun JSONObject.optDoubleOrNull(key: String): Double? =
    if (isNull(key)) null else optDouble(key).takeUnless { it.isNaN() }

fun JSONObject.optIntOrNull(key: String): Int? = if (isNull(key)) null else optInt(key)

/* ── HR: attendance and leave ──────────────────────────────────────── */
//
// These come from the EMPLOYEE portal's own endpoints, not from the sales
// module — /api/employee/attendance and /api/employee/leave-applications. The
// field team is on the same rolls as everybody else, and duplicating attendance
// into the sales domain would give the company two answers to "was Ramesh in
// on Tuesday".

/** One day on the muster roll, as HR's own status codes describe it. */
data class AttendanceDay(
    val dateStr: String,
    val status: String,
    val label: String,
    val inTime: String,
    val outTime: String,
    val workDisplay: String,
    val isLate: Boolean,
    val lateMins: Int,
) {
    /** Present in any of its forms — full, adjusted, or system-inferred. */
    val isPresent: Boolean get() = status in setOf("P", "P*", "P~")
    val isAbsent: Boolean get() = status in setOf("AB", "LAB", "EAB")
    val isHalfDay: Boolean get() = status == "HD" || status == "LHD"
    val isOff: Boolean get() = status == "WO" || status in setOf("PH", "FH", "NH", "OH", "RH")

    companion object {
        fun from(o: JSONObject) = AttendanceDay(
            dateStr = o.optString("dateStr"),
            status = o.optString("effectiveStatus").ifBlank { o.optString("status") },
            label = o.optString("label"),
            inTime = o.optString("inTime"),
            outTime = o.optString("finalOut"),
            workDisplay = o.optString("workDisplay"),
            isLate = o.optBoolean("isLate"),
            lateMins = o.optInt("lateMins"),
        )
    }
}

data class AttendanceMonth(
    val days: List<AttendanceDay>,
    val present: Int,
    val absent: Int,
    val halfDay: Int,
    val weekOff: Int,
    val holiday: Int,
) {
    companion object {
        fun from(root: JSONObject): AttendanceMonth {
            val s = root.optJSONObject("summary") ?: JSONObject()
            return AttendanceMonth(
                days = root.optJSONArray("data").mapObjects { AttendanceDay.from(it) },
                present = s.optInt("present"),
                absent = s.optInt("absent"),
                halfDay = s.optInt("halfDay"),
                weekOff = s.optInt("weekOff"),
                holiday = s.optInt("holiday"),
            )
        }
    }
}

/**
 * What is left to take.
 *
 * `effectiveAvailable` is the one the app shows, not `available`: it subtracts
 * days already committed by applications that are filed but not yet approved.
 * Showing the other number lets somebody apply for leave twice over.
 */
data class LeaveBalance(
    val casualLeft: Double,
    val sickLeft: Double,
    val privilegeLeft: Double,
    val casualTotal: Double,
    val sickTotal: Double,
    val privilegeTotal: Double,
    val plEligible: Boolean,
) {
    companion object {
        val EMPTY = LeaveBalance(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, false)

        fun from(root: JSONObject): LeaveBalance {
            val d = root.optJSONObject("data") ?: return EMPTY
            val eff = d.optJSONObject("effectiveAvailable") ?: d.optJSONObject("available") ?: JSONObject()
            val ent = d.optJSONObject("entitlement") ?: JSONObject()
            return LeaveBalance(
                casualLeft = eff.optDouble("CL", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                sickLeft = eff.optDouble("SL", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                privilegeLeft = eff.optDouble("PL", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                casualTotal = ent.optDouble("CL", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                sickTotal = ent.optDouble("SL", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                privilegeTotal = ent.optDouble("PL", 0.0).takeUnless { it.isNaN() } ?: 0.0,
                plEligible = d.optJSONObject("balance")?.optBoolean("plEligible") ?: false,
            )
        }
    }
}

data class LeaveApplication(
    val id: String,
    val leaveType: String,
    val fromDate: String,
    val toDate: String,
    val days: Double,
    val status: String,
    val reason: String,
    val appliedOn: String,
) {
    companion object {
        fun from(o: JSONObject) = LeaveApplication(
            id = o.optString("_id"),
            leaveType = o.optString("leaveType"),
            fromDate = o.optString("fromDate"),
            toDate = o.optString("toDate"),
            days = o.optDouble("totalDays", 0.0).takeUnless { it.isNaN() }
                ?: o.optDouble("days", 0.0).takeUnless { it.isNaN() } ?: 0.0,
            status = o.optString("status"),
            reason = o.optString("reason"),
            appliedOn = o.optString("applicationDate").ifBlank { o.optString("createdAt") },
        )
    }
}
