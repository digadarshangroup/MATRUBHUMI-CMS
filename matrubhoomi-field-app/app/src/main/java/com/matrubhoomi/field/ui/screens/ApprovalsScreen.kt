package com.matrubhoomi.field.ui.screens

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import com.matrubhoomi.field.core.rangeLabel
import com.matrubhoomi.field.core.trimNumber
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.LeaveItem
import com.matrubhoomi.field.data.OvertimeReport
import com.matrubhoomi.field.data.Regularization
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.data.leaveTypeName
import com.matrubhoomi.field.data.regularizationTypeName
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Accent
import com.matrubhoomi.field.ui.components.AccentCard
import com.matrubhoomi.field.ui.components.Avatar
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ReasonDialog
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.SegmentedTabs
import com.matrubhoomi.field.ui.components.StatusChip
import com.matrubhoomi.field.ui.components.rememberFetch
import com.matrubhoomi.field.ui.components.runAction
import kotlinx.coroutines.launch

/**
 * Everything waiting on this person as somebody's reporting manager.
 *
 * ONE MANAGER, SO EVERY DECISION HERE IS FINAL
 * --------------------------------------------
 * There is no second approver after the reporting manager. Approving a leave
 * here deducts the balance and marks the muster roll; approving a field day
 * marks it present. The buttons say so, and a refusal always asks for the
 * reason the employee will read.
 *
 * Approving is one tap — the manager has the card in front of them. Refusing
 * takes a sentence, because "Not approved" with no reason is a conversation
 * the employee then has to start.
 */
