package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BuildCircle
import androidx.compose.material3.FilterChip
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
import com.matrubhoomi.field.data.Regularization
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.data.regularizationTypeName
import com.matrubhoomi.field.ui.components.BigButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.ConfirmDialog
import com.matrubhoomi.field.ui.components.DateField
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.StatusChip
import com.matrubhoomi.field.ui.components.TimeField
import com.matrubhoomi.field.ui.components.rememberFetch
import com.matrubhoomi.field.ui.components.runAction
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * Asking for a wrong day to be put right — a missed punch, a forgotten one, a
 * day marked wrongly, or a day spent at a client's.
 *
 * It goes to the ONE reporting manager, and their approval writes the times
 * onto the muster roll directly. A salesperson's field days usually arrive
 * here by themselves — ending duty files them — and are marked as such.
 */
@Composable
fun RegularizeScreen(initialDate: String?) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()

    val mine = rememberFetch("regs") { repo.myRegularizations() }

    var date by remember {
        mutableStateOf(initialDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now().minusDays(1))
    }
    var type by remember { mutableStateOf("miss_punch") }
    var inTime by remember { mutableStateOf("") }
    var outTime by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("P") }
    var reason by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var cancelling by remember { mutableStateOf<Regularization?>(null) }

    val needsTimes = type == "miss_punch" || type == "forgot_punch"
    val timesValid = !needsTimes || inTime.isNotBlank() || outTime.isNotBlank()
    val orderValid = inTime.isBlank() || outTime.isBlank() || inTime < outTime

    val toast = com.matrubhoomi.field.ui.components.LocalToast.current
    Scaffold(topBar = { ScreenBar("Fix attendance", "Goes to your reporting manager") }) { padding ->
        com.matrubhoomi.field.ui.components.RefreshableList(
            refreshing = (mine.loading && mine.data != null),
            onRefresh = { mine.reload() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }

            item {
                Card {
                    SectionLabel("Which day")
                    Spacer(Modifier.height(8.dp))
                    DateField("Date", date, onChange = { date = it; result = null }, latest = LocalDate.now())

                    Spacer(Modifier.height(14.dp))
                    SectionLabel("What went wrong")
                    Spacer(Modifier.height(8.dp))
                    com.matrubhoomi.field.ui.components.ChipFlow {
                        listOf("miss_punch", "forgot_punch", "wrong_status", "client_visit").forEach { t ->
                            FilterChip(selected = type == t, onClick = { type = t; result = null }, label = { Text(regularizationTypeName(t)) })
                        }
                    }

                    if (type == "wrong_status") {
                        Spacer(Modifier.height(12.dp))
                        Text("It should have been", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(6.dp))
                        com.matrubhoomi.field.ui.components.ChipFlow {
                            listOf("P" to "Present", "HD" to "Half day", "WFH" to "Work from home", "CO" to "Comp off").forEach { (code, label) ->
                                FilterChip(selected = status == code, onClick = { status = code }, label = { Text(label) })
                            }
                        }
                    }

                    if (type != "client_visit") {
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            TimeField(if (needsTimes) "In" else "In (optional)", inTime, { inTime = it; result = null }, Modifier.weight(1f))
                            TimeField(if (needsTimes) "Out" else "Out (optional)", outTime, { outTime = it; result = null }, Modifier.weight(1f))
                        }
                    } else {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "A day at a client's is marked present once your manager agrees.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it; result = null },
                        label = { Text("Reason for your manager") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    if (!orderValid) {
                        Spacer(Modifier.height(6.dp))
                        Text("The out time has to be after the in time.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }

                    result?.let { (ok, message) ->
                        Spacer(Modifier.height(10.dp))
                        Notice(title = if (ok) "Sent" else "Not sent", body = message, severe = !ok)
                    }

                    Spacer(Modifier.height(12.dp))
                    BigButton(
                        text = if (sending) "Sending…" else "Send to my manager",
                        enabled = !sending && reason.isNotBlank() && timesValid && orderValid,
                    ) {
                        sending = true
                        scope.launch {
                            val (ok, message) = runAction {
                                repo.requestRegularization(
                                    date.toString(),
                                    type,
                                    reason.trim(),
                                    inTime.takeIf { type != "client_visit" },
                                    outTime.takeIf { type != "client_visit" },
                                    when (type) {
                                        "wrong_status" -> status
                                        "client_visit" -> "P"
                                        else -> null
                                    },
                                )
                            }
                            result = if (ok) null else false to (message ?: "Not sent.")
                            if (ok) toast?.show("Sent — your manager will see it in their approvals.")
                            if (ok) {
                                reason = ""
                                inTime = ""
                                outTime = ""
                                mine.reload()
                            }
                            sending = false
                        }
                    }
                }
            }

            item { SectionLabel("Your requests", Modifier.padding(top = 6.dp)) }

            val list = mine.data.orEmpty()
            when {
                mine.loading && mine.data == null -> item { LoadingBlock() }
                mine.problem != null && mine.data == null -> item { Notice(title = "Could not load your requests", body = mine.problem, severe = !mine.offline) }
                list.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.BuildCircle,
                            title = "No requests",
                            body = "Days you ask to be corrected appear here, with your manager's decision.",
                        )
                    }
                }
                else -> items(list, key = { it.id }) { r -> RegularizationCard(r, onCancel = { cancelling = r }) }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }

    cancelling?.let { r ->
        ConfirmDialog(
            title = "Cancel this request?",
            body = "Your manager has not decided it yet, so it is withdrawn straight away.",
            confirmLabel = "Cancel request",
            destructive = true,
            onConfirm = {
                scope.launch {
                    val (ok, message) = runAction { repo.cancelRegularization(r.id) }
                    toast?.result(ok, message, "Request cancelled.", "Could not cancel it.")
                    mine.reload()
                }
            },
            onDismiss = { cancelling = null },
        )
    }
}

@Composable
fun RegularizationCard(r: Regularization, onCancel: (() -> Unit)? = null, header: String? = null) {
    Card {
        if (header != null) {
            Text(header, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(4.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    "${dayLabel(r.dateStr)} · ${if (r.isFieldDay) "Field day" else regularizationTypeName(r.type)}",
                    style = MaterialTheme.typography.titleMedium,
                )
                val times = listOf(r.inTime, r.outTime).filter { it.isNotBlank() }.joinToString(" – ")
                if (times.isNotBlank() || r.requestedStatus.isNotBlank()) {
                    Text(
                        listOfNotNull(times.ifBlank { null }, r.requestedStatus.ifBlank { null }?.let { "as $it" }).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            StatusChip(r.status)
        }
        if (r.isFieldDay) {
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Chip("recorded by the app", MaterialTheme.colorScheme.primary)
                r.fieldSummary?.let {
                    Chip("${it.distanceKm} km")
                    Chip("${it.visits} visit${if (it.visits == 1) "" else "s"}")
                }
            }
        }
        if (r.reason.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(r.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (r.rejectionReason.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text("Reason: ${r.rejectionReason}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (onCancel != null && r.status == "pending") {
            TextButton(onClick = onCancel) { Text("Cancel request", color = MaterialTheme.colorScheme.error) }
        }
    }
}
