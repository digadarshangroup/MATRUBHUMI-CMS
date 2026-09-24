package com.matrubhoomi.field.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Every question the app asks, and every "done" it says, in ONE look.
 *
 * Before this file each screen built its own AlertDialog: a title in the corner,
 * two small text buttons, and whatever spacing that screen's author chose. A
 * dialog is the moment the app interrupts somebody — often standing in the sun
 * with one thumb free — so it gets the same shape everywhere: a tinted icon that
 * says what KIND of moment this is, a title, a sentence, and full-width buttons
 * a thumb cannot miss. A write in progress keeps the dialog open with a spinner,
 * and a refusal is shown INSIDE it, next to what can be changed, rather than
 * after it has closed.
 */

/** What kind of moment a dialog or a toast is. The colour follows from it. */
enum class Tone { Info, Positive, Warning, Danger }

private val Amber = Color(0xFFB7791F)

@Composable
fun toneColor(tone: Tone): Color = when (tone) {
    Tone.Info -> MaterialTheme.colorScheme.secondary
    Tone.Positive -> MaterialTheme.colorScheme.primary
    Tone.Warning -> Amber
    Tone.Danger -> MaterialTheme.colorScheme.error
}

private fun defaultIcon(tone: Tone): ImageVector = when (tone) {
    Tone.Info -> Icons.Outlined.Info
    Tone.Positive -> Icons.Outlined.CheckCircle
    Tone.Warning -> Icons.Outlined.WarningAmber
    Tone.Danger -> Icons.Outlined.ErrorOutline
}

/**
 * The one dialog.
 *
 * @param busy a write is in flight: the buttons are held, the primary one spins,
 *   and neither a tap outside nor Back can dismiss it half-way.
 * @param error the server's refusal, shown inside the dialog above the buttons.
 */
