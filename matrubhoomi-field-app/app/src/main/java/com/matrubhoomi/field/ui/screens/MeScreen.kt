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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.BuildCircle
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.trimNumber
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.AccentCard
import com.matrubhoomi.field.ui.components.Avatar
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.MenuRow
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionHeader
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.rememberFetch

/**
 * The employee's own corner — today's attendance, leave left, and a door to
 * every administrative thing, whoever they are.
 *
 * The top answers the two questions people actually open it for: am I marked
 * in today, and how many days do I have left. Below that, the same places the
 * menu lists, as a page — some people never find a drawer.
 */
@Composable
fun MeScreen(vm: AppViewModel, onOpen: (String) -> Unit) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val caps = state.caps
    val p = state.profile

    val today = rememberFetch("today") { repo.attendanceToday() }
    val book = rememberFetch("book") { repo.leaveBook() }

    Scaffold(topBar = { ScreenBar("Me", "Attendance, leave, pay and settings") }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }

            /* ── Who this is ─────────────────────────────────────── */
            // A handset several people may pick up over a shift: "whose account
            // is this" should be answerable without scrolling.
            item {
                Card(Modifier.clickable { onOpen("profile") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(p.name.ifBlank { state.employeeName.ifBlank { "You" } }, size = 54.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.name.ifBlank { state.employeeName.ifBlank { "Signed in" } }, style = MaterialTheme.typography.titleLarge)
                            Text(
                                listOf(p.code, p.designation, p.department).filter { it.isNotBlank() }.joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            p.manager?.let {
                                Text("Reports to ${it.name}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (caps.field && state.onDuty) Chip("on duty", MaterialTheme.colorScheme.primary)
                        else Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            /* ── A manager's queue, when there is one ───────────── */
            if (caps.manager && state.approvals > 0) {
                item {
                    AccentCard(tone = MaterialTheme.colorScheme.error, onClick = { onOpen("approvals") }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.AutoMirrored.Outlined.FactCheck, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${state.approvals} waiting for your approval",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    "Your team's leave, attendance and overtime",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            /* ── Am I marked in today ────────────────────────────── */
            item {
                val day = today.data
                val tone = when {
                    day == null -> MaterialTheme.colorScheme.onSurfaceVariant
                    day.isPresent -> MaterialTheme.colorScheme.primary
                    day.isAbsent -> MaterialTheme.colorScheme.error
                    else -> MaterialTheme.colorScheme.secondary
                }
                Card(Modifier.clickable { onOpen("attendance") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(12.dp).background(tone, RoundedCornerShape(999.dp)))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                when {
                                    today.loading && day == null -> "Checking today…"
                                    day == null -> "Not marked in yet"
                                    else -> day.word
                                },
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                when {
                                    today.problem != null && day == null -> today.problem
                                    day == null ->
                                        if (caps.fieldAttendance) "Field staff are marked from the duty the app records."
                                        else "Nothing from the punch machine for you today yet."
                                    day.inTime.isNotBlank() ->
                                        "In ${day.inTime}" +
                                            (if (day.outTime.isNotBlank()) " · Out ${day.outTime}" else "") +
                                            (if (day.workDisplay.isNotBlank()) " · ${day.workDisplay}" else "")
                                    else -> "Today"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (day?.isLate == true) Chip("${day.lateMins} min late", MaterialTheme.colorScheme.error)
                    }
                }
            }

            /* ── Leave left ──────────────────────────────────────── */
            item {
                val b = book.data
                Card {
                    SectionHeader("Leave left this year", action = "Apply", onAction = { onOpen("leave") })
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile(b?.let { trimNumber(it.left("CL")) } ?: "–", "casual", modifier = Modifier.weight(1f))
                        StatTile(b?.let { trimNumber(it.left("SL")) } ?: "–", "sick", tone = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f))
                        StatTile(
                            if (b?.plEligible == true) trimNumber(b.left("PL")) else "–",
                            "privilege",
                            tone = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            /* ── Every place, as a page ──────────────────────────── */
            item {
                Card {
                    SectionLabel("My workday")
                    MenuRow(Icons.Outlined.CalendarMonth, "Attendance", "Every day this month", { onOpen("attendance") })
                    MenuRow(Icons.Outlined.EventAvailable, "Leave", "Balance, requests and applying", { onOpen("leave") })
                    MenuRow(Icons.Outlined.BuildCircle, "Fix attendance", "Ask for a day to be corrected", { onOpen("regularize") })
                    if (caps.overtime) MenuRow(Icons.Outlined.AccessTime, "Overtime", "Report a late stay", { onOpen("overtime") })
                    MenuRow(Icons.Outlined.BeachAccess, "Holidays", "This year's company holidays", { onOpen("holidays") }, last = true)
                }
            }
            item {
                Card {
                    SectionLabel("Pay and papers")
                    MenuRow(Icons.Outlined.AccountBalanceWallet, "Payslips", "Every paid month, as a PDF", { onOpen("payslips") })
                    MenuRow(Icons.Outlined.Description, "Documents", "Letters from HR, and asking for one", { onOpen("documents") }, last = true)
                }
            }
            item {
                Card {
                    SectionLabel("More")
                    if (caps.manager) MenuRow(Icons.AutoMirrored.Outlined.FactCheck, "Approvals", "Your team's requests", { onOpen("approvals") }, badge = state.approvals)
                    if (caps.standings) MenuRow(Icons.Outlined.EmojiEvents, "Standings", "Ranked by time worked", { onOpen("standings") })
                    MenuRow(Icons.Outlined.Notifications, "Notifications", "Everything the office has sent you", { onOpen("notifications") }, badge = state.unread)
                    if (caps.field) {
                        MenuRow(
                            Icons.Outlined.CloudUpload,
                            "Waiting to be sent",
                            if (state.pendingRecords + state.queuedPings == 0) "Nothing waiting"
                            else "${state.pendingRecords} visits · ${state.queuedPings} positions",
                            { onOpen("settings") },
                            badge = state.rejectedRecords,
                        )
                    }
                    MenuRow(Icons.Outlined.Settings, "Settings", "App lock, permissions, sign out", { onOpen("settings") }, last = true)
                }
            }

            /* ── How the field work works — field staff only ─────── */
            // The five sentences a new salesperson needs on day one, on the
            // screen they already open, rather than behind a help menu.
            if (caps.field) {
                item {
                    Card {
                        SectionLabel("How field work works")
                        Spacer(Modifier.height(8.dp))
                        listOf(
                            "Start DUTY when you set off and end it when you finish. The app records your route only while you are on duty, and your manager confirms the day as present.",
                            "You get two kinds of work: NEW CUSTOMERS (a target, you find the people) and FOLLOW-UPS (a named customer, one visit).",
                            "When you register someone, you choose their SCHEME. That decides the steps they go through from then on.",
                            "Saving a visit sends it to the sales desk for APPROVAL. A step counts as done only when they approve.",
                            "Everything works with no signal and is sent when you have some.",
                        ).forEach { line ->
                            Row(Modifier.padding(vertical = 4.dp)) {
                                Text("•  ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                                Text(line, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}
