package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.formatKm
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.MyDay
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.MapPoint
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.TileMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * The day's route with the whole screen to itself — numbered stops, visits,
 * and where the phone is now, over streets or satellite.
 *
 * A map inside a scrolling page is a keyhole, and every drag on it is one the
 * page also wants. Here there is no parent to compete with, so the map behaves
 * the way a map is expected to: drag anywhere, pinch anywhere.
 */
@Composable
fun MapScreen(vm: AppViewModel) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val state by vm.state.collectAsState()

    var day by remember { mutableStateOf<MyDay?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val result = withContext(Dispatchers.IO) { repo.myDay() }
        if (result is ApiResult.Ok) day = result.value
        loading = false
    }

    // Keeps up while the round is being recorded, so the line grows as you walk
    // rather than freezing at whatever it was when the screen opened.
    LaunchedEffect(state.onDuty) {
        if (!state.onDuty) return@LaunchedEffect
        while (true) {
            delay(30_000)
            val result = withContext(Dispatchers.IO) { repo.myDay() }
            if (result is ApiResult.Ok) day = result.value
        }
    }

    val d = day
    Scaffold(
        topBar = {
            ScreenBar(
                "My route",
                if (d == null) "Loading…" else "${formatKm(d.distanceKm)} · ${d.stops.count { it.isStay }} stops",
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (loading) {
                CircularProgressIndicator(Modifier.align(Alignment.Center).height(28.dp), strokeWidth = 2.dp)
            } else {
                TileMap(
                    path = d?.path.orEmpty().map { MapPoint(it.lat, it.lng) },
                    markers = d?.let { routeMarkers(it, state.onDuty) }.orEmpty(),
                    modifier = Modifier.fillMaxSize(),
                    emptyMessage = if (state.onDuty) "Nothing recorded yet. The line appears once you have moved."
                    else "Start duty from Today and your round is recorded from then on.",
                )
                // What is happening now, over the bottom of the map — the one
                // line somebody opening this screen is looking for.
                val words = nowWords(d, state.onDuty)
                Surface(
                    modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 36.dp),
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
                    shadowElevation = 3.dp,
                ) {
                    Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                        Text(words.headline, style = MaterialTheme.typography.titleMedium)
                        if (words.detail.isNotBlank()) {
                            Text(words.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(6.dp))
                        MapKey()
                    }
                }
            }
        }
    }
}
