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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.WindowInsets
import com.matrubhoomi.field.ui.components.brandGradient
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.FieldTask
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.BigButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.Progress
import com.matrubhoomi.field.ui.components.SectionHeader
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.AccentCard
import com.matrubhoomi.field.ui.components.Accent
import com.matrubhoomi.field.ui.components.AnimatedCount
import com.matrubhoomi.field.ui.components.DayBar
import com.matrubhoomi.field.ui.components.LivePill
import com.matrubhoomi.field.ui.components.ProgressRing
import com.matrubhoomi.field.ui.components.SegmentedTabs
import com.matrubhoomi.field.ui.components.WeekBars
import java.util.Calendar

/**
 * The screen the day starts on.
 *
 * ORDER IS THE DESIGN HERE
 * ------------------------
 * Anything BLOCKING comes first — a missing permission, a battery setting that
 * will stop the recording, records that could not be sent. Then the duty
 * switch, because that is the one thing that has to be done before setting off.
 * Then the day's figures, then the work.
 *
 * An employee opening this in a hurry should see, without scrolling, whether
 * anything needs them before they leave.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(
    vm: AppViewModel,
    onOpenTask: (String) -> Unit,
    onOpenWork: () -> Unit,
    onOpenLeads: () -> Unit,
    onNewLead: () -> Unit,
) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val today = state.bootstrap?.today

    // Which figure the week strip is showing. Screen state, not saved: it is a
    // glance, and it should start on distance every time.
    var weekMode by remember { mutableStateOf(0) }

    val tasks = state.bootstrap?.tasks.orEmpty()
    val assigned = tasks.sumOf { it.targetCount }
    val done = tasks.sumOf { it.doneCount }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(greeting(), style = MaterialTheme.typography.titleLarge)
                        Text(
                            state.employeeName.ifBlank { "Field sales" },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { vm.refresh() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
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

            /* ── Duty ──────────────────────────────────────────── */
            //
            // A coloured panel rather than another white card. This is the one
            // control on the screen with a state worth seeing across a room —
            // recording or not recording — and a white card with a switch in it
            // reads as a settings row. The colour IS the status; the words are
            // there because colour alone is never the only signal.

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
                            // The gradient only when recording. Off duty this is
                            // a plain white card, because a panel that looks
                            // important while nothing is happening teaches people
                            // to stop looking at it.
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
                                        // The one pulsing thing in the app. It
                                        // says "this is happening now", which is
                                        // exactly the doubt an employee has when
                                        // the phone has been in a pocket.
                                        LivePill("recording")
                                    }
                                }
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    if (on) "Recording — screen off, app closed, pocket."
                                    else "Turn on when you set off.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (on) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f)
                                    else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(
                                checked = on,
                                onCheckedChange = { vm.setDuty(it) },
                                enabled = Tracking.hasForegroundLocation(context),
                                colors = androidx.compose.material3.SwitchDefaults.colors(
                                    checkedThumbColor = MaterialTheme.colorScheme.primary,
                                    checkedTrackColor = MaterialTheme.colorScheme.onPrimary,
                                    checkedBorderColor = MaterialTheme.colorScheme.onPrimary,
                                ),
                            )
                        }

                        if (on) {
                            Spacer(Modifier.height(16.dp))
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                HeroFigure(today?.distanceKm ?: 0.0, "km", decimals = 1)
                                HeroFigure((today?.submissions ?: 0).toDouble(), "visits")
                                HeroFigure((today?.leadsCreated ?: 0).toDouble(), "leads")
                                HeroFigure(state.queuedPings.toDouble(), "queued")
                            }
                        }
                    }
                }
            }

            /* ── The day, in three numbers ─────────────────────── */

            if (!state.onDuty) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile(
                            value = "${today?.distanceKm ?: 0.0}",
                            label = "km travelled",
                            tone = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            value = "${today?.submissions ?: 0}",
                            label = "visits recorded",
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            value = "${today?.leadsCreated ?: 0}",
                            label = "leads added",
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            /* ── Quick actions ─────────────────────────────────── */

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuickAction(
                        icon = Icons.Outlined.Add,
                        label = "Add a lead",
                        modifier = Modifier.weight(1f),
                        onClick = onNewLead,
                    )
                    QuickAction(
                        icon = Icons.Outlined.Groups,
                        label = "Find a farmer",
                        modifier = Modifier.weight(1f),
                        onClick = onOpenLeads,
                    )
                }
            }

            /* ── Today's progress ──────────────────────────────── */

            if (tasks.isNotEmpty()) {
                item {
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            // The ring rather than the bar. "How far through the
                            // day am I" is a proportion, and a proportion is
                            // what a ring shows — legible from arm's length,
                            // where two bar widths are not.
                            ProgressRing(
                                fraction = if (assigned > 0) done.toFloat() / assigned else 0f,
                                size = 76.dp,
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "$done",
                                        style = MaterialTheme.typography.titleLarge,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        "of $assigned",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
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
                                    color = if (done >= assigned && assigned > 0)
                                        MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }
                }
            }

            /* ── The employee's own week ───────────────────────── */
            //
            // Not the desk's view of them — theirs. A single day's figure means
            // nothing on its own; "6.4 km" only becomes a day when it sits next
            // to the six days behind it. Drawn only when there is a week to
            // draw, so a new joiner is not shown seven empty columns.

            val week = state.bootstrap?.recentDays.orEmpty()
            if (week.size >= 3) {
                item {
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Your week", style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    weekSummary(week, weekMode),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        SegmentedTabs(
                            options = listOf("Distance", "Visits", "Leads"),
                            selectedIndex = weekMode,
                            onSelect = { weekMode = it },
                        )
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
                            valueLabel = { v ->
                                if (weekMode == 0) ((v * 10).toInt() / 10.0).toString()
                                else v.toInt().toString()
                            },
                        )
                    }
                }
            }

            item {
                SectionHeader(
                    title = if (tasks.isEmpty()) "Assigned to you" else "Next up",
                    action = if (tasks.size > 2) "See all" else null,
                    onAction = onOpenWork,
                )
            }

            if (tasks.isEmpty()) {
                item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.CheckCircle,
                            title = if (state.stale) "Nothing downloaded yet" else "Nothing assigned",
                            body = if (state.stale)
                                "This is what was last downloaded. Refresh when you have signal."
                            else
                                "The sales desk has not given you anything for today. You can still add leads yourself.",
                        )
                    }
                }
            } else {
                items(tasks.take(3), key = { it.id }) { task ->
                    TaskCard(task = task, stageName = vm.stageName(task), onClick = { onOpenTask(task.id) })
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

/* ------------------------------------------------------------------ */

/** A figure on the coloured duty panel. White on green, not a tinted tile. */
@Composable
private fun HeroFigure(value: Double, label: String, decimals: Int = 0) {
    Column {
        // Animated, because these change while the screen is open — the km
        // figure ticks up as the employee walks — and a number that jumps has
        // already finished changing by the time anybody notices.
        AnimatedCount(
            value = value,
            decimals = decimals,
            style = MaterialTheme.typography.titleLarge,
            colour = MaterialTheme.colorScheme.onPrimary,
        )
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f),
        )
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
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // A tinted square rather than a bare glyph. It gives the two
            // actions a weight matching the cards around them — a loose icon
            // beside text reads as a label, not as something to press.
            Box(
                Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(19.dp),
                )
            }
            Spacer(Modifier.width(10.dp))
            Text(label, style = MaterialTheme.typography.labelLarge)
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
                        if (task.schemeName.isNotBlank()) append(task.schemeName)
                        else append(task.code)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.width(12.dp))

            // The count as a ring instead of a bar across the bottom. It puts
            // "two of five" beside the name rather than under it, which is
            // where the eye already is.
            ProgressRing(
                fraction = if (task.targetCount > 0) task.doneCount.toFloat() / task.targetCount else 0f,
                size = 46.dp,
                stroke = 5.dp,
                colour = if (complete) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.primary,
            ) {
                Text(
                    "${task.doneCount}/${task.targetCount}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }

        Spacer(Modifier.height(10.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chip(stageName, MaterialTheme.colorScheme.primary)
            if (task.requireOtp) Chip("OTP")
            if (task.requirePhoto) Chip("photo")
            if (task.priority == "urgent" || task.priority == "high") {
                Chip(task.priority, MaterialTheme.colorScheme.error)
            }
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
 * One line under "Your week" — the total, and how today compares.
 *
 * The comparison is the useful half. A total is a number; "ahead of your usual
 * day" is a fact somebody can feel something about.
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

    // Averaged over the days that HAPPENED, not over seven. Counting days off
    // as zeroes makes every working day look above average, which is flattery
    // rather than information.
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
 * Returned as a list rather than rendered inline so the "nothing is wrong" case
 * costs nothing on screen — an empty list draws no gap, no heading and no
 * reassurance nobody asked for.
 */
fun blockers(context: Context, state: AppViewModel.UiState): List<@Composable () -> Unit> {
    val out = mutableListOf<@Composable () -> Unit>()

    if (!Tracking.hasForegroundLocation(context)) {
        out.add {
            Notice(
                title = "Location is switched off",
                body = "Your visits cannot be recorded without it. Tap to allow location for this app.",
                actionLabel = "Open settings",
                severe = true,
                onAction = { Tracking.openAppSettings(context) },
            )
        }
    } else if (!Tracking.hasBackgroundLocation(context)) {
        out.add {
            Notice(
                title = "Set location to \"Allow all the time\"",
                body = "Right now the route stops being recorded whenever the screen goes off. " +
                    "Android only lets this be changed from the settings screen.",
                actionLabel = "Open settings",
                severe = true,
                onAction = { Tracking.openAppSettings(context) },
            )
        }
    }

    if (Tracking.isBatteryOptimised(context)) {
        out.add {
            Notice(
                title = "Battery saving will stop the recording",
                body = "This phone is allowed to put the app to sleep. Allow it to run in the background " +
                    "so your round is recorded to the end of the day.",
                actionLabel = "Allow",
                severe = true,
                onAction = { Tracking.requestBatteryExemption(context) },
            )
        }
    }

    if (!Tracking.hasNotifications(context)) {
        out.add {
            Notice(
                title = "Notifications are blocked",
                body = "The on-duty notice is what keeps the recording alive. Without it, Android stops it.",
                actionLabel = "Open settings",
                severe = true,
                onAction = { Tracking.openAppSettings(context) },
            )
        }
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
                body = "Showing what was last downloaded. New assignments will not appear until you have signal.",
            )
        }
    }

    return out
}
