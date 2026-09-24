package com.matrubhoomi.field

import android.app.Application
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.sync.InboxWorker
import com.matrubhoomi.field.sync.SyncScheduler

/**
 * Three things at process start, and nothing else.
 *
 * Both are IDEMPOTENT, which is what makes them safe here: this runs on every
 * cold start, and on some handsets that includes a start caused by the very
 * alarm that is being re-armed. Neither call does anything if the state it
 * wants already holds.
 */
class FieldApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // The net under the outbox. Enqueued as unique periodic work with a
        // KEEP policy, so twenty cold starts do not produce twenty schedules.
        SyncScheduler.schedulePeriodic(this)

        // The inbox check — how leave decisions and approvals reach the phone,
        // since the server's push cannot. Unique work with KEEP, like the one
        // above; only while somebody is signed in.
        if (Prefs.get(this).isSignedIn) InboxWorker.schedule(this)

        // If duty was on when the process died — a reboot, a low-memory kill, a
        // manufacturer's cleaner — the recording has to come back. But NOT by
        // starting the service from here.
        //
        // Application.onCreate runs for EVERY process start, including the ones
        // Android makes in the background for a worker or a broadcast. Starting
        // a foreground service from a background process is forbidden on
        // Android 12+, and it does not fail quietly — it throws
        // ForegroundServiceStartNotAllowedException out of onCreate and takes
        // the whole app down before any window appears. The symptom is brutal
        // and confusing: once duty is ON, every cold start crashes instantly,
        // so the app simply "stops opening".
        //
        // Arming the alarm is always legal. The alarm then starts the service
        // from a context that IS permitted (an exact alarm is one of the
        // documented exemptions), and MainActivity starts it directly whenever
        // somebody actually opens the app.
        if (Prefs.get(this).onDuty) {
            Tracking.scheduleHeartbeat(this)
        }
    }
}
