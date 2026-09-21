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
        sp.edit()
            .remove(KEY_TOKEN).remove(KEY_EMP_ID).remove(KEY_EMP_NAME).remove(KEY_EMP_CODE)
            .putBoolean(KEY_ON_DUTY, false)
            .apply()
    }

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

    var trackingEnabled: Boolean
        get() = sp.getBoolean(KEY_TRACKING_ENABLED, true)
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
        private const val KEY_TRACKING_ENABLED = "tracking_enabled"
        private const val KEY_LAST_SYNC = "last_sync"
        private const val KEY_BOOTSTRAP = "bootstrap"
        private const val KEY_BATTERY_PROMPT = "battery_prompt_shown"

        @Volatile private var instance: Prefs? = null

        fun get(context: Context): Prefs =
            instance ?: synchronized(this) {
                instance ?: Prefs(context).also { instance = it }
            }
    }
}
