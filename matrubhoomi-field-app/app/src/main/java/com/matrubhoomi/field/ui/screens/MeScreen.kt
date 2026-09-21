package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.AttendanceDay
import com.matrubhoomi.field.data.LeaveBalance
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.StatTile
import com.matrubhoomi.field.ui.components.Avatar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The employee's own record — attendance, leave, and the way into everything
 * administrative.
 *
 * WHY THIS IS IN THE SALES APP AT ALL
 * -----------------------------------
 * A field employee carries one phone. Making them install a second app to see
 * whether they were marked present, or to ask for a day off, is a decision made
 * for the convenience of whoever drew the module boundaries. The data is the
 * same rolls and the same endpoints the portal uses — nothing here is a copy.
 *
 * The top of the screen answers the question people actually open it for:
 * am I marked in today, and how many days do I have left.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeScreen(
    vm: AppViewModel,
    onOpenAttendance: () -> Unit,
    onOpenLeave: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }

    var today by remember { mutableStateOf<AttendanceDay?>(null) }
    var balance by remember { mutableStateOf(LeaveBalance.EMPTY) }
    var loaded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val attendance = withContext(Dispatchers.IO) { repo.attendanceToday() }
        if (attendance is ApiResult.Ok) today = attendance.value
        val leave = withContext(Dispatchers.IO) { repo.leaveBalance() }
        if (leave is ApiResult.Ok) balance = leave.value
        loaded = true
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(state.employeeName.ifBlank { "You" }, style = MaterialTheme.typography.titleLarge)
                        Text(
                            "Attendance, leave and settings",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
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

            /* ── Who this is ───────────────────────────────────── */
            //
            // The name was already in the app bar, where it is 14sp and scrolls
            // away. This is a handset several people may pick up over a shift,
            // and "whose account am I looking at" should be answerable without
            // scrolling to the top.

            item {
                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(state.employeeName.ifBlank { "You" }, size = 54.dp)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                state.employeeName.ifBlank { "Signed in" },
                                style = MaterialTheme.typography.titleLarge,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                listOfNotNull(
                                    state.bootstrap?.employeeCode?.ifBlank { null },
                                    "Field sales",
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (state.onDuty) {
                            Chip("on duty", MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }

            /* ── Am I marked in today ──────────────────────────── */

            item {
                val tone = when {
                    today == null -> MaterialTheme.colorScheme.onSurfaceVariant
                    today!!.isPresent -> MaterialTheme.colorScheme.primary
                    today!!.isAbsent -> MaterialTheme.colorScheme.error
                    today!!.isOff -> MaterialTheme.colorScheme.secondary
                    else -> MaterialTheme.colorScheme.secondary
                }

                Card {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(12.dp)
                                .background(tone, RoundedCornerShape(999.dp)),
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                when {
                                    !loaded -> "Checking today…"
                                    today == null -> "No attendance record"
                                    else -> today!!.label.ifBlank { today!!.status }
                                },
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                when {
                                    today == null && loaded ->
                                        "Nothing has come from the punch machine for you today."
                                    today != null && today!!.inTime.isNotBlank() ->
                                        "In ${today!!.inTime}" +
                                            (if (today!!.outTime.isNotBlank()) " · Out ${today!!.outTime}" else "") +
                                            (if (today!!.workDisplay.isNotBlank()) " · ${today!!.workDisplay}" else "")
                                    else -> "Today"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (today?.isLate == true) {
                            Chip("${today!!.lateMins} min late", MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

            /* ── Leave left ────────────────────────────────────── */

            item {
                Card {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        SectionLabel("Leave left this year")
                        Text(
                            "Apply",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable(onClick = onOpenLeave)
                                .padding(horizontal = 6.dp),
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile(
                            value = trim(balance.casualLeft),
                            label = "casual",
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            value = trim(balance.sickLeft),
                            label = "sick",
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
            }

            /* ── How the work works ────────────────────────────── */
            //
            // The five sentences a new employee needs on day one. Kept here, on
            // the screen they already open to check their own numbers, rather
            // than behind a help menu nobody finds in a field.
            item {
                Card {
                    SectionLabel("How this works")
                    Spacer(Modifier.height(8.dp))
                    listOf(
                        "You get two kinds of work: NEW CUSTOMERS (a target, you find the people) and FOLLOW-UPS (a named customer, one visit).",
                        "When you register someone, you choose which SCHEME they belong to. That decides the steps they go through from then on.",
                        "A follow-up already knows the customer, the scheme and the step. You only fill the form for that step.",
                        "Saving a visit sends it to the sales desk for APPROVAL. The step counts as done only when they approve — not when you press save.",
                        "If a visit is sent back, it shows the desk's reason and a Redo button. Everything works with no signal and is sent when you have some.",
                    ).forEach { line ->
                        Row(Modifier.padding(vertical = 4.dp)) {
                            Text("•  ", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                            Text(line, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }

            /* ── Everything else ───────────────────────────────── */

            item {
                Card(Modifier.padding(0.dp)) {
                    MeRow(Icons.Outlined.CalendarMonth, "Attendance history", "Every day this month", onOpenAttendance)
                    MeRow(Icons.Outlined.EventAvailable, "Leave", "Balance, applications, and applying", onOpenLeave)
                    MeRow(
                        Icons.Outlined.CloudUpload,
                        "Waiting to be sent",
                        if (state.pendingRecords + state.queuedPings == 0) "Nothing waiting"
                        else "${state.pendingRecords} visits · ${state.queuedPings} positions",
                        onOpenSettings,
                    )
                    MeRow(Icons.Outlined.Settings, "Settings", "Sync, sign out, and anything that needs fixing", onOpenSettings, last = true)
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun MeRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    last: Boolean = false,
) {
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!last) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(MaterialTheme.colorScheme.outlineVariant),
            )
        }
    }
}

/** 12.0 reads as an error on a leave balance; 12 reads as a number of days. */
private fun trim(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString() else "%.1f".format(value)
