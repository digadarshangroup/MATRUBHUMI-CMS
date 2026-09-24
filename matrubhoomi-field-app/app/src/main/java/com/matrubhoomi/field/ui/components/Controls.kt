package com.matrubhoomi.field.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.RowScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.requestStatusLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * The controls every employee screen shares — so leave, corrections, overtime
 * and payslips all load, fail, pick a date and say "Waiting for manager" the
 * same way.
 */

/* ── The chrome: burger on a tab, back arrow on anything pushed ────── */

/**
 * What a screen needs to know about where it sits. A screen like Attendance is
 * a bottom-bar TAB for somebody in Accounts and a page pushed from the menu for
 * a salesperson, so it cannot decide its own top-left icon; the shell tells it.
 */
class Chrome(
    val isTab: (String?) -> Boolean,
    val currentRoute: () -> String?,
    val openDrawer: () -> Unit,
    val back: () -> Unit,
    val open: (String) -> Unit,
)

val LocalChrome = compositionLocalOf {
    Chrome(isTab = { false }, currentRoute = { null }, openDrawer = {}, back = {}, open = {})
}

/** The menu on a tab, a back arrow on anything pushed on top of one. */
@Composable
fun NavIcon() {
    val chrome = LocalChrome.current
    if (chrome.isTab(chrome.currentRoute())) {
        IconButton(onClick = chrome.openDrawer) { Icon(Icons.Default.Menu, contentDescription = "Menu") }
    } else {
        IconButton(onClick = chrome.back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
    }
}

/** The standard top bar: title, an optional second line, the right icon, actions. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenBar(
    title: String,
    subtitle: String? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    TopAppBar(
        title = {
            // ONE line each. The bar is a fixed height; a subtitle that wrapped
            // to a second line spilled out of it onto the card below.
            Column {
                Text(
                    title,
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                }
            }
        },
        navigationIcon = { NavIcon() },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
    )
}

/* ── Loading something from the server ─────────────────────────────── */

/**
 * One server read, with the four states every screen has to say something
 * about: loading, loaded, no connection, and refused.
 */
class Fetch<T>(
    val data: T?,
    val loading: Boolean,
    val problem: String?,
    val offline: Boolean,
    val reload: () -> Unit,
)

@Composable
fun <T> rememberFetch(vararg keys: Any?, load: suspend () -> ApiResult<T>): Fetch<T> {
    var data by remember { mutableStateOf<T?>(null) }
    var loading by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf<String?>(null) }
    var offline by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableIntStateOf(0) }

    LaunchedEffect(*keys, reloadKey) {
        loading = true
        when (val r = withContext(Dispatchers.IO) { load() }) {
            is ApiResult.Ok -> { data = r.value; problem = null; offline = false }
            is ApiResult.Offline -> { problem = "No connection — this needs one."; offline = true }
            // The session guard has already signed the app out; the shell moves on.
            is ApiResult.Unauthorised -> problem = "Your session has ended."
            is ApiResult.Failed -> { problem = r.message; offline = false }
        }
        loading = false
    }
    return Fetch(data, loading, problem, offline) { reloadKey++ }
}

/** Run a write off the main thread and hand back the message a person should read. */
suspend fun <T> runAction(block: suspend () -> ApiResult<T>): Pair<Boolean, String?> =
    when (val r = withContext(Dispatchers.IO) { block() }) {
        is ApiResult.Ok -> true to ((r.value as? String)?.takeIf { it.isNotBlank() })
        is ApiResult.Offline -> false to "No connection. Try again when you have signal."
        is ApiResult.Unauthorised -> false to "Your session has ended."
        is ApiResult.Failed -> false to r.message
    }

@Composable
fun LoadingBlock(modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(vertical = 28.dp), horizontalArrangement = Arrangement.Center) {
        CircularProgressIndicator(Modifier.size(26.dp), strokeWidth = 2.dp)
    }
}

