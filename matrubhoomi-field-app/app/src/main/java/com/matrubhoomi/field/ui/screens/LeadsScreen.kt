package com.matrubhoomi.field.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.LeadSummary
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.SkeletonRows
import com.matrubhoomi.field.ui.components.Avatar
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.Notice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * The book, searchable, for the moment somebody is standing in front of you.
 *
 * "Everybody's" is offered on purpose. The field team covers for each other,
 * and a farmer who walks up to whoever is nearest must be findable by whoever
 * is nearest — a book that only shows your own fails at the one moment it is
 * needed.
 *
 * This screen is ONLINE-ONLY and says so rather than showing an empty list: the
 * leads a phone happens to have cached are a subset nobody can reason about,
 * and "no results" would read as "not in the book".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadsScreen(vm: AppViewModel, onOpenLead: (String) -> Unit) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }

    var query by remember { mutableStateOf("") }
    var scope by remember { mutableStateOf(Scope.Mine) }
    var leads by remember { mutableStateOf<List<LeadSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf<String?>(null) }
    // Kept apart from the message so the heading cannot contradict it — the
    // screen said "needs a connection" over a message about a missing employee
    // record, which sends somebody to check their wifi over an HR problem.
    var problemIsOffline by remember { mutableStateOf(false) }

    LaunchedEffect(query, scope) {
        loading = true
        problem = null
        // Debounced: one request per keystroke is ten requests for one name,
        // and on a weak link that is ten chances to stall the keyboard.
        delay(350)
        when (val result = withContext(Dispatchers.IO) { repo.leads(query.trim(), scope != Scope.Everyone) }) {
            is ApiResult.Ok -> leads = if (scope == Scope.Customers) result.value.filter { it.isCustomer } else result.value
            is ApiResult.Offline -> {
                problemIsOffline = true
                problem = "Searching the book needs a connection. Your assigned visits are on Today and work without one."
            }
            is ApiResult.Unauthorised -> {
                problemIsOffline = false
                problem = "Your session has ended. Open More and sign in again."
            }
            is ApiResult.Failed -> {
                problemIsOffline = false
                problem = result.message
            }
        }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Leads", style = MaterialTheme.typography.titleLarge)
                        if (!loading && problem == null) {
                            Text(
                                "${leads.size} ${if (leads.size == 1) "person" else "people"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
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
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Name or phone number") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            )

            Spacer(Modifier.height(10.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Scope.entries.forEach { option ->
                    FilterChip(
                        selected = scope == option,
                        onClick = { scope = option },
                        label = { Text(option.label) },
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            when {
                // Skeleton rows rather than a spinner. A spinner says "wait";
                // these say "a list of people is coming", which on a handset
                // with one bar is the difference between waiting and deciding
                // the screen is broken.
                loading -> Card { SkeletonRows(rows = 5) }

                problem != null -> Notice(
                    title = if (problemIsOffline) "The book needs a connection" else "Could not load the book",
                    body = problem!!,
                    severe = !problemIsOffline,
                )

                leads.isEmpty() -> Card {
                    EmptyState(
                        icon = Icons.Outlined.Groups,
                        title = if (query.isBlank()) "Nothing here yet" else "No match for \"$query\"",
                        body = if (query.isBlank())
                            "Leads you add and farmers assigned to you appear here."
                        else
                            "Try part of the phone number, or switch to Everybody's.",
                    )
                }

                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(leads, key = { it.id }) { lead ->
                        LeadRow(
                            lead = lead,
                            stageName = vm.stageName(lead.stageKey),
                            onOpen = { onOpenLead(lead.id) },
                            onCall = {
                                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${lead.phone}")))
                            },
                        )
                    }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}

private enum class Scope(val label: String) {
    Mine("Mine"),
    Everyone("Everybody's"),
    Customers("Customers"),
}

@Composable
private fun LeadRow(lead: LeadSummary, stageName: String, onOpen: () -> Unit, onCall: () -> Unit) {
    Card(Modifier.clip(RoundedCornerShape(16.dp)).clickable(onClick = onOpen)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // THE AVATAR IS NOT DECORATION. This list is twenty lines of
            // similar-looking Marathi names; a stable colour and two initials
            // are what let somebody find the farmer they saw yesterday without
            // reading all twenty. The colour is derived from the name, so it is
            // the same on every screen and after a reinstall.
            Avatar(lead.name, size = 42.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(lead.name, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(2.dp))
                Text(
                    listOfNotNull(
                        lead.phone.ifBlank { null },
                        lead.village.ifBlank { null },
                        lead.code.ifBlank { null },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (lead.phone.isNotBlank()) {
                // A filled tonal button, not a bare icon: on this screen the
                // phone is the action, and it should be findable with a thumb
                // while walking.
                FilledTonalIconButton(onClick = onCall, modifier = Modifier.size(44.dp)) {
                    Icon(Icons.Outlined.Call, contentDescription = "Call ${lead.name}")
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chip(
                stageName,
                if (lead.isCustomer) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (lead.isCustomer) Chip("customer", MaterialTheme.colorScheme.primary)
            if (lead.status == "lost") Chip("lost", MaterialTheme.colorScheme.error)
        }
    }
}
