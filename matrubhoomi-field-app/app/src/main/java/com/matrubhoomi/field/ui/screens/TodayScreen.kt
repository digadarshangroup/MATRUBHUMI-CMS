package com.matrubhoomi.field.ui.screens

import android.content.Context
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
import androidx.compose.material.icons.outlined.BatteryAlert
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.BuildCircle
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.dayLabel
import com.matrubhoomi.field.core.trimNumber
import com.matrubhoomi.field.data.FieldTask
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.Routes
import com.matrubhoomi.field.ui.components.Accent
import com.matrubhoomi.field.ui.components.AccentCard
import com.matrubhoomi.field.ui.components.AnimatedCount
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.DayBar
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LivePill
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ProgressRing
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionHeader
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.SegmentedTabs
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.WeekBars
import com.matrubhoomi.field.ui.components.brandGradient
import com.matrubhoomi.field.ui.components.rememberFetch
import java.time.LocalDate
import java.util.Calendar

/**
 * The screen the day starts on — "Today" for field staff, "Home" for everyone
 * else, built from the same pieces.
 *
 * ORDER IS THE DESIGN HERE
 * ------------------------
 * Anything BLOCKING comes first — a missing permission, a battery setting that
 * will stop the recording, records that could not be sent. Then the one thing
 * that must be done before setting off (duty, for field staff). Then whether
 * they are marked in today, what is waiting on them as a manager, and the
 * day's work.
 *
 * Everything field-shaped is shown ONLY to field staff: an accountant's home
 * has no duty switch, no distance and no location warnings, because nothing
 * about them is tracked.
 */