/* ── Status, said the same way everywhere ─────────────────────────── */

@Composable
fun statusTone(status: String): Color = when (status) {
    "hr_approved", "available", "manager_approved" -> MaterialTheme.colorScheme.primary
    "manager_rejected", "hr_rejected", "rejected", "declined", "cancelled", "withdrawn", "expired" ->
        MaterialTheme.colorScheme.error
    else -> MaterialTheme.colorScheme.secondary
}

@Composable
fun StatusChip(status: String) = Chip(requestStatusLabel(status), statusTone(status))

/* ── Picking a date, a time ────────────────────────────────────────── */

/**
 * A date the person TAPS rather than types. The old leave form asked for
 * "YYYY-MM-DD" in a text box, which on a phone keyboard is a typo waiting to
 * be refused by the server.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(
    label: String,
    value: LocalDate?,
    onChange: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
    earliest: LocalDate? = null,
    latest: LocalDate? = null,
) {
    var open by remember { mutableStateOf(false) }
    PickerBox(
        label = label,
        value = value?.let { com.matrubhoomi.field.core.dayLabel(it.toString()) } ?: "Pick a date",
        icon = Icons.Outlined.CalendarMonth,
        modifier = modifier,
        onClick = { open = true },
    )
    if (open) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = (value ?: LocalDate.now()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : androidx.compose.material3.SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    val d = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate()
                    return (earliest == null || !d.isBefore(earliest)) && (latest == null || !d.isAfter(latest))
                }
            },
        )
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate())
                    }
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }
}

/** "HH:mm" in 24-hour form — the wire format corrections carry their times in. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    PickerBox(
        label = label,
        value = value.ifBlank { "Pick a time" },
        icon = Icons.Outlined.Schedule,
        modifier = modifier,
        onClick = { open = true },
    )
    if (open) {
        val parts = value.split(":")
        val state = rememberTimePickerState(
            initialHour = parts.getOrNull(0)?.toIntOrNull() ?: 9,
            initialMinute = parts.getOrNull(1)?.toIntOrNull() ?: 30,
            is24Hour = false,
        )
        AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    onChange("%02d:%02d".format(state.hour, state.minute))
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
            text = { TimePicker(state = state) },
        )
    }
}

@Composable
private fun PickerBox(
    label: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                .clickable(onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            FitText(value, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

/* ConfirmDialog and ReasonDialog live in Dialogs.kt, with every other dialog. */

/* ── A month, as a grid ────────────────────────────────────────────── */

/**
 * A month calendar where each day carries a tone — present, absent, leave, off
 * — and can be tapped. The word for the status is on the day list below it;
 * colour is never the only signal.
 */
