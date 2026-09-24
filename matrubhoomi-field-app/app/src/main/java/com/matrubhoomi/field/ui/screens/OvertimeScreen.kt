package com.matrubhoomi.field.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.dayLabel
import com.matrubhoomi.field.core.formatMinutes
import com.matrubhoomi.field.data.OvertimeDue
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.components.AccentCard
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.StatusChip
import com.matrubhoomi.field.ui.components.rememberFetch
import com.matrubhoomi.field.ui.components.runAction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Staying late, reported — and the next morning's grace time that comes of it.
 *
 * The server finds the late stays itself from the fingerprint record; the
 * employee only says why, with a photograph of the proof if there is one. The
 * reporting manager approves, and the grace is applied to the next day's
 * attendance. A stay not reported by the end of that day expires.
 */
@Composable
fun OvertimeScreen() {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()

    val due = rememberFetch("due") { repo.overtimeDue() }
    val mine = rememberFetch("mine") { repo.myOvertime() }

    var reporting by remember { mutableStateOf<OvertimeDue?>(null) }
    var result by remember { mutableStateOf<Pair<Boolean, String>?>(null) }

    Scaffold(topBar = { ScreenBar("Overtime", "Report a late stay for next-day grace") }) { padding ->
        com.matrubhoomi.field.ui.components.RefreshableList(
            refreshing = (due.loading && due.data != null) || (mine.loading && mine.data != null),
            onRefresh = { due.reload(); mine.reload() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }

            result?.let { (ok, message) -> item { Notice(title = if (ok) "Reported" else "Not reported", body = message, severe = !ok) } }

            item { SectionLabel("Waiting for your report") }
            when {
                due.loading && due.data == null -> item { LoadingBlock() }
                due.problem != null && due.data == null -> item { Notice(title = "Could not check", body = due.problem, severe = !due.offline) }
                due.data.isNullOrEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.AccessTime,
                            title = "Nothing to report",
                            body = "When the fingerprint machine shows you stayed past your shift, the day appears here to report.",
                        )
                    }
                }
                else -> items(due.data!!, key = { it.dateStr }) { d ->
                    AccentCard(tone = MaterialTheme.colorScheme.primary, onClick = { reporting = d }) {
                        Text("${dayLabel(d.dateStr)} · stayed until ${d.actualOut}", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "${formatMinutes(d.stayOverMins)} past ${d.scheduledOut}. If approved, report by ${d.adjustedReportTime} the next day.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        TextButton(onClick = { reporting = d }) { Text("Report it") }
                    }
                }
            }

            item { SectionLabel("This month", Modifier.padding(top = 6.dp)) }
            val list = mine.data.orEmpty()
            if (!mine.loading && list.isEmpty()) {
                item { Text("No reports this month.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            items(list, key = { it.id }) { r ->
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${dayLabel(r.dateStr)} · until ${r.actualOut}", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "${formatMinutes(r.stayOverMins)} late · ${r.graceMinutes} min grace",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        StatusChip(r.status)
                    }
                    if (r.rejectionReason.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text("Reason: ${r.rejectionReason}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }

    val toast = com.matrubhoomi.field.ui.components.LocalToast.current
    reporting?.let { d ->
        ReportDialog(
            due = d,
            onDismiss = { reporting = null },
            send = { description, proof, mime -> runAction { repo.submitOvertime(d.dateStr, description, proof, mime) } },
            onSent = { message ->
                toast?.show(message?.takeIf { it.isNotBlank() } ?: "Sent to your manager.")
                due.reload()
                mine.reload()
            },
        )
    }
}

@Composable
private fun ReportDialog(
    due: OvertimeDue,
    onDismiss: () -> Unit,
    send: suspend (String, File?, String) -> Pair<Boolean, String?>,
    onSent: (String?) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var description by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    var proof by remember { mutableStateOf<File?>(null) }
    var mime by remember { mutableStateOf("image/jpeg") }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            // Copied into the app's own cache: the picker's grant does not
            // survive a process restart, and the upload may happen after one.
            val type = context.contentResolver.getType(uri) ?: "image/jpeg"
            val ext = when (type) { "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg" }
            val file = File(File(context.cacheDir, "proofs").apply { mkdirs() }, "overtime-${due.dateStr}.$ext")
            withContext(Dispatchers.IO) {
                context.contentResolver.openInputStream(uri)?.use { input -> file.outputStream().use { input.copyTo(it) } }
            }
            proof = file
            mime = type
        }
    }

    com.matrubhoomi.field.ui.components.AppDialog(
        title = "You stayed until ${due.actualOut}",
        message = "${dayLabel(due.dateStr)} — say what kept you. If your manager approves, you get grace on your next day's arrival.",
        icon = Icons.Outlined.AccessTime,
        tone = com.matrubhoomi.field.ui.components.Tone.Positive,
        confirmLabel = "Send to manager",
        confirmEnabled = description.isNotBlank(),
        busy = busy,
        error = problem,
        onDismiss = { proof?.delete(); onDismiss() },
        onConfirm = {
            busy = true
            problem = null
            scope.launch {
                val (ok, message) = send(description.trim(), proof, mime)
                busy = false
                if (ok) { proof?.delete(); onSent(message); onDismiss() } else problem = message ?: "Not sent."
            }
        },
    ) {
        com.matrubhoomi.field.ui.components.SuggestionRow(
            listOf("Month-end closing", "Urgent customer work", "Stock arrived late", "Meeting ran late"),
        ) { description = it; problem = null }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = description,
            onValueChange = { description = it; problem = null },
            label = { Text("What kept you") },
            minLines = 3,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(6.dp))
        TextButton(onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
            Icon(Icons.Outlined.AttachFile, contentDescription = null)
            Spacer(Modifier.padding(start = 6.dp))
            Text(if (proof == null) "Attach a photo (optional)" else "Photo attached — change")
        }
    }
}
