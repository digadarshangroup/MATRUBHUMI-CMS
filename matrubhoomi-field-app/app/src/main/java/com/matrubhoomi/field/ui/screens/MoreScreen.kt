package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.BuildConfig
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.sync.SyncScheduler
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Avatar
import com.matrubhoomi.field.ui.components.BigOutlinedButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.ConfirmDialog
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.StatTile

/**
 * Settings — the app lock, what is stopping the app working, and signing out.
 *
 * What appears depends on who is holding the phone. The outbox and the
 * location permissions are field staff's concern and nobody else's; an
 * accountant's settings page has no location section, because nothing about
 * them is recorded.
 *
 * The permission list is written as PLAIN CONSEQUENCES rather than permission
 * names. "Allow all the time" means nothing to somebody standing in a field;
 * "your route stops being recorded when the screen goes off" is the same fact
 * in a form they can act on.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MoreScreen(vm: AppViewModel, onSignedOut: () -> Unit) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val prefs = remember { Prefs.get(context) }
    val caps = state.caps

    var serverField by remember { mutableStateOf(prefs.serverUrl.orEmpty()) }
    var serverSaved by remember { mutableStateOf(false) }
    // Revealed by a long press on the version line — see the server card below.
    var showServer by remember { mutableStateOf(false) }
    var lockOn by remember { mutableStateOf(prefs.appLockEnabled) }
    var confirmSignOut by remember { mutableStateOf(false) }

    val waiting = state.pendingRecords + state.queuedPings + state.rejectedRecords

    Scaffold(topBar = { ScreenBar("Settings") }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }

            /* ── Who ───────────────────────────────────────────── */
            item {
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(state.profile.name.ifBlank { state.employeeName.ifBlank { "?" } }, size = 48.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(state.profile.name.ifBlank { state.employeeName.ifBlank { "Signed in" } }, style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Matrubhoomi ${BuildConfig.VERSION_NAME}" + if (showServer) " · setup shown" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                // The way in to the server address. A long press
                                // rather than a tap count: it cannot be reached by
                                // accident, and it is one instruction to give over
                                // the phone.
                                modifier = Modifier.combinedClickable(onClick = {}, onLongClick = { showServer = !showServer }),
                            )
                        }
                    }
                }
            }

            /* ── Text size ─────────────────────────────────────── */
            item {
                Card {
                    Text("Text size", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "On top of your phone's own text size setting.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(10.dp))
                    val sizes = com.matrubhoomi.field.ui.components.TextSize.entries
                    val current = com.matrubhoomi.field.ui.components.TextSize.of(state.textScale)
                    com.matrubhoomi.field.ui.components.SegmentedTabs(
                        options = sizes.map { it.label },
                        selectedIndex = sizes.indexOf(current),
                        onSelect = { vm.setTextScale(sizes[it].factor) },
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Your casual leave on Fri 2 Oct is approved.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            /* ── Updates ───────────────────────────────────────── */
            item {
                val release = state.update
                if (release != null) {
                    com.matrubhoomi.field.ui.components.UpdateCard(release)
                } else {
                    var checking by remember { mutableStateOf(false) }
                    val toast = com.matrubhoomi.field.ui.components.LocalToast.current
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("App version ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.titleMedium)
                                Text("HR publishes new versions; you'll be told here and on your home screen.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            androidx.compose.material3.TextButton(
                                enabled = !checking,
                                onClick = {
                                    checking = true
                                    vm.checkForUpdate(force = true) { ok ->
                                        checking = false
                                        if (!ok) toast?.show("Could not check — no connection.", com.matrubhoomi.field.ui.components.Tone.Danger)
                                        else if (vm.state.value.update == null) toast?.show("You're on the latest version.")
                                    }
                                },
                            ) { Text(if (checking) "Checking…" else "Check now") }
                        }
                    }
                }
            }

            /* ── App lock ──────────────────────────────────────── */
            item {
                val possible = canLock(context)
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Lock the app", style = MaterialTheme.typography.titleMedium)
                            Text(
                                if (possible) "Ask for your fingerprint or screen lock when the app opens, and after a minute away."
                                else "Set a screen lock or fingerprint on this phone first — the app uses the phone's own.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(
                            checked = lockOn && possible,
                            enabled = possible,
                            onCheckedChange = {
                                lockOn = it
                                prefs.appLockEnabled = it
                            },
                        )
                    }
                }
            }

            /* ── The outbox — field staff, or anything left over ─ */
            if (caps.field || waiting > 0) {
                item {
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.CloudUpload, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(10.dp))
                            Text("Waiting to be sent", style = MaterialTheme.typography.titleMedium)
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            StatTile(
                                value = "${state.pendingRecords}",
                                label = "visits",
                                tone = if (state.pendingRecords > 0) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                            StatTile(value = "${state.queuedPings}", label = "positions", tone = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                            StatTile(
                                value = "${state.rejectedRecords}",
                                label = "refused",
                                tone = if (state.rejectedRecords > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (state.rejectedRecords > 0) {
                            Spacer(Modifier.height(10.dp))
                            Text(
                                "Refused records will not be retried — the server rejected them outright. Show this screen to the sales desk.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                        Spacer(Modifier.height(12.dp))
                        BigOutlinedButton(text = "Try sending now", modifier = Modifier.fillMaxWidth()) {
                            SyncScheduler.now(context)
                            vm.refreshCounts()
                        }
                    }
                }
            }

            /* ── Only what is actually wrong ───────────────────── */
            // A permanent checklist of green ticks is setup paperwork. But on the
            // handsets this runs on, permissions REVOKE themselves — Vivo and
            // Xiaomi builds drop background location and re-enable battery
            // optimisation after an update. So the card appears exactly when
            // there is something to do, and says what it costs.
            item {
                // Read so this card looks again whenever a permission may have
                // changed — see UiState.permissionsVersion.
                @Suppress("UNUSED_VARIABLE") val tick = state.permissionsVersion
                val problems = permissionProblems(context, tracked = caps.tracking)
                if (problems.isNotEmpty()) {
                    Card {
                        SectionLabel("Needs your attention")
                        Spacer(Modifier.height(4.dp))
                        Text(
                            if (caps.tracking) "Recording will not work properly until " + if (problems.size == 1) "this is fixed." else "these are fixed."
                            else "Approvals and decisions will not reach you until this is fixed.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(6.dp))
                        for (problem in problems) {
                            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(problem.label, style = MaterialTheme.typography.bodyLarge)
                                    Text(problem.consequence, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                                }
                                TextButton(onClick = { problem.fix(context) }) { Text("Fix") }
                            }
                        }
                        if (caps.tracking) {
                            Spacer(Modifier.height(10.dp))
                            Text(
                                "On Xiaomi, Vivo, Oppo and Realme phones there is one more, and the app cannot ask for it: open this app in " +
                                    "the phone's own Settings, turn ON \"Autostart\", and set battery to \"No restrictions\". Without it these " +
                                    "phones stop the recording however many permissions are granted here.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            /* ── The server address, out of the way ────────────── */
            // Engineering, not work — but the company's server address is a DHCP
            // lease that moves, and somebody has to be able to point a handset at
            // the new one without a rebuild. Behind a long press on the version.
            if (showServer) {
                item {
                    Card {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Dns, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(10.dp))
                            Text("Server address", style = MaterialTheme.typography.titleMedium)
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Currently using ${prefs.serverUrl ?: BuildConfig.API_URL}" + if (prefs.serverUrl == null) " (built in)" else " (set on this phone)",
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
                    }
                }
            }

            /* ── Out ───────────────────────────────────────────── */
            item {
                Card {
                    SectionLabel("Session")
                    Spacer(Modifier.height(8.dp))
                    Text(
                        when {
                            caps.field && waiting > 0 ->
                                "Signing out ends duty. Anything still waiting stays on the phone and goes up when you sign back in."
                            caps.field -> "Signing out ends duty and returns to the sign-in screen."
                            else -> "Signing out returns to the sign-in screen."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    TextButton(onClick = { confirmSignOut = true }) { Text("Sign out", color = MaterialTheme.colorScheme.error) }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }

    if (confirmSignOut) {
        ConfirmDialog(
            title = "Sign out?",
            body = if (state.onDuty) "You are on duty. Signing out ends it now." else "You will need your password to sign back in.",
            confirmLabel = "Sign out",
            destructive = true,
            onConfirm = { vm.signOut(onSignedOut) },
            onDismiss = { confirmSignOut = false },
        )
    }
}

/**
 * What is stopping the app working, right now. Evaluated fresh on every
 * composition: the fix buttons send the user to system settings, and the screen
 * has to reflect what they did there the moment they come back.
 */
private class PermissionProblem(
    val label: String,
    val consequence: String,
    val fix: (android.content.Context) -> Unit,
)

private fun permissionProblems(context: android.content.Context, tracked: Boolean): List<PermissionProblem> {
    val problems = mutableListOf<PermissionProblem>()

    if (!Tracking.hasNotifications(context)) {
        problems += PermissionProblem(
            "Show notifications",
            if (tracked) "Android needs the on-duty notice on screen to keep recording, and decisions arrive as notifications."
            else "Leave decisions and approvals arrive as notifications.",
        ) { Tracking.openAppSettings(it) }
    }
    // Location is asked of tracked staff ONLY. Nobody else is ever told the
    // app wants to know where they are.
    if (!tracked) return problems

    if (!Tracking.hasForegroundLocation(context)) {
        problems += PermissionProblem("See your location", "Nothing can be recorded without it.") { Tracking.openAppSettings(it) }
    }
    if (!Tracking.hasBackgroundLocation(context)) {
        problems += PermissionProblem("See it all the time", "Without this, the route stops whenever the screen goes off.") { Tracking.openAppSettings(it) }
    }
    if (Tracking.isBatteryOptimised(context)) {
        problems += PermissionProblem(
            "Run in the background",
            "Without this, the phone puts the app to sleep and the round ends early.",
        ) { Tracking.requestBatteryExemption(it) }
    }
    if (!Tracking.canScheduleExactAlarms(context)) {
        problems += PermissionProblem(
            "Wake itself up",
            "Without this, a recording the phone stops takes longer to come back.",
        ) { Tracking.openExactAlarmSettings(it) }
    }
    return problems
}
