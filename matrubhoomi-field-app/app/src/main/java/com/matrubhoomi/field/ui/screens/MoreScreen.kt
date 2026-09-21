package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.BuildConfig
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.sync.SyncScheduler
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.BigOutlinedButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.KeyValue
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.StatTile

/**
 * Everything that is not the day's work.
 *
 * The permission list is written as PLAIN CONSEQUENCES rather than permission
 * names. "Allow all the time" means nothing to somebody standing in a field;
 * "your route stops being recorded when the screen goes off" is the same fact
 * in a form they can act on.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun MoreScreen(vm: AppViewModel, onBack: () -> Unit, onSignedOut: () -> Unit) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val prefs = remember { Prefs.get(context) }

    var serverField by remember { mutableStateOf(prefs.serverUrl.orEmpty()) }
    var serverSaved by remember { mutableStateOf(false) }
    // Revealed by a long press on the version line — see the server card below.
    var showServer by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", style = MaterialTheme.typography.titleLarge) },
                navigationIcon = {
                    androidx.compose.material3.IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
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

            /* ── Who ───────────────────────────────────────────── */

            item {
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(48.dp)
                                .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(999.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                state.employeeName.take(1).uppercase().ifBlank { "?" },
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                            )
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                state.employeeName.ifBlank { "Signed in" },
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                "Matrubhoomi Field ${BuildConfig.VERSION_NAME}" +
                                    if (showServer) " · setup shown" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                // The way in to the server address. A long press
                                // rather than a tap count: it cannot be reached
                                // by accident, and it is one instruction to give
                                // over the phone.
                                modifier = Modifier.combinedClickable(
                                    onClick = {},
                                    onLongClick = { showServer = !showServer },
                                ),
                            )
                        }
                    }
                }
            }

            /* ── The outbox ────────────────────────────────────── */

            item {
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Outlined.CloudUpload,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text("Waiting to be sent", style = MaterialTheme.typography.titleMedium)
                    }

                    Spacer(Modifier.height(12.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile(
                            value = "${state.pendingRecords}",
                            label = "visits",
                            tone = if (state.pendingRecords > 0) MaterialTheme.colorScheme.secondary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            value = "${state.queuedPings}",
                            label = "positions",
                            tone = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            value = "${state.rejectedRecords}",
                            label = "refused",
                            tone = if (state.rejectedRecords > 0) MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f),
                        )
                    }

                    if (state.rejectedRecords > 0) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Refused records will not be retried — the server rejected them outright. " +
                                "Show this screen to the sales desk.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    BigOutlinedButton(
                        text = "Try sending now",
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        SyncScheduler.now(context)
                        vm.refreshCounts()
                    }
                }
            }

            /* ── Only what is actually wrong ───────────────────── */

            // WHY THIS CARD DISAPPEARS WHEN EVERYTHING IS GRANTED
            // ---------------------------------------------------
            // A permanent checklist of five green ticks is setup paperwork, and
            // it is not the field employee's paperwork — they granted these once
            // on day one and will never touch them again. Left on screen it
            // reads as five things they are responsible for.
            //
            // But the list cannot simply be deleted: on the handsets this app
            // actually runs on, a permission REVOKES itself. Vivo and Xiaomi
            // builds quietly drop background location and re-enable battery
            // optimisation after an update or a few idle days, and when that
            // happens the day's route ends early with nothing on screen to
            // explain it.
            //
            // So the card appears exactly when there is something to do, and
            // states the consequence rather than the permission name.
            item {
                val problems = permissionProblems(context)
                if (problems.isNotEmpty()) {
                    Card {
                        SectionLabel("Needs your attention")
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Recording will not work properly until " +
                                if (problems.size == 1) "this is fixed." else "these are fixed.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(6.dp))

                        for (problem in problems) {
                            PermissionRow(
                                label = problem.label,
                                granted = false,
                                consequence = problem.consequence,
                                onFix = { problem.fix(context) },
                            )
                        }

                        Spacer(Modifier.height(10.dp))
                        Text(
                            "On Xiaomi, Vivo, Oppo and Realme phones there is one more, and the app cannot ask " +
                                "for it: open this app in the phone's own Settings, turn ON \"Autostart\", and set " +
                                "battery to \"No restrictions\". Without it these phones stop the recording however " +
                                "many permissions are granted here.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            /* ── The server address, out of the way ────────────── */

            // WHY THIS IS HIDDEN RATHER THAN REMOVED
            // --------------------------------------
            // This field is engineering, not work. A field employee has no use
            // for it, cannot judge whether an address is right, and an app that
            // invites them to edit one has handed them a way to break their own
            // handset with no way back.
            //
            // It cannot be deleted either. The company runs this on its own
            // network, where the server's address is a DHCP lease that changes;
            // when it moves, somebody has to be able to point a handset at the
            // new one without a rebuild and a cable. That somebody is whoever
            // is holding the phone at the time.
            //
            // So it lives behind a long press on the version line — invisible
            // in ordinary use, and thirty seconds away for anybody who has been
            // told where it is.
            item {
                if (showServer) {
                    Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Outlined.Dns,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text("Server address", style = MaterialTheme.typography.titleMedium)
                    }

                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Currently using ${prefs.serverUrl ?: BuildConfig.API_URL}" +
                            if (prefs.serverUrl == null) " (built in)" else " (set on this phone)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = serverField,
                        onValueChange = { serverField = it; serverSaved = false },
                        label = { Text("Address") },
                        placeholder = { Text("http://192.168.1.9:5000") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        BigOutlinedButton(text = "Save", modifier = Modifier.weight(1f)) {
                            prefs.serverUrl = serverField.ifBlank { null }
                            serverSaved = true
                            vm.refresh()
                        }
                        BigOutlinedButton(text = "Use built-in", modifier = Modifier.weight(1f)) {
                            prefs.serverUrl = null
                            serverField = ""
                            serverSaved = true
                            vm.refresh()
                        }
                    }

                    if (serverSaved) {
                        Spacer(Modifier.height(8.dp))
                        Chip("saved", MaterialTheme.colorScheme.primary)
                    }

                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Changing this does not sign you out, and nothing waiting to be sent is lost — " +
                            "it goes to the new address instead.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    }
                }
            }

            /* ── Out ───────────────────────────────────────────── */

            item {
                Card {
                    SectionLabel("Session")
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (state.pendingRecords > 0 || state.queuedPings > 0)
                            "Signing out stops the recording. Anything still waiting stays on the phone and " +
                                "goes up when you sign back in — nothing is thrown away."
                        else
                            "Signing out stops the recording and returns to the sign-in screen.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    TextButton(onClick = { vm.signOut(); onSignedOut() }) {
                        Text("Sign out", color = MaterialTheme.colorScheme.error)
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

/**
 * What is stopping the recording from working, right now.
 *
 * Evaluated fresh on every composition rather than cached: the fix buttons send
 * the user out to the system settings, and the screen has to reflect what they
 * did there the moment they come back.
 */
private class PermissionProblem(
    val label: String,
    val consequence: String,
    val fix: (android.content.Context) -> Unit,
)

private fun permissionProblems(context: android.content.Context): List<PermissionProblem> {
    val problems = mutableListOf<PermissionProblem>()

    if (!Tracking.hasForegroundLocation(context)) {
        problems += PermissionProblem(
            "See your location",
            "Nothing can be recorded without it.",
        ) { Tracking.openAppSettings(it) }
    }
    if (!Tracking.hasBackgroundLocation(context)) {
        problems += PermissionProblem(
            "See it all the time",
            "Without this, the route stops whenever the screen goes off.",
        ) { Tracking.openAppSettings(it) }
    }
    if (Tracking.isBatteryOptimised(context)) {
        problems += PermissionProblem(
            "Run in the background",
            "Without this, the phone puts the app to sleep and the round ends early.",
        ) { Tracking.requestBatteryExemption(it) }
    }
    if (!Tracking.hasNotifications(context)) {
        problems += PermissionProblem(
            "Show the on-duty notice",
            "Android needs that notice on screen to keep recording.",
        ) { Tracking.openAppSettings(it) }
    }
    if (!Tracking.canScheduleExactAlarms(context)) {
        problems += PermissionProblem(
            "Wake itself up",
            "Without this, a recording the phone stops takes longer to come back.",
        ) { Tracking.openAppSettings(it) }
    }

    return problems
}

@Composable
private fun PermissionRow(
    label: String,
    granted: Boolean,
    consequence: String,
    onFix: () -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            if (!granted) {
                Text(
                    consequence,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        if (granted) {
            Chip("on", MaterialTheme.colorScheme.primary)
        } else {
            TextButton(onClick = onFix) { Text("Fix") }
        }
    }
}
