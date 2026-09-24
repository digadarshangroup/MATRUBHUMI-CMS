package com.matrubhoomi.field.sync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.matrubhoomi.field.MainActivity
import com.matrubhoomi.field.data.InboxItem
import com.matrubhoomi.field.location.Tracking

/**
 * The app's own notifications — everything except the on-duty status line,
 * which belongs to the location service.
 *
 * WHY THE APP RAISES THEM ITSELF
 * ------------------------------
 * The server's push is Expo-only, which a native app cannot receive, and there
 * is no Firebase project behind this app. So the server keeps an inbox, and
 * InboxWorker reads it in the background and raises the notification here. A
 * tap opens the app on the screen the notification is about.
 */
object Notifier {

    private const val CHANNEL_UPDATES = "updates"
    private const val ID_MIDNIGHT = 4301
    const val EXTRA_OPEN = "open"
    const val EXTRA_INBOX_ID = "inboxId"

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_UPDATES) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_UPDATES,
                "Approvals and updates",
                // DEFAULT: a leave decision or a new assignment is worth a sound.
                // The recording's own status line stays LOW on its own channel.
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = "Leave decisions, attendance, assignments and anything waiting for you." },
        )
    }

    private fun openIntent(context: Context, requestCode: Int, route: String?, inboxId: String?): PendingIntent =
        PendingIntent.getActivity(
            context,
            requestCode,
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .apply {
                    route?.let { putExtra(EXTRA_OPEN, it) }
                    inboxId?.let { putExtra(EXTRA_INBOX_ID, it) }
                },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun post(context: Context, id: Int, title: String, body: String, route: String?, inboxId: String? = null) {
        if (!Tracking.hasNotifications(context)) return
        ensureChannel(context)
        val n = NotificationCompat.Builder(context, CHANNEL_UPDATES)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(openIntent(context, id, route, inboxId))
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(id, n) }
    }

    /** One inbox item, as a notification that opens the screen it is about. */
    fun inbox(context: Context, item: InboxItem) {
        post(context, item.id.hashCode(), item.title, item.body, routeForInbox(item), item.id)
    }

    fun dutyEndedAtMidnight(context: Context) {
        post(
            context,
            ID_MIDNIGHT,
            "Duty ended at midnight",
            "Yesterday's duty was still on, so it was ended at midnight and the day closed. Start duty again when you set off.",
            "today",
        )
    }

    /**
     * Where a notification should land. By KIND, because the server's `screen`
     * names are the old Expo app's routes; the native app has its own.
     */
    fun routeForInbox(item: InboxItem): String {
        // The titles utils/notifyEmployee.js sends to a MANAGER — somebody else's
        // request waiting on them. Everything else of these kinds is about the
        // reader's own request.
        val t = item.title.lowercase()
        val forManager = MANAGER_TITLES.any { t.startsWith(it) }
        return when (item.kind) {
            "leave" -> if (forManager) "approvals" else "leave"
            "regularization" -> if (forManager) "approvals" else "regularize"
            "overtime" -> if (forManager) "approvals" else "overtime"
            "payroll" -> "payslips"
            "document" -> "documents"
            "sales_task", "sales_review" -> "work"
            else -> "notifications"
        }
    }

    private val MANAGER_TITLES = listOf(
        "new leave request",
        "leave needs your approval",
        "withdrawal requested",
        "attendance correction request",
        "correction needs your approval",
        "field attendance to confirm",
        "overtime report submitted",
    )
}
