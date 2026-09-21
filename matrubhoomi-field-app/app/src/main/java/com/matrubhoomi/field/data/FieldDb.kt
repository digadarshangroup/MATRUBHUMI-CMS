package com.matrubhoomi.field.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.location.Location
import org.json.JSONArray
import org.json.JSONObject

/**
 * The outbox. Everything this app records is written HERE first and sent later.
 *
 * WHY WRITE-THEN-SEND, RATHER THAN SEND-THEN-FALL-BACK
 * ----------------------------------------------------
 * The obvious design is to POST the record and queue it only if that fails.
 * It is wrong in exactly the case this app exists for: the employee is standing
 * in a field with one flickering bar, the POST hangs for forty seconds, the
 * screen is off by then, the process is killed, and the record is gone — with
 * the employee believing it was saved because the form closed.
 *
 * So a submission is committed to this database synchronously, the screen says
 * "saved", and a worker delivers it whenever the network allows. The employee is
 * never waiting on a socket, and nothing is ever lost to one.
 *
 * WHY SQLITE DIRECTLY, WITHOUT ROOM
 * ---------------------------------
 * Three tables and a dozen statements. Room would add an annotation processor,
 * a build plugin and generated code to express the same thing, and its main
 * benefit — compile-time-checked queries over an evolving schema — is worth
 * little for a schema this small that is written once.
 */
