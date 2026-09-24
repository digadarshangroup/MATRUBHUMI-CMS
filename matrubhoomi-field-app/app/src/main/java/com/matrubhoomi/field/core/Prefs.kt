package com.matrubhoomi.field.core

import android.content.Context
import android.content.SharedPreferences

/**
 * Everything the app remembers between launches.
 *
 * ON THE TOKEN NOT BEING ENCRYPTED
 * --------------------------------
 * It lives in a private SharedPreferences file, which on a non-rooted handset is
 * readable only by this app. It is deliberately NOT wrapped in EncryptedSharedPreferences:
 * that library keys off the Android keystore, and its failure mode on the cheap
 * handsets this runs on — a keystore that loses its key after an OS update — is
 * an app that cannot decrypt its own session and cannot explain why. The
 * trade is a token readable on a rooted phone against an app that stops working
 * on a phone that updated overnight, and for a field team the second is worse.
 *
 * The token is short-lived and scoped to one employee's own records either way.
 */
class Prefs(context: Context) {

    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("field", Context.MODE_PRIVATE)

    /* ── Where the server is ──────────────────────────────────────── */

    /**
     * Overrides the address baked in at build time.
     *
     * A field handset lives for months and the office IP changes; a laptop on
     * a hotel wifi changes hourly. Without this, every change is a rebuild, a
     * transfer and a reinstall on every phone. Set from the sign-in screen,
     * blank means "use the one this APK was built with".
     */
    var serverUrl: String?
        get() = sp.getString(KEY_SERVER, null)?.ifBlank { null }
        set(value) = sp.edit().putString(KEY_SERVER, value?.trim()?.trimEnd('/')).apply()

    /* ── Session ──────────────────────────────────────────────────── */

    var token: String?
        get() = sp.getString(KEY_TOKEN, null)
        set(value) = sp.edit().putString(KEY_TOKEN, value).apply()

    var employeeId: String?
        get() = sp.getString(KEY_EMP_ID, null)
        set(value) = sp.edit().putString(KEY_EMP_ID, value).apply()

    var employeeName: String
        get() = sp.getString(KEY_EMP_NAME, "") ?: ""
        set(value) = sp.edit().putString(KEY_EMP_NAME, value).apply()

    var employeeCode: String
        get() = sp.getString(KEY_EMP_CODE, "") ?: ""
        set(value) = sp.edit().putString(KEY_EMP_CODE, value).apply()

    val isSignedIn: Boolean get() = !token.isNullOrBlank()

    fun signOut() {
        // Deliberately targeted rather than sp.edit().clear(): the queued
        // submissions and pings belong to work already done, and clearing the
        // whole file would strand them with no employee to attribute them to.
        // They are held, and go up when somebody signs in again.
        //
        // The ROLE goes with the session, though. The next person to sign in
        // on this handset may be an accountant, and nothing about the last
        // user's field work or tracking may carry over to them.
        sp.edit()
            .remove(KEY_TOKEN).remove(KEY_EMP_ID).remove(KEY_EMP_NAME).remove(KEY_EMP_CODE)
            .remove(KEY_BOOTSTRAP).remove(KEY_IS_FIELD).remove(KEY_NOW_LINE).remove(KEY_SERVER_DAY_KM)
            .remove(KEY_INBOX_SEEN).remove(KEY_ATTENDANCE_NOTE).remove(KEY_MUST_CHANGE_PW)
            .putBoolean(KEY_ON_DUTY, false)
            .putBoolean(KEY_TRACKING_ENABLED, false)
            .putLong(KEY_DUTY_AT, 0L)
            .apply()
    }

    /* ── What this person's app is ────────────────────────────────── */

    /**
     * Field staff — set from the server's capabilities on every bootstrap.
     * Read by the parts that run without a screen (the boot receiver, the
     * heartbeat alarm, the sync worker), which must know whether this handset
     * has any business recording a location without asking the network.
     */
    var isFieldStaff: Boolean
        get() = sp.getBoolean(KEY_IS_FIELD, false)
        set(value) = sp.edit().putBoolean(KEY_IS_FIELD, value).apply()

    /** Seconds between "I am still here" fixes while the phone does not move. */
    var heartbeatSeconds: Int
        get() = sp.getInt(KEY_HEARTBEAT, 120)
        set(value) = sp.edit().putInt(KEY_HEARTBEAT, value.coerceIn(30, 900)).apply()

    /**
     * The office's own reading of where the employee is — "At Kalmeshwar ·
     * 25 min" — from the last location batch it acknowledged. Shown in the
     * on-duty notification so the phone and the desk say the same thing.
     */
    var nowLine: String
        get() = sp.getString(KEY_NOW_LINE, "") ?: ""
        set(value) = sp.edit().putString(KEY_NOW_LINE, value).apply()

