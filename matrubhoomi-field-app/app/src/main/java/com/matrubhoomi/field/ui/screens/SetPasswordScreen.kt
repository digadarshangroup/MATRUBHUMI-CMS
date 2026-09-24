package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.R
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.BigButton
import com.matrubhoomi.field.ui.components.InlineProblem
import com.matrubhoomi.field.ui.components.PasswordField
import com.matrubhoomi.field.ui.components.runAction
import kotlinx.coroutines.launch

/**
 * The first thing after signing in with the password HR issued.
 *
 * That password is the employee's phone number — also their login id, and
 * printed on their ID card — so until they choose their own, anybody holding
 * the card could sign in as them and see their payslips. Nothing else in the
 * app opens until this is done; signing out is the only other way off it.
 */
@Composable
fun SetPasswordScreen(vm: AppViewModel) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()
    val remembered = vm.justTypedPassword
    var current by remember { mutableStateOf(remembered.orEmpty()) }
    var next by remember { mutableStateOf("") }
    var again by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    var done by remember { mutableStateOf(false) }

    val longEnough = next.length >= 6
    val notCurrent = next.isNotEmpty() && next != current
    val matches = next.isNotEmpty() && next == again
    val ready = current.isNotBlank() && longEnough && notCurrent && matches && !busy

    fun save() {
        if (!ready) return
        busy = true
        problem = null
        scope.launch {
            val (ok, message) = runAction { repo.changePassword(current, next) }
            busy = false
            if (ok) {
                done = true
                vm.passwordChosen()
            } else problem = message ?: "Not saved. Try again."
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 28.dp),
    ) {
        Box(
            Modifier.size(64.dp).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Image(painterResource(R.drawable.logo_mark), contentDescription = null, modifier = Modifier.size(44.dp))
        }
        Spacer(Modifier.height(20.dp))
        Text("Choose your own password", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            "You signed in with the password HR gave you — your phone number. Anyone who knows your number could sign in as you, " +
                "so pick one only you know. You'll use it from now on.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))

        if (remembered == null) {
            PasswordField(current, { current = it; problem = null }, "Current password", supporting = "The one you signed in with")
            Spacer(Modifier.height(12.dp))
        }
        PasswordField(next, { next = it; problem = null }, "New password")
        Spacer(Modifier.height(12.dp))
        PasswordField(
            again,
            { again = it; problem = null },
            "Type it again",
            isError = again.isNotEmpty() && !matches,
            imeAction = ImeAction.Done,
            onDone = { save() },
        )

        Spacer(Modifier.height(14.dp))
        Rule("At least 6 characters", longEnough)
        Rule("Not the password you have now", notCurrent)
        Rule("Both entries match", matches)

        problem?.let {
            Spacer(Modifier.height(14.dp))
            InlineProblem(it)
        }

        Spacer(Modifier.height(24.dp))
        BigButton(text = if (busy) "Saving…" else if (done) "Saved" else "Save my password", enabled = ready) { save() }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = { vm.signOut() }, modifier = Modifier.fillMaxWidth()) {
            Text("Sign out instead", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Rule(text: String, met: Boolean) {
    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(
            if (met) Icons.Outlined.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
            contentDescription = if (met) "Done" else "Not yet",
            tint = if (met) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = if (met) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
