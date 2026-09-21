package com.matrubhoomi.field.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Navigation
import androidx.compose.material.icons.outlined.Verified
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.LeadDetail
import com.matrubhoomi.field.data.PastVisit
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.BigButton
import com.matrubhoomi.field.ui.components.BigOutlinedButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.TimelineRow
import com.matrubhoomi.field.ui.components.Avatar
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.KeyValue
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.SectionLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Everything known about one farmer, for the two minutes before knocking.
 *
 * WHAT AN EMPLOYEE ACTUALLY NEEDS HERE
 * ------------------------------------
 * Not a CRM record. Three things: how to reach them, how to get there, and what
 * happened last time — because arriving without knowing what was already agreed
 * is how a farmer is asked the same twelve questions twice and stops answering.
 *
 * So the phone and directions are the top of the screen, and the last visit —
 * with the answers and the photographs from it — comes before anything
 * administrative.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadDetailScreen(
    vm: AppViewModel,
    leadId: String,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }

    var lead by remember { mutableStateOf<LeadDetail?>(null) }
    var loading by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(leadId) {
        loading = true
        problem = null
        when (val result = withContext(Dispatchers.IO) { repo.leadDetail(leadId) }) {
            is ApiResult.Ok -> {
                lead = result.value
                if (result.value == null) problem = "This lead could not be read."
            }
            is ApiResult.Offline -> problem = "A lead's history lives on the server — this needs a connection."
            is ApiResult.Unauthorised -> problem = "Your session expired. Sign in again."
            is ApiResult.Failed -> problem = result.message
        }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(lead?.name ?: "Lead", maxLines = 1, style = MaterialTheme.typography.titleLarge)
                        lead?.let {
                            Text(
                                listOfNotNull(it.code.ifBlank { null }, it.village.ifBlank { null }).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
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
        when {
            loading -> Row(
                Modifier.fillMaxSize().padding(padding),
                horizontalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(Modifier.padding(top = 48.dp).height(26.dp), strokeWidth = 2.dp)
            }

            problem != null -> Column(Modifier.padding(padding).padding(16.dp)) {
                Notice(title = "Could not open this lead", body = problem!!, severe = true)
            }

            lead != null -> LeadBody(lead!!, vm, padding) { action ->
                when (action) {
                    is Action.Call -> context.startActivity(
                        Intent(Intent.ACTION_DIAL, Uri.parse("tel:${action.phone}")),
                    )
                    is Action.Navigate -> context.startActivity(
                        // The `q=` form rather than a turn-by-turn intent: it
                        // opens whatever map app the handset actually has, and
                        // a field phone often has no Google Maps at all.
                        Intent(Intent.ACTION_VIEW, Uri.parse("geo:${action.lat},${action.lng}?q=${action.lat},${action.lng}(${Uri.encode(action.label)})")),
                    )
                }
            }
        }
    }
}

private sealed interface Action {
    data class Call(val phone: String) : Action
    data class Navigate(val lat: Double, val lng: Double, val label: String) : Action
}

@Composable
private fun LeadBody(
    lead: LeadDetail,
    vm: AppViewModel,
    padding: androidx.compose.foundation.layout.PaddingValues,
    onAction: (Action) -> Unit,
) {
    LazyColumn(
        Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Spacer(Modifier.height(2.dp)) }

        /* ── Who, and where they stand ─────────────────────────── */

        item {
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // The same mark as in the list, so arriving here confirms
                    // you opened the person you meant to.
                    Avatar(lead.name, size = 52.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(lead.name, style = MaterialTheme.typography.titleLarge)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            lead.phone,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (lead.phoneVerified) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Outlined.Verified,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                "verified",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Chip(vm.stageName(lead.stageKey), MaterialTheme.colorScheme.primary)
                    if (lead.isCustomer) Chip("customer", MaterialTheme.colorScheme.primary)
                    if (lead.status == "lost") Chip("lost", MaterialTheme.colorScheme.error)
                    if (lead.visitCount > 0) Chip("${lead.visitCount} visit${if (lead.visitCount == 1) "" else "s"}")
                }

                Spacer(Modifier.height(14.dp))

                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BigButton(
                        text = "Call",
                        icon = Icons.Outlined.Call,
                        modifier = Modifier.weight(1f),
                        enabled = lead.phone.isNotBlank(),
                    ) { onAction(Action.Call(lead.phone)) }

                    if (lead.lat != null && lead.lng != null) {
                        BigOutlinedButton(
                            text = "Directions",
                            icon = Icons.Outlined.Navigation,
                            modifier = Modifier.weight(1f),
                        ) { onAction(Action.Navigate(lead.lat, lead.lng, lead.name)) }
                    }
                }
            }
        }

        /* ── The particulars ───────────────────────────────────── */

        item {
            Card {
                SectionLabel("Details")
                Spacer(Modifier.height(6.dp))
                KeyValue("Village", lead.village)
                KeyValue("District", lead.district)
                KeyValue("Owner", lead.assignedToName)
                KeyValue("Last contacted", shortDate(lead.lastContactedAt))
                KeyValue("Next follow-up", shortDate(lead.nextFollowUpAt))
                if (lead.isCustomer || lead.dealValue > 0) {
                    KeyValue("Deal", rupees(lead.dealValue))
                    KeyValue("Collected", rupees(lead.amountCollected))
                    val due = lead.dealValue - lead.amountCollected
                    if (due > 0) KeyValue("Still due", rupees(due))
                } else if (lead.estimatedValue > 0) {
                    KeyValue("Estimated value", rupees(lead.estimatedValue))
                }
                if (lead.notes.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    SectionLabel("Notes")
                    Spacer(Modifier.height(4.dp))
                    Text(lead.notes, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        /* ── What happened last time ───────────────────────────── */

        if (lead.visits.isNotEmpty()) {
            item {
                SectionLabel("Past visits (${lead.visits.size})", Modifier.padding(top = 6.dp))
            }
            items(lead.visits.size) { i -> VisitCard(lead.visits[i]) }
        }

        /* ── History ───────────────────────────────────────────── */

        if (lead.timeline.isNotEmpty()) {
            item { SectionLabel("History", Modifier.padding(top = 6.dp)) }
            item {
                Card {
                    // A CONNECTED timeline, not a list of dots. The dots alone
                    // were a bulleted list that happened to be in date order;
                    // the connecting line is what makes it read as one thing
                    // that moved through stages, which is what a lead is.
                    val shown = lead.timeline.take(12)
                    shown.forEachIndexed { i, entry ->
                        TimelineRow(
                            first = i == 0,
                            last = i == shown.lastIndex,
                            // The most recent entry is filled; everything behind
                            // it is hollow. So "where is this lead now" is one
                            // glance rather than a date comparison.
                            filled = i == 0,
                            tone = if (i == 0) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.outline,
                        ) {
                            Text(
                                entry.message,
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (i == 0) MaterialTheme.colorScheme.onSurface
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                listOfNotNull(entry.byName.ifBlank { null }, shortDateTime(entry.at)).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(20.dp)) }
    }
}

@Composable
private fun VisitCard(visit: PastVisit) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Outlined.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(visit.templateName.ifBlank { "Visit" }, style = MaterialTheme.typography.titleMedium)
                Text(
                    listOfNotNull(
                        visit.submittedByName.ifBlank { null },
                        shortDateTime(visit.capturedAt),
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (visit.outcome != "progressed") {
                Chip(visit.outcome.replace('_', ' '), MaterialTheme.colorScheme.error)
            }
        }

        if (visit.answers.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            visit.answers.take(8).forEach { (label, value) -> KeyValue(label, value) }
        }

        if (visit.note.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Surface(
                Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Text(visit.note, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(10.dp))
            }
        }

        if (visit.photoUrls.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text(
                "${visit.photoUrls.size} photograph${if (visit.photoUrls.size == 1) "" else "s"} on file",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/* ── Dates, written the way they are read here ─────────────────────── */

private fun parse(iso: String): java.util.Date? = runCatching {
    val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
    f.timeZone = TimeZone.getTimeZone("UTC")
    f.parse(iso.take(19))
}.getOrNull()

fun shortDate(iso: String): String {
    val d = parse(iso) ?: return "—"
    return SimpleDateFormat("d MMM", Locale.US).format(d)
}

fun shortDateTime(iso: String): String {
    val d = parse(iso) ?: return ""
    return SimpleDateFormat("d MMM, h:mm a", Locale.US).format(d)
}

fun rupees(value: Double): String =
    if (value <= 0) "—" else "₹" + String.format(Locale("en", "IN"), "%,.0f", value)
