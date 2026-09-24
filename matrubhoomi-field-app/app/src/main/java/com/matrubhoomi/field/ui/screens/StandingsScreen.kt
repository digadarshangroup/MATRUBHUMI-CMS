package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.data.Standing
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Accent
import com.matrubhoomi.field.ui.components.AccentCard
import com.matrubhoomi.field.ui.components.Avatar
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.SegmentedTabs
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.rememberFetch

/**
 * Standings — who has put in the time, this month, quarter or year.
 *
 * Ranked on POSITIVE signal only: time worked, days present, days on time. The
 * server never sends anyone's absences or leave reasons to their colleagues, and
 * this screen could not show them if it wanted to. Your own position is pinned
 * at the top so nobody has to scroll a hundred names to find it.
 */
@Composable
fun StandingsScreen(vm: AppViewModel) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val state by vm.state.collectAsState()
    val periods = listOf("month" to "This month", "quarter" to "Quarter", "year" to "Year")
    var index by remember { mutableIntStateOf(0) }
    val board = rememberFetch(index) { repo.standings(periods[index].first) }

    Scaffold(topBar = { ScreenBar("Standings", "Ranked by time worked") }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                SegmentedTabs(
                    options = periods.map { it.second },
                    selectedIndex = index,
                    onSelect = { index = it },
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            val data = board.data
            when {
                board.loading && data == null -> item { LoadingBlock() }
                board.problem != null && data == null -> item { Notice(title = "Could not load standings", body = board.problem, severe = !board.offline) }
                data == null || data.entries.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.EmojiEvents,
                            title = "Nothing to rank yet",
                            body = "Standings fill in from the attendance record as the period goes on.",
                        )
                    }
                }
                else -> {
                    data.me?.let { me ->
                        item {
                            AccentCard(tone = MaterialTheme.colorScheme.primary) {
                                SectionLabel("Your position")
                                Spacer(Modifier.height(6.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("#${me.rank}", style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary)
                                    Spacer(Modifier.width(12.dp))
                                    Text(
                                        "of ${data.entries.size}${if (data.entries.size >= 100) "+" else ""}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Spacer(Modifier.height(10.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    StatTile(me.worked, "worked", modifier = Modifier.weight(1f))
                                    StatTile("${me.present}", "days present", tone = Accent.Water, modifier = Modifier.weight(1f))
                                    StatTile("${me.onTime}", "on time", tone = Accent.Harvest, modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                    item { SectionLabel("Everyone", Modifier.padding(top = 6.dp)) }
                    items(data.entries, key = { it.employeeId }) { s ->
                        StandingRow(s, isMe = s.employeeId == (data.me?.employeeId ?: state.profile.id))
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun StandingRow(s: Standing, isMe: Boolean) {
    val medal = when (s.rank) {
        1 -> Accent.Harvest
        2 -> MaterialTheme.colorScheme.onSurfaceVariant
        3 -> Accent.Brick
        else -> null
    }
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "${s.rank}",
                style = MaterialTheme.typography.titleMedium,
                color = medal ?: MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = if (medal != null) FontWeight.Bold else FontWeight.Normal,
                modifier = Modifier.widthIn(min = 30.dp),
            )
            Avatar(s.name, size = 36.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (isMe) "${s.name} (you)" else s.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (isMe) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
                Text(
                    listOf(s.designation, s.department).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "${s.present} days present" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
            }
            Text(s.worked, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        }
    }
}
