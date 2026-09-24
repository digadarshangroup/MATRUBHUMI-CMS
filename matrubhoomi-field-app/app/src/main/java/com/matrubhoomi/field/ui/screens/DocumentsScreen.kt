package com.matrubhoomi.field.ui.screens

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
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
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.DocumentItem
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.components.BigButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.ConfirmDialog
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

/**
 * Letters from HR — the ones released to this employee, and the ones asked for.
 *
 * A released document opens through a link fetched AT THE MOMENT of opening,
 * never one kept in the list: HR can withdraw a letter, and a link cached on
 * the handset would keep opening it. An employee may ask for a letter (not a
 * warning letter — nobody requests their own), and may cancel the ask while HR
 * has not acted on it.
 */
@Composable
fun DocumentsScreen() {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()

    val docs = rememberFetch("documents") { repo.documents() }
    var asking by remember { mutableStateOf(false) }
    var cancelling by remember { mutableStateOf<DocumentItem?>(null) }
    var opening by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<Pair<Boolean, String>?>(null) }

    fun open(d: DocumentItem) {
        opening = d.id
        message = null
        scope.launch {
            when (val r = withContext(Dispatchers.IO) { repo.documentLink(d.id) }) {
                is ApiResult.Ok -> {
                    if (r.value.isBlank()) {
                        message = false to "HR has not attached the file yet."
                    } else {
                        try {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(r.value)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        } catch (e: ActivityNotFoundException) {
                            message = false to "This phone has nothing that can open the document."
                        }
                    }
                }
                is ApiResult.Offline -> message = false to "No connection — a document is fetched when you open it."
                is ApiResult.Unauthorised -> message = false to "Your session has ended."
                is ApiResult.Failed -> message = false to r.message
            }
            opening = null
        }
    }

    Scaffold(topBar = { ScreenBar("Documents", "Letters from HR") }) { padding ->
        com.matrubhoomi.field.ui.components.RefreshableList(
            refreshing = (docs.loading && docs.data != null),
            onRefresh = { docs.reload() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }
            message?.let { (ok, text) -> item { Notice(title = if (ok) "Done" else "Could not do that", body = text, severe = !ok) } }
            item { BigButton("Ask HR for a letter", icon = Icons.Outlined.Add) { asking = true } }

            val list = docs.data.orEmpty()
            val ready = list.filter { it.isAvailable }
            val asked = list.filterNot { it.isAvailable }

            when {
                docs.loading && docs.data == null -> item { LoadingBlock() }
                docs.problem != null && docs.data == null -> item { Notice(title = "Could not load documents", body = docs.problem, severe = !docs.offline) }
                list.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.Description,
                            title = "No documents yet",
                            body = "Letters HR releases to you — appointment, experience, relieving — appear here. You can also ask for one.",
                        )
                    }
                }
                else -> {
                    if (ready.isNotEmpty()) {
                        item { SectionLabel("Ready to open", Modifier.padding(top = 4.dp)) }
                        items(ready, key = { it.id }) { d ->
                            Card(Modifier.clickable(enabled = opening == null) { open(d) }) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(d.displayName, style = MaterialTheme.typography.titleMedium)
                                        if (d.releasedAt.isNotBlank()) {
                                            Text(
                                                "Released ${dayLabel(d.releasedAt)}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                    if (opening == d.id) {
                                        Text("Opening…", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                                    } else {
                                        Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = "Open", tint = MaterialTheme.colorScheme.primary)
                                    }
                                }
                            }
                        }
                    }
                    if (asked.isNotEmpty()) {
                        item { SectionLabel("Your requests", Modifier.padding(top = 6.dp)) }
                        items(asked, key = { it.id }) { d ->
                            Card {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(d.displayName, style = MaterialTheme.typography.titleMedium)
                                        if (d.requestedAt.isNotBlank()) {
                                            Text(
                                                "Asked ${dayLabel(d.requestedAt)}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                    StatusChip(d.status)
                                }
                                if (d.status == "declined" && d.declineReason.isNotBlank()) {
                                    Spacer(Modifier.height(6.dp))
                                    Text("HR: ${d.declineReason}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                                }
                                if (d.status == "requested") {
                                    TextButton(onClick = { cancelling = d }) { Text("Cancel request") }
                                }
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }

    val toast = com.matrubhoomi.field.ui.components.LocalToast.current
    if (asking) {
        RequestDialog(
            repo = repo,
            onDismiss = { asking = false },
            send = { type, label, reason -> runAction { repo.requestDocument(type, label, reason) } },
            onSent = { text ->
                toast?.show(text ?: "Sent to HR. You will be told when it is ready.")
                docs.reload()
            },
        )
    }

    cancelling?.let { d ->
        ConfirmDialog(
            title = "Cancel this request?",
            body = "HR will stop working on your ${d.displayName.lowercase()}.",
            confirmLabel = "Cancel request",
            destructive = true,
            onConfirm = {
                scope.launch {
                    val (ok, text) = runAction { repo.cancelDocument(d.id) }
                    toast?.result(ok, text, "Request cancelled.", "Not cancelled.")
                    if (ok) docs.reload()
                }
            },
            onDismiss = { cancelling = null },
        )
    }
}

@Composable
private fun RequestDialog(
    repo: Repository,
    onDismiss: () -> Unit,
    send: suspend (String, String, String) -> Pair<Boolean, String?>,
    onSent: (String?) -> Unit,
) {
    val types = rememberFetch("types") { repo.documentTypes() }
    var type by remember { mutableStateOf("") }
    var label by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val valid = type.isNotBlank() && (type != "other" || label.isNotBlank())

    com.matrubhoomi.field.ui.components.AppDialog(
        title = "Ask HR for a letter",
        message = "HR prepares it and you are told when it is ready to open here.",
        icon = androidx.compose.material.icons.Icons.Outlined.Description,
        confirmLabel = "Send to HR",
        confirmEnabled = valid,
        busy = busy,
        error = problem,
        onDismiss = onDismiss,
        onConfirm = {
            busy = true
            problem = null
            scope.launch {
                val (ok, text) = send(type, label.trim(), reason.trim())
                busy = false
                if (ok) { onSent(text); onDismiss() } else problem = text ?: "Not sent."
            }
        },
    ) {
            Column {
                when {
                    types.loading && types.data == null -> LoadingBlock()
                    types.problem != null && types.data == null ->
                        Text(types.problem, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    else -> types.data.orEmpty().forEach { (value, name) ->
                        Row(
                            Modifier.fillMaxWidth().clickable { type = value },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = type == value, onClick = { type = value })
                            Text(name, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
                if (type == "other") {
                    OutlinedTextField(
                        value = label,
                        onValueChange = { label = it.take(120) },
                        label = { Text("Which letter") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it.take(500) },
                    label = { Text("What it is for (optional)") },
                    minLines = 2,
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
    }
}
