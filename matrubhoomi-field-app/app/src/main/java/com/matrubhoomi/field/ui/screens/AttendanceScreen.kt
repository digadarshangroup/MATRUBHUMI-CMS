package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.dayLabel
import com.matrubhoomi.field.data.AttendanceDay
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.MonthCalendar
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.rememberFetch
import java.time.LocalDate

/**
 * Every day this month, as HR has it — a calendar to find a day, a list to
 * read it, and a way to ask for a wrong one to be fixed.
 *
 * IT SHOWS HR'S STATUS, NOT A SIMPLIFICATION OF IT
 * ------------------------------------------------
 * The muster roll has more than present and absent — half days, late-absent,
 * week offs, five kinds of holiday — and every one of them affects pay.
 * Flattening them to a tick and a cross would make this screen disagree with
 * the payslip, and the payslip is the one somebody argues about. So the codes
 * keep HR's own labels, and colour is a second signal beside the word.
 */
@Composable
fun AttendanceScreen(onFixDay: (String) -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }

    val now = remember { LocalDate.now() }
    var year by remember { mutableIntStateOf(now.year) }
    var month by remember { mutableIntStateOf(now.monthValue) }
    var selected by remember { mutableStateOf<LocalDate?>(null) }

    val data = rememberFetch(year, month) { repo.attendanceMonth(year, month) }
    val byDate = data.data?.days.orEmpty().associateBy { it.dateStr }

    fun shift(by: Int) {
        val d = LocalDate.of(year, month, 1).plusMonths(by.toLong())
        year = d.year
        month = d.monthValue
        selected = null
    }

    val present = MaterialTheme.colorScheme.primary
    val absent = MaterialTheme.colorScheme.error
    val half = MaterialTheme.colorScheme.secondary
    val off = MaterialTheme.colorScheme.outline

    fun toneOf(day: AttendanceDay?): Color? = when {
        day == null -> null
        day.isPresent -> present
        day.isAbsent -> absent
        day.isHalfDay -> half
        day.isOff -> off
        day.status.startsWith("L") -> half
        else -> null
    }

    Scaffold(topBar = { ScreenBar("Attendance", "From the fingerprint machine and approved corrections") }) { padding ->
        com.matrubhoomi.field.ui.components.RefreshableList(
            refreshing = (data.loading && data.data != null),
            onRefresh = { data.reload() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card {
                    MonthCalendar(
                        year = year,
                        month = month,
                        toneFor = { toneOf(byDate[it.toString()]) },
                        selected = selected,
                        onSelect = { selected = if (selected == it) null else it },
                        onShift = ::shift,
                        canGoForward = LocalDate.of(year, month, 1).isBefore(now.withDayOfMonth(1)),
                    )
                }
            }

            if (data.problem != null) {
                item { Notice(title = "Could not load attendance", body = data.problem, severe = !data.offline) }
            }

            data.data?.let { m ->
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile("${m.present}", "present", modifier = Modifier.weight(1f))
                        StatTile("${m.absent}", "absent", tone = if (m.absent > 0) absent else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                        StatTile("${m.halfDay}", "half days", tone = half, modifier = Modifier.weight(1f))
                        StatTile("${m.weekOff + m.holiday}", "off", tone = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    }
                }
            }

            val days = data.data?.days.orEmpty()
                .filter { selected == null || it.dateStr == selected.toString() }
                .sortedByDescending { it.dateStr }

            when {
                data.loading && data.data == null -> item { LoadingBlock() }
                selected != null && days.isEmpty() -> item {
                    Card {
                        Text(dayLabel(selected.toString()), style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Nothing was recorded for this day. If you worked, ask for it to be corrected.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        TextButton(onClick = { onFixDay(selected.toString()) }) { Text("Fix this day") }
                    }
                }
                days.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.CalendarMonth,
                            title = "Nothing recorded",
                            body = "No attendance was recorded for this month. If that looks wrong, ask for a correction — " +
                                "this screen shows the muster roll, it does not create it.",
                        )
                    }
                }
                else -> items(days, key = { it.dateStr }) { day -> DayRow(day, toneOf(day) ?: off, onFixDay) }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }
}

@Composable
private fun DayRow(day: AttendanceDay, tone: Color, onFixDay: (String) -> Unit) {
    // A day worth correcting: marked absent, or a punch missing.
    val past = day.dateStr < LocalDate.now().toString()
    val fixable = day.isAbsent || day.status == "MP" ||
        (day.inTime.isNotBlank() && day.outTime.isBlank() && past) ||
        // No punch at all on a past working day is the commonest thing to fix.
        (!day.hasRecord && past && !day.isOff)
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(width = 4.dp, height = 38.dp).background(tone, RoundedCornerShape(999.dp)))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(dayLabel(day.dateStr), style = MaterialTheme.typography.titleMedium)
                Text(
                    buildString {
                        append(day.word)
                        if (day.inTime.isNotBlank()) {
                            append(" · ").append(day.inTime)
                            if (day.outTime.isNotBlank()) append(" – ").append(day.outTime)
                        }
                        if (day.workDisplay.isNotBlank()) append(" · ").append(day.workDisplay)
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (day.isLate) {
                Text("${day.lateMins}m late", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.error)
            }
        }
        if (fixable) {
            TextButton(onClick = { onFixDay(day.dateStr) }) { Text("Fix this day") }
        }
    }
}