@Composable
fun MonthCalendar(
    year: Int,
    month: Int,
    toneFor: (LocalDate) -> Color?,
    selected: LocalDate?,
    onSelect: (LocalDate) -> Unit,
    onShift: (Int) -> Unit,
    canGoForward: Boolean,
) {
    val first = LocalDate.of(year, month, 1)
    val days = first.lengthOfMonth()
    // Monday-first, the way an Indian office calendar is printed.
    val lead = (first.dayOfWeek.value - 1)
    val today = LocalDate.now()

    Column {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onShift(-1) }) { Icon(Icons.Default.ChevronLeft, contentDescription = "Previous month") }
            Text(
                first.format(java.time.format.DateTimeFormatter.ofPattern("MMMM yyyy", java.util.Locale.US)),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
            )
            IconButton(onClick = { onShift(1) }, enabled = canGoForward) {
                Icon(
                    Icons.Default.ChevronRight,
                    contentDescription = "Next month",
                    tint = if (canGoForward) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline,
                )
            }
        }
        Row(Modifier.fillMaxWidth()) {
            listOf("M", "T", "W", "T", "F", "S", "S").forEach {
                Text(
                    it,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        val cells = lead + days
        val rows = (cells + 6) / 7
        for (r in 0 until rows) {
            Row(Modifier.fillMaxWidth()) {
                for (c in 0 until 7) {
                    val index = r * 7 + c - lead + 1
                    Box(Modifier.weight(1f).aspectRatio(1f).padding(2.dp), contentAlignment = Alignment.Center) {
                        if (index in 1..days) {
                            val date = LocalDate.of(year, month, index)
                            val tone = toneFor(date)
                            val isSelected = date == selected
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = when {
                                    isSelected -> MaterialTheme.colorScheme.primary
                                    tone != null -> tone.copy(alpha = 0.14f)
                                    else -> Color.Transparent
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .then(
                                        if (date == today && !isSelected)
                                            Modifier.border(1.5.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(10.dp))
                                        else Modifier,
                                    )
                                    .clickable(enabled = !date.isAfter(today)) { onSelect(date) },
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        "$index",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = when {
                                            isSelected -> MaterialTheme.colorScheme.onPrimary
                                            date.isAfter(today) -> MaterialTheme.colorScheme.outline
                                            tone != null -> tone
                                            else -> MaterialTheme.colorScheme.onSurface
                                        },
                                    )
                                    if (tone != null && !isSelected) {
                                        Box(
                                            Modifier
                                                .align(Alignment.BottomCenter)
                                                .padding(bottom = 4.dp)
                                                .size(4.dp)
                                                .background(tone, RoundedCornerShape(999.dp)),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** A row in a menu-like card: icon, title, subtitle, a count, and a chevron. */
@Composable
fun MenuRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    badge: Int = 0,
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
            Box(
                Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyLarge)
                if (subtitle.isNotBlank()) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (badge > 0) {
                Box(
                    Modifier
                        .background(MaterialTheme.colorScheme.error, RoundedCornerShape(999.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text(
                        if (badge > 99) "99+" else "$badge",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onError,
                    )
                }
                Spacer(Modifier.width(6.dp))
            }
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!last) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
        }
    }
}

/* ── Pull down to reload ───────────────────────────────────────────── */

/**
 * The gesture everybody tries first on a list that looks stale. The spinner
 * shows only for a RE-load: the first load has its own block in the list.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshableList(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    androidx.compose.material3.pulltorefresh.PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        modifier = modifier,
    ) { content() }
}

/* ── A password, with the eye to check what was typed ─────────────── */

/**
 * Typing a password on a phone keyboard in sunlight is error-prone; the eye
 * lets somebody check it before the server refuses it.
 */
@Composable
fun PasswordField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    isError: Boolean = false,
    imeAction: androidx.compose.ui.text.input.ImeAction = androidx.compose.ui.text.input.ImeAction.Next,
    onDone: () -> Unit = {},
) {
    var shown by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        isError = isError,
        shape = RoundedCornerShape(14.dp),
        leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
        trailingIcon = {
            IconButton(onClick = { shown = !shown }) {
                Icon(
                    if (shown) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                    contentDescription = if (shown) "Hide password" else "Show password",
                )
            }
        },
        visualTransformation = if (shown) androidx.compose.ui.text.input.VisualTransformation.None
        else androidx.compose.ui.text.input.PasswordVisualTransformation(),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
            keyboardType = androidx.compose.ui.text.input.KeyboardType.Password,
            imeAction = imeAction,
        ),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { onDone() }),
        supportingText = supporting?.let { { Text(it) } },
        modifier = modifier.fillMaxWidth(),
    )
}

/* ── Choices that wrap instead of running off the screen ──────────── */

/**
 * A row of chips that wraps onto a second line when the phone is narrow or its
 * font is large. A plain Row squeezed the last chip ("Unpaid") into an empty
 * sliver; a scrolling one hid "Wrong status" and "Client visit" off the edge
 * with nothing to say they were there.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ChipFlow(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    androidx.compose.foundation.layout.FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) { content() }
}
