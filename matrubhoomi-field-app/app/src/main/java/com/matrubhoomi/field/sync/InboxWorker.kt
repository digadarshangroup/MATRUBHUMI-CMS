package com.matrubhoomi.field.sync

import android.content.Context
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Checks the employee's inbox in the background and raises a notification for
 * anything new — a leave approved, a correction waiting for a manager, a new
 * assignment.
 *
 * Every fifteen minutes (WorkManager's floor) and whenever the app opens. The
 * very first check after signing in only REMEMBERS where the inbox is; it does
 * not replay a month of history as a burst of notifications.
 */
class InboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = Prefs.get(applicationContext)
        if (!prefs.isSignedIn) return@withContext Result.success()

        val firstLook = prefs.inboxSeenAt.isBlank()
        when (val result = Api.get(applicationContext).inbox(limit = 20, since = prefs.inboxSeenAt.ifBlank { null })) {
            is ApiResult.Ok -> {
                val items = result.value.items
                if (items.isNotEmpty()) {
                    if (!firstLook) {
                        // Oldest first, so they stack in the order they happened.
                        items.filter { !it.read }.reversed().forEach { Notifier.inbox(applicationContext, it) }
                    }
                    prefs.inboxSeenAt = items.maxOf { it.createdAt }
                } else if (firstLook) {
                    prefs.inboxSeenAt = com.matrubhoomi.field.data.FieldDb.isoUtc(System.currentTimeMillis())
                }
                Result.success()
            }
            is ApiResult.Offline -> Result.retry()
            // Already signed out by the session guard; nothing more to do.
            is ApiResult.Unauthorised -> Result.success()
            is ApiResult.Failed -> Result.success()
        }
    }

    companion object {
        private const val UNIQUE_PERIODIC = "inbox-periodic"
        private const val UNIQUE_NOW = "inbox-now"

        private val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_PERIODIC,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<InboxWorker>(15, TimeUnit.MINUTES).setConstraints(constraints).build(),
            )
        }

        fun now(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_NOW,
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<InboxWorker>().setConstraints(constraints).build(),
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_PERIODIC)
        }
    }
}
