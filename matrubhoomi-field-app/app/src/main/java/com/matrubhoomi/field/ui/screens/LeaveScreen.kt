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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.matrubhoomi.field.data.LeaveApplication
import com.matrubhoomi.field.data.LeaveBalance
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.components.BigButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.StatTile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Calendar

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
 * whether privilege leave has been earned yet. This screen does not reimplement
 * any of them; it shows what comes back, including the refusals, in the server's
 * own words.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeaveScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()

    var balance by remember { mutableStateOf(LeaveBalance.EMPTY) }
    var applications by remember { mutableStateOf<List<LeaveApplication>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }

    // The form
    var type by remember { mutableStateOf("CL") }
    var from by remember { mutableStateOf(today()) }
    var to by remember { mutableStateOf(today()) }
    var reason by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    var succeeded by remember { mutableStateOf(false) }

    LaunchedEffect(reloadKey) {
        loading = true
        problem = null
        val b = withContext(Dispatchers.IO) { repo.leaveBalance() }
        when (b) {
            is ApiResult.Ok -> balance = b.value
            is ApiResult.Offline -> problem = "Leave lives on the server — this needs a connection."
            is ApiResult.Unauthorised -> problem = "Your session has ended. Sign in again."
            is ApiResult.Failed -> problem = b.message
        }
        val a = withContext(Dispatchers.IO) { repo.leaveApplications() }
        if (a is ApiResult.Ok) applications = a.value
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Leave", style = MaterialTheme.typography.titleLarge) },
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
        LazyColumn(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }

            if (problem != null) {
                item { Notice(title = "Could not load leave", body = problem!!, severe = true) }
            }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(value = trim(balance.casualLeft), label = "casual left", modifier = Modifier.weight(1f))
                    StatTile(
                        value = trim(balance.sickLeft),
                        label = "sick left",
                        tone = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.weight(1f),
                    )
                    StatTile(
                        value = if (balance.plEligible) trim(balance.privilegeLeft) else "—",
                        label = "privilege",
                        tone = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            /* ── Apply ─────────────────────────────────────────── */

            item {
                Card {
                    SectionLabel("Apply for leave")
                    Spacer(Modifier.height(12.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("CL" to "Casual", "SL" to "Sick", "PL" to "Privilege", "LOP" to "Unpaid")
                            .forEach { (code, label) ->
                                FilterChip(
                                    selected = type == code,
                                    onClick = { type = code; result = null },
                                    label = { Text(label) },
                                    enabled = code != "PL" || balance.plEligible,
                                )
                            }
                    }

                    Spacer(Modifier.height(12.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = from,
                            onValueChange = { from = it; if (to < it) to = it },
                            label = { Text("From") },
                            placeholder = { Text("YYYY-MM-DD") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = to,
                            onValueChange = { to = it },
                            label = { Text("To") },
                            placeholder = { Text("YYYY-MM-DD") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Spacer(Modifier.height(10.dp))

                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it; result = null },
                        label = { Text("Reason") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    if (result != null) {
                        Spacer(Modifier.height(10.dp))
                        Notice(
                            title = if (succeeded) "Applied" else "Not applied",
                            body = result!!,
                            severe = !succeeded,
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    BigButton(
                        text = if (sending) "Sending…" else "Apply",
                        enabled = !sending && reason.isNotBlank() && from.length == 10 && to.length == 10,
                    ) {
                        sending = true
                        result = null
                        scope.launch {
                            when (val r = withContext(Dispatchers.IO) {
                                repo.applyLeave(type, from, to, reason.trim(), false)
                            }) {
                                is ApiResult.Ok -> {
                                    succeeded = true
                                    result = "Your application has gone to your manager."
                                    reason = ""
                                    reloadKey++
                                }
                                is ApiResult.Offline -> {
                                    succeeded = false
                                    // Deliberately NOT queued offline. A leave
                                    // application has approval rules, balances
                                    // and monthly caps that only the server can
                                    // check — queuing one would tell somebody
                                    // they had booked a day the server was
                                    // always going to refuse.
                                    result = "No connection. Applying needs one, because the balance and the rules are checked on the server."
                                }
                                is ApiResult.Unauthorised -> {
                                    succeeded = false
                                    result = "Your session has ended. Sign in again."
                                }
                                is ApiResult.Failed -> {
                                    succeeded = false
                                    result = r.message
                                }
                            }
                            sending = false
                        }
                    }
                }
            }

            /* ── History ───────────────────────────────────────── */

            item { SectionLabel("Your applications", Modifier.padding(top = 6.dp)) }

            when {
                loading -> item {
                    Row(Modifier.fillMaxWidth().padding(top = 20.dp), horizontalArrangement = Arrangement.Center) {
                        CircularProgressIndicator(Modifier.height(24.dp), strokeWidth = 2.dp)
                    }
                }

                applications.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.EventAvailable,
                            title = "Nothing applied for",
                            body = "Applications you send appear here with whatever your manager decided.",
                        )
                    }
                }

                else -> items(applications, key = { it.id }) { application ->
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    "${typeName(application.leaveType)} · ${trim(application.days)} day${if (application.days == 1.0) "" else "s"}",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    if (application.fromDate == application.toDate) application.fromDate
                                    else "${application.fromDate} to ${application.toDate}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Chip(
                                application.status,
                                when (application.status.lowercase()) {
                                    "approved" -> MaterialTheme.colorScheme.primary
                                    "rejected", "cancelled" -> MaterialTheme.colorScheme.error
                                    else -> MaterialTheme.colorScheme.secondary
                                },
                            )
                        }
                        if (application.reason.isNotBlank()) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                application.reason,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

private fun today(): String {
    val c = Calendar.getInstance()
    return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
}

private fun typeName(code: String) = when (code) {
    "CL" -> "Casual leave"
    "SL" -> "Sick leave"
    "PL" -> "Privilege leave"
    "LOP" -> "Unpaid leave"
    else -> code
}

private fun trim(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString() else "%.1f".format(value)
