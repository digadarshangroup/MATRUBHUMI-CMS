package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.LockReset
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.BuildConfig
import com.matrubhoomi.field.R
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.AppDialog
import com.matrubhoomi.field.ui.components.InlineProblem
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.PasswordField
import com.matrubhoomi.field.ui.components.Tone

/**
 * The way in, for the whole workforce — the same phone number and password as
 * the employee portal.
 *
 * It needs a connection and says so, plainly, because the alternative is an
 * employee in a dead spot concluding the app is broken. And when the SERVER
 * ended the last session — HR deactivated the account, say — it says why,
 * rather than dropping somebody back here with no explanation.
 */
@Composable
fun LoginScreen(vm: AppViewModel, onSignedIn: () -> Unit) {
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var showServer by remember { mutableStateOf(false) }
    var showForgot by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val prefs = remember { Prefs.get(context) }
    var server by remember { mutableStateOf(prefs.serverUrl.orEmpty()) }
    // Why the last session ended, when it was the server that ended it. Read
    // once: it is cleared by the next successful sign-in.
    val endedBecause = remember { prefs.signedOutReason.ifBlank { null } }
    val canSubmit = !busy && phone.length == 10 && password.isNotBlank()

    fun submit() {
        if (!canSubmit) return
        busy = true
        error = null
        vm.signIn(phone, password) { failure ->
            busy = false
            if (failure == null) onSignedIn() else error = failure
        }
    }

    val brand = MaterialTheme.colorScheme.primary
    val view = androidx.compose.ui.platform.LocalView.current
    androidx.compose.runtime.DisposableEffect(Unit) {
        val window = (view.context as? android.app.Activity)?.window
        val controller = window?.let { androidx.core.view.WindowCompat.getInsetsController(it, view) }
        controller?.isAppearanceLightStatusBars = false
        onDispose { controller?.isAppearanceLightStatusBars = true }
    }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .verticalScroll(rememberScrollState()),
    ) {
        /* ── The masthead ─────────────────────────────────────── */
        Box(
            Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(listOf(brand, Color(0xFF14471F))),
                    RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp),
                )
                .statusBarsPadding()
                .padding(start = 24.dp, end = 24.dp, top = 28.dp, bottom = 56.dp),
        ) {
            Column {
                // The emblem, on white, at a size where the brickwork, the
                // leaves and the water are still legible.
                Surface(shape = CircleShape, color = Color.White, shadowElevation = 6.dp, modifier = Modifier.size(84.dp)) {
                    Box(contentAlignment = Alignment.Center) {
                        Image(
                            painter = painterResource(R.drawable.logo_mark),
                            contentDescription = "Matrubhoomi Farms and Developers",
                            modifier = Modifier.size(64.dp),
                        )
                    }
                }
                Spacer(Modifier.height(18.dp))
                Text("Matrubhoomi", style = MaterialTheme.typography.headlineMedium, color = Color.White, fontWeight = FontWeight.Medium)
                Text("Employee app", style = MaterialTheme.typography.titleMedium, color = Color.White.copy(alpha = 0.85f))
            }
        }

        /* ── The form, on a card lifted over the masthead ───── */
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 8.dp,
            modifier = Modifier
                .padding(horizontal = 16.dp)
                .offset(y = (-32).dp)
                .fillMaxWidth(),
        ) {
            Column(Modifier.padding(20.dp)) {
                Text("Sign in", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Medium)
                Text(
                    "With the same phone number and password as the employee portal.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                if (endedBecause != null && error == null) {
                    Spacer(Modifier.height(14.dp))
                    Notice(title = "You were signed out", body = endedBecause, severe = true)
                }

                Spacer(Modifier.height(18.dp))
                OutlinedTextField(
                    value = phone,
                    // Capped and filtered at the source. The server looks an
                    // employee up BY phone and refuses anything that is not ten
                    // digits before it ever reaches the password — so a stray
                    // space here reads back as "invalid phone number or
                    // password", which sends somebody hunting the wrong problem.
                    onValueChange = { v ->
                        var digits = v.filter(Char::isDigit)
                        // A pasted "+91 90000 00006" or "090000 00006" is still the number.
                        if (digits.length > 10 && digits.startsWith("91")) digits = digits.drop(2)
                        if (digits.length > 10 && digits.startsWith("0")) digits = digits.drop(1)
                        // Anything past ten digits is refused, not shifted in — an
                        // eleventh digit used to push the first one out of sight.
                        phone = digits.take(10)
                        error = null
                    },
                    label = { Text("Phone number") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    leadingIcon = { Icon(Icons.Outlined.Phone, contentDescription = null) },
                    prefix = { Text("+91 ", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    supportingText = { Text("The ten-digit number HR has on file for you") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
                )
                Spacer(Modifier.height(6.dp))
                PasswordField(
                    value = password,
                    onChange = { password = it; error = null },
                    label = "Password",
                    imeAction = ImeAction.Done,
                    onDone = { submit() },
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.End) {
                    TextButton(onClick = { showForgot = true }) { Text("Forgot password?") }
                }

                error?.let {
                    InlineProblem(it)
                    Spacer(Modifier.height(12.dp))
                }

                Button(
                    onClick = { submit() },
                    enabled = canSubmit,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                ) {
                    if (busy) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                        Spacer(Modifier.width(10.dp))
                        Text("Signing in…", style = MaterialTheme.typography.labelLarge)
                    } else {
                        Text("Sign in", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }

        Column(Modifier.padding(horizontal = 24.dp).offset(y = (-16).dp)) {
            Text(
                "Signing in needs a connection. After that, most of the app works without one — " +
                    "anything you record is saved on this phone and sent when signal returns.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))

            // The server address, folded away. It belongs HERE and not only in
            // settings: the one moment it is needed is when sign-in fails on a
            // handset that has never signed in, and everything behind this
            // screen is unreachable then.
            TextButton(onClick = { showServer = !showServer }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                Icon(Icons.Outlined.Dns, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(if (showServer) "Hide server address" else "Cannot connect? Set the server address", style = MaterialTheme.typography.bodySmall)
            }
            if (showServer) {
                OutlinedTextField(
                    value = server,
                    onValueChange = { server = it },
                    label = { Text("Server address") },
                    placeholder = { Text(BuildConfig.API_URL) },
                    supportingText = { Text("Leave blank to use ${BuildConfig.API_URL}") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        prefs.serverUrl = server.ifBlank { null }
                        error = null
                        showServer = false
                    },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Use this address") }
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "Version ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
            Spacer(Modifier.height(16.dp))
        }
    }
    // A strip the colour of the masthead behind the status bar: with the
    // keyboard open on a small phone the page scrolls up, and "Matrubhoomi"
    // was drawn straight through the clock.
    Spacer(
        Modifier
            .fillMaxWidth()
            .windowInsetsTopHeight(WindowInsets.statusBars)
            .background(brand),
    )
    }

    if (showForgot) {
        AppDialog(
            title = "Forgot your password?",
            message = "HR can reset it for you. After a reset your password is your 10-digit phone number, " +
                "and the app will ask you to choose a new one as soon as you sign in.",
            icon = Icons.Outlined.LockReset,
            tone = Tone.Info,
            confirmLabel = "Got it",
            onConfirm = { showForgot = false },
            onDismiss = { showForgot = false },
            dismissLabel = null,
        )
    }
}