class FieldDb(context: Context) : SQLiteOpenHelper(context.applicationContext, NAME, null, VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE pings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              lat REAL NOT NULL, lng REAL NOT NULL,
              accuracy REAL, altitude REAL, speed REAL, bearing REAL,
              recorded_at INTEGER NOT NULL,
              battery INTEGER, is_charging INTEGER DEFAULT 0,
              is_mock INTEGER DEFAULT 0, is_moving INTEGER DEFAULT 0,
              provider TEXT, activity TEXT, source TEXT DEFAULT 'service',
              task_id TEXT, lead_id TEXT
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX idx_pings_at ON pings(recorded_at)")

        db.execSQL(
            """
            CREATE TABLE submissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              client_ref TEXT NOT NULL UNIQUE,
              payload TEXT NOT NULL,
              photos TEXT NOT NULL DEFAULT '[]',
              created_at INTEGER NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              last_error TEXT,
              state TEXT NOT NULL DEFAULT 'pending'
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX idx_sub_state ON submissions(state, created_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // There is no migration to write yet, and dropping is safe ONLY because
        // this database is an outbox: anything in it that has already been
        // delivered is on the server, and anything that has not is lost.
        // The day this holds anything that is not a copy, this must become a
        // real migration.
        db.execSQL("DROP TABLE IF EXISTS pings")
        db.execSQL("DROP TABLE IF EXISTS submissions")
        onCreate(db)
    }

    /* ── Location fixes ───────────────────────────────────────────── */

    fun enqueuePing(
        location: Location,
        battery: Int?,
        isCharging: Boolean,
        isMoving: Boolean,
        activity: String,
        source: String = "service",
        taskId: String? = null,
        leadId: String? = null,
    ) {
        val values = ContentValues().apply {
            put("lat", location.latitude)
            put("lng", location.longitude)
            put("accuracy", if (location.hasAccuracy()) location.accuracy.toDouble() else null)
            put("altitude", if (location.hasAltitude()) location.altitude else null)
            put("speed", if (location.hasSpeed()) location.speed.toDouble() else null)
            put("bearing", if (location.hasBearing()) location.bearing.toDouble() else null)
            put("recorded_at", location.time)
            put("battery", battery)
            put("is_charging", if (isCharging) 1 else 0)
            put("is_mock", if (isMockLocation(location)) 1 else 0)
            put("is_moving", if (isMoving) 1 else 0)
            put("provider", location.provider)
            put("activity", activity)
            put("source", source)
            put("task_id", taskId)
            put("lead_id", leadId)
        }
        writableDatabase.insert("pings", null, values)
    }

    /**
     * The oldest `limit` fixes, as the JSON the API expects, with their ids so
     * the caller can delete exactly what was accepted.
     *
     * Oldest first, deliberately: a day recovered after eight hours with no
     * signal is delivered in the order it happened, and the server's distance
     * walk depends on that order being right.
     */
    fun takePings(limit: Int): Pair<List<Long>, JSONArray> {
        val ids = ArrayList<Long>()
        val array = JSONArray()

        readableDatabase.query(
            "pings", null, null, null, null, null, "recorded_at ASC", limit.toString(),
        ).use { c ->
            while (c.moveToNext()) {
                ids.add(c.getLong(c.getColumnIndexOrThrow("id")))
                array.put(
                    JSONObject().apply {
                        put("lat", c.getDouble(c.getColumnIndexOrThrow("lat")))
                        put("lng", c.getDouble(c.getColumnIndexOrThrow("lng")))
                        c.optDouble("accuracy")?.let { put("accuracy", it) }
                        c.optDouble("altitude")?.let { put("altitude", it) }
                        c.optDouble("speed")?.let { put("speed", it) }
                        c.optDouble("bearing")?.let { put("bearing", it) }
                        // ISO-8601, because the server stores a Date and a
                        // millisecond number would be read as a string by it.
                        put("recordedAt", isoUtc(c.getLong(c.getColumnIndexOrThrow("recorded_at"))))
                        c.optInt("battery")?.let { put("battery", it) }
                        put("isCharging", c.getInt(c.getColumnIndexOrThrow("is_charging")) == 1)
                        put("isMock", c.getInt(c.getColumnIndexOrThrow("is_mock")) == 1)
                        put("isMoving", c.getInt(c.getColumnIndexOrThrow("is_moving")) == 1)
                        put("provider", c.getString(c.getColumnIndexOrThrow("provider")) ?: "")
                        put("activity", c.getString(c.getColumnIndexOrThrow("activity")) ?: "unknown")
                        put("source", c.getString(c.getColumnIndexOrThrow("source")) ?: "service")
                        c.getString(c.getColumnIndexOrThrow("task_id"))?.let { put("taskId", it) }
                        c.getString(c.getColumnIndexOrThrow("lead_id"))?.let { put("leadId", it) }
                    },
                )
            }
        }

        return ids to array
    }

    fun deletePings(ids: List<Long>) {
        if (ids.isEmpty()) return
        writableDatabase.execSQL("DELETE FROM pings WHERE id IN (${ids.joinToString(",")})")
    }

    fun pingCount(): Int = countOf("pings")

    /**
     * Drop the oldest fixes when the queue has grown beyond reason.
     *
     * Ten thousand fixes is roughly two days of continuous recording with no
     * network at all. Past that, something is wrong that more storage will not
     * fix, and an unbounded table on a 16GB handset eventually takes the whole
     * app down. The OLDEST go, so the recent trail — the part anybody will ask
     * about — survives.
     */
    fun trimPings(keep: Int = 10_000) {
        writableDatabase.execSQL(
            "DELETE FROM pings WHERE id NOT IN (SELECT id FROM pings ORDER BY recorded_at DESC LIMIT $keep)",
        )
    }

    /* ── Submissions ──────────────────────────────────────────────── */

    /** @param photos local file paths still to be uploaded, with their field keys. */
    fun enqueueSubmission(clientRef: String, payload: JSONObject, photos: JSONArray) {
        val values = ContentValues().apply {
            put("client_ref", clientRef)
            put("payload", payload.toString())
            put("photos", photos.toString())
            put("created_at", System.currentTimeMillis())
            put("state", "pending")
        }
        // CONFLICT_IGNORE, not REPLACE: the client_ref is what makes a retry
        // idempotent, and a second write under the same ref is the same record
        // arriving twice, not a newer version of it.
        writableDatabase.insertWithOnConflict("submissions", null, values, SQLiteDatabase.CONFLICT_IGNORE)
    }

    data class Queued(
        val id: Long,
        val clientRef: String,
        val payload: JSONObject,
        val photos: JSONArray,
        val attempts: Int,
    )

    fun pendingSubmissions(limit: Int = 20): List<Queued> {
        val out = ArrayList<Queued>()
        readableDatabase.query(
            "submissions", null, "state = ?", arrayOf("pending"), null, null, "created_at ASC", limit.toString(),
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    Queued(
                        id = c.getLong(c.getColumnIndexOrThrow("id")),
                        clientRef = c.getString(c.getColumnIndexOrThrow("client_ref")),
                        payload = JSONObject(c.getString(c.getColumnIndexOrThrow("payload"))),
                        photos = JSONArray(c.getString(c.getColumnIndexOrThrow("photos"))),
                        attempts = c.getInt(c.getColumnIndexOrThrow("attempts")),
                    ),
                )
            }
        }
        return out
    }

    fun markSent(id: Long) {
        writableDatabase.delete("submissions", "id = ?", arrayOf(id.toString()))
    }

    /**
     * A record the server will never accept.
     *
     * Kept, not deleted — it holds a farmer's details and an employee's
     * afternoon. It stops being retried and starts being visible in the app as
     * something that needs a human, which is the honest outcome for a record
     * that cannot be delivered.
     */
    fun markRejected(id: Long, error: String) {
        writableDatabase.update(
            "submissions",
            ContentValues().apply {
                put("state", "rejected")
                put("last_error", error)
            },
            "id = ?", arrayOf(id.toString()),
        )
    }

    fun noteAttempt(id: Long, error: String?) {
        writableDatabase.execSQL(
            "UPDATE submissions SET attempts = attempts + 1, last_error = ? WHERE id = ?",
            arrayOf(error ?: "", id.toString()),
        )
    }

    /** Photo URLs earned by a partially delivered submission, so a retry does
     *  not re-upload what already went up. */
    fun updatePhotos(id: Long, photos: JSONArray) {
        writableDatabase.update(
            "submissions",
            ContentValues().apply { put("photos", photos.toString()) },
            "id = ?", arrayOf(id.toString()),
        )
    }

    fun pendingCount(): Int = countOf("submissions", "state = 'pending'")
    fun rejectedCount(): Int = countOf("submissions", "state = 'rejected'")

    fun rejected(): List<Queued> {
        val out = ArrayList<Queued>()
        readableDatabase.query(
            "submissions", null, "state = ?", arrayOf("rejected"), null, null, "created_at DESC", "50",
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    Queued(
                        id = c.getLong(c.getColumnIndexOrThrow("id")),
                        clientRef = c.getString(c.getColumnIndexOrThrow("client_ref")),
                        payload = JSONObject(c.getString(c.getColumnIndexOrThrow("payload"))),
                        photos = JSONArray(c.getString(c.getColumnIndexOrThrow("photos"))),
                        attempts = c.getInt(c.getColumnIndexOrThrow("attempts")),
                    ),
                )
            }
        }
        return out
    }

    private fun countOf(table: String, where: String? = null): Int {
        val sql = "SELECT COUNT(*) FROM $table" + if (where != null) " WHERE $where" else ""
        readableDatabase.rawQuery(sql, null).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }

    companion object {
        private const val NAME = "field_outbox.db"
        private const val VERSION = 1

        @Volatile private var instance: FieldDb? = null
        fun get(context: Context): FieldDb =
            instance ?: synchronized(this) { instance ?: FieldDb(context).also { instance = it } }

        /** Android's own mock-location flag, across the version split. */
        fun isMockLocation(location: Location): Boolean =
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) location.isMock
            else @Suppress("DEPRECATION") location.isFromMockProvider

        fun isoUtc(millis: Long): String {
            val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            format.timeZone = java.util.TimeZone.getTimeZone("UTC")
            return format.format(java.util.Date(millis))
        }
    }
}

/* Cursor helpers — a null numeric column read with getDouble() comes back 0.0,
   which for an accuracy or a speed is a lie the server would then trust. */
private fun android.database.Cursor.optDouble(column: String): Double? {
    val i = getColumnIndexOrThrow(column)
    return if (isNull(i)) null else getDouble(i)
}

private fun android.database.Cursor.optInt(column: String): Int? {
    val i = getColumnIndexOrThrow(column)
    return if (isNull(i)) null else getInt(i)
}
