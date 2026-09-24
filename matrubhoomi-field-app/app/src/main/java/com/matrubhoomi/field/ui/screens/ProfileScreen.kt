package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.longDate
import com.matrubhoomi.field.data.ContactDetails
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Avatar
import com.matrubhoomi.field.ui.components.BigOutlinedButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.KeyValue
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.rememberFetch
import com.matrubhoomi.field.ui.components.runAction
import kotlinx.coroutines.launch

/**
 * Who the office has you down as — and the few things you may change yourself.
 *
 * Name, department, designation, salary, bank and reporting line are HR's; this
 * screen shows them and says so. Contact details, blood group and the current
 * address are the employee's own, and are edited here. The server enforces the
 * same split — it ignores anything else a request tries to change.
 */
@Composable
fun ProfileScreen(vm: AppViewModel) {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()
    val state by vm.state.collectAsState()
    val p = state.profile

    val contact = rememberFetch("contact") { repo.contactDetails() }
    var editing by remember { mutableStateOf(false) }
    var changingPassword by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<Pair<Boolean, String>?>(null) }

    Scaffold(topBar = { ScreenBar("My profile") }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(2.dp))
            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(p.name.ifBlank { state.employeeName.ifBlank { "You" } }, size = 58.dp)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(p.name.ifBlank { state.employeeName }, style = MaterialTheme.typography.titleLarge)
                        Text(
                            listOf(p.designation, p.department).filter { it.isNotBlank() }.joinToString(" · "),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (p.code.isNotBlank()) {
                            Text("ID ${p.code}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            result?.let { (ok, text) -> Notice(title = if (ok) "Saved" else "Not saved", body = text, severe = !ok) }

            Card {
                SectionLabel("Work")
                Spacer(Modifier.height(4.dp))
                KeyValue("Reports to", p.manager?.name.orEmpty())
                KeyValue("Joined", if (p.joinedOn.isBlank()) "" else longDate(p.joinedOn))
                KeyValue("Employment", p.employmentType.replace('_', ' '))
                KeyValue("Sign-in phone", p.phone)
                if (p.workPhone.isNotBlank()) KeyValue("Work phone", p.workPhone)
                KeyValue("Work email", p.email)
                Spacer(Modifier.height(6.dp))
                Text(
                    "These are kept by HR. If something is wrong, tell HR.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SectionLabel("Personal", Modifier.weight(1f))
                    if (contact.data != null) {
                        TextButton(onClick = { editing = true }) { Text("Edit") }
                    }
                }
                val c = contact.data
                when {
                    contact.loading && c == null -> LoadingBlock()
                    contact.problem != null && c == null ->
                        Text(contact.problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    c != null -> {
                        KeyValue("Other phone", c.alternatePhone)
                        KeyValue("Personal email", c.personalEmail)
                        KeyValue("Blood group", c.bloodGroup)
                        KeyValue("Date of birth", if (c.dateOfBirth.isBlank()) "" else longDate(c.dateOfBirth))
                        KeyValue("Address", listOf(c.street, c.city, c.state, c.pincode).filter { it.isNotBlank() }.joinToString(", "))
                        if (c.maskedAccount.isNotBlank()) {
                            KeyValue("Salary account", listOf(c.bankName, c.maskedAccount).filter { it.isNotBlank() }.joinToString(" "))
                        }
                    }
                }
            }

            BigOutlinedButton("Change password", modifier = Modifier.fillMaxWidth(), icon = Icons.Outlined.Lock) { changingPassword = true }
            Spacer(Modifier.height(16.dp))
        }
    }

    val toast = com.matrubhoomi.field.ui.components.LocalToast.current
    if (editing) {
        contact.data?.let { c ->
            EditContactDialog(
                initial = c,
                onDismiss = { editing = false },
                save = { alt, email, blood, street, city, st, pin ->
                    runAction { repo.updateContact(alt, email, blood, street, city, st, pin) }
                },
                onSaved = {
                    toast?.show("Your details are updated.")
                    contact.reload()
                },
            )
        }
    }

    if (changingPassword) {
        PasswordDialog(
            onDismiss = { changingPassword = false },
            save = { current, next -> runAction { repo.changePassword(current, next) } },
            onSaved = { toast?.show("Password changed. Use the new one next time you sign in.") },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EditContactDialog(
    initial: ContactDetails,
    onDismiss: () -> Unit,
    save: suspend (String, String, String, String, String, String, String) -> Pair<Boolean, String?>,
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    var alt by remember { mutableStateOf(initial.alternatePhone) }
    var email by remember { mutableStateOf(initial.personalEmail) }
    var blood by remember { mutableStateOf(initial.bloodGroup) }
    var street by remember { mutableStateOf(initial.street) }
    var city by remember { mutableStateOf(initial.city) }
    var st by remember { mutableStateOf(initial.state) }
    var pin by remember { mutableStateOf(initial.pincode) }

    val phoneOk = alt.isBlank() || alt.filter { it.isDigit() }.length == 10
    val emailOk = email.isBlank() || Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(email.trim())
    val pinOk = pin.isBlank() || Regex("^\\d{6}$").matches(pin.trim())

    com.matrubhoomi.field.ui.components.AppDialog(
        title = "Your details",
        message = "How HR can reach you, and where you live. Your name, job and bank details are changed by HR.",
        icon = Icons.Outlined.Edit,
        confirmLabel = "Save",
        confirmEnabled = phoneOk && emailOk && pinOk,
        busy = busy,
        error = problem,
        onDismiss = onDismiss,
        onConfirm = {
            busy = true
            problem = null
            scope.launch {
                val (ok, message) = save(alt, email.trim().lowercase(), blood, street.trim(), city.trim(), st.trim(), pin.trim())
                busy = false
                if (ok) { onSaved(); onDismiss() } else problem = message ?: "Not saved."
            }
        },
    ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = alt, onValueChange = { alt = it.filter { ch -> ch.isDigit() }.take(10) },
                    label = { Text("Other phone") }, singleLine = true, isError = !phoneOk,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = email, onValueChange = { email = it.trim() },
                    label = { Text("Personal email") }, singleLine = true, isError = !emailOk,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Blood group", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-").forEach { g ->
                        FilterChip(selected = blood == g, onClick = { blood = if (blood == g) "" else g }, label = { Text(g) })
                    }
                }
                OutlinedTextField(value = street, onValueChange = { street = it.take(200) }, label = { Text("House, street") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = city, onValueChange = { city = it.take(80) }, label = { Text("Village / town") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = st, onValueChange = { st = it.take(80) }, label = { Text("State") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    value = pin, onValueChange = { pin = it.filter { ch -> ch.isDigit() }.take(6) },
                    label = { Text("PIN code") }, singleLine = true, isError = !pinOk,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
    }
}

@Composable
private fun PasswordDialog(
    onDismiss: () -> Unit,
    save: suspend (String, String) -> Pair<Boolean, String?>,
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var again by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val longEnough = next.length >= 6
    val matches = next == again
    com.matrubhoomi.field.ui.components.AppDialog(
        title = "Change password",
        message = "You'll use the new one the next time you sign in, here and on the portal.",
        icon = Icons.Outlined.Lock,
        confirmLabel = "Change password",
        confirmEnabled = current.isNotEmpty() && longEnough && matches && next != current,
        busy = busy,
        error = problem,
        onDismiss = onDismiss,
        onConfirm = {
            busy = true
            problem = null
            scope.launch {
                val (ok, message) = save(current, next)
                busy = false
                // A wrong current password is shown HERE — the server answers
                // it with a 400 now, so it can no longer end the session.
                if (ok) { onSaved(); onDismiss() } else problem = message ?: "Not changed."
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            com.matrubhoomi.field.ui.components.PasswordField(current, { current = it; problem = null }, "Current password")
            com.matrubhoomi.field.ui.components.PasswordField(
                next, { next = it; problem = null }, "New password",
                isError = next.isNotEmpty() && !longEnough,
                supporting = "At least 6 characters, and not your phone number",
            )
            com.matrubhoomi.field.ui.components.PasswordField(
                again, { again = it; problem = null }, "New password again",
                isError = again.isNotEmpty() && !matches,
                supporting = if (again.isNotEmpty() && !matches) "The two do not match" else null,
                imeAction = androidx.compose.ui.text.input.ImeAction.Done,
            )
        }
    }
}
