package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.FieldTask
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.Notice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Every assignment, open and finished.
 *
 * WHY "FINISHED" IS WORTH A TAB AT ALL
 * ------------------------------------
 * An employee is asked, regularly, what they did on Tuesday — by the desk, by a
 * customer who says nobody came, by themselves at the end of a long week. The
 * open list answers none of that. Finished work is fetched from the server
 * rather than kept locally, because the point of the question is the record the
 * OFFICE holds.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkScreen(vm: AppViewModel, onOpenTask: (String) -> Unit) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()

    var showDone by remember { mutableStateOf(false) }
    var doneTasks by remember { mutableStateOf<List<FieldTask>>(emptyList()) }
    var loadingDone by remember { mutableStateOf(false) }
    var doneError by remember { mutableStateOf<String?>(null) }

    // Fetched only when the tab is actually opened. Most days nobody looks, and
    // a request nobody asked for is battery spent on a handset that needs it.
    LaunchedEffect(showDone) {
        if (!showDone || doneTasks.isNotEmpty()) return@LaunchedEffect
        loadingDone = true
        doneError = null
        when (val result = withContext(Dispatchers.IO) { repo.tasks("done") }) {
            is ApiResult.Ok -> doneTasks = result.value
            is ApiResult.Offline -> doneError = "Finished work is on the server — this needs a connection."
            is ApiResult.Unauthorised -> doneError = "Your session expired. Sign in again."
            is ApiResult.Failed -> doneError = result.message
        }
        loadingDone = false
    }

    val open = state.bootstrap?.tasks.orEmpty()
    val shown = if (showDone) doneTasks else open

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Work", style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = !showDone,
                    onClick = { showDone = false },
                    label = { Text("To do${if (open.isNotEmpty()) " (${open.size})" else ""}") },
                )
                FilterChip(
                    selected = showDone,
                    onClick = { showDone = true },
                    label = { Text("Finished") },
                )
            }

            Spacer(Modifier.height(12.dp))

            when {
                showDone && loadingDone -> Row(
                    Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.Top,
                ) {
                    CircularProgressIndicator(Modifier.padding(top = 40.dp).height(26.dp), strokeWidth = 2.dp)
                }

                showDone && doneError != null -> Notice(
                    title = "Could not load finished work",
                    body = doneError!!,
                )

                shown.isEmpty() -> Card {
                    EmptyState(
                        icon = Icons.Outlined.Assignment,
                        title = if (showDone) "Nothing finished yet" else "Nothing to do",
                        body = if (showDone)
                            "Work you complete moves here, so you can show what was done and when."
                        else
                            "When the sales desk assigns a round, it appears here and on Today.",
                    )
                }

                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(shown, key = { it.id }) { task ->
                        TaskCard(
                            task = task,
                            stageName = vm.stageName(task),
                            onClick = { onOpenTask(task.id) },
                        )
                    }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}
