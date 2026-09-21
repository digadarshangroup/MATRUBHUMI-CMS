package com.matrubhoomi.field.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.matrubhoomi.field.MainActivity
import com.matrubhoomi.field.R
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.data.FieldDb
import com.matrubhoomi.field.sync.SyncScheduler

/**
 * The recording itself.
 *
 * WHAT IT ACTUALLY DOES, IN ORDER
 * -------------------------------
 *   1. Goes foreground with a notification the user cannot dismiss. On
 *      Android 10+ that notification is not decoration — it is the LEGAL BASIS
 *      for receiving location while the app is invisible. Without it the
 *      system throttles delivery to a few fixes an hour.
 *   2. Asks the fused provider for high-accuracy fixes at the cadence the
 *      server set, with a minimum displacement so a phone on a desk does not
 *      generate a fix every twenty seconds all day.
 *   3. Writes every fix straight to the outbox and asks the sync worker to
 *      drain it once a batch has built up.
 *   4. Drops to a slower cadence when the phone has been still for a while, and
 *      climbs back the moment it moves.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not filter, smooth or discard fixes. Every fix the provider hands it
 * is recorded, accuracy and all. The judgement about which fixes are trustworthy
 * enough to count as travel is made ONCE, on the server (services/fieldTracking.js),
 * where it can be reconsidered later against data that has already been kept —
 * a fix thrown away on the handset is gone for good, and the rule that threw it
 * away can never be corrected.
 *
 * THE WAKE LOCK
 * -------------
 * A partial one, held for as long as the service runs. The fused provider does
 * not need it on stock Android — but on the OEM builds this ships to, the CPU
 * sleeping between fixes is where a service's callbacks quietly stop arriving.
 * It costs battery. Losing the afternoon costs more.
 */
class LocationService : Service() {

    private lateinit var client: FusedLocationProviderClient
    private lateinit var prefs: Prefs
    private lateinit var db: FieldDb

    private var wakeLock: PowerManager.WakeLock? = null
    private var callback: LocationCallback? = null

    private var currentMode = Mode.ACTIVE
    private var lastFix: Location? = null
    private var lastMovementAt = System.currentTimeMillis()
    private var pingsSinceUpload = 0
    private var lastUploadAt = 0L

    private var fixCount = 0
    private var metresThisSession = 0.0

    private enum class Mode { ACTIVE, IDLE }

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs.get(this)
        db = FieldDb.get(this)
        client = LocationServices.getFusedLocationProviderClient(this)
        createChannel()
        registerReceiver(stopReceiver, IntentFilter(ACTION_STOP), exportFlags())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // FIRST, always, and before anything that can throw: the system gives a
        // service started with startForegroundService five seconds to show its
        // notification, and misses that window as a crash.
        startForegroundCompat()

        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (!prefs.onDuty || !prefs.trackingEnabled) {
            stopSelf()
            return START_NOT_STICKY
        }

        acquireWakeLock()
        requestUpdates(Mode.ACTIVE)

