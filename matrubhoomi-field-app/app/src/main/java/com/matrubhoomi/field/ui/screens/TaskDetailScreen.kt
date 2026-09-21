package com.matrubhoomi.field.ui.screens

import android.content.Intent
import android.net.Uri
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.FieldTask
import com.matrubhoomi.field.data.TaskTarget
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.KeyValue
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.Progress
import com.matrubhoomi.field.ui.components.SectionLabel

/**
 * One assignment, and what it is for.
 *
 * TWO SHAPES, ONE SCREEN — as on the server (SalesTask's header).
 *
 *   NEW CUSTOMER  "4 approved, 2 waiting, 4 more to bring in" and a button to
 *                 register the next one.
 *   FOLLOW-UP     one person, the scheme they are in, the step this visit is
 *                 for, and a button to record it. The employee chooses none of
 *                 those three; the task arrived already knowing them.
 *
 * WHAT "DONE" MEANS HERE
 * ----------------------
 * Approved by the desk. A visit the employee has recorded but the desk has not
 * yet accepted is shown as WAITING, with its own word and its own count, and is
 * never folded into the done figure — an employee told they had finished, who
 * then had two visits refused, has been lied to by their own phone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailScreen(
    vm: AppViewModel,
    taskId: String,
    onBack: () -> Unit,
    onRecordVisit: (taskId: String, leadId: String) -> Unit,
    onAddLead: (taskId: String) -> Unit,
) {
    val state by vm.state.collectAsState()
    val task = vm.task(taskId)
    val context = LocalContext.current

    // Telling the desk the employee has seen it, the first time it is opened.
    // Cheap, and it is the difference between "not started" and "no idea".
    LaunchedEffect(taskId) {
        if (task != null && task.status == "assigned") vm.acceptTask(task)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(task?.title ?: "Task", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        if (task == null) {
            Column(Modifier.padding(padding).padding(16.dp)) {
                Notice(
                    title = "This task is no longer on the phone",
                    body = "It may have been cancelled, or it belongs to a day that is no longer downloaded.",
                )
            }
            return@Scaffold
        }

        val template = vm.templateFor(task)

        LazyColumn(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(4.dp)) }

            /* ── The context ───────────────────────────────────── */

            item {
                if (task.isFollowUp) FollowUpHeader(task, vm.stageName(task))
                else QuotaHeader(task, vm.stageName(task))
            }

            item {
                if (task.instructions.isNotBlank() || task.assignedByName.isNotBlank()) {
                    Card {
                        if (task.instructions.isNotBlank()) {
                            SectionLabel("Instructions")
                            Spacer(Modifier.height(4.dp))
                            Text(task.instructions, style = MaterialTheme.typography.bodyMedium)
                        }
                        if (task.assignedByName.isNotBlank()) {
                            if (task.instructions.isNotBlank()) Spacer(Modifier.height(10.dp))
                            Text(
                                "Given by ${task.assignedByName}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            if (template == null) {
                item {
                    Notice(
                        title = "No form has been attached",
                        body = if (task.isQuota)
                            "There is no registration form on this phone. Refresh on the home screen when you " +
                                "have signal; if it is still missing, the sales desk has not configured one."
                        else
                            "This step has no form to fill, so nothing can be recorded against it. " +
                                "Tell the sales desk — they attach one from the scheme's builder.",
                        severe = true,
                    )
                }
            }

            /* ── Quota work ────────────────────────────────────── */

            if (task.isQuota) {
                item {
                    Card {
                        Text(
                            when {
                                task.remaining > 0 -> "${task.remaining} more to register"
                                task.pendingCount > 0 -> "All submitted — ${task.pendingCount} waiting for the desk"
                                else -> "Everything asked for has been approved"
                            },
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "Register each customer as you meet them. The form opens straight after, " +
                                "and the desk reviews what you send.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = { onAddLead(task.id) },
                            enabled = template != null,
                            modifier = Modifier.fillMaxWidth().height(50.dp),
                        ) {
                            Text("Register a customer")
                        }
                    }
                }
            }

            /* ── Named people ──────────────────────────────────── */

            if (task.targets.isNotEmpty()) {
                item {
                    SectionLabel(
                        when {
                            task.isQuota -> "Registered so far (${task.targets.size})"
                            task.isFollowUp -> "This visit"
                            else -> "To visit (${task.targets.count { it.isOpen }} left)"
                        },
                        Modifier.padding(top = 6.dp),
                    )
                }

                items(task.targets, key = { it.leadId }) { target ->
                    TargetRow(
                        target = target,
                        canRecord = template != null,
                        onCall = {
                            context.startActivity(
                                Intent(Intent.ACTION_DIAL, Uri.parse("tel:${target.phone}")),
                            )
                        },
                        onRecord = { onRecordVisit(task.id, target.leadId) },
                    )
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

/* ------------------------------------------------------------------ */

/** New customers: the target, and how much of it the desk has accepted. */
@Composable
private fun QuotaHeader(task: FieldTask, stageName: String) {
    Card {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("New customers", MaterialTheme.colorScheme.primary)
            if (task.requireOtp) Chip("OTP needed")
            if (task.requirePhoto) Chip("Photo needed")
        }
        Spacer(Modifier.height(12.dp))
        // The bar is APPROVED against the target. Waiting sits beside it.
        Progress(done = task.doneCount, total = task.targetCount)
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Figure(task.targetCount, "target")
            Figure(task.doneCount, "approved")
            Figure(task.pendingCount, "waiting")
            Figure(task.rejectedCount, "to redo")
            Figure(task.remaining, "remaining")
        }
    }
}

/** A follow-up: who, which scheme, which step. Said, not asked. */
@Composable
private fun FollowUpHeader(task: FieldTask, stageName: String) {
    val who = task.customer
    Card {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Follow-up")
            if (task.requireOtp) Chip("OTP needed")
            if (task.requirePhoto) Chip("Photo needed")
        }
        Spacer(Modifier.height(12.dp))
        if (who != null) {
            Text(who.name, style = MaterialTheme.typography.titleLarge)
            Text(
                listOfNotNull(who.village.ifBlank { null }, who.code.ifBlank { null }).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
        }
        KeyValue("Scheme", task.schemeName.ifBlank { "—" })
        KeyValue("This visit is for", stageName)
        KeyValue(
            "Form",
            task.templateName.ifBlank { "—" } + (task.templateVersion?.let { " · v$it" } ?: ""),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "The step is finished once the sales desk approves what you record — not when you press save.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Figure(value: Int, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$value", style = MaterialTheme.typography.titleMedium)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TargetRow(
    target: TaskTarget,
    canRecord: Boolean,
    onCall: () -> Unit,
    onRecord: () -> Unit,
) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(target.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    listOfNotNull(
                        target.phone.ifBlank { null },
                        target.village.ifBlank { null },
                        target.code.ifBlank { null },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (target.isDone) {
                Icon(Icons.Default.Check, contentDescription = "Approved", tint = MaterialTheme.colorScheme.primary)
            } else if (target.phone.isNotBlank()) {
                IconButton(onClick = onCall) {
                    Icon(Icons.Default.Call, contentDescription = "Call ${target.name}")
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        // The state, in a word. Colour never carries it alone.
        when {
            target.isDone -> Chip("approved", MaterialTheme.colorScheme.primary)
            target.isWaiting -> Chip("waiting for approval")
            target.isRework -> Chip("sent back", MaterialTheme.colorScheme.error)
            target.status == "rejected" -> Chip("not interested", MaterialTheme.colorScheme.error)
            target.status == "unreachable" -> Chip("unreachable")
            target.status == "rescheduled" -> Chip("rescheduled")
            else -> {}
        }

        if (target.isRework && target.rejectionNote.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Notice(title = "What to fix", body = target.rejectionNote, severe = true)
        }

        if (target.isOpen) {
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = onRecord,
                enabled = canRecord,
                modifier = Modifier.fillMaxWidth().height(46.dp),
            ) {
                Text(if (target.isRework) "Redo this visit" else "Record this visit")
            }
        }
    }
}
