package com.matrubhoomi.field.ui.screens

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
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.Holiday
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.SegmentedTabs
import com.matrubhoomi.field.ui.components.rememberFetch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * The company's holidays for the year — the next one first, the rest by month.
 *
 * Planning leave around a long weekend is the question this answers, so the
 * next holiday is pulled to the top with how many days away it is.
 */
@Composable
fun HolidaysScreen() {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val thisYear = LocalDate.now().year
    var year by remember { mutableIntStateOf(thisYear) }
    val list = rememberFetch(year) { repo.holidays(year) }

    Scaffold(topBar = { ScreenBar("Holidays", "Company holidays for $year") }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                SegmentedTabs(
                    options = listOf("$thisYear", "${thisYear + 1}"),
                    selectedIndex = if (year == thisYear) 0 else 1,
                    onSelect = { year = thisYear + it },
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            val all = list.data.orEmpty()
            val holidays = all.filterNot { it.isWorkingSunday }
            val workingSundays = all.filter { it.isWorkingSunday }
            when {
                list.loading && list.data == null -> item { LoadingBlock() }
                list.problem != null && list.data == null -> item { Notice(title = "Could not load holidays", body = list.problem, severe = !list.offline) }
                holidays.isEmpty() && workingSundays.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.BeachAccess,
                            title = "No holidays listed for $year",
                            body = "HR has not published this year's list yet.",
                        )
                    }
                }
                else -> {
                    val today = LocalDate.now()
                    val next = holidays.firstOrNull { parse(it.date)?.let { d -> !d.isBefore(today) } == true }
                    if (next != null) {
                        item {
                            Card {
                                SectionLabel("Next holiday")
                                Spacer(Modifier.height(6.dp))
                                Text(next.name, style = MaterialTheme.typography.titleLarge)
                                val d = parse(next.date)
                                if (d != null) {
                                    val days = ChronoUnit.DAYS.between(today, d)
                                    Text(
                                        d.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.US)) + " · " +
                                            when (days) { 0L -> "today"; 1L -> "tomorrow"; else -> "in $days days" },
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            }
                        }
                    }
                    holidays.groupBy { parse(it.date)?.monthValue ?: 0 }.toSortedMap().forEach { (month, inMonth) ->
                        item(key = "m$month") {
                            SectionLabel(
                                if (month == 0) "Undated" else java.time.Month.of(month).getDisplayName(java.time.format.TextStyle.FULL, Locale.US),
                                Modifier.padding(top = 8.dp),
                            )
                        }
                        items(inMonth, key = { it.date + it.name }) { h -> HolidayRow(h, today) }
                    }
                    if (workingSundays.isNotEmpty()) {
                        item(key = "ws") { SectionLabel("Working Sundays — come in on these", Modifier.padding(top = 8.dp)) }
                        items(workingSundays, key = { "ws" + it.date }) { h -> HolidayRow(h, today) }
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun HolidayRow(h: Holiday, today: LocalDate) {
    val date = parse(h.date)
    val past = date != null && date.isBefore(today)
    val ink = if (past) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = (if (past) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                modifier = Modifier.size(52.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(date?.dayOfMonth?.toString() ?: "–", style = MaterialTheme.typography.titleLarge, color = if (past) ink else MaterialTheme.colorScheme.primary)
                        Text(
                            date?.format(DateTimeFormatter.ofPattern("EEE", Locale.US)) ?: "",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(h.name, style = MaterialTheme.typography.titleMedium, color = ink)
                if (h.description.isNotBlank()) {
                    Text(h.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            // Only the kinds that change what somebody does: an optional or
            // restricted holiday has to be asked for; a working Sunday is a
            // day at work. National and company holidays need no label.
            when (h.type) {
                "optional", "restricted" -> Chip(h.type)
                "working_sunday" -> Chip("working day", MaterialTheme.colorScheme.error)
            }
        }
    }
}

private fun parse(date: String): LocalDate? = runCatching { LocalDate.parse(date.take(10)) }.getOrNull()
