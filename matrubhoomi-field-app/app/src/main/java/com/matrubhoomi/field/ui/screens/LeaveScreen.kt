package com.matrubhoomi.field.ui.screens

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
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.width
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import com.matrubhoomi.field.core.rangeLabel
import com.matrubhoomi.field.core.trimNumber
import com.matrubhoomi.field.data.LeaveItem
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.data.leaveTypeName
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.Routes
import com.matrubhoomi.field.ui.components.BigButton
import com.matrubhoomi.field.ui.components.BigOutlinedButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.AppDialog
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.ConfirmDialog
import com.matrubhoomi.field.ui.components.LocalToast
import com.matrubhoomi.field.ui.components.RefreshableList
import com.matrubhoomi.field.ui.components.SuggestionRow
import com.matrubhoomi.field.ui.components.Tone
import com.matrubhoomi.field.ui.components.statusTone
import com.matrubhoomi.field.ui.components.DateField
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.MenuRow
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ReasonDialog
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.SegmentedTabs
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.rememberFetch
import com.matrubhoomi.field.ui.components.runAction
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Leave: what is left, what has been asked for, and asking for more.
 *
 * THE BALANCE SHOWN IS `effectiveAvailable`, NOT `available`
 * ----------------------------------------------------------
 * The difference is days already committed by applications that are filed but
 * not yet approved. Showing the other number lets somebody spend the same three
 * days twice and find out weeks later, when the second one is refused.
 *
 * The server is the authority on every rule — waiting periods, monthly caps,
 * whether privilege leave has been earned yet. This screen reimplements none of
 * them; it shows what comes back, including the refusals, in the server's own
 * words. A request goes to the ONE reporting manager, whose decision is final.
 */