@Composable
fun AppDialog(
    title: String,
    onDismiss: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    message: String? = null,
    tone: Tone = Tone.Info,
    icon: ImageVector? = defaultIcon(tone),
    confirmEnabled: Boolean = true,
    busy: Boolean = false,
    error: String? = null,
    dismissLabel: String? = "Cancel",
    dismissOnOutside: Boolean = true,
    content: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val accent = toneColor(tone)
    Dialog(
        onDismissRequest = { if (!busy) onDismiss() },
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = !busy,
            dismissOnClickOutside = dismissOnOutside && !busy,
        ),
    ) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 16.dp,
            modifier = Modifier
                .padding(horizontal = 20.dp, vertical = 24.dp)
                .widthIn(max = 460.dp)
                .fillMaxWidth()
                .imePadding(),
        ) {
            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(start = 24.dp, end = 24.dp, top = 26.dp, bottom = 16.dp),
            ) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (icon != null) {
                        Box(
                            Modifier
                                .size(56.dp)
                                .background(accent.copy(alpha = 0.12f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(28.dp))
                        }
                        Spacer(Modifier.height(16.dp))
                    }
                    Text(
                        title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                    )
                    if (!message.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                if (content != null) {
                    Spacer(Modifier.height(18.dp))
                    Column(Modifier.fillMaxWidth(), content = content)
                }
                if (!error.isNullOrBlank()) {
                    Spacer(Modifier.height(14.dp))
                    InlineProblem(error)
                }
                Spacer(Modifier.height(22.dp))
                Button(
                    onClick = onConfirm,
                    enabled = confirmEnabled && !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = if (tone == Tone.Danger) {
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError,
                        )
                    } else ButtonDefaults.buttonColors(),
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = LocalContentColor.current,
                        )
                        Spacer(Modifier.width(10.dp))
                    }
                    Text(confirmLabel, style = MaterialTheme.typography.labelLarge)
                }
                if (dismissLabel != null) {
                    Spacer(Modifier.height(4.dp))
                    TextButton(
                        onClick = onDismiss,
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                    ) {
                        Text(dismissLabel, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/** A refusal, said next to the thing that can be changed. */
@Composable
fun InlineProblem(text: String) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.error.copy(alpha = 0.08f),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Icon(
                Icons.Outlined.ErrorOutline,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(10.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

/* ── The two dialogs every screen uses ─────────────────────────────── */

@Composable
fun ConfirmDialog(
    title: String,
    body: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = false,
    icon: ImageVector? = null,
) {
    AppDialog(
        title = title,
        message = body,
        tone = if (destructive) Tone.Danger else Tone.Info,
        icon = icon ?: if (destructive) Icons.Outlined.WarningAmber else Icons.Outlined.HelpOutline,
        confirmLabel = confirmLabel,
        onConfirm = { onConfirm(); onDismiss() },
        onDismiss = onDismiss,
        dismissLabel = "Not now",
    )
}

/**
 * A decision that needs words — refusing somebody's leave, a quick day off.
 *
 * With [submit], the dialog runs the write itself: it stays open and busy until
 * the server answers, closes on success, and shows a refusal inside itself so
 * the words typed are not lost. Without it, it hands the text over and closes.
 */
@Composable
fun ReasonDialog(
    title: String,
    hint: String,
    confirmLabel: String,
    required: Boolean,
    onConfirm: (String) -> Unit = {},
    onDismiss: () -> Unit,
    message: String? = null,
    tone: Tone = Tone.Info,
    icon: ImageVector? = null,
    suggestions: List<String> = emptyList(),
    submit: (suspend (String) -> Pair<Boolean, String?>)? = null,
    onDone: (String?) -> Unit = {},
) {
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AppDialog(
        title = title,
        message = message,
        tone = tone,
        icon = icon ?: defaultIcon(tone),
        confirmLabel = confirmLabel,
        confirmEnabled = !required || text.isNotBlank(),
        busy = busy,
        error = error,
        onDismiss = onDismiss,
        onConfirm = {
            val value = text.trim()
            if (submit == null) {
                onConfirm(value)
                onDismiss()
            } else {
                busy = true
                error = null
                scope.launch {
                    val (ok, said) = submit(value)
                    busy = false
                    if (ok) {
                        onDone(said)
                        onDismiss()
                    } else error = said ?: "That did not go through."
                }
            }
        },
    ) {
        if (suggestions.isNotEmpty()) {
            SuggestionRow(suggestions) { text = it; error = null }
            Spacer(Modifier.height(10.dp))
        }
        OutlinedTextField(
            value = text,
            onValueChange = { text = it; error = null },
            label = { Text(hint) },
            minLines = 2,
            maxLines = 5,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Tappable ready-made answers, for somebody typing with one thumb. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SuggestionRow(options: List<String>, onPick: (String) -> Unit) {
    androidx.compose.foundation.layout.FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            androidx.compose.material3.SuggestionChip(
                onClick = { onPick(option) },
                label = { Text(option, style = MaterialTheme.typography.labelMedium) },
                shape = RoundedCornerShape(999.dp),
            )
        }
    }
}

/* ── "Done", said once, at the bottom of the screen ─────────────────── */

/**
 * The short confirmation after an action — "Sent to your manager", "No
 * connection". A result used to be written into the form on the screen, which
 * was off-screen for anything done from a dialog or a card further down.
 */
class Toaster(private val host: SnackbarHostState, private val scope: CoroutineScope) {
    fun show(message: String, tone: Tone = Tone.Positive) {
        scope.launch {
            host.currentSnackbarData?.dismiss()
            host.showSnackbar(ToastVisuals(message, tone))
        }
    }

    /** The usual pair from [runAction]: good news green, bad news red. */
    fun result(ok: Boolean, message: String?, fallbackOk: String, fallbackFailed: String) =
        show(message ?: if (ok) fallbackOk else fallbackFailed, if (ok) Tone.Positive else Tone.Danger)
}

private class ToastVisuals(override val message: String, val tone: Tone) : SnackbarVisuals {
    override val actionLabel: String? = null
    override val withDismissAction: Boolean = false
    override val duration: SnackbarDuration =
        if (tone == Tone.Danger || message.length > 80) SnackbarDuration.Long else SnackbarDuration.Short
}

val LocalToast = staticCompositionLocalOf<Toaster?> { null }

/** Where toasts appear — above the bottom bar, the width of the content. */
@Composable
fun AppSnackbarHost(host: SnackbarHostState, modifier: Modifier = Modifier) {
    SnackbarHost(host, modifier) { data -> Toast(data) }
}

@Composable
private fun Toast(data: SnackbarData) {
    val tone = (data.visuals as? ToastVisuals)?.tone ?: Tone.Info
    val accent = when (tone) {
        Tone.Danger -> Color(0xFFFF8A7A)
        Tone.Warning -> Color(0xFFF3C06B)
        Tone.Info -> Color(0xFF8CC8E3)
        Tone.Positive -> Color(0xFF7FD69A)
    }
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFF1E2329),
        contentColor = Color.White,
        shadowElevation = 10.dp,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp).fillMaxWidth(),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(defaultIcon(tone), contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(12.dp))
            Text(data.visuals.message, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            TextButton(onClick = { data.dismiss() }) { Text("OK", color = accent) }
        }
    }
}
