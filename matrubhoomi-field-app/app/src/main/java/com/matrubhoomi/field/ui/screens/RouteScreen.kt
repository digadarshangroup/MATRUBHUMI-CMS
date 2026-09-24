package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.formatKm
import com.matrubhoomi.field.core.formatMinutes
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.MyDay
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.KeyValue
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.MapPoint
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.TileMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The employee's own day, as the office sees it — where they are now, where
 * they stopped and for how long, and the line they have drawn.
 *
 * THIS SCREEN EXISTS FOR THE PERSON BEING TRACKED
 * -----------------------------------------------
 * An app that records somebody's movements all day and never shows them what it
 * recorded is doing something to them. This shows the same figures, the same
 * stops and the same place names the sales desk gets, from the same source — so
 * there is nothing on the desk's screen that is not also on theirs.
 */
@Composable
fun RouteScreen(vm: AppViewModel, onOpenMap: () -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val state by vm.state.collectAsState()

    var day by remember { mutableStateOf<MyDay?>(null) }
    var loading by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }

    // LIVE while on duty; the polling stops the moment duty ends, so a phone in
    // a pocket off the clock is not making requests all evening.
    LaunchedEffect(state.onDuty) {
        if (!state.onDuty) return@LaunchedEffect
        while (true) {
            kotlinx.coroutines.delay(30_000)
            reloadKey++
        }
    }

    LaunchedEffect(reloadKey) {
        loading = true
        when (val result = withContext(Dispatchers.IO) { repo.myDay() }) {
            is ApiResult.Ok -> { day = result.value; problem = null }
            is ApiResult.Offline -> problem = "Today's route comes from the server. What you record is still being kept on the phone."
            is ApiResult.Unauthorised -> problem = "Your session has ended."
            is ApiResult.Failed -> problem = result.message
        }
        loading = false
    }

    Scaffold(
        topBar = {
            ScreenBar(
                "My route",
                if (state.onDuty) "Recording now" else "Not recording",
                actions = { IconButton(onClick = { reloadKey++ }) { Icon(Icons.Default.Refresh, contentDescription = "Refresh") } },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }

            problem?.let { item { Notice(title = "Could not refresh", body = it) } }

            /* ── Right now ─────────────────────────────────────── */
            item { NowPanel(day, state.onDuty) }

            /* ── The day's figures ─────────────────────────────── */
            item {
                val d = day
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatTile(formatKm(d?.distanceKm ?: 0.0), "travelled", tone = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f))
                    StatTile(short(d?.movingMinutes ?: 0), "moving", modifier = Modifier.weight(1f))
                    val stays = d?.stops?.count { it.isStay } ?: 0
                    StatTile("$stays", if (stays == 1) "stop" else "stops", tone = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                }
            }

            /* ── The map ───────────────────────────────────────── */
            item {
                Card {
                    SectionLabel("Where you have been")
                    Spacer(Modifier.height(10.dp))
                    val d = day
                    when {
                        loading && d == null -> LoadingBlock(Modifier.height(200.dp))
                        d == null || (d.path.size < 2 && d.stops.isEmpty() && d.position == null) -> EmptyState(
                            icon = Icons.Outlined.Map,
                            title = if (state.onDuty) "Nothing recorded yet" else "Not on duty",
                            body = if (state.onDuty) "The line appears once you have moved a few hundred metres."
                            else "Start duty from Today and your round is recorded from then on.",
                        )
                        else -> {
                            TileMap(
                                path = d.path.map { MapPoint(it.lat, it.lng) },
                                markers = routeMarkers(d, state.onDuty),
                                modifier = Modifier.fillMaxWidth().height(300.dp),
                                emptyMessage = "Nothing recorded yet.",
                                onExpand = onOpenMap,
                                interactive = false,
                            )
                            Spacer(Modifier.height(8.dp))
                            MapKey()
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Tap the map to open it full screen.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            /* ── Stops and visits, in order ────────────────────── */
            item {
                Card {
                    SectionLabel("Stops and visits")
                    Spacer(Modifier.height(10.dp))
                    val d = day
                    if (d == null || d.stops.isEmpty()) {
                        Row {
                            Icon(Icons.Outlined.Place, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.padding(start = 8.dp))
                            Text(
                                "A stop appears here when you stay in one place for five minutes or more — with the village's name and how long you were there.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        DayTimeline(d)
                    }
                }
            }

            /* ── What was achieved ─────────────────────────────── */
            item {
                Card {
                    SectionLabel("What was achieved")
                    Spacer(Modifier.height(6.dp))
                    KeyValue("Visits recorded", "${day?.submissions ?: 0}")
                    KeyValue("Customers added", "${day?.leadsCreated ?: 0}")
                    KeyValue("Time moving", formatMinutes(day?.movingMinutes ?: 0))
                    KeyValue("Time stopped", formatMinutes(day?.idleMinutes ?: 0))
                    KeyValue("Waiting to send", "${state.pendingRecords} visits · ${state.queuedPings} positions")
                }
            }

            /* ── Is the recording healthy ──────────────────────── */
            item {
                Card {
                    SectionLabel("Recording")
                    Spacer(Modifier.height(6.dp))
                    KeyValue("On duty", if (state.onDuty) "Yes" else "No")
                    KeyValue(
                        "Location permission",
                        when {
                            !Tracking.hasForegroundLocation(context) -> "Not granted"
                            !Tracking.hasBackgroundLocation(context) -> "Only while open"
                            else -> "All the time"
                        },
                    )
                    KeyValue("Location switch", if (Tracking.isLocationSwitchOn(context)) "On" else "Off")
                    KeyValue("Background", if (Tracking.isBatteryOptimised(context)) "Restricted by battery saving" else "Unrestricted")
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Distance is measured conservatively: fixes that are too vague, too small to be a real step, or too fast to be " +
                            "possible are stored but never counted. The figure under-reports rather than inventing travel.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

private fun short(minutes: Int): String = when {
    minutes < 60 -> "${minutes}m"
    minutes % 60 == 0 -> "${minutes / 60}h"
    else -> "${minutes / 60}h ${minutes % 60}m"
}