        // START_STICKY: if the system kills this for memory, it recreates it
        // with a null intent — which is why every piece of state above is read
        // from Prefs rather than passed in an extra. The heartbeat alarm covers
        // the OEM killers that do not honour sticky at all.
        return START_STICKY
    }

    /* ── Fixes ────────────────────────────────────────────────────── */

    private fun requestUpdates(mode: Mode) {
        val intervalSeconds =
            if (mode == Mode.IDLE) prefs.idleIntervalSeconds else prefs.pingIntervalSeconds

        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            intervalSeconds * 1000L,
        )
            // The provider may deliver faster than the nominal interval when a
            // fix is free (another app asked for one); half the interval is the
            // floor so a busy handset does not flood the outbox.
            .setMinUpdateIntervalMillis(intervalSeconds * 500L)
            // Nothing recorded unless the phone has actually moved this far.
            // It is the single biggest saving on a day spent mostly parked.
            .setMinUpdateDistanceMeters(prefs.minDistanceMeters.toFloat())
            // Do NOT wait for a precise fix before delivering the first one: on
            // a cold GPS that wait is up to a minute, and a coarse fix now is
            // more use than a perfect one after the employee has walked off.
            .setWaitForAccurateLocation(false)
            // A ceiling on how long the provider may batch fixes before
            // delivering them. Fixes carry their own timestamps, so batching
            // costs nothing in accuracy and saves a wake-up per fix.
            .setMaxUpdateDelayMillis(intervalSeconds * 3000L)
            .build()

        callback?.let { client.removeLocationUpdates(it) }

        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.locations.forEach { record(it) }
            }
        }
        callback = cb
        currentMode = mode

        try {
            client.requestLocationUpdates(request, cb, mainLooper)
        } catch (e: SecurityException) {
            // The permission was revoked while running — the person turned
            // location off in the shade, or Android reset it for an unused app.
            // Nothing to record, and nothing to be gained by staying alive.
            stopSelf()
        }
    }

    private fun record(location: Location) {
        fixCount++

        val moved = lastFix?.distanceTo(location) ?: 0f
        val accuracy = if (location.hasAccuracy()) location.accuracy else 0f
        val lastAccuracy = lastFix?.takeIf { it.hasAccuracy() }?.accuracy ?: 0f

        // The SAME rule the server counts by (services/fieldTracking.js): a step
        // must clearly exceed the uncertainty of the two fixes behind it.
        //
        // Kept in step deliberately. The notification used a flat 12m and so
        // showed a figure the desk's screen disagreed with — an employee being
        // told two different distances for the same day has no reason to trust
        // either. When one changes, change both.
        val floor = maxOf(maxOf(accuracy, lastAccuracy) * JITTER_FACTOR, JITTER_MIN_M)
        val speed = if (location.hasSpeed()) location.speed else null
        val standingStill = speed != null && speed < STILL_SPEED && moved < maxOf(accuracy, lastAccuracy) * 3f

        val realStep = moved >= floor && !standingStill && accuracy <= ACCURACY_LIMIT

        // Movement for the CADENCE decision is a lower bar than movement for
        // the DISTANCE total: the service should wake up and start sampling
        // densely as soon as somebody might be walking, even if that first step
        // is too small to be counted as travel.
        val isMoving = realStep || (speed != null && speed > MOVING_SPEED)
        if (isMoving) lastMovementAt = System.currentTimeMillis()
        if (realStep) metresThisSession += moved

        lastFix = location

        db.enqueuePing(
            location = location,
            battery = batteryPercent(),
            isCharging = isCharging(),
            isMoving = isMoving,
            activity = if (isMoving) inferActivity(location) else "still",
        )

        pingsSinceUpload++
        maybeUpload()
        adaptCadence()
        updateNotification()
    }

    /**
     * Slow down when nothing is happening; speed up the moment it does.
     *
     * The asymmetry is deliberate. Dropping to the idle cadence takes five
     * minutes of genuine stillness, so a farmer's long conversation does not
     * cost a cadence change every time somebody shifts their weight. Coming
     * BACK is immediate, because the first hundred metres of a journey is the
     * part that says where somebody went.
     */
    private fun adaptCadence() {
        val stillFor = System.currentTimeMillis() - lastMovementAt
        val shouldIdle = stillFor > IDLE_AFTER_MS

        if (shouldIdle && currentMode == Mode.ACTIVE) requestUpdates(Mode.IDLE)
        else if (!shouldIdle && currentMode == Mode.IDLE) requestUpdates(Mode.ACTIVE)
    }

    private fun maybeUpload() {
        val dueByCount = pingsSinceUpload >= prefs.batchSize
        val dueByTime = System.currentTimeMillis() - lastUploadAt > UPLOAD_EVERY_MS
        if (!dueByCount && !dueByTime) return

        pingsSinceUpload = 0
        lastUploadAt = System.currentTimeMillis()
        // Asks WorkManager rather than posting from here: the request then
        // survives this service being killed mid-flight, and waits for a
        // network rather than failing into a retry loop without one.
        SyncScheduler.now(this)
    }

    /** Crude, and honest about it — the server records it as a hint, not a fact. */
    private fun inferActivity(location: Location): String = when {
        !location.hasSpeed() -> "unknown"
        location.speed > 6.5f -> "in_vehicle"   // ~23 km/h and above
        location.speed > 3.0f -> "on_bicycle"
        location.speed > 0.6f -> "walking"
        else -> "still"
    }

    /* ── The notification ─────────────────────────────────────────── */

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.tracking_channel_name),
            // LOW: no sound, no heads-up. It is a persistent status line, and a
            // notification that chimes every time it updates its distance would
            // be turned off within a day — taking the recording with it.
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.tracking_channel_desc)
            setShowBadge(false)
            enableVibration(false)
        }
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val km = String.format(java.util.Locale.US, "%.1f", metresThisSession / 1000.0)
        val queued = db.pingCount()

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("On duty — recording your round")
            .setContentText(
                buildString {
                    append("$km km today")
                    if (currentMode == Mode.IDLE) append(" · paused while still")
                    if (queued > 0) append(" · $queued waiting to send")
                },
            )
            .setContentIntent(open)
            // Ongoing and non-dismissible. This is the honest signal that
            // location is being recorded — the user should be able to see it at
            // any moment, and should never be able to hide it while it runs.
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "End duty",
                PendingIntent.getBroadcast(
                    this, 1, Intent(ACTION_STOP).setPackage(packageName),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            .build()
    }

    private fun startForegroundCompat() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification() {
        // Every fix would be up to three notification posts a minute. Once a
        // minute is enough for a status line and keeps the system's rate
        // limiter — which silently drops updates past a threshold — out of it.
        if (System.currentTimeMillis() - lastNotificationAt < 60_000) return
        lastNotificationAt = System.currentTimeMillis()
        runCatching {
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(NOTIFICATION_ID, buildNotification())
        }
    }

    private var lastNotificationAt = 0L

    /* ── Battery ──────────────────────────────────────────────────── */

    private fun batteryPercent(): Int? = runCatching {
        (getSystemService(Context.BATTERY_SERVICE) as BatteryManager)
            .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            .takeIf { it in 0..100 }
    }.getOrNull()

    private fun isCharging(): Boolean = runCatching {
        (getSystemService(Context.BATTERY_SERVICE) as BatteryManager).isCharging
    }.getOrDefault(false)

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "matrubhoomi:duty").apply {
            setReferenceCounted(false)
            // A timeout, always. A wake lock held forever by a service that
            // leaked is a flat battery by lunchtime and no way to tell why.
            // Twelve hours is longer than any round; the heartbeat re-acquires
            // it if a day somehow runs past that.
            acquire(12 * 60 * 60 * 1000L)
        }
    }

    /* ── Ending ───────────────────────────────────────────────────── */

    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            // The notification's own "End duty" action. It clears the flag as
            // well as stopping the service — otherwise the heartbeat would
            // faithfully restart what the user just switched off.
            Tracking.stopDuty(context)
        }
    }

    private fun exportFlags(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Context.RECEIVER_NOT_EXPORTED else 0

    override fun onTaskRemoved(rootIntent: Intent?) {
        // The app was swiped out of Recents. That gesture means "I am done
        // looking at it", not "stop recording my round" — so the service stays
        // and the heartbeat is re-armed in case this handset kills us anyway.
        if (Prefs.get(this).onDuty) Tracking.scheduleHeartbeat(this)
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        callback?.let { runCatching { client.removeLocationUpdates(it) } }
        callback = null
        runCatching { unregisterReceiver(stopReceiver) }
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null

        // If we are dying while still on duty, this was not a user decision —
        // it was the system or an OEM cleaner. Leave an alarm behind to undo it.
        if (Prefs.get(this).onDuty) Tracking.scheduleHeartbeat(this)

        // Anything collected but not yet sent goes now.
        SyncScheduler.now(this)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_START = "com.matrubhoomi.field.START_TRACKING"
        const val ACTION_STOP = "com.matrubhoomi.field.STOP_TRACKING"

        private const val CHANNEL_ID = "duty"
        private const val NOTIFICATION_ID = 4201

        // Mirrors services/fieldTracking.js. See the note in record().
        private const val JITTER_FACTOR = 2.0f
        private const val JITTER_MIN_M = 10f
        private const val ACCURACY_LIMIT = 35f
        private const val STILL_SPEED = 0.35f
        private const val MOVING_SPEED = 0.6f  // m/s — a slow walk
        private const val IDLE_AFTER_MS = 5 * 60 * 1000L
        private const val UPLOAD_EVERY_MS = 2 * 60 * 1000L
    }
}
