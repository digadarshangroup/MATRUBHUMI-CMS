package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.BuildCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.agoOf
import com.matrubhoomi.field.data.InboxItem
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.sync.Notifier
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Accent
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.rememberFetch
import com.matrubhoomi.field.ui.components.runAction
import kotlinx.coroutines.launch

/**
 * The inbox — every notification the office has sent this person, read or not.
 *
 * It is the same list the phone's notifications came from (InboxWorker raises
 * them), so a notification swiped away unread is still here. Tapping one opens
 * the screen it is about and marks it read.
 */
@Composable
fun NotificationsScreen(vm: AppViewModel, onOpen: (String) -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()
    val inbox = rememberFetch("inbox") { repo.inbox(limit = 80) }
    // Marked read on THIS screen straight away, before the server confirms,
    // so a tap does not leave the dot lit while the request is in flight.
    var readHere by remember { mutableStateOf(setOf<String>()) }
    var opened by remember { mutableStateOf<InboxItem?>(null) }

    LaunchedEffect(inbox.data) { inbox.data?.let { vm.setUnread(it.unread) } }

    fun markRead(ids: List<String>?) {
        readHere = if (ids == null) inbox.data?.items.orEmpty().map { it.id }.toSet() else readHere + ids
        scope.launch {
            runAction { repo.markInboxRead(ids) }
            vm.refreshBadges()
        }
    }

    val items = inbox.data?.items.orEmpty()
    val unread = items.count { !it.read && it.id !in readHere }

    Scaffold(
        topBar = {
            ScreenBar(
                "Notifications",
                if (unread > 0) "$unread unread" else null,
                actions = { if (unread > 0) TextButton(onClick = { markRead(null) }) { Text("Mark all read") } },
            )
        },
    ) { padding ->
        com.matrubhoomi.field.ui.components.RefreshableList(
            refreshing = inbox.loading && inbox.data != null,
            onRefresh = { inbox.reload() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }
            when {
                inbox.loading && inbox.data == null -> item { LoadingBlock() }
                inbox.problem != null && inbox.data == null -> item { Notice(title = "Could not load notifications", body = inbox.problem, severe = !inbox.offline) }
                items.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.Notifications,
                            title = "Nothing yet",
                            body = "Leave decisions, attendance confirmations, payslips and new assignments arrive here.",
                        )
                    }
                }
                else -> items(items, key = { it.id }) { n ->
                    val isUnread = !n.read && n.id !in readHere
                    InboxRow(n, isUnread) {
                        if (isUnread) markRead(listOf(n.id))
                        val route = Notifier.routeForInbox(n)
                        // An announcement IS its text; it opens where it can be read in full.
                        if (n.kind == "announcement") opened = n
                        else if (route != "notifications") onOpen(route)
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }

    opened?.let { n ->
        com.matrubhoomi.field.ui.components.AppDialog(
            title = n.title,
            message = n.body,
            icon = Icons.Outlined.Campaign,
            tone = com.matrubhoomi.field.ui.components.Tone.Positive,
            confirmLabel = "Got it",
            onConfirm = { opened = null },
            onDismiss = { opened = null },
            dismissLabel = null,
        ) {
            Text(
                "Announcement · ${agoOf(n.createdAt)}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

@Composable
private fun InboxRow(n: InboxItem, unread: Boolean, onClick: () -> Unit) {
    val (icon, tone) = iconFor(n.kind)
    Card(Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(tone.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = null, tint = tone, modifier = Modifier.size(19.dp)) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        n.title,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal,
                        modifier = Modifier.weight(1f),
                    )
                    if (unread) {
                        Box(Modifier.size(8.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(999.dp)))
                    }
                }
                if (n.kind == "announcement") {
                    Text("Announcement", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                if (n.body.isNotBlank()) {
                    Text(
                        n.body,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 3,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(2.dp))
                Text(agoOf(n.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}

@Composable
private fun iconFor(kind: String): Pair<ImageVector, androidx.compose.ui.graphics.Color> = when (kind) {
    "leave" -> Icons.Outlined.EventAvailable to MaterialTheme.colorScheme.primary
    "regularization" -> Icons.Outlined.BuildCircle to Accent.Water
    "overtime" -> Icons.Outlined.AccessTime to Accent.Harvest
    "payroll" -> Icons.Outlined.AccountBalanceWallet to MaterialTheme.colorScheme.primary
    "document" -> Icons.Outlined.Description to Accent.Water
    "sales_task", "sales_review" -> Icons.AutoMirrored.Outlined.Assignment to Accent.Brick
    "announcement" -> Icons.Outlined.Campaign to MaterialTheme.colorScheme.primary
    else -> Icons.Outlined.Notifications to MaterialTheme.colorScheme.onSurfaceVariant
}