@Composable
fun LeaveScreen(vm: AppViewModel, onOpen: (String) -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()
    val toast = LocalToast.current

    val book = rememberFetch("book") { repo.leaveBook() }
    val mine = rememberFetch("mine") { repo.myLeaves() }

    // The form
    var type by remember { mutableStateOf("CL") }
    var from by remember { mutableStateOf(LocalDate.now()) }
    var to by remember { mutableStateOf(LocalDate.now()) }
    var halfDay by remember { mutableStateOf(false) }
    var secondHalf by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var confirmLop by remember { mutableStateOf(false) }
    var quick by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var withdrawing by remember { mutableStateOf<LeaveItem?>(null) }
    var certificateFor by remember { mutableStateOf<LeaveItem?>(null) }
    var filter by remember { mutableIntStateOf(0) }

    val days = if (halfDay) 0.5 else (ChronoUnit.DAYS.between(from, to) + 1).coerceAtLeast(1).toDouble()
    val slWarning = type == "SL" && days > (book.data?.slDocumentThreshold ?: 2)

    fun reloadAll() {
        book.reload()
        mine.reload()
        vm.refreshBadges()
    }

    fun submit() {
        sending = true
        result = null
        scope.launch {
            val (ok, message) = runAction {
                repo.applyLeave(type, from.toString(), (if (halfDay) from else to).toString(), reason.trim(), halfDay, if (secondHalf) "second_half" else "first_half")
            }
            // Good news is a toast; a refusal stays in the form, next to what
            // can be changed — it is usually long, and about these very fields.
            result = if (ok) null else false to (message ?: "Not sent.")
            if (ok) {
                toast?.result(true, message, "Sent to your manager.", "")
                reason = ""
                reloadAll()
            }
            sending = false
        }
    }

    Scaffold(topBar = { ScreenBar("Leave", "Goes to your reporting manager") }) { padding ->
        RefreshableList(
            refreshing = (book.loading && book.data != null) || (mine.loading && mine.data != null),
            onRefresh = { reloadAll() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }

            if (book.problem != null && book.data == null) {
                item { Notice(title = "Could not load your leave", body = book.problem, severe = !book.offline) }
            }

            book.data?.let { b ->
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile(trimNumber(b.left("CL")), "casual left of ${trimNumber(b.total["CL"] ?: 0.0)}", modifier = Modifier.weight(1f))
                        StatTile(trimNumber(b.left("SL")), "sick left of ${trimNumber(b.total["SL"] ?: 0.0)}", tone = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f))
                        StatTile(
                            if (b.plEligible) trimNumber(b.left("PL")) else "—",
                            if (b.plEligible) "privilege left" else "privilege — not yet earned",
                            tone = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                val pending = b.pending.values.sum()
                if (pending > 0) {
                    item {
                        Text(
                            "${trimNumber(pending)} day${if (pending == 1.0) "" else "s"} held by requests still waiting — already taken off the figures above.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (!b.waitingComplete) {
                    item {
                        Notice(
                            title = "Paid leave starts after your waiting period",
                            body = "Until then, leave you ask for is unpaid. The server will say so if you try.",
                        )
                    }
                }
            }

            /* ── Quick leave ─────────────────────────────────── */

            item {
                Card {
                    SectionLabel("Need a day now?")
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Tell your manager in one tap — they decide whether it is casual, sick or unpaid.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BigOutlinedButton("Today", modifier = Modifier.weight(1f)) { quick = "today" to false }
                        BigOutlinedButton("Half day", modifier = Modifier.weight(1f)) { quick = "today" to true }
                        BigOutlinedButton("Tomorrow", modifier = Modifier.weight(1f)) { quick = "tomorrow" to false }
                    }
                }
            }

            /* ── Apply ───────────────────────────────────────── */

            item {
                Card {
                    SectionLabel("Apply for leave")
                    Spacer(Modifier.height(12.dp))

                    com.matrubhoomi.field.ui.components.ChipFlow {
                        val b = book.data
                        listOf("CL" to "Casual", "SL" to "Sick", "PL" to "Privilege", "LOP" to "Unpaid").forEach { (code, label) ->
                            FilterChip(
                                selected = type == code,
                                onClick = { type = code; result = null },
                                label = { Text(label) },
                                enabled = code != "PL" || (b?.plEligible ?: false),
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Half day", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        Switch(checked = halfDay, onCheckedChange = { halfDay = it; result = null })
                    }
                    if (halfDay) {
                        com.matrubhoomi.field.ui.components.ChipFlow {
                            FilterChip(selected = !secondHalf, onClick = { secondHalf = false }, label = { Text("First half") })
                            FilterChip(selected = secondHalf, onClick = { secondHalf = true }, label = { Text("Second half") })
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        DateField(
                            label = if (halfDay) "Date" else "From",
                            value = from,
                            onChange = { from = it; if (to.isBefore(it)) to = it; result = null },
                            modifier = Modifier.weight(1f),
                        )
                        if (!halfDay) {
                            DateField(
                                label = "To",
                                value = to,
                                onChange = { to = it; result = null },
                                earliest = from,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it; result = null },
                        label = { Text("Reason") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(Modifier.height(6.dp))
                    Text(
                        "${trimNumber(days)} day${if (days == 1.0) "" else "s"}, including any week off or holiday in between — the server works out what is actually paid.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (slWarning) {
                        Spacer(Modifier.height(8.dp))
                        Notice(
                            title = "A medical certificate will be needed",
                            body = "Sick leave longer than ${book.data?.slDocumentThreshold ?: 2} days needs one. HR will ask for it.",
                        )
                    }

                    result?.let { (ok, message) ->
                        Spacer(Modifier.height(10.dp))
                        Notice(title = if (ok) "Applied" else "Not applied", body = message, severe = !ok)
                    }

                    Spacer(Modifier.height(12.dp))
                    BigButton(
                        text = if (sending) "Sending…" else "Apply",
                        enabled = !sending && reason.isNotBlank(),
                    ) {
                        if (type == "LOP") confirmLop = true else submit()
                    }
                }
            }

            item {
                Card(Modifier.padding(0.dp)) {
                    MenuRow(Icons.Outlined.BeachAccess, "Holidays this year", "Company holidays, before you plan", onClick = { onOpen(Routes.HOLIDAYS) }, last = true)
                }
            }

            /* ── History ─────────────────────────────────────── */

            item {
                SectionLabel("Your applications", Modifier.padding(top = 6.dp))
                Spacer(Modifier.height(8.dp))
                SegmentedTabs(options = listOf("All", "Waiting", "Approved", "Other"), selectedIndex = filter, onSelect = { filter = it })
            }

            val list = mine.data.orEmpty().filter {
                when (filter) {
                    1 -> it.isOpen || it.status == "withdraw_pending"
                    2 -> it.isApproved
                    3 -> !it.isOpen && !it.isApproved && it.status != "withdraw_pending"
                    else -> true
                }
            }

            when {
                mine.loading && mine.data == null -> item { LoadingBlock() }
                list.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.EventAvailable,
                            title = "Nothing here",
                            body = "Applications you send appear here with whatever your manager decided.",
                        )
                    }
                }
                else -> items(list, key = { it.id }) { leave ->
                    LeaveCard(leave, onWithdraw = { withdrawing = leave }, onAttach = { certificateFor = leave })
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }

    if (confirmLop) {
        ConfirmDialog(
            title = "Apply for unpaid leave?",
            body = "Unpaid leave is deducted from your salary for these days.",
            confirmLabel = "Apply",
            onConfirm = { submit() },
            onDismiss = { confirmLop = false },
        )
    }

    quick?.let { (target, half) ->
        QuickLeaveDialog(
            initialTarget = target,
            initialHalf = half,
            onDismiss = { quick = null },
            send = { day, isHalf, slot, text -> runAction { repo.quickLeave(day, isHalf, slot, text) } },
            onSent = { message ->
                toast?.result(true, message, "Sent — your manager will decide the type.", "")
                reloadAll()
            },
        )
    }

    certificateFor?.let { leave ->
        CertificateDialog(
            leave = leave,
            onDismiss = { certificateFor = null },
            upload = { file, mime -> runAction { repo.uploadLeaveDocument(leave.id, file, mime) } },
            onUploaded = {
                toast?.show("Certificate attached — your manager can see it now.")
                reloadAll()
            },
        )
    }

    withdrawing?.let { leave ->
        ConfirmDialog(
            title = if (leave.isApproved) "Ask to withdraw this leave?" else "Cancel this request?",
            body = if (leave.isApproved)
                "It is already approved, so your manager has to agree. The days come back to your balance if they do."
            else "It has not been decided yet, so it is cancelled straight away.",
            confirmLabel = if (leave.isApproved) "Ask to withdraw" else "Cancel request",
            destructive = true,
            onConfirm = {
                scope.launch {
                    val (ok, message) = runAction { repo.cancelLeave(leave.id, "Withdrawn by the employee") }
                    toast?.result(ok, message, if (leave.isApproved) "Sent to your manager." else "Request cancelled.", "Could not withdraw it.")
                    reloadAll()
                }
            },
            onDismiss = { withdrawing = null },
        )
    }
}

@Composable
private fun LeaveCard(leave: LeaveItem, onWithdraw: () -> Unit, onAttach: () -> Unit) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                val days = leave.paidDays ?: leave.totalDays
                Text(
                    buildString {
                        append(if (leave.isQuick && leave.resolvedType.isNotBlank()) leaveTypeName(leave.resolvedType) else leaveTypeName(leave.leaveType))
                        append(" · ").append(trimNumber(leave.totalDays)).append(if (leave.totalDays == 1.0) " day" else " days")
                        if (leave.isHalfDay) append(" (half)")
                    },
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(rangeLabel(leave.fromDate, leave.toDate), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (leave.lwpDays > 0 && days < leave.totalDays) {
                    Text("${trimNumber(days)} paid · ${trimNumber(leave.lwpDays)} unpaid", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
            Chip(leave.statusText, statusTone(leave.status))
        }
        if (leave.reason.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(leave.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val decision = leave.decisions.lastOrNull()
        val note = when {
            leave.rejectionReason.isNotBlank() -> "Reason: ${leave.rejectionReason}"
            decision != null && decision.managerName.isNotBlank() ->
                "${if (decision.decision == "approved") "Approved" else "Refused"} by ${decision.managerName}" +
                    if (decision.remarks.isNotBlank()) " — ${decision.remarks}" else ""
            else -> ""
        }
        if (note.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(note, style = MaterialTheme.typography.bodySmall)
        }
        if (leave.needsCertificate) {
            Spacer(Modifier.height(8.dp))
            Notice(
                title = "Medical certificate needed",
                body = "Sick leave this long needs one. Attach a photo or a PDF of it.",
                actionLabel = "Attach certificate",
                onAction = onAttach,
            )
        } else if (leave.requiresDocument && leave.hasDocument) {
            Spacer(Modifier.height(4.dp))
            Text("Certificate attached", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
        if (leave.canWithdraw) {
            TextButton(onClick = onWithdraw) {
                Text(if (leave.isApproved) "Ask to withdraw" else "Cancel request", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

/**
 * "I need a day" in one screen: which day, how much of it, and why — with the
 * usual reasons a tap away. The type (casual, sick, unpaid) is the manager's
 * call, so it is not asked for here.
 */
@Composable
private fun QuickLeaveDialog(
    initialTarget: String,
    initialHalf: Boolean,
    onDismiss: () -> Unit,
    send: suspend (String, Boolean, String, String) -> Pair<Boolean, String?>,
    onSent: (String?) -> Unit,
) {
    var target by remember { mutableStateOf(initialTarget) }
    // 0 full day, 1 first half, 2 second half
    var length by remember { mutableIntStateOf(if (initialHalf) 1 else 0) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val day = if (target == "today") LocalDate.now() else LocalDate.now().plusDays(1)

    AppDialog(
        title = "Tell your manager",
        message = "They decide whether it counts as casual, sick or unpaid leave.",
        icon = Icons.Outlined.EventAvailable,
        tone = Tone.Positive,
        confirmLabel = "Send to manager",
        confirmEnabled = reason.isNotBlank(),
        busy = busy,
        error = error,
        onDismiss = onDismiss,
        onConfirm = {
            busy = true
            error = null
            scope.launch {
                val (ok, message) = send(target, length != 0, if (length == 2) "second_half" else "first_half", reason.trim())
                busy = false
                if (ok) { onSent(message); onDismiss() } else error = message ?: "Not sent."
            }
        },
    ) {
        SegmentedTabs(
            options = listOf("Today", "Tomorrow"),
            selectedIndex = if (target == "today") 0 else 1,
            onSelect = { target = if (it == 0) "today" else "tomorrow"; error = null },
        )
        Spacer(Modifier.height(10.dp))
        SegmentedTabs(
            options = listOf("Full day", "Morning", "Afternoon"),
            selectedIndex = length,
            onSelect = { length = it; error = null },
        )
        Spacer(Modifier.height(8.dp))
        Text(
            com.matrubhoomi.field.core.dayLabel(day.toString()) + when (length) { 1 -> " · first half"; 2 -> " · second half"; else -> "" },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(12.dp))
        SuggestionRow(listOf("Not feeling well", "Family emergency", "Doctor's appointment", "Personal work")) {
            reason = it
            error = null
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = reason,
            onValueChange = { reason = it; error = null },
            label = { Text("Reason") },
            minLines = 2,
            maxLines = 4,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Pick a photo or a PDF of the certificate and send it with the leave. */
@Composable
private fun CertificateDialog(
    leave: LeaveItem,
    onDismiss: () -> Unit,
    upload: suspend (java.io.File, String) -> Pair<Boolean, String?>,
    onUploaded: (String?) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var file by remember { mutableStateOf<java.io.File?>(null) }
    var mime by remember { mutableStateOf("image/jpeg") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val picker = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val type = context.contentResolver.getType(uri) ?: "image/jpeg"
        if (type != "application/pdf" && !type.startsWith("image/")) {
            error = "Choose a photo or a PDF."
            return@rememberLauncherForActivityResult
        }
        val ext = when (type) { "application/pdf" -> "pdf"; "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg" }
        val out = java.io.File(java.io.File(context.cacheDir, "proofs").apply { mkdirs() }, "certificate-${leave.id}.$ext")
        runCatching {
            context.contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } }
        }.onSuccess {
            if (out.length() > 10L * 1024 * 1024) { error = "That file is over 10 MB. Try a photo instead."; out.delete() }
            else { file = out; mime = if (type == "image/jpg") "image/jpeg" else type; error = null }
        }.onFailure { error = "Could not read that file." }
    }

    AppDialog(
        title = "Attach medical certificate",
        message = "For your sick leave, ${rangeLabel(leave.fromDate, leave.toDate)}. A clear photo is enough.",
        icon = Icons.Outlined.UploadFile,
        tone = Tone.Info,
        confirmLabel = if (file == null) "Choose file" else "Send certificate",
        busy = busy,
        error = error,
        onDismiss = { file?.delete(); onDismiss() },
        onConfirm = {
            val chosen = file
            if (chosen == null) {
                picker.launch(arrayOf("image/*", "application/pdf"))
            } else {
                busy = true
                scope.launch {
                    val (ok, message) = upload(chosen, mime)
                    busy = false
                    if (ok) { chosen.delete(); onUploaded(message); onDismiss() } else error = message ?: "Not sent."
                }
            }
        },
    ) {
        if (file != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.UploadFile, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (mime == "application/pdf") "PDF chosen" else "Photo chosen", style = MaterialTheme.typography.bodyLarge)
                    Text("${(file!!.length() / 1024).coerceAtLeast(1)} KB", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = { picker.launch(arrayOf("image/*", "application/pdf")) }) { Text("Change") }
            }
        }
    }
}
