package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.LeadSummary
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.location.CurrentLocation
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.SectionLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * A customer, entered on the doorstep.
 *
 * THE DUPLICATE CHECK RUNS WHILE THEY TYPE
 * ----------------------------------------
 * A farmer visited in March and knocked on again in July is one person. Finding
 * that out AFTER the employee has filled a twelve-field form and walked away is
 * useless, so the phone number is checked against the book as the tenth digit
 * lands — and the answer is a name, not an error code.
 *
 * THE SCHEME IS CHOSEN HERE, AND ONLY HERE
 * ----------------------------------------
 * Registering somebody means saying which workflow they are entering. The list
 * comes down in the bootstrap from whatever the desk has configured — nothing
 * in this file knows a scheme's name — and a registration under a task cannot
 * continue without one, because a customer in no scheme has no next step for
 * anybody to follow up. Every later visit to this person is a follow-up task
 * that already carries the scheme and step; this is the one moment a choice is
 * asked of the employee.
 *
 * TWO WAYS OUT, BECAUSE OF SIGNAL
 * -------------------------------
 * Entered against a TASK, the details travel with the form and the server
 * creates the customer when the record arrives — so it works with no signal at
 * all, and it enters the approval queue rather than the book directly. Entered
 * on its own, the lead is created immediately, which needs a connection.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewLeadScreen(
    vm: AppViewModel,
    taskId: String?,
    onBack: () -> Unit,
    onContinueToForm: (taskId: String) -> Unit,
    onCreated: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { Repository.get(context) }
    val schemes = remember { vm.schemes() }

    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var village by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("farmer") }
    // Preselected only when there is exactly one — a choice with one option is
    // not a choice, and asking for it is a tap that teaches nothing.
    var schemeKey by remember { mutableStateOf(schemes.singleOrNull()?.key) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var duplicate by remember { mutableStateOf<LeadSummary?>(null) }

    // Debounced: a lookup per keystroke would be ten requests for one number,
    // and on a weak link that is ten chances to stall the keyboard.
    LaunchedEffect(phone) {
        duplicate = null
        val digits = phone.filter(Char::isDigit)
        if (digits.length != 10) return@LaunchedEffect
        delay(400)
        val result = withContext(Dispatchers.IO) { repo.lookupPhone(digits) }
        if (result is ApiResult.Ok) duplicate = result.value
    }

    fun leadJson(): JSONObject = JSONObject().apply {
        put("name", name.trim())
        put("phone", phone.filter(Char::isDigit))
        put("category", category)
        put("source", "field_visit")
        put("address", JSONObject().put("village", village.trim()))
        schemeKey?.let { key ->
            put("schemeKey", key)
            // For the form's header only; the server resolves the scheme by key.
            put("schemeName", schemes.firstOrNull { it.key == key }?.name ?: key)
        }
        taskId?.let { put("taskId", it) }
    }

    val underTask = taskId != null
    val needsScheme = underTask && schemes.isNotEmpty()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (underTask) "Register a customer" else "Add a lead") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            error?.let { Notice(title = "Not saved", body = it, severe = true) }

            duplicate?.let {
                Notice(
                    title = "${it.name} is already in the book",
                    body = "${it.code} · ${if (it.isCustomer) "already a customer" else it.stageKey.replace('_', ' ')}. " +
                        "Registering them again would split their history in two — go back and open the existing record instead.",
                    severe = true,
                )
            }

            Card {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = phone,
                    onValueChange = { if (it.length <= 10) phone = it.filter(Char::isDigit) },
                    label = { Text("Phone number") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    supportingText = { Text("Ten digits. Every callback and every verification uses this.") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = village,
                    onValueChange = { village = it },
                    label = { Text("Village") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                )
            }

            Card {
                SectionLabel("What they are")
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("farmer" to "Farmer", "dealer" to "Dealer", "other" to "Other").forEach { (id, label) ->
                        FilterChip(
                            selected = category == id,
                            onClick = { category = id },
                            label = { Text(label) },
                        )
                    }
                }
            }

            /* ── Which scheme ──────────────────────────────────── */

            if (underTask) {
                Card {
                    SectionLabel("Which scheme do they belong to?")
                    Spacer(Modifier.height(4.dp))
                    if (schemes.isEmpty()) {
                        Text(
                            "No schemes have been set up yet. They will go into the standard pipeline; " +
                                "the desk can move them later.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        Text(
                            "This decides the steps they go through from here. It is the one thing " +
                                "you choose — every visit after this already knows.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(6.dp))
                        schemes.forEach { scheme ->
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .selectable(
                                        selected = schemeKey == scheme.key,
                                        onClick = { schemeKey = scheme.key },
                                    )
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                RadioButton(selected = schemeKey == scheme.key, onClick = { schemeKey = scheme.key })
                                Column(Modifier.padding(start = 4.dp)) {
                                    Text(scheme.name, style = MaterialTheme.typography.titleSmall)
                                    val sub = buildString {
                                        append("${scheme.steps.size} step")
                                        if (scheme.steps.size != 1) append("s")
                                        scheme.steps.firstOrNull()?.let { append(" · starts at ").append(it.name) }
                                    }
                                    Text(
                                        sub,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Button(
                onClick = {
                    if (busy) return@Button
                    val digits = phone.filter(Char::isDigit)
                    if (name.isBlank() || digits.length != 10) {
                        error = "A name and a ten-digit phone number are needed."
                        return@Button
                    }
                    if (needsScheme && schemeKey == null) {
                        error = "Choose which scheme this customer belongs to."
                        return@Button
                    }
                    error = null

                    if (taskId != null) {
                        // Carried into the form. The server creates the customer
                        // and stores the visit in the same request, so a dead
                        // spot costs nothing.
                        NewLeadCarrier.put(leadJson())
                        onContinueToForm(taskId)
                        return@Button
                    }

                    busy = true
                    scope.launch {
                        val located = withContext(Dispatchers.IO) { CurrentLocation.get(context, 8_000) }
                        val payload = leadJson().apply {
                            located.fix?.let {
                                put("geo", JSONObject().put("lat", it.lat).put("lng", it.lng).put("accuracy", it.accuracy ?: 0.0))
                            }
                        }
                        when (val result = withContext(Dispatchers.IO) { repo.createLead(payload) }) {
                            is ApiResult.Ok -> { vm.refresh(); onCreated() }
                            is ApiResult.Offline -> error =
                                "No signal. A lead on its own has to reach the server — " +
                                    "add it against one of your tasks instead and it will be saved on the phone."
                            is ApiResult.Unauthorised -> error = "Your session expired. Sign in again."
                            is ApiResult.Failed -> error = result.message
                        }
                        busy = false
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().height(54.dp),
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text(if (underTask) "Continue to the form" else "Add lead", style = MaterialTheme.typography.labelLarge)
            }

            if (!underTask) {
                Text(
                    "Adding a lead on its own needs a connection. Against a task, it is saved on the phone " +
                        "and sent later.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