@Composable
fun TodayScreen(
    vm: AppViewModel,
    onOpen: (String) -> Unit,
    onOpenTask: (String) -> Unit,
    onNewLead: () -> Unit,
) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val caps = state.caps
    val today = state.bootstrap?.today

    // Which figure the week strip is showing. Screen state, not saved: it is a
    // glance, and it should start on distance every time.
    var weekMode by remember { mutableIntStateOf(0) }
    var dutyRefused by remember { mutableStateOf(false) }
    var confirmEnd by remember { mutableStateOf(false) }
    // Permission, then the location switch, then duty — see DutyGate.
    val gate = com.matrubhoomi.field.ui.components.rememberDutyGate(onReady = { dutyRefused = !vm.setDuty(true) })

    val attendance = rememberFetch(state.signedIn) { repo.attendanceToday() }
    val leave = rememberFetch(state.signedIn) { repo.leaveBook() }
    val holidays = rememberFetch(state.signedIn) { repo.holidays(LocalDate.now().year) }

    val tasks = state.bootstrap?.tasks.orEmpty()
    val assigned = tasks.sumOf { it.targetCount }
    val done = tasks.sumOf { it.doneCount }

    Scaffold(
        topBar = {
            ScreenBar(
                title = greeting(),
                subtitle = state.profile.name.ifBlank { state.employeeName }.ifBlank { null },
                actions = {
                    IconButton(onClick = {
                        vm.refresh()
                        vm.refreshBadges()
                        attendance.reload()
                        leave.reload()
                    }) { Icon(Icons.Default.Refresh, contentDescription = "Refresh") }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }

            /* ── Anything that needs fixing, first ─────────────── */

            items(blockers(context, state)) { blocker -> blocker() }

            state.update?.let { release -> item(key = "update") { com.matrubhoomi.field.ui.components.UpdateCard(release) } }

            if (dutyRefused) {
                item {
                    Notice(
                        title = "Duty is for the field team",
                        body = "Your account is not set up for field work, so nothing is recorded. If you should be, ask HR to put you in Sales.",
                    )
                }
            }

            /* ── What happened to today's field attendance ─────── */

            val note = state.attendanceNote.substringAfter('|', "")
            val noteDay = state.attendanceNote.substringBefore('|', "")
            if (caps.fieldAttendance && note.isNotBlank() && noteDay == LocalDate.now().toString()) {
                item { Notice(title = "Field attendance", body = note) }
            }

            /* ── Duty (field staff only) ───────────────────────── */
            //
            // A coloured panel rather than another white card. This is the one
            // control on the screen with a state worth seeing across a room —
            // recording or not recording. The colour IS the status; the words
            // are there because colour alone is never the only signal.

            if (caps.tracking) {
                item {
                    val on = state.onDuty
                    Surface(
                        Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        color = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                        border = if (on) null
                        else androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        shadowElevation = if (on) 2.dp else 0.dp,
                    ) {
                        Column(
                            Modifier
                                .then(if (on) Modifier.background(brandGradient()) else Modifier)
                                .padding(18.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            if (on) "On duty" else "Off duty",
                                            style = MaterialTheme.typography.headlineSmall,
                                            color = if (on) MaterialTheme.colorScheme.onPrimary
                                            else MaterialTheme.colorScheme.onSurface,
                                        )
                                        if (on) {
                                            Spacer(Modifier.width(10.dp))
                                            LivePill("recording")
                                        }
                                    }
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        if (on) "Recording — screen off, app closed, pocket."
                                        else if (caps.fieldAttendance) "Turn on when you set off. Turning it off sends your field day to your manager."
                                        else "Turn on when you set off.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (on) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f)
                                        else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Switch(
                                    checked = on,
                                    // Never disabled: a missing permission is asked for
                                    // by the tap, not left as a switch that will not move.
                                    onCheckedChange = { wanted -> if (wanted) gate.start() else confirmEnd = true },
                                    colors = androidx.compose.material3.SwitchDefaults.colors(
                                        checkedThumbColor = MaterialTheme.colorScheme.primary,
                                        checkedTrackColor = MaterialTheme.colorScheme.onPrimary,
                                        checkedBorderColor = MaterialTheme.colorScheme.onPrimary,
                                    ),
                                )
                            }

                            if (on) {
                                Spacer(Modifier.height(16.dp))
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    HeroFigure(today?.distanceKm ?: 0.0, "km", decimals = 1)
                                    HeroFigure((today?.submissions ?: 0).toDouble(), "visits")
                                    HeroFigure((today?.leadsCreated ?: 0).toDouble(), "leads")
                                    HeroFigure(state.queuedPings.toDouble(), "queued")
                                }
                            }
                        }
                    }
                }
            }

            /* ── Am I marked in today (everybody) ──────────────── */

            item {
                val day = attendance.data
                val tone = when {
                    day == null -> MaterialTheme.colorScheme.onSurfaceVariant
                    day.isPresent -> MaterialTheme.colorScheme.primary
                    day.isAbsent -> MaterialTheme.colorScheme.error
                    else -> MaterialTheme.colorScheme.secondary
                }
                AccentCard(tone = tone, onClick = { onOpen(Routes.ATTENDANCE) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                when {
                                    attendance.loading && day == null -> "Checking today…"
                                    day == null -> "Nothing recorded yet today"
                                    else -> day.word
                                },
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                when {
                                    day != null && day.inTime.isNotBlank() ->
                                        "In ${day.inTime}" +
                                            (if (day.outTime.isNotBlank()) " · Out ${day.outTime}" else "") +
                                            (if (day.workDisplay.isNotBlank()) " · ${day.workDisplay}" else "")
                                    caps.fieldAttendance -> "Field days are sent to your manager when you end duty."
                                    else -> "Punches come from the fingerprint machine."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (day?.isLate == true) Chip("${day.lateMins} min late", MaterialTheme.colorScheme.error)
                    }
                }
            }

            /* ── Waiting on me (managers) ──────────────────────── */

            if (caps.manager && state.approvals > 0) {
                item {
                    AccentCard(tone = Accent.Harvest, onClick = { onOpen(Routes.APPROVALS) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.AutoMirrored.Outlined.FactCheck, contentDescription = null, tint = Accent.Harvest)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${state.approvals} request${if (state.approvals == 1) "" else "s"} waiting for you",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    "Leave, attendance and overtime from your team. Your decision is final.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            if (state.unread > 0) {
                item {
                    AccentCard(tone = MaterialTheme.colorScheme.secondary, onClick = { onOpen(Routes.NOTIFICATIONS) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Notifications, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                            Spacer(Modifier.width(12.dp))
                            Text(
                                "${state.unread} new notification${if (state.unread == 1) "" else "s"}",
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            /* ── The field day (field staff only) ──────────────── */

            if (caps.field) {
                if (!state.onDuty && caps.tracking) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            StatTile(value = "${today?.distanceKm ?: 0.0}", label = "km travelled", tone = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f))
                            StatTile(value = "${today?.submissions ?: 0}", label = "visits recorded", modifier = Modifier.weight(1f))
                            StatTile(value = "${today?.leadsCreated ?: 0}", label = "leads added", modifier = Modifier.weight(1f))
                        }
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        QuickAction(icon = Icons.Outlined.Add, label = "Add a customer", modifier = Modifier.weight(1f), onClick = onNewLead)
                        QuickAction(icon = Icons.Outlined.Groups, label = "Find a farmer", modifier = Modifier.weight(1f), onClick = { onOpen(Routes.LEADS) })
                    }
                }

                if (tasks.isNotEmpty()) {
                    item {
                        Card {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                // The ring rather than the bar. "How far through the
                                // day am I" is a proportion, and a proportion is
                                // what a ring shows.
                                ProgressRing(fraction = if (assigned > 0) done.toFloat() / assigned else 0f, size = 76.dp) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text("$done", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
                                        Text("of $assigned", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                Spacer(Modifier.width(18.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("Today's round", style = MaterialTheme.typography.titleMedium)
                                    Spacer(Modifier.height(3.dp))
                                    Text(
                                        "${tasks.size} ${if (tasks.size == 1) "assignment" else "assignments"} from the sales desk",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    Spacer(Modifier.height(8.dp))
                                    Text(
                                        when {
                                            assigned == 0 -> "Nothing to count yet."
                                            done >= assigned -> "All done. Anything else today is extra."
                                            else -> "${assigned - done} left to do."
                                        },
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (done >= assigned && assigned > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }
                        }
                    }
                }

                // The employee's own week. A single day's figure means nothing
                // on its own; "6.4 km" only becomes a day next to the six behind it.
                val week = state.bootstrap?.recentDays.orEmpty()
                if (week.size >= 3) {
                    item {
                        Card {
                            Text("Your week", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(2.dp))
                            Text(weekSummary(week, weekMode), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(12.dp))
                            SegmentedTabs(options = listOf("Distance", "Visits", "Leads"), selectedIndex = weekMode, onSelect = { weekMode = it })
                            Spacer(Modifier.height(14.dp))
                            WeekBars(
                                days = week.mapIndexed { index, d ->
                                    DayBar(
                                        letter = dayLetter(d.day),
                                        value = when (weekMode) {
                                            0 -> d.distanceKm
                                            1 -> d.submissions.toDouble()
                                            else -> d.leadsCreated.toDouble()
                                        },
                                        isToday = index == week.lastIndex,
                                    )
                                },
                                colour = when (weekMode) {
                                    0 -> MaterialTheme.colorScheme.primary
                                    1 -> Accent.Water
                                    else -> Accent.Harvest
                                },
                                valueLabel = { v -> if (weekMode == 0) ((v * 10).toInt() / 10.0).toString() else v.toInt().toString() },
                            )
                        }
                    }
                }

                item {
                    SectionHeader(
                        title = if (tasks.isEmpty()) "Assigned to you" else "Next up",
                        action = if (tasks.size > 2) "See all" else null,
                        onAction = { onOpen(Routes.WORK) },
                    )
                }

                if (tasks.isEmpty()) {
                    item {
                        Card {
                            EmptyState(
                                icon = Icons.Outlined.CheckCircle,
                                title = if (state.stale) "Nothing downloaded yet" else "Nothing assigned",
                                body = if (state.stale) "This is what was last downloaded. Refresh when you have signal."
                                else "The sales desk has not given you anything for today. You can still add customers yourself.",
                            )
                        }
                    }
                } else {
                    items(tasks.take(3), key = { it.id }) { task ->
                        TaskCard(task = task, stageName = vm.stageName(task), onClick = { onOpenTask(task.id) })
                    }
                }
            } else {
                /* ── Everybody else: the things they come here for ─ */
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        QuickAction(icon = Icons.Outlined.EventAvailable, label = "Apply for leave", modifier = Modifier.weight(1f), onClick = { onOpen(Routes.LEAVE) })
                        QuickAction(icon = Icons.Outlined.BuildCircle, label = "Fix attendance", modifier = Modifier.weight(1f), onClick = { onOpen("regularize") })
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        QuickAction(icon = Icons.Outlined.AccountBalanceWallet, label = "Payslips", modifier = Modifier.weight(1f), onClick = { onOpen(Routes.PAYSLIPS) })
                        QuickAction(icon = Icons.Outlined.BeachAccess, label = "Holidays", modifier = Modifier.weight(1f), onClick = { onOpen(Routes.HOLIDAYS) })
                    }
                }
            }

            /* ── Leave left, and the next day off (everybody) ──── */

            leave.data?.let { book ->
                item {
                    Card(Modifier.clip(RoundedCornerShape(16.dp)).clickable { onOpen(Routes.LEAVE) }) {
                        SectionLabel("Leave left this year")
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            StatTile(value = trimNumber(book.left("CL")), label = "casual", modifier = Modifier.weight(1f))
                            StatTile(value = trimNumber(book.left("SL")), label = "sick", tone = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f))
                            StatTile(
                                value = if (book.plEligible) trimNumber(book.left("PL")) else "—",
                                label = "privilege",
                                tone = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            holidays.data?.firstOrNull { !it.isWorkingSunday && it.date >= LocalDate.now().toString() }?.let { next ->
                item {
                    AccentCard(tone = Accent.Water, onClick = { onOpen(Routes.HOLIDAYS) }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.BeachAccess, contentDescription = null, tint = Accent.Water)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Next holiday: ${next.name}", style = MaterialTheme.typography.titleMedium)
                                Text(dayLabel(next.date), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }

    if (confirmEnd) {
        com.matrubhoomi.field.ui.components.EndDutyDialog(
            onConfirm = { vm.setDuty(false) },
            onDismiss = { confirmEnd = false },
            fieldAttendance = caps.fieldAttendance,
        )
    }
}

/* ------------------------------------------------------------------ */

/** One thing the phone still needs before the round can be recorded properly. */
private class SetupItem(
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val title: String,
    val why: String,
    /** For a setting some phones never report back — see Prefs.batteryAckAt. */
    val alreadyDone: (() -> Unit)? = null,
    val fix: () -> Unit,
)

private fun setupItems(context: Context): List<SetupItem> {
    val prefs = com.matrubhoomi.field.core.Prefs.get(context)
    val items = mutableListOf<SetupItem>()
    if (!Tracking.hasForegroundLocation(context)) {
        items += SetupItem(Icons.Outlined.LocationOn, "Allow location", "Nothing can be recorded without it.") { Tracking.openAppSettings(context) }
    } else if (!Tracking.hasBackgroundLocation(context)) {
        items += SetupItem(
            Icons.Outlined.LocationOn,
            "Location: \"Allow all the time\"",
            "Otherwise recording stops when the screen goes off.",
        ) { Tracking.openAppSettings(context) }
    }
    if (!Tracking.hasNotifications(context)) {
        items += SetupItem(Icons.Outlined.Notifications, "Allow notifications", "The on-duty notice keeps the recording alive.") {
            Tracking.openAppSettings(context)
        }
    }
    // Some phone makers keep their own battery switch that Android never
    // reports; once somebody says they have set it, the home screen believes
    // them for a week (Settings still lists it).
    val acknowledged = System.currentTimeMillis() - prefs.batteryAckAt < 7L * 24 * 3600 * 1000
    if (Tracking.isBatteryOptimised(context) && !acknowledged) {
        items += SetupItem(
            Icons.Outlined.BatteryAlert,
            "Let it run in the background",
            "Otherwise battery saving may stop the recording.",
            fix = { Tracking.requestBatteryExemption(context) },
            alreadyDone = { prefs.batteryAckAt = System.currentTimeMillis() },
        )
    }
    return items
}

@Composable
private fun SetupCard(items: List<SetupItem>) {
    var hidden by remember { mutableStateOf(setOf<String>()) }
    val shown = items.filter { it.title !in hidden }
    if (shown.isEmpty()) return
    val tone = MaterialTheme.colorScheme.error
    Surface(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = tone.copy(alpha = 0.06f),
        border = androidx.compose.foundation.BorderStroke(1.dp, tone.copy(alpha = 0.22f)),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text("Finish setting up this phone", style = MaterialTheme.typography.titleMedium, color = tone)
            Text(
                if (shown.size == 1) "One thing stops your round being recorded properly." else "${shown.size} things stop your round being recorded properly.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            shown.forEach { item ->
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(item.icon, contentDescription = null, tint = tone, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item.title, style = MaterialTheme.typography.titleSmall)
                        Text(item.why, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        item.alreadyDone?.let { done ->
                            Text(
                                "I've already set this",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier
                                    .padding(top = 2.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable { done(); hidden = hidden + item.title },
                            )
                        }
                    }
                    TextButton(onClick = item.fix) { Text("Fix") }
                }
            }
        }
    }
}

/** A figure on the coloured duty panel. White on green, not a tinted tile. */
@Composable
private fun HeroFigure(value: Double, label: String, decimals: Int = 0) {
    Column {
        // Animated, because these change while the screen is open — the km
        // figure ticks up as the employee walks.
        AnimatedCount(
            value = value,
            decimals = decimals,
            style = MaterialTheme.typography.titleLarge,
            colour = MaterialTheme.colorScheme.onPrimary,
        )
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f))
    }
}

@Composable
private fun QuickAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Surface(
        modifier = modifier.clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            // A tinted square rather than a bare glyph: it gives the actions a
            // weight matching the cards around them.
            Box(
                Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(19.dp))
            }
            Spacer(Modifier.width(10.dp))
            com.matrubhoomi.field.ui.components.WrapText(label, style = MaterialTheme.typography.labelLarge)
        }
    }
}

/** One assignment, as a card. Shared by Today and Work. */
@Composable
fun TaskCard(task: FieldTask, stageName: String, onClick: () -> Unit) {
    // THE STRIPE CARRIES THE PRIORITY. Down a scrolling list of eight
    // assignments, a 4dp edge is findable at a glance where a chip four lines
    // in is not — and the chip stays anyway, because colour is never the only
    // signal on a screen read in sunlight.
    val tone = when {
        task.priority == "urgent" -> MaterialTheme.colorScheme.error
        task.priority == "high" -> Accent.Brick
        task.doneCount >= task.targetCount && task.targetCount > 0 -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.outlineVariant
    }
    val complete = task.targetCount > 0 && task.doneCount >= task.targetCount

    AccentCard(tone = tone, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(task.title, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(2.dp))
                Text(
                    buildString {
                        // A follow-up is about one person; say who, before anything else.
                        task.customer?.let { append(it.name).append(" · ") }
                        if (task.schemeName.isNotBlank()) append(task.schemeName) else append(task.code)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.width(12.dp))

            ProgressRing(
                fraction = if (task.targetCount > 0) task.doneCount.toFloat() / task.targetCount else 0f,
                size = 46.dp,
                stroke = 5.dp,
            ) {
                Text("${task.doneCount}/${task.targetCount}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        }

        Spacer(Modifier.height(10.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chip(stageName, MaterialTheme.colorScheme.primary)
            if (task.requireOtp) Chip("OTP")
            if (task.requirePhoto) Chip("photo")
            if (task.priority == "urgent" || task.priority == "high") Chip(task.priority, MaterialTheme.colorScheme.error)
            // Approved is the ring. Waiting and rework are said beside it, never
            // folded into it — see recountTask() on the server.
            if (task.pendingCount > 0) Chip("${task.pendingCount} waiting")
            if (task.rejectedCount > 0) Chip("${task.rejectedCount} to redo", MaterialTheme.colorScheme.error)
            if (complete) Chip("done", MaterialTheme.colorScheme.primary)
        }
    }
}

/**
 * The single letter under a bar. Derived from the date key rather than from the
 * position in the list, so a week that starts on a Thursday still reads right.
 */
private fun dayLetter(dayKey: String): String {
    val parts = dayKey.split("-")
    if (parts.size != 3) return "·"
    return try {
        val cal = Calendar.getInstance()
        cal.set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt(), 12, 0, 0)
        when (cal.get(Calendar.DAY_OF_WEEK)) {
            Calendar.MONDAY -> "M"; Calendar.TUESDAY -> "T"; Calendar.WEDNESDAY -> "W"
            Calendar.THURSDAY -> "T"; Calendar.FRIDAY -> "F"; Calendar.SATURDAY -> "S"
            else -> "S"
        }
    } catch (e: Exception) {
        "·"
    }
}

/**
 * One line under "Your week" — the total, and how today compares. Averaged over
 * the days that HAPPENED, not over seven: counting days off as zeroes makes
 * every working day look above average.
 */
private fun weekSummary(week: List<com.matrubhoomi.field.data.DaySummary>, mode: Int): String {
    val values = week.map {
        when (mode) {
            0 -> it.distanceKm
            1 -> it.submissions.toDouble()
            else -> it.leadsCreated.toDouble()
        }
    }
    val unit = when (mode) { 0 -> "km"; 1 -> "visits"; else -> "leads" }
    val total = values.sum()
    val totalText = if (mode == 0) "${(total * 10).toInt() / 10.0}" else total.toInt().toString()

    val worked = values.dropLast(1).filter { it > 0 }
    val todayValue = values.lastOrNull() ?: 0.0
    if (worked.isEmpty()) return "$totalText $unit over ${week.size} days"

    val usual = worked.average()
    val comparison = when {
        todayValue <= 0 -> "nothing recorded today yet"
        todayValue > usual * 1.15 -> "ahead of your usual day"
        todayValue < usual * 0.85 -> "behind your usual day"
        else -> "about your usual day"
    }
    return "$totalText $unit this week · $comparison"
}

private fun greeting(): String {
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when {
        hour < 12 -> "Good morning"
        hour < 17 -> "Good afternoon"
        else -> "Good evening"
    }
}

/**
 * The things that will stop this working, as composables ready to render.
 *
 * The recording-related ones appear ONLY for somebody who is tracked — an
 * accountant is never told to allow location "all the time".
 */
fun blockers(context: Context, state: AppViewModel.UiState): List<@Composable () -> Unit> {
    val out = mutableListOf<@Composable () -> Unit>()

    if (state.caps.tracking) {
        if (state.onDuty && !Tracking.isLocationSwitchOn(context)) {
            out.add {
                Notice(
                    title = "Your phone's location is switched off",
                    body = "While it is off nothing is recorded. Turn Location on from the quick settings.",
                    actionLabel = "Open location settings",
                    severe = true,
                    onAction = {
                        runCatching {
                            context.startActivity(
                                android.content.Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        }
                    },
                )
            }
        }

        // Everything else the phone needs, as ONE compact card rather than a
        // stack of red panels that pushed the day off the screen.
        val setup = setupItems(context)
        if (setup.isNotEmpty()) out.add { SetupCard(setup) }
    }

    if (state.rejectedRecords > 0) {
        out.add {
            Notice(
                title = "${state.rejectedRecords} record${if (state.rejectedRecords == 1) "" else "s"} could not be sent",
                body = "The server refused them and retrying will not help. Show this to the sales desk.",
                severe = true,
            )
        }
    }

    if (state.stale) {
        out.add {
            Notice(
                title = "Working offline",
                body = "Showing what was last downloaded. New information will not appear until you have signal.",
            )
        }
    }

    return out
}
