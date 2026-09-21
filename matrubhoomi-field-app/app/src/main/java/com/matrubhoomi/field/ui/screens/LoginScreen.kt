package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Notice

/**
 * The only screen that needs a connection.
 *
 * It says so, plainly, because the alternative is an employee in a dead spot
 * concluding the app is broken. Everything after this point works offline.
 */
@Composable
fun LoginScreen(vm: AppViewModel, onSignedIn: () -> Unit) {
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var showServer by remember { mutableStateOf(false) }

    val context = androidx.compose.ui.platform.LocalContext.current
    val prefs = remember { com.matrubhoomi.field.core.Prefs.get(context) }
    var server by remember { mutableStateOf(prefs.serverUrl.orEmpty()) }

    fun submit() {
        if (phone.length != 10 || password.isBlank()) return
        busy = true
        error = null
        vm.signIn(phone, password) { failure ->
            busy = false
            if (failure == null) onSignedIn() else error = failure
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.Start,
    ) {
        // The emblem, at a size where the brickwork, the leaves and the water
        // are actually legible. This is the one screen with room for it — the
        // launcher icon and the top bars get the same artwork at sizes where
        // only its silhouette and colour survive.
        androidx.compose.foundation.Image(
            painter = androidx.compose.ui.res.painterResource(com.matrubhoomi.field.R.drawable.logo_mark),
            contentDescription = "Matrubhoomi Farms and Developers",
            modifier = Modifier.size(96.dp),
        )

        Spacer(Modifier.height(16.dp))

        Text("Matrubhoomi", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Field sales",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Sign in with the same details you use for the employee portal.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(28.dp))

        OutlinedTextField(
            value = phone,
            // Capped and filtered at the source. The server looks an employee
            // up BY phone and refuses anything that is not ten digits before it
            // ever reaches the password — so a stray space here reads back as
            // "invalid phone number or password", which sends somebody hunting
            // for the wrong problem.
            onValueChange = { if (it.length <= 10) phone = it.filter(Char::isDigit) },
            label = { Text("Phone number") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            supportingText = { Text("The ten-digit number HR has on file for you.") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Phone,
                imeAction = ImeAction.Next,
            ),
        )

        Spacer(Modifier.height(14.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
        )

        if (error != null) {
            Spacer(Modifier.height(16.dp))
            Notice(title = "Could not sign in", body = error!!, severe = true)
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = { submit() },
            enabled = !busy && phone.length == 10 && password.isNotBlank(),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
        ) {
            if (busy) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
            else Text("Sign in", style = MaterialTheme.typography.labelLarge)
        }

        Spacer(Modifier.height(16.dp))
        Text(
            "Signing in needs a connection. After that, the app works without one — " +
                "your visits are saved on this phone and sent when signal returns.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(20.dp))

        // The server address, folded away.
        //
        // It belongs HERE and not only in settings, because the one moment it
        // is needed is when sign-in fails on a handset that has never signed in
        // — and everything behind the sign-in screen is unreachable then. Kept
        // collapsed so it is not the first thing a field employee reads.
        androidx.compose.material3.TextButton(onClick = { showServer = !showServer }) {
            Text(
                if (showServer) "Hide server address" else "Cannot connect? Set the server address",
                style = MaterialTheme.typography.bodySmall,
            )
        }

        if (showServer) {
            OutlinedTextField(
                value = server,
                onValueChange = { server = it },
                label = { Text("Server address") },
                placeholder = { Text(com.matrubhoomi.field.BuildConfig.API_URL) },
                supportingText = {
                    Text("Leave blank to use ${com.matrubhoomi.field.BuildConfig.API_URL}")
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            androidx.compose.material3.OutlinedButton(
                onClick = {
                    prefs.serverUrl = server.ifBlank { null }
                    error = null
                    showServer = false
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Use this address") }
        }
    }
}
