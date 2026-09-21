package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.MyDay
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.MapPoint
import com.matrubhoomi.field.ui.components.TileMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * The day's route, with the whole screen to itself.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CARD ON `Route`
 * ---------------------------------------------------
 * A map inside a scrolling page is a keyhole in two ways: it is 300dp tall, and
 * every drag on it is a drag the page also wants. The gesture competition is
 * settled properly now (see TileMap's own note), but the keyhole is not — a
 * route across three villages is simply not readable in a third of a screen.
 *
 * Here there is no parent to compete with and nothing else on screen, so the
 * map behaves the way a map is expected to: drag anywhere, pinch anywhere.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(vm: AppViewModel, onBack: () -> Unit) {
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Your route", style = MaterialTheme.typography.titleLarge)
                        Text(
                            if (day == null) "Loading…"
                            else "${day!!.distanceKm} km · ${day!!.path.size} points",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
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
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (loading) {
                CircularProgressIndicator(
                    Modifier.align(Alignment.Center).height(28.dp),
                    strokeWidth = 2.dp,
                )
            } else {
                TileMap(
                    path = day?.path.orEmpty().map { MapPoint(it.lat, it.lng) },
                    modifier = Modifier.fillMaxSize(),
                    emptyMessage = if (state.onDuty)
                        "Nothing recorded yet. The line appears once you have moved."
                    else
                        "Turn on duty from Today and your round is recorded from then on.",
                )
            }
        }
    }
}
