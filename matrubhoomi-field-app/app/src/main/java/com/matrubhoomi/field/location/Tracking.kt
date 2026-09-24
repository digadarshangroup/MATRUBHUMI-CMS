package com.matrubhoomi.field.location

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.sync.SyncScheduler

/**
 * Starting, stopping, and KEEPING the recording alive.
 *
 * THE PROBLEM THIS FILE EXISTS FOR
 * --------------------------------
 * Stock Android will keep a foreground service with a location type running
 * indefinitely. The handsets this app runs on are not stock: Xiaomi's MIUI,
 * Vivo's FunTouch, Oppo's ColorOS and Samsung's "Put unused apps to sleep" all
 * ship aggressive process killers that ignore the foreground-service contract
 * and stop apps minutes after the screen goes off. On those handsets a
 * correctly written service simply stops, silently, and the day's trail ends
 * mid-afternoon with nothing in any log to explain it.
 *
 * Three defences, and none of them is sufficient alone:
 *
 *   1. THE FLAG IS THE TRUTH. `Prefs.onDuty` says whether recording should be
 *      happening. The service is a consequence of it. So a service that was
 *      killed is a discrepancy anybody can notice and fix, rather than a state
 *      nobody can observe.
 *   2. A REPEATING EXACT ALARM re-asserts the flag every few minutes. If the
 *      service is gone, it comes back; if it is running, `ensure()` is a no-op.
 *      Exact, because an inexact alarm cannot legally start a foreground
 *      service on Android 12+ (see the manifest's note).
 *   3. BOOT AND UPDATE RECEIVERS cover the two cases the alarm cannot: the
 *      handset was switched off, and the app was reinstalled.
 *
 * And one thing the user has to do, which no code can do for them: exempt the
 * app from battery optimisation, and on OEM builds, tick "Autostart" and
 * "No restrictions". The app asks for the first and explains the rest.
 */
object Tracking {

    private const val ALARM_REQUEST = 8801
    private const val HEARTBEAT_MINUTES = 5L

    /** Why duty ended — decides whether the office is told, and what the notification says. */
    enum class StopReason { User, Notification, Midnight, SignedOut, RoleChanged }

    /* ── Duty ─────────────────────────────────────────────────────── */

    /**
     * Start the day's recording.
     *
     * ONLY FOR FIELD STAFF, whatever calls it. `trackingEnabled` is set from
     * the server's capabilities on every bootstrap and is false for everybody
     * outside Sales — so a stale button, a stale notification or a restored
     * screen can never start a location service on an accountant's phone.
     *
     * @return false when this person may not record at all.
     */
    fun startDuty(context: Context): Boolean {
        val prefs = Prefs.get(context)
        if (!prefs.trackingEnabled || !prefs.isFieldStaff) return false
        val now = System.currentTimeMillis()
        prefs.onDuty = true
        if (prefs.dutyStartedAt == 0L) prefs.dutyStartedAt = now
        prefs.nowLine = ""
        // What happened when the LAST duty ended is not news once a new one is
        // running; the next end says what happened to the whole day.
        prefs.attendanceNote = ""

        // The office is TOLD, through the outbox like everything else: without
        // it the desk cannot tell "ended the day at six" from "phone died at
        // six", and ending duty is what files the day's field attendance.
        com.matrubhoomi.field.data.FieldDb.get(context)
            .enqueueDutyEvent("on", now, java.util.UUID.randomUUID().toString(), null, null, prefs.employeeId)

        ensure(context)
        scheduleHeartbeat(context)
        SyncScheduler.schedulePeriodic(context)
        SyncScheduler.now(context)
        return true
    }

    /**
     * @param at  when duty ended — now, or the last moment of the day for a
     *            duty that ran past midnight.
     */
    fun stopDuty(context: Context, reason: StopReason = StopReason.User, at: Long = System.currentTimeMillis()) {
        val prefs = Prefs.get(context)
        val wasOn = prefs.onDuty
        prefs.onDuty = false
        prefs.dutyStartedAt = 0L
        prefs.nowLine = ""

        // A signed-out session cannot deliver anything, so nothing is queued
        // for it; every other ending is reported so the day closes properly.
        if (wasOn && reason != StopReason.SignedOut) {
            com.matrubhoomi.field.data.FieldDb.get(context)
                .enqueueDutyEvent("off", at, java.util.UUID.randomUUID().toString(), null, null, prefs.employeeId)
        }

        cancelHeartbeat(context)
        context.stopService(Intent(context, LocationService::class.java))
        // Whatever the day collected goes up now rather than waiting for the
        // next periodic window — the employee has just said they are finished.
        SyncScheduler.now(context)
    }

    /**
     * End a duty left running past midnight.
     *
     * A day is the unit everything here is counted in — distance, stops, the
     * attendance it files — so a duty is not allowed to spill into the next
     * one. It is ended at the last moment of the day it started, and the
     * employee is told. Checked by every heartbeat and every time the app
     * opens, so it happens within minutes of midnight even in a pocket.
     *
     * @return true when it ended one.
     */
    fun endDutyIfDayChanged(context: Context): Boolean {
        val prefs = Prefs.get(context)
        if (!prefs.onDuty || prefs.dutyStartedAt == 0L) return false
        val zone = java.time.ZoneId.systemDefault()
        val started = java.time.Instant.ofEpochMilli(prefs.dutyStartedAt).atZone(zone).toLocalDate()
        val today = java.time.LocalDate.now(zone)
        if (!started.isBefore(today)) return false
        val endOfDay = started.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() - 1
        stopDuty(context, StopReason.Midnight, at = endOfDay)
        com.matrubhoomi.field.sync.Notifier.dutyEndedAtMidnight(context)
        return true
    }

