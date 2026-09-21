package com.matrubhoomi.field.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.data.Api
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.FieldDb
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Delivers the outbox: queued location fixes first, then queued submissions.
 *
 * WHY WORKMANAGER RATHER THAN A COROUTINE IN THE SERVICE
 * ------------------------------------------------------
 * The work has to survive the process. A submission taken at 2pm in a dead spot
 * has to arrive even if the app is force-stopped at 2:05, the handset reboots at
 * 4, and signal only returns at 6. WorkManager persists its queue to disk and
 * re-schedules across reboots; a coroutine dies with the process that owned it.
 *
 * FIXES GO BEFORE FORMS, AND THAT ORDER MATTERS
 * ---------------------------------------------
 * A submission's server-side handling folds "what was achieved" into the day's
 * rollup, and that rollup is keyed on the day the fixes established. Sending the
 * trail first means the visit lands on a day that already exists.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = Prefs.get(applicationContext)
        // Nothing can be attributed without a session, and retrying without one
        // burns battery to earn 401s. The work is retried when somebody signs
        // back in — the outbox is deliberately not cleared on sign-out.
        if (!prefs.isSignedIn) return@withContext Result.success()

        val api = Api.get(applicationContext)
        val db = FieldDb.get(applicationContext)

        var mustRetry = false

        /* ── The trail ───────────────────────────────────────────── */

        // Bounded per run: a handset back from two days offline holds thousands
        // of fixes, and one enormous request on a weak link is the request most
        // likely to fail. Successive runs drain the rest.
        var batches = 0
        while (batches < MAX_BATCHES_PER_RUN) {
            val (ids, pings) = db.takePings(prefs.batchSize)
            if (ids.isEmpty()) break

            when (val result = api.sendPings(pings, UUID.randomUUID().toString())) {
                is ApiResult.Ok -> db.deletePings(ids)
                is ApiResult.Offline -> { mustRetry = true; break }
                is ApiResult.Unauthorised -> return@withContext Result.success()
                is ApiResult.Failed -> {
                    if (result.permanent) {
                        // The server refused these fixes and always will —
                        // a clock skew, a shape it cannot read. Dropping them
                        // is right; keeping them would block every later batch
                        // behind a queue head that can never move.
                        db.deletePings(ids)
                    } else {
                        mustRetry = true
                    }
                    break
                }
            }
            batches++
        }

        db.trimPings()

        /* ── The records ─────────────────────────────────────────── */

        for (queued in db.pendingSubmissions()) {
            // Photos first. Each one that succeeds is written back immediately,
            // so a retry after three of four uploaded does not re-send the
            // three that already landed.
            val photos = queued.photos
            var photosReady = true

            for (i in 0 until photos.length()) {
                val entry = photos.optJSONObject(i) ?: continue
                if (entry.has("url")) continue

                val path = entry.optString("path")
                val file = File(path)
                if (path.isBlank() || !file.exists()) {
                    // The camera file was swept out of the cache before it went
                    // up. The record still has value — the answers, the OTP and
                    // the location are all there — so it goes without the photo
                    // rather than being held for one that no longer exists.
                    entry.put("url", JSONObject.NULL)
                    entry.put("missing", true)
                    continue
                }

                when (val up = api.uploadPhoto(file, entry.optString("fieldKey"), entry.optDoubleOrNullSafe("lat"), entry.optDoubleOrNullSafe("lng"))) {
                    is ApiResult.Ok -> {
                        entry.put("url", up.value.url)
                        entry.put("publicId", up.value.publicId)
                        db.updatePhotos(queued.id, photos)
                        file.delete()
                    }
                    is ApiResult.Offline -> { photosReady = false; mustRetry = true }
                    is ApiResult.Unauthorised -> return@withContext Result.success()
                    is ApiResult.Failed -> {
                        if (up.permanent) {
                            entry.put("url", JSONObject.NULL)
                            entry.put("failed", up.message)
                            db.updatePhotos(queued.id, photos)
                        } else {
                            photosReady = false
                            mustRetry = true
                        }
                    }
                }
                if (!photosReady) break
            }

            if (!photosReady) continue

            val payload = queued.payload
            payload.put("photos", photos.usableOnly())

            when (val result = api.submit(payload)) {
                is ApiResult.Ok -> {
                    db.markSent(queued.id)
                    prefs.lastSyncAt = System.currentTimeMillis()
                }
                is ApiResult.Offline -> mustRetry = true
                is ApiResult.Unauthorised -> return@withContext Result.success()
                is ApiResult.Failed -> {
                    db.noteAttempt(queued.id, result.message)
                    if (result.permanent) {
                        // A validation failure, a cancelled task, a lead that
                        // was deleted. Retrying cannot fix any of them, so it
                        // stops being retried and starts being visible in the
                        // app as something that needs a person.
                        db.markRejected(queued.id, result.message)
                    } else {
                        mustRetry = true
                    }
                }
            }
        }

        if (mustRetry) Result.retry() else Result.success()
    }

    companion object {
        private const val MAX_BATCHES_PER_RUN = 25
    }
}

/** Photos that actually have a URL. The rest were missing or refused. */
private fun JSONArray.usableOnly(): JSONArray {
    val out = JSONArray()
    for (i in 0 until length()) {
        val o = optJSONObject(i) ?: continue
        val url = o.opt("url")
        if (url is String && url.isNotBlank()) out.put(o)
    }
    return out
}

private fun JSONObject.optDoubleOrNullSafe(key: String): Double? =
    if (isNull(key)) null else optDouble(key).takeUnless { it.isNaN() }

/**
 * When the outbox is drained, and how insistently.
 *
 * Two schedules on purpose. `now()` is fired the moment something is queued and
 * whenever the location service finishes a batch — that is the normal path, and
 * on a working connection nothing waits more than a second or two. The periodic
 * one is the safety net for the case that matters: the app was force-stopped, or
 * the handset rebooted, while records were still waiting.
 */
object SyncScheduler {

    private const val UNIQUE_NOW = "field-sync-now"
    private const val UNIQUE_PERIODIC = "field-sync-periodic"

    private val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun now(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            // Exponential from ten seconds: a village edge comes and goes, and
            // hammering it every second drains a battery to no purpose.
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context)
            // KEEP, not REPLACE: replacing a running sync mid-upload is how a
            // photo gets uploaded twice.
            .enqueueUniqueWork(UNIQUE_NOW, ExistingWorkPolicy.KEEP, request)
    }

    fun schedulePeriodic(context: Context) {
        // Fifteen minutes is WorkManager's floor for periodic work, and it is
        // the right floor here: this is the net under `now()`, not the main
        // path, and a tighter interval would cost battery for work that has
        // almost always already happened.
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(UNIQUE_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}
