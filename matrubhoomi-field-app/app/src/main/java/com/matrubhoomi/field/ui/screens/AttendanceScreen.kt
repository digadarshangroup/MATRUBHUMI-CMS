package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.AttendanceDay
import com.matrubhoomi.field.data.AttendanceMonth
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.StatTile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar

/**
 * Every day this month, as HR has it.
 *
 * IT SHOWS HR'S STATUS, NOT A SIMPLIFICATION OF IT
 * ------------------------------------------------
 * The muster roll has more than present and absent — half days, late-absent,
 * early-out-absent, week offs, five kinds of holiday — and every one of them
 * affects pay. Flattening them to a tick and a cross would make this screen
 * disagree with the payslip, and the payslip is the one somebody argues about.
 *
 * So the codes are shown with HR's own labels, and the colour is a second
 * signal beside the word rather than instead of it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }

    val now = remember { Calendar.getInstance() }
    var year by remember { mutableStateOf(now.get(Calendar.YEAR)) }
    var month by remember { mutableStateOf(now.get(Calendar.MONTH) + 1) }

    var data by remember { mutableStateOf<AttendanceMonth?>(null) }
    var loading by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(year, month) {
        loading = true
        problem = null
        when (val result = withContext(Dispatchers.IO) { repo.attendanceMonth(year, month) }) {
            is ApiResult.Ok -> data = result.value
            is ApiResult.Offline -> problem = "Attendance lives on the server — this needs a connection."
            is ApiResult.Unauthorised -> problem = "Your session has ended. Sign in again."
            is ApiResult.Failed -> problem = result.message
        }
        loading = false
    }

    fun shift(by: Int) {
        var m = month + by
        var y = year
        if (m < 1) { m = 12; y -= 1 }
        if (m > 12) { m = 1; y += 1 }
        month = m
        year = y
    }

    val isCurrentMonth = year == now.get(Calendar.YEAR) && month == now.get(Calendar.MONTH) + 1

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Attendance", style = MaterialTheme.typography.titleLarge) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
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
            item {
                Row(
                    Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { shift(-1) }) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = "Previous month")
                    }
                    Text("${monthName(month)} $year", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { shift(1) }, enabled = !isCurrentMonth) {
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = "Next month",
                            // Greyed at the current month rather than hidden:
                            // a control that disappears reads as a bug.
                            tint = if (isCurrentMonth) MaterialTheme.colorScheme.outline
                            else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            if (problem != null) {
                item { Notice(title = "Could not load attendance", body = problem!!, severe = true) }
            }

            data?.let { month ->
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile(value = "${month.present}", label = "present", modifier = Modifier.weight(1f))
                        StatTile(
                            value = "${month.absent}",
                            label = "absent",
                            tone = if (month.absent > 0) MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            value = "${month.halfDay}",
                            label = "half days",
                            tone = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            value = "${month.weekOff + month.holiday}",
                            label = "off",
                            tone = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            when {
                loading -> item {
                    Row(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalArrangement = Arrangement.Center) {
                        CircularProgressIndicator(Modifier.height(26.dp), strokeWidth = 2.dp)
                    }
                }

                data?.days.isNullOrEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.CalendarMonth,
                            title = "Nothing recorded",
                            body = "No attendance was recorded for this month. If that looks wrong, ask HR — " +
                                "this screen shows the muster roll, it does not create it.",
                        )
                    }
                }

                else -> items(data!!.days.reversed(), key = { it.dateStr }) { day -> DayRow(day) }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun DayRow(day: AttendanceDay) {
    val tone = when {
        day.isPresent -> MaterialTheme.colorScheme.primary
        day.isAbsent -> MaterialTheme.colorScheme.error
        day.isHalfDay -> MaterialTheme.colorScheme.secondary
        day.isOff -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(width = 4.dp, height = 38.dp)
                    .background(tone, RoundedCornerShape(999.dp)),
            )
            Spacer(Modifier.width(14.dp))

            Column(Modifier.weight(1f)) {
                Text(dayLabel(day.dateStr), style = MaterialTheme.typography.titleMedium)
                Text(
                    buildString {
                        append(day.label.ifBlank { day.status })
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
                Text(
                    "${day.lateMins}m late",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

private fun dayLabel(dateStr: String): String {
    // "2026-08-26" -> "Wed 26 Aug". Parsed by hand rather than with a formatter
    // because the string is already in a fixed shape and a locale-aware parse
    // would fail on a handset set to a calendar that is not Gregorian.
    return runCatching {
        val parts = dateStr.split("-")
        val cal = Calendar.getInstance().apply {
            set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt())
        }
        val weekday = arrayOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")[cal.get(Calendar.DAY_OF_WEEK) - 1]
        "$weekday ${parts[2].toInt()} ${monthName(parts[1].toInt()).take(3)}"
    }.getOrDefault(dateStr)
}

private fun monthName(month: Int): String = arrayOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)[(month - 1).coerceIn(0, 11)]