    /**
     * The day's distance as the SERVER counts it, "yyyy-MM-dd|km", from the
     * last upload. The on-duty notification shows this rather than a counter
     * of its own: that one started again from zero every time the service was
     * restarted — after an update, or an OEM killer — and told somebody eight
     * kilometres into their day that they had done none.
     */
    var serverDayKm: String
        get() = sp.getString(KEY_SERVER_DAY_KM, "") ?: ""
        set(value) = sp.edit().putString(KEY_SERVER_DAY_KM, value).apply()

    /** Why the session ended, for the sign-in screen to say. Cleared once shown. */
    var signedOutReason: String
        get() = sp.getString(KEY_SIGNED_OUT_REASON, "") ?: ""
        set(value) = sp.edit().putString(KEY_SIGNED_OUT_REASON, value).apply()

    /** What happened to today's field attendance when duty last ended. */
    /**
     * Tell `onChange` whenever one of the values the screens show changes
     * underneath them — the sync worker storing an attendance note, the
     * notification's "End duty" action, the midnight rule. Keep the returned
     * listener referenced: SharedPreferences only holds it weakly.
     */
    fun watch(onChange: () -> Unit): SharedPreferences.OnSharedPreferenceChangeListener {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key in SHOWN_KEYS) onChange()
        }
        sp.registerOnSharedPreferenceChangeListener(listener)
        return listener
    }

    fun unwatch(listener: SharedPreferences.OnSharedPreferenceChangeListener) =
        sp.unregisterOnSharedPreferenceChangeListener(listener)

    var attendanceNote: String
        get() = sp.getString(KEY_ATTENDANCE_NOTE, "") ?: ""
        set(value) = sp.edit().putString(KEY_ATTENDANCE_NOTE, value).apply()

    /**
     * Signed in with the password HR issued (the phone number, after a new
     * hire or a reset). The app asks for a password of their own before
     * anything else, and keeps asking after a restart until it has one.
     */
    var mustChangePassword: Boolean
        get() = sp.getBoolean(KEY_MUST_CHANGE_PW, false)
        set(value) = sp.edit().putBoolean(KEY_MUST_CHANGE_PW, value).apply()

    /**
     * When the employee said they had already let the app run in the
     * background. Some phone makers keep a battery switch of their own that
     * Android never reports, so the check can say "no" to somebody who did it.
     */
    var batteryAckAt: Long
        get() = sp.getLong(KEY_BATTERY_ACK, 0L)
        set(value) = sp.edit().putLong(KEY_BATTERY_ACK, value).apply()

    /** The last update check: when, and the release it found (JSON, or ""). */
    var updateCheckedAt: Long
        get() = sp.getLong(KEY_UPDATE_AT, 0L)
        set(value) = sp.edit().putLong(KEY_UPDATE_AT, value).apply()
    var updateJson: String
        get() = sp.getString(KEY_UPDATE_JSON, "") ?: ""
        set(value) = sp.edit().putString(KEY_UPDATE_JSON, value).apply()

    /* ── The inbox ────────────────────────────────────────────────── */

    /** The newest notification already raised on this phone (ISO time). */
    var inboxSeenAt: String
        get() = sp.getString(KEY_INBOX_SEEN, "") ?: ""
        set(value) = sp.edit().putString(KEY_INBOX_SEEN, value).apply()

    /* ── App lock ─────────────────────────────────────────────────── */

    var appLockEnabled: Boolean
        get() = sp.getBoolean(KEY_APP_LOCK, false)
        set(value) = sp.edit().putBoolean(KEY_APP_LOCK, value).apply()

    /** When the app last went to the background, so a quick switch does not relock it. */
    var backgroundedAt: Long
        get() = sp.getLong(KEY_BACKGROUNDED, 0L)
        set(value) = sp.edit().putLong(KEY_BACKGROUNDED, value).apply()

    /* ── Duty ─────────────────────────────────────────────────────── */

    /**
     * Whether the location service should be running.
     *
     * This is the SOURCE OF TRUTH the boot receiver and the restart alarm read.
     * The service being alive is a consequence of this flag, never the other way
     * round — which is what makes "was killed by the OEM cleaner and came back"
     * indistinguishable from "was never killed" as far as the recording goes.
     */
    var onDuty: Boolean
        get() = sp.getBoolean(KEY_ON_DUTY, false)
        set(value) = sp.edit().putBoolean(KEY_ON_DUTY, value).apply()

    var dutyStartedAt: Long
        get() = sp.getLong(KEY_DUTY_AT, 0L)
        set(value) = sp.edit().putLong(KEY_DUTY_AT, value).apply()

    /* ── Tracking cadence, as the server last stated it ───────────── */
    //
    // Read from /api/field/bootstrap so the whole fleet's battery behaviour can
    // be retuned without shipping an APK to twenty handsets in three districts.

    var pingIntervalSeconds: Int
        get() = sp.getInt(KEY_INTERVAL, 20)
        set(value) = sp.edit().putInt(KEY_INTERVAL, value.coerceIn(5, 900)).apply()

    var idleIntervalSeconds: Int
        get() = sp.getInt(KEY_IDLE_INTERVAL, 120)
        set(value) = sp.edit().putInt(KEY_IDLE_INTERVAL, value.coerceIn(15, 3600)).apply()

    var minDistanceMeters: Int
        get() = sp.getInt(KEY_MIN_DISTANCE, 15)
        set(value) = sp.edit().putInt(KEY_MIN_DISTANCE, value.coerceIn(0, 500)).apply()

    var batchSize: Int
        get() = sp.getInt(KEY_BATCH_SIZE, 20)
        set(value) = sp.edit().putInt(KEY_BATCH_SIZE, value.coerceIn(1, 200)).apply()

    /**
     * The longest recorded fixes wait on the phone before they are sent. The
     * desk's live board is only as live as this; a minute keeps "where are
     * they now" within about a minute of true, for a few hundred bytes.
     */
    var uploadEverySeconds: Int
        get() = sp.getInt(KEY_UPLOAD_EVERY, 60)
        set(value) = sp.edit().putInt(KEY_UPLOAD_EVERY, value.coerceIn(15, 900)).apply()

    /**
     * Whether this handset may record a location at all: the server's switch
     * AND this person being field staff. Defaults to NO — a fresh install
     * signed in by somebody in Accounts must never start a location service
     * before the first bootstrap has said who they are.
     */
    var trackingEnabled: Boolean
        get() = sp.getBoolean(KEY_TRACKING_ENABLED, false)
        set(value) = sp.edit().putBoolean(KEY_TRACKING_ENABLED, value).apply()

    /* ── Housekeeping ─────────────────────────────────────────────── */

    var lastSyncAt: Long
        get() = sp.getLong(KEY_LAST_SYNC, 0L)
        set(value) = sp.edit().putLong(KEY_LAST_SYNC, value).apply()

    var lastBootstrapJson: String?
        get() = sp.getString(KEY_BOOTSTRAP, null)
        set(value) = sp.edit().putString(KEY_BOOTSTRAP, value).apply()

    /** Shown once, then never again unless the exemption is revoked. */
    var batteryPromptShown: Boolean
        get() = sp.getBoolean(KEY_BATTERY_PROMPT, false)
        set(value) = sp.edit().putBoolean(KEY_BATTERY_PROMPT, value).apply()

    companion object {
        private const val KEY_SERVER = "server_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_EMP_ID = "employee_id"
        private const val KEY_EMP_NAME = "employee_name"
        private const val KEY_EMP_CODE = "employee_code"
        private const val KEY_ON_DUTY = "on_duty"
        private const val KEY_DUTY_AT = "duty_started_at"
        private const val KEY_INTERVAL = "ping_interval"
        private const val KEY_IDLE_INTERVAL = "idle_interval"
        private const val KEY_MIN_DISTANCE = "min_distance"
        private const val KEY_BATCH_SIZE = "batch_size"
        private const val KEY_UPLOAD_EVERY = "upload_every_s"
        private const val KEY_TRACKING_ENABLED = "tracking_enabled"
        private const val KEY_LAST_SYNC = "last_sync"
        private const val KEY_BOOTSTRAP = "bootstrap"
        private const val KEY_BATTERY_PROMPT = "battery_prompt_shown"
        private const val KEY_IS_FIELD = "is_field_staff"
        private const val KEY_HEARTBEAT = "heartbeat_s"
        private const val KEY_NOW_LINE = "now_line"
        private const val KEY_SERVER_DAY_KM = "server_day_km"
        private const val KEY_SIGNED_OUT_REASON = "signed_out_reason"
        private const val KEY_ATTENDANCE_NOTE = "attendance_note"
        private const val KEY_MUST_CHANGE_PW = "must_change_password"
        private const val KEY_UPDATE_AT = "update_checked_at"
        private const val KEY_BATTERY_ACK = "battery_ack_at"
        private const val KEY_UPDATE_JSON = "update_json"
        /** Changed off-screen and shown on screen — see watch(). */
        private val SHOWN_KEYS = setOf(KEY_ON_DUTY, KEY_DUTY_AT, KEY_ATTENDANCE_NOTE)
        private const val KEY_INBOX_SEEN = "inbox_seen_at"
        private const val KEY_APP_LOCK = "app_lock"
        private const val KEY_BACKGROUNDED = "backgrounded_at"

        @Volatile private var instance: Prefs? = null

        fun get(context: Context): Prefs =
            instance ?: synchronized(this) {
                instance ?: Prefs(context).also { instance = it }
            }
    }
}
