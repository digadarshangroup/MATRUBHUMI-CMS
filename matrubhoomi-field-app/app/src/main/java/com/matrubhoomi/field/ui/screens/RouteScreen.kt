package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.MyDay
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.KeyValue
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.MapPoint
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.TileMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.abs

/**
 * The employee's own day, as the office sees it.
 *
 * THIS SCREEN EXISTS FOR THE PERSON BEING TRACKED
 * -----------------------------------------------
 * An app that records somebody's movements all day and never shows them what it
 * recorded is doing something to them. This shows the same figures the desk
 * gets, from the same source — so there is nothing on the desk's screen that is
 * not also on theirs.
 *
 * The line is drawn from the SERVER's simplified path, not from the phone's own
 * queue, for the same reason: if the two ever disagree, the employee should be
 * looking at the number they will be asked about.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteScreen(vm: AppViewModel, onOpenMap: () -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val state by vm.state.collectAsState()

    var day by remember { mutableStateOf<MyDay?>(null) }
    var loading by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }

    // LIVE while on duty. The screen was a snapshot that only moved when
    // somebody pressed refresh, which for a screen titled "Recording now" is a
    // contradiction — it looked stuck. Polling stops the moment duty ends, so a
    // phone in a pocket off the clock is not making requests all evening.
    LaunchedEffect(state.onDuty) {
        if (!state.onDuty) return@LaunchedEffect
        while (true) {
            kotlinx.coroutines.delay(30_000)
            reloadKey++
        }
    }

    LaunchedEffect(reloadKey) {
        loading = true
        problem = null
        when (val result = withContext(Dispatchers.IO) { repo.myDay() }) {
            is ApiResult.Ok -> day = result.value
            is ApiResult.Offline -> problem = "Today's figures come from the server. What you record is still being kept on the phone."
            is ApiResult.Unauthorised -> problem = "Your session expired. Sign in again."
            is ApiResult.Failed -> problem = result.message
        }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Your route", style = MaterialTheme.typography.titleLarge)
                        Text(
                            if (state.onDuty) "Recording now" else "Not recording",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (state.onDuty) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { reloadKey++ }) {
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

            if (problem != null) {
                item { Notice(title = "Working offline", body = problem!!) }
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(
                        value = "${day?.distanceKm ?: 0.0}",
                        label = "km today",
                        tone = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.weight(1f),
                    )
                    StatTile(
                        value = hours(day?.movingMinutes ?: 0),
                        label = "moving",
                        modifier = Modifier.weight(1f),
                    )
                    StatTile(
                        value = hours(day?.idleMinutes ?: 0),
                        label = "still",
                        tone = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            item {
                Card {
                    SectionLabel("Where you have been")
                    Spacer(Modifier.height(10.dp))

                    when {
                        loading -> Row(
                            Modifier.fillMaxWidth().height(180.dp),
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            CircularProgressIndicator(Modifier.padding(top = 70.dp).height(24.dp), strokeWidth = 2.dp)
                        }

                        (day?.path?.size ?: 0) < 2 -> EmptyState(
                            icon = Icons.Outlined.Map,
                            title = if (state.onDuty) "Nothing recorded yet" else "Not on duty",
                            body = if (state.onDuty)
                                "The line appears once you have moved a few hundred metres."
                            else
                                "Turn on duty from the Today screen and your round is recorded from then on.",
                        )

                        else -> {
                            TileMap(
                                path = day!!.path.map { MapPoint(it.lat, it.lng) },
                                modifier = Modifier.fillMaxWidth().height(300.dp),
                                emptyMessage = "Nothing recorded yet.",
                                onExpand = onOpenMap,
                                interactive = false,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Tap the map to open it full screen. ${day!!.path.size} points, ${lastSeen(day!!.lastPingAt)}.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            item {
                Card {
                    SectionLabel("What was achieved")
                    Spacer(Modifier.height(6.dp))
                    KeyValue("Visits recorded", "${day?.submissions ?: 0}")
                    KeyValue("Leads added", "${day?.leadsCreated ?: 0}")
                    KeyValue("Stops", "${day?.stopCount ?: 0}")
                    KeyValue("Waiting to send", "${state.pendingRecords} visits · ${state.queuedPings} positions")
                }
            }

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
                    KeyValue(
                        "Background",
                        if (Tracking.isBatteryOptimised(context)) "Restricted by battery saving" else "Unrestricted",
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Distance is measured conservatively: fixes that are too vague, too small to be a " +
                            "real step, or too fast to be possible are stored but never counted. The figure " +
                            "under-reports rather than inventing travel.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

/** "seen 2 min ago", from the last fix the office actually holds. */
private fun lastSeen(iso: String): String {
    if (iso.isBlank()) return "not reporting"
    val at = runCatching {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        f.parse(iso.take(19))?.time
    }.getOrNull() ?: return "not reporting"

    val mins = ((System.currentTimeMillis() - at) / 60000).toInt()
    return when {
        mins <= 1 -> "updated just now"
        mins < 60 -> "updated $mins min ago"
        else -> "updated ${mins / 60} h ago"
    }
}

private fun hours(minutes: Int): String = when {
    minutes < 60 -> "${minutes}m"
    minutes % 60 == 0 -> "${minutes / 60}h"
    else -> "${minutes / 60}h ${minutes % 60}m"
}