    /** The phone's own location switch — separate from the app's permission. */
    fun isLocationSwitchOn(context: Context): Boolean {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
        return androidx.core.location.LocationManagerCompat.isLocationEnabled(lm)
    }

    /**
     * Start the service if it should be running and is not.
     *
     * Safe to call from anywhere, as often as you like: the service treats a
     * second start as a reconfiguration, not a restart, so the fix stream is
     * never interrupted by a heartbeat that had nothing to fix.
     */
    fun ensure(context: Context) {
        val prefs = Prefs.get(context)
        if (!prefs.onDuty || !prefs.trackingEnabled || !prefs.isFieldStaff) return
        if (!hasForegroundLocation(context)) return
        if (endDutyIfDayChanged(context)) return

        val intent = Intent(context, LocationService::class.java).setAction(LocationService.ACTION_START)

        // startForegroundService, not startService: the service has five
        // seconds to call startForeground() or the system kills it with an
        // ANR-style crash, and that contract is exactly what keeps it alive
        // afterwards.
        //
        // WRAPPED, because this call is not always allowed. Android 12+ refuses
        // a foreground-service start from a background process and throws
        // ForegroundServiceStartNotAllowedException. Callers here include a
        // boot receiver and an exact alarm — both exempt — but also anything
        // that runs while the app is not visible, and an uncaught throw from
        // one of those kills the app.
        //
        // A refusal is not fatal and not final: the heartbeat is re-armed, and
        // an exact alarm IS an allowed context, so the recording resumes a few
        // minutes later without anybody noticing.
        try {
            ContextCompat.startForegroundService(context, intent)
        } catch (e: Exception) {
            android.util.Log.w("Tracking", "Could not start the recording now: ${e.javaClass.simpleName}")
            scheduleHeartbeat(context)
        }
    }

    /* ── The heartbeat ────────────────────────────────────────────── */

    private fun alarmIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            ALARM_REQUEST,
            Intent(context, RestartReceiver::class.java).setAction(RestartReceiver.ACTION_HEARTBEAT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun scheduleHeartbeat(context: Context) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val at = System.currentTimeMillis() + HEARTBEAT_MINUTES * 60 * 1000

        // Re-armed by the receiver each time rather than set as a repeating
        // alarm: setRepeating is inexact on API 19+ and is coalesced into Doze
        // windows, which is the exact behaviour this is defending against.
        try {
            if (canScheduleExactAlarms(context)) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(context))
            } else {
                // Without the permission this still fires, just late. Late is
                // a worse heartbeat and a better one than none — and the app
                // tells the user what they are losing (see PermissionState).
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(context))
            }
        } catch (e: SecurityException) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(context))
        }
    }

    fun cancelHeartbeat(context: Context) {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(alarmIntent(context))
    }

    /* ── What the system will let us do ───────────────────────────── */

    fun hasForegroundLocation(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    fun hasBackgroundLocation(context: Context): Boolean =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) hasForegroundLocation(context)
        else ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    fun hasNotifications(context: Context): Boolean =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) true
        else ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    fun isBatteryOptimised(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return !pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    fun canScheduleExactAlarms(context: Context): Boolean =
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) true
        else (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()

    /**
     * The system dialog that grants the battery exemption.
     *
     * This is the single most important thing a field handset needs and the
     * only one that cannot be arranged in code. On Play-distributed apps the
     * intent below is policy-restricted; this app is installed by the company
     * onto company-used handsets, which is the case the exemption is for.
     */
    @Suppress("BatteryLife")
    fun requestBatteryExemption(context: Context) {
        runCatching {
            context.startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    .setData(Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure {
            // Some OEM builds do not expose the per-app dialog. The list screen
            // always exists.
            runCatching {
                context.startActivity(
                    Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
        }
    }

    /**
     * "Alarms & reminders" for this app. Only reachable on Android 12 and 12L:
     * from 13 on the manifest's USE_EXACT_ALARM grants it at install, and this
     * is never needed. Falls back to the app's page.
     */
    fun openExactAlarmSettings(context: Context) {
        runCatching {
            check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            context.startActivity(
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    .setData(Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }.onFailure { openAppSettings(context) }
    }

    /** The app's own settings page — where "Allow all the time" has to be set. */
    fun openAppSettings(context: Context) {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/**
 * Puts the service back, and re-arms its own alarm.
 *
 * Runs every few minutes while on duty. Almost every firing finds a healthy
 * service and does nothing, which is what a heartbeat should feel like.
 */
class RestartReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!Prefs.get(context).onDuty) return
        if (Tracking.endDutyIfDayChanged(context)) return
        Tracking.ensure(context)
        // Re-armed here rather than repeated by the system — see scheduleHeartbeat.
        Tracking.scheduleHeartbeat(context)
    }

    companion object {
        const val ACTION_HEARTBEAT = "com.matrubhoomi.field.HEARTBEAT"
    }
}

/**
 * After a reboot or an app update, resume whatever was in progress.
 *
 * BOOT_COMPLETED is one of the documented exemptions from Android 12's
 * background foreground-service ban, which is what makes starting the service
 * from here legal at all.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prefs = Prefs.get(context)
        // The outbox may hold records from before the reboot whatever the duty
        // state is, so the sync net is re-armed either way.
        SyncScheduler.schedulePeriodic(context)
        if (!prefs.onDuty) return
        Tracking.ensure(context)
        Tracking.scheduleHeartbeat(context)
    }
}