@Composable
fun ApprovalsScreen(vm: AppViewModel) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()

    var tab by remember { mutableIntStateOf(0) }
    val leaves = rememberFetch("leaves") { repo.teamLeaves() }
    val withdrawals = rememberFetch("withdrawals") { repo.teamWithdrawals() }
    val corrections = rememberFetch("corrections") { repo.teamRegularizations() }
    val overtime = rememberFetch("overtime") { repo.teamOvertime() }

    var busy by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var refusing by remember { mutableStateOf<Refusal?>(null) }
    var unpaid by remember { mutableStateOf<LeaveItem?>(null) }

    /** Run one decision, say what happened, and refresh that queue and the badges. */
    val toast = com.matrubhoomi.field.ui.components.LocalToast.current
    fun decide(id: String, done: String, reload: () -> Unit, block: suspend () -> ApiResult<Any?>) {
        busy = id
        result = null
        scope.launch {
            val (ok, message) = runAction { block() }
            // Our own words on success — the server's are written for the web
            // desk. Its words on a refusal, which say what rule stopped it.
            // A toast, not a line at the top: the card decided may be far down.
            toast?.result(ok, if (ok) done else message, done, "That did not go through.")
            busy = null
            reload()
            vm.refreshBadges()
        }
    }

    val leaveCount = leaves.data.orEmpty().size + withdrawals.data.orEmpty().size
    val correctionCount = corrections.data.orEmpty().size
    val overtimeCount = overtime.data.orEmpty().size

    Scaffold(topBar = { ScreenBar("Approvals", "Your decision is final") }) { padding ->
        com.matrubhoomi.field.ui.components.RefreshableList(
            refreshing = (leaves.loading && leaves.data != null) || (withdrawals.loading && withdrawals.data != null) || (corrections.loading && corrections.data != null) || (overtime.loading && overtime.data != null),
            onRefresh = { leaves.reload(); withdrawals.reload(); corrections.reload(); overtime.reload() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                SegmentedTabs(
                    options = listOf(
                        "Leave" + if (leaveCount > 0) " ($leaveCount)" else "",
                        "Attendance" + if (correctionCount > 0) " ($correctionCount)" else "",
                        "Overtime" + if (overtimeCount > 0) " ($overtimeCount)" else "",
                    ),
                    selectedIndex = tab,
                    onSelect = { tab = it; result = null },
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            result?.let { (ok, text) -> item { Notice(title = if (ok) "Done" else "Not done", body = text, severe = !ok) } }

            when (tab) {
                0 -> leaveTab(
                    leaves = leaves.data,
                    withdrawals = withdrawals.data.orEmpty(),
                    loading = leaves.loading,
                    problem = leaves.problem,
                    offline = leaves.offline,
                    busy = busy,
                    onApprove = { l -> decide(l.id, "Approved. ${l.employeeName} has been told.", { leaves.reload() }) { repo.approveLeave(l.id, "") } },
                    onClassify = { l, type ->
                        if (type == "LOP") unpaid = l
                        else decide(l.id, "Approved as ${leaveTypeName(type).lowercase()}.", { leaves.reload() }) { repo.classifyQuickLeave(l.id, type, null) }
                    },
                    onRefuse = { l -> refusing = Refusal.Leave(l) },
                    onAllowWithdraw = { l ->
                        decide(l.id, "Withdrawal approved — the days are back in ${l.employeeName}'s balance.", { withdrawals.reload() }) { repo.approveWithdrawal(l.id) }
                    },
                    onKeep = { l -> refusing = Refusal.Withdrawal(l) },
                )
                1 -> correctionTab(
                    rows = corrections.data,
                    loading = corrections.loading,
                    problem = corrections.problem,
                    offline = corrections.offline,
                    busy = busy,
                    onApprove = { r ->
                        decide(r.id, if (r.isFieldDay) "Field day confirmed — the duty times are now on the attendance record." else "Correction approved.", { corrections.reload() }) {
                            repo.approveRegularization(r.id, "")
                        }
                    },
                    onRefuse = { r -> refusing = Refusal.Correction(r) },
                )
                else -> overtimeTab(
                    rows = overtime.data,
                    loading = overtime.loading,
                    problem = overtime.problem,
                    offline = overtime.offline,
                    busy = busy,
                    onApprove = { o ->
                        decide(o.id, "Approved — ${o.graceMinutes} min grace applied to the next day.", { overtime.reload() }) { repo.approveOvertime(o.id, "") }
                    },
                    onRefuse = { o -> refusing = Refusal.Overtime(o) },
                    onProof = { url ->
                        try {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        } catch (e: ActivityNotFoundException) {
                            result = false to "This phone has nothing that can open the photo."
                        }
                    },
                )
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }

    refusing?.let { r ->
        ReasonDialog(
            title = r.title,
            hint = r.hint,
            confirmLabel = r.confirm,
            required = true,
            // A refusal is the one decision here with a consequence for
            // somebody else, so it looks like one — and says who reads it.
            tone = if (r is Refusal.Withdrawal) com.matrubhoomi.field.ui.components.Tone.Warning else com.matrubhoomi.field.ui.components.Tone.Danger,
            message = "They will see your reason in the app, with your name.",
            suggestions = r.suggestions,
            onConfirm = { reason ->
                when (r) {
                    is Refusal.Leave -> decide(r.item.id, "Not approved. ${r.item.employeeName} has been told why.", { leaves.reload() }) { repo.rejectLeave(r.item.id, reason) }
                    is Refusal.Withdrawal -> decide(r.item.id, "The leave stands. ${r.item.employeeName} has been told why.", { withdrawals.reload() }) { repo.rejectWithdrawal(r.item.id, reason) }
                    is Refusal.Correction -> decide(r.item.id, "Not approved. ${r.item.employeeName} has been told why.", { corrections.reload() }) { repo.rejectRegularization(r.item.id, reason) }
                    is Refusal.Overtime -> decide(r.item.id, "Not approved. ${r.item.employeeName} has been told why.", { overtime.reload() }) { repo.rejectOvertime(r.item.id, reason) }
                }
            },
            onDismiss = { refusing = null },
        )
    }

    unpaid?.let { l ->
        ReasonDialog(
            title = "Approve as unpaid?",
            hint = "Why unpaid — ${l.employeeName} will read this",
            confirmLabel = "Approve unpaid",
            required = true,
            tone = com.matrubhoomi.field.ui.components.Tone.Warning,
            message = "Paid leave is still available, so say why this day is unpaid.",
            suggestions = listOf("Did not inform in time", "Already took leave this week", "Asked for it unpaid"),
            onConfirm = { reason ->
                decide(l.id, "Approved as unpaid leave.", { leaves.reload() }) { repo.classifyQuickLeave(l.id, "LOP", reason) }
            },
            onDismiss = { unpaid = null },
        )
    }
}

/** What a refusal is of — each asks for its reason in its own words. */
private sealed class Refusal(val title: String, val hint: String, val confirm: String, val suggestions: List<String> = emptyList()) {
    class Leave(val item: LeaveItem) : Refusal(
        "Refuse this leave?", "Reason — ${item.employeeName} will read this", "Refuse",
        listOf("The team is short that week", "Too close to month-end", "Please apply for fewer days", "Let's talk first"),
    )
    class Withdrawal(val item: LeaveItem) : Refusal("Keep the leave as approved?", "Why it cannot be withdrawn", "Keep leave")
    class Correction(val item: Regularization) : Refusal(
        if (item.isFieldDay) "Do not confirm this field day?" else "Refuse this correction?",
        "Reason — ${item.employeeName} will read this",
        "Refuse",
        listOf("The machine shows a different time", "Please speak to me first", "Not a working day for you"),
    )
    class Overtime(val item: OvertimeReport) : Refusal(
        "Refuse this overtime?", "Reason — ${item.employeeName} will read this", "Refuse",
        listOf("Not asked to stay back", "Work could have waited", "Please speak to me first"),
    )
}

/* ── Leave ──────────────────────────────────────────────────────────── */

private fun LazyListScope.leaveTab(
    leaves: List<LeaveItem>?,
    withdrawals: List<LeaveItem>,
    loading: Boolean,
    problem: String?,
    offline: Boolean,
    busy: String?,
    onApprove: (LeaveItem) -> Unit,
    onClassify: (LeaveItem, String) -> Unit,
    onRefuse: (LeaveItem) -> Unit,
    onAllowWithdraw: (LeaveItem) -> Unit,
    onKeep: (LeaveItem) -> Unit,
) {
    when {
        loading && leaves == null -> item { LoadingBlock() }
        problem != null && leaves == null -> item { Notice(title = "Could not load leave requests", body = problem, severe = !offline) }
        leaves.isNullOrEmpty() && withdrawals.isEmpty() -> item { NoneWaiting("No leave waiting", "Leave your team applies for appears here for you to approve.") }
        else -> {
            if (!leaves.isNullOrEmpty()) {
                item { SectionLabel("Asking for leave") }
                items(leaves, key = { it.id }) { l ->
                    val quick = l.isQuick && l.leaveType == "QUICK" && l.status == "pending"
                    AccentCard(tone = if (quick) Accent.Brick else MaterialTheme.colorScheme.primary) {
                        Who(l.employeeName, l.department)
                        Text(
                            buildString {
                                append(if (quick) "Quick leave" else leaveTypeName(l.leaveType))
                                append(" · ").append(trimNumber(l.totalDays)).append(if (l.totalDays == 1.0) " day" else " days")
                                if (l.isHalfDay) append(if (l.halfDaySlot == "second_half") " (afternoon)" else " (morning)")
                            },
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(rangeLabel(l.fromDate, l.toDate), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (l.reason.isNotBlank()) {
                            Spacer(Modifier.height(6.dp))
                            Text("“${l.reason}”", style = MaterialTheme.typography.bodyMedium)
                        }
                        // The certificate a long sick leave asked for — seen
                        // BEFORE deciding, not taken on trust.
                        if (l.requiresDocument) {
                            val context = androidx.compose.ui.platform.LocalContext.current
                            Spacer(Modifier.height(6.dp))
                            if (l.documentUrl.isNotBlank()) {
                                androidx.compose.material3.TextButton(
                                    onClick = {
                                        runCatching {
                                            context.startActivity(
                                                android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(l.documentUrl))
                                                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK),
                                            )
                                        }
                                    },
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                                ) { Text("View medical certificate") }
                            } else {
                                Text("No medical certificate attached yet", style = MaterialTheme.typography.bodySmall, color = Accent.Brick)
                            }
                        }
                        if (l.status == "manager_approved") {
                            Spacer(Modifier.height(6.dp))
                            Chip("approved earlier by ${l.decisions.firstOrNull()?.managerName?.ifBlank { null } ?: "another manager"}")
                        }
                        Spacer(Modifier.height(10.dp))
                        if (quick) {
                            Text(
                                "Asked for at short notice — choose how it is counted.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(6.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("CL" to "Casual", "SL" to "Sick", "LOP" to "Unpaid").forEach { (code, label) ->
                                    OutlinedButton(
                                        onClick = { onClassify(l, code) },
                                        enabled = busy == null,
                                        modifier = Modifier.weight(1f),
                                    ) { Text(label, maxLines = 1) }
                                }
                            }
                            TextButton(onClick = { onRefuse(l) }, enabled = busy == null) {
                                Text("Refuse", color = MaterialTheme.colorScheme.error)
                            }
                        } else {
                            Decide(busy == l.id, busy == null, "Approve", onApprove = { onApprove(l) }, onRefuse = { onRefuse(l) })
                        }
                    }
                }
            }
            if (withdrawals.isNotEmpty()) {
                item { SectionLabel("Asking to withdraw approved leave", Modifier.padding(top = 6.dp)) }
                items(withdrawals, key = { "w" + it.id }) { l ->
                    AccentCard(tone = Accent.Harvest) {
                        Who(l.employeeName, l.department)
                        Text(
                            "${leaveTypeName(l.leaveType)} · ${rangeLabel(l.fromDate, l.toDate)}",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        if (l.cancelReason.isNotBlank()) {
                            Spacer(Modifier.height(6.dp))
                            Text("“${l.cancelReason}”", style = MaterialTheme.typography.bodyMedium)
                        }
                        Spacer(Modifier.height(10.dp))
                        Decide(busy == l.id, busy == null, "Allow", refuseLabel = "Keep leave", onApprove = { onAllowWithdraw(l) }, onRefuse = { onKeep(l) })
                    }
                }
            }
        }
    }
}

/* ── Attendance corrections, and field days ─────────────────────────── */

private fun LazyListScope.correctionTab(
    rows: List<Regularization>?,
    loading: Boolean,
    problem: String?,
    offline: Boolean,
    busy: String?,
    onApprove: (Regularization) -> Unit,
    onRefuse: (Regularization) -> Unit,
) {
    when {
        loading && rows == null -> item { LoadingBlock() }
        problem != null && rows == null -> item { Notice(title = "Could not load corrections", body = problem, severe = !offline) }
        rows.isNullOrEmpty() -> item {
            NoneWaiting("Nothing to confirm", "Field days recorded by the app and corrections your team asks for appear here.")
        }
        else -> {
            val (field, other) = rows.partition { it.isFieldDay }
            if (field.isNotEmpty()) {
                item { SectionLabel("Field days to confirm") }
                items(field, key = { it.id }) { r ->
                    AccentCard(tone = MaterialTheme.colorScheme.primary) {
                        Who(r.employeeName, "")
                        Text("${dayLabel(r.dateStr)} · on duty ${r.inTime} – ${r.outTime}", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Chip("recorded by the app", MaterialTheme.colorScheme.primary)
                            r.fieldSummary?.let {
                                Chip("${trimNumber(it.distanceKm)} km")
                                Chip("${it.visits} visit${if (it.visits == 1) "" else "s"}")
                                if (it.stops > 0) Chip("${it.stops} stop${if (it.stops == 1) "" else "s"}")
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Decide(busy == r.id, busy == null, "Confirm", onApprove = { onApprove(r) }, onRefuse = { onRefuse(r) })
                    }
                }
            }
            if (other.isNotEmpty()) {
                item { SectionLabel("Corrections", Modifier.padding(top = if (field.isEmpty()) 0.dp else 6.dp)) }
                items(other, key = { it.id }) { r ->
                    AccentCard(tone = Accent.Water) {
                        Who(r.employeeName, "")
                        Text("${dayLabel(r.dateStr)} · ${regularizationTypeName(r.type)}", style = MaterialTheme.typography.titleMedium)
                        val times = listOf(r.inTime, r.outTime).filter { it.isNotBlank() }.joinToString(" – ")
                        val asked = listOfNotNull(
                            times.ifBlank { null },
                            r.requestedStatus.ifBlank { null }?.let { "as $it" },
                        ).joinToString(" · ")
                        if (asked.isNotBlank()) {
                            Text(asked, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (r.reason.isNotBlank()) {
                            Spacer(Modifier.height(6.dp))
                            Text("“${r.reason}”", style = MaterialTheme.typography.bodyMedium)
                        }
                        if (r.status == "manager_approved") {
                            Spacer(Modifier.height(6.dp))
                            StatusChip(r.status)
                        }
                        Spacer(Modifier.height(10.dp))
                        Decide(busy == r.id, busy == null, "Approve", onApprove = { onApprove(r) }, onRefuse = { onRefuse(r) })
                    }
                }
            }
        }
    }
}

/* ── Overtime ───────────────────────────────────────────────────────── */

private fun LazyListScope.overtimeTab(
    rows: List<OvertimeReport>?,
    loading: Boolean,
    problem: String?,
    offline: Boolean,
    busy: String?,
    onApprove: (OvertimeReport) -> Unit,
    onRefuse: (OvertimeReport) -> Unit,
    onProof: (String) -> Unit,
) {
    when {
        loading && rows == null -> item { LoadingBlock() }
        problem != null && rows == null -> item { Notice(title = "Could not load overtime", body = problem, severe = !offline) }
        rows.isNullOrEmpty() -> item { NoneWaiting("No overtime waiting", "Late stays your team reports appear here. Approving gives them grace the next morning.") }
        else -> items(rows, key = { it.id }) { o ->
            AccentCard(tone = Accent.Harvest) {
                Who(o.employeeName, o.department)
                Text("${dayLabel(o.dateStr)} · stayed until ${o.actualOut}", style = MaterialTheme.typography.titleMedium)
                Text(
                    "${formatMinutes(o.stayOverMins)} past closing · ${o.graceMinutes} min grace next day if approved",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (o.description.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text("“${o.description}”", style = MaterialTheme.typography.bodyMedium)
                }
                if (o.hasProof) {
                    TextButton(onClick = { onProof(o.proofUrl) }) {
                        Icon(Icons.Outlined.Image, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("See the photo")
                    }
                }
                Spacer(Modifier.height(6.dp))
                Decide(busy == o.id, busy == null, "Approve", onApprove = { onApprove(o) }, onRefuse = { onRefuse(o) })
            }
        }
    }
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

@Composable
private fun ColumnScope.Who(name: String, department: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
        Avatar(name.ifBlank { "?" }, size = 30.dp)
        Spacer(Modifier.width(10.dp))
        Column {
            Text(name.ifBlank { "Team member" }, style = MaterialTheme.typography.labelLarge)
            if (department.isNotBlank()) {
                Text(department, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Decide(
    working: Boolean,
    enabled: Boolean,
    approveLabel: String,
    refuseLabel: String = "Refuse",
    onApprove: () -> Unit,
    onRefuse: () -> Unit,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedButton(
            onClick = onRefuse,
            enabled = enabled,
            modifier = Modifier.weight(1f),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) { Text(refuseLabel) }
        Button(onClick = onApprove, enabled = enabled, modifier = Modifier.weight(1f)) {
            Text(if (working) "Saving…" else approveLabel, maxLines = 1)
        }
    }
}

@Composable
private fun NoneWaiting(title: String, body: String) {
    Card { EmptyState(icon = Icons.AutoMirrored.Outlined.FactCheck, title = title, body = body) }
}
