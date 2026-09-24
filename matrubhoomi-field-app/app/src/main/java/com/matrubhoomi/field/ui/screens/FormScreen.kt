package com.matrubhoomi.field.ui.screens

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.material.icons.outlined.Sms
import androidx.compose.foundation.border
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.FormField
import com.matrubhoomi.field.data.LocationFix
import com.matrubhoomi.field.data.PendingPhoto
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.location.CurrentLocation
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.SectionLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The form the desk designed, rendered on a phone.
 *
 * THE APP KNOWS FIELD TYPES. IT KNOWS NOTHING ABOUT THIS COMPANY'S QUESTIONS.
 * -------------------------------------------------------------------------
 * Everything below switches on `field.type` and never on a field's meaning. A
 * new question about soil pH is a row in a template on the web side and needs no
 * change here — which is the entire justification for forms being data (see
 * SalesFormTemplate's header).
 *
 * VALIDATION HAPPENS TWICE, AND THAT IS NOT DUPLICATION
 * -----------------------------------------------------
 * Here, so the employee gets a clear message at the point of typing rather than
 * after a round trip. And on the server, because an app build is a copy of the
 * rules running on a device somebody else owns. If the two ever disagree, the
 * server wins and the app is wrong.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormScreen(
    vm: AppViewModel,
    taskId: String,
    leadId: String?,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { Repository.get(context) }

    val task = vm.task(taskId)
    val template = task?.let { vm.templateFor(it) }
    val newLead = remember { NewLeadCarrier.take() }

    // The name at the top has to be somebody: an existing target, or the farmer
    // just entered on the previous screen.
    val subjectName = remember(leadId, newLead) {
        newLead?.optString("name")
            ?: task?.targets?.firstOrNull { it.leadId == leadId }?.name
            ?: "Visit"
    }
    val subjectPhone = remember(leadId, newLead) {
        newLead?.optString("phone")
            ?: task?.targets?.firstOrNull { it.leadId == leadId }?.phone
            ?: ""
    }

    val values = remember { mutableStateMapOf<String, Any?>() }
    val photos = remember { mutableStateListOf<PendingPhoto>() }
    var outcome by remember { mutableStateOf("progressed") }
    var note by remember { mutableStateOf("") }
    var errors by remember { mutableStateOf<List<String>>(emptyList()) }
    var saving by remember { mutableStateOf(false) }

    var otpId by remember { mutableStateOf<String?>(null) }
    var otpVerified by remember { mutableStateOf(false) }
    var showOtp by remember { mutableStateOf(false) }

    var locationNote by remember { mutableStateOf<String?>(null) }

    // The camera writes to a file this screen owns; the launcher only reports
    // success. `pendingCapture` is what it wrote to and which field asked for it.
    var pendingCapture by remember { mutableStateOf<Pair<File, String>?>(null) }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val capture = pendingCapture
        pendingCapture = null
        if (ok && capture != null && capture.first.exists()) {
            scope.launch {
                val fix = withContext(Dispatchers.IO) { CurrentLocation.get(context, 6_000) }.fix
                photos.add(
                    PendingPhoto(
                        file = capture.first,
                        fieldKey = capture.second,
                        lat = fix?.lat,
                        lng = fix?.lng,
                    ),
                )
            }
        } else {
            // Cancelled, or the camera app died. The empty file it left behind
            // would otherwise sit in the cache forever.
            capture?.first?.delete()
        }
    }

    fun capture(fieldKey: String) {
        val dir = File(context.cacheDir, "photos").apply { mkdirs() }
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val file = File(dir, "field_${stamp}_$fieldKey.jpg")
        pendingCapture = file to fieldKey
        cameraLauncher.launch(
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file),
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(subjectName, maxLines = 1, style = MaterialTheme.typography.titleLarge)
                        Text(
                            template?.name ?: "Form",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->

        if (task == null || template == null) {
            Column(Modifier.padding(padding).padding(16.dp)) {
                Notice(
                    title = "This form is not available",
                    body = "The task or its form is no longer on this phone. Refresh on the home screen when you have signal.",
                    severe = true,
                )
            }
            return@Scaffold
        }

        val visibleFields = template.fields.filter { it.isVisible(values) }

        LazyColumn(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item { Spacer(Modifier.height(4.dp)) }

            /* ── Who, and which step ───────────────────────────── */
            //
            // Told, never asked. A follow-up already knows the customer, the
            // scheme and the step from the task; a registration knows who is
            // being registered and into which scheme. The employee picks none
            // of it here, which is the whole point.
            item {
                Card {
                    Text(subjectName, style = MaterialTheme.typography.titleLarge)
                    val schemeLine = newLead?.optString("schemeName").orEmpty().ifBlank { task.schemeName }
                    val stepLine = if (newLead != null) "New customer registration" else vm.stageName(task)
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (schemeLine.isNotBlank()) Chip(schemeLine)
                        Chip(stepLine, MaterialTheme.colorScheme.primary)
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "${template.name}" + (task.templateVersion?.let { " · version $it" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val rework = task.targets.firstOrNull { it.leadId == leadId && it.isRework }
                    if (rework != null && rework.rejectionNote.isNotBlank()) {
                        Spacer(Modifier.height(10.dp))
                        Notice(title = "Sent back by the desk", body = rework.rejectionNote, severe = true)
                    }
                }
            }

            if (errors.isNotEmpty()) {
                item {
                    Notice(
                        title = "Not saved yet",
                        body = errors.joinToString("\n"),
                        severe = true,
                    )
                }
            }

            /* ── What happened, first ──────────────────────────── */
            //
            // Before the questions, because "nobody was home" makes every
            // question below irrelevant — and an employee who has to scroll
            // past twelve fields to say so will invent answers instead.
            item {
                Card {
                    SectionLabel("What happened")
                    Spacer(Modifier.height(10.dp))
                    com.matrubhoomi.field.ui.components.ChipFlow {
                        OUTCOMES.forEach { (id, label) ->
                            FilterChip(
                                selected = outcome == id,
                                onClick = { outcome = id },
                                label = { Text(label) },
                            )
                        }
                    }
                    if (outcome != "progressed") {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Recorded as it happened. The questions below become optional.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            /* ── OTP ───────────────────────────────────────────── */

            if (task.requireOtp && outcome == "progressed") {
                item {
                    Card {
                        SectionLabel("Customer's phone")
                        Spacer(Modifier.height(6.dp))
                        if (otpVerified) {
                            Chip("verified", MaterialTheme.colorScheme.primary)
                        } else {
                            Text(
                                "A code has to be sent to $subjectPhone and read back before this can be saved.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(10.dp))
                            OutlinedButton(
                                onClick = { showOtp = true },
                                enabled = subjectPhone.isNotBlank(),
                                modifier = Modifier.fillMaxWidth().height(46.dp),
                            ) {
                                Text("Verify the number")
                            }
                        }
                    }
                }
            }

            /* ── The questions ─────────────────────────────────── */

            items(visibleFields.size) { index ->
                val field = visibleFields[index]
                FieldEditor(
                    field = field,
                    value = values[field.key],
                    photos = photos.filter { it.fieldKey == field.key },
                    onValue = { values[field.key] = it },
                    onCapture = { capture(field.key) },
                    onRemovePhoto = { photo -> photos.remove(photo); photo.file.delete() },
                )
            }

            item {
                Card {
                    SectionLabel("Anything else")
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        placeholder = { Text("Notes for the sales desk") },
                    )
                }
            }

            if (locationNote != null) {
                item { Notice(title = "Location", body = locationNote!!, severe = true) }
            }

            /* ── Save ──────────────────────────────────────────── */

            item {
                Button(
                    onClick = {
                        if (saving) return@Button
                        val problems = validate(template.fields, values, photos, task.requirePhoto, outcome)
                        val needsOtp = task.requireOtp && outcome == "progressed" && !otpVerified
                        errors = problems + if (needsOtp) listOf("The customer's phone has to be verified first") else emptyList()
                        if (errors.isNotEmpty()) return@Button

                        saving = true
                        scope.launch {
                            val located = withContext(Dispatchers.IO) { CurrentLocation.get(context) }

                            if (located.fix == null && task.requireLocation && outcome == "progressed") {
                                locationNote = located.reason ?: "A location fix is required for this form."
                                saving = false
                                return@launch
                            }

                            withContext(Dispatchers.IO) {
                                repo.queueSubmission(
                                    task = task,
                                    leadId = leadId,
                                    newLead = newLead,
                                    template = template,
                                    values = values.toJson(),
                                    photos = photos.toList(),
                                    location = located.fix,
                                    otpId = otpId.takeIf { otpVerified },
                                    outcome = outcome,
                                    note = note,
                                )
                            }
                            vm.refreshCounts()
                            saving = false
                            onDone()
                        }
                    },
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                ) {
                    if (saving) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Text("Save this visit", style = MaterialTheme.typography.labelLarge)
                }
            }

            item {
                Text(
                    "Saved on this phone straight away, and sent on its own when there is signal. " +
                        "The sales desk then reviews it — the step counts as done once they approve, " +
                        "not before. You do not have to wait here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            item { Spacer(Modifier.height(32.dp)) }
        }
    }

    if (showOtp) {
        OtpDialog(
            phone = subjectPhone,
            leadId = leadId,
            taskId = taskId,
            onDismiss = { showOtp = false },
            onVerified = { id ->
                otpId = id
                otpVerified = true
                showOtp = false
            },
        )
    }
}

/* ------------------------------------------------------------------ */
/* One field                                                           */
/* ------------------------------------------------------------------ */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FieldEditor(
    field: FormField,
    value: Any?,
    photos: List<PendingPhoto>,
    onValue: (Any?) -> Unit,
    onCapture: () -> Unit,
    onRemovePhoto: (PendingPhoto) -> Unit,
) {
    if (field.type == "heading") {
        SectionLabel(field.label, Modifier.padding(top = 10.dp))
        return
    }

    Card {
        Row {
            Text(field.label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            if (field.required) {
                Text(
                    "required",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (field.helpText.isNotBlank()) {
            Text(
                field.helpText,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(10.dp))

        when (field.type) {
            "textarea" -> OutlinedTextField(
                value = value?.toString().orEmpty(),
                onValueChange = onValue,
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                placeholder = { Text(field.placeholder) },
            )

            "number", "currency", "area" -> Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = value?.toString().orEmpty(),
                    onValueChange = onValue,
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                    placeholder = { Text(field.placeholder.ifBlank { "0" }) },
                )
                if (field.type == "area" && field.unit.isNotBlank()) {
                    Spacer(Modifier.size(10.dp))
                    Text(field.unit, style = MaterialTheme.typography.bodyMedium)
                }
            }

            "phone" -> OutlinedTextField(
                value = value?.toString().orEmpty(),
                onValueChange = onValue,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
            )

            "email" -> OutlinedTextField(
                value = value?.toString().orEmpty(),
                onValueChange = onValue,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            )

            "checkbox" -> Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = value == true, onCheckedChange = onValue)
                Spacer(Modifier.size(6.dp))
                Text(if (value == true) "Yes" else "No", style = MaterialTheme.typography.bodyMedium)
            }

            "select", "radio" -> Column {
                // Rendered the same way whichever the desk chose: on a phone in
                // sunlight a dropdown is a worse control than a list of large
                // tappable rows, and there are rarely more than six choices.
                field.options.forEach { option ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = value == option.value,
                                onClick = { onValue(option.value) },
                            )
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = value == option.value, onClick = { onValue(option.value) })
                        Spacer(Modifier.size(8.dp))
                        Text(option.label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }

            "multiselect" -> Column {
                @Suppress("UNCHECKED_CAST")
                val chosen = (value as? List<String>).orEmpty()
                field.options.forEach { option ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable {
                                onValue(if (option.value in chosen) chosen - option.value else chosen + option.value)
                            }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = option.value in chosen,
                            onCheckedChange = {
                                onValue(if (option.value in chosen) chosen - option.value else chosen + option.value)
                            },
                        )
                        Spacer(Modifier.size(8.dp))
                        Text(option.label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }

            "rating" -> com.matrubhoomi.field.ui.components.ChipFlow {
                val current = (value as? String)?.toIntOrNull() ?: (value as? Int) ?: 0
                (1..5).forEach { n ->
                    FilterChip(
                        selected = current == n,
                        onClick = { onValue(n) },
                        label = { Text("$n") },
                    )
                }
            }

            "photo" -> Column {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    photos.forEach { photo ->
                        Box {
                            PhotoThumb(photo.file)
                            IconButton(
                                onClick = { onRemovePhoto(photo) },
                                modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
                            ) {
                                Icon(Icons.Default.Close, contentDescription = "Remove photo")
                            }
                        }
                    }
                }
                if (photos.isNotEmpty()) Spacer(Modifier.height(10.dp))
                if (photos.size < field.maxPhotos) {
                    OutlinedButton(onClick = onCapture, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null)
                        Spacer(Modifier.size(8.dp))
                        Text(if (photos.isEmpty()) "Take a photo" else "Take another")
                    }
                }
                if (field.cameraOnly) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Taken here, not chosen from the gallery.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            "date", "time" -> OutlinedTextField(
                value = value?.toString().orEmpty(),
                onValueChange = onValue,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(if (field.type == "date") "DD/MM/YYYY" else "HH:MM") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
            )

            else -> OutlinedTextField(
                value = value?.toString().orEmpty(),
                onValueChange = onValue,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text(field.placeholder) },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
        }
    }
}

/**
 * A thumbnail decoded at a size that fits a thumbnail.
 *
 * A modern phone camera returns a 12-megapixel JPEG; decoding four of those at
 * full size to draw them 88dp wide is around 200MB of bitmap and an
 * OutOfMemoryError on the cheap handsets this runs on.
 */
@Composable
private fun PhotoThumb(file: File) {
    val bitmap = remember(file.absolutePath) {
        runCatching {
            val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            android.graphics.BitmapFactory.decodeFile(file.absolutePath, bounds)
            val options = android.graphics.BitmapFactory.Options().apply {
                inSampleSize = (bounds.outWidth / 300).coerceAtLeast(1)
            }
            android.graphics.BitmapFactory.decodeFile(file.absolutePath, options)
        }.getOrNull()
    }

    Box(
        Modifier
            .size(88.dp)
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp)),
    ) {
        bitmap?.let {
            androidx.compose.foundation.Image(
                bitmap = it.asImageBitmap(),
                contentDescription = "Photograph taken for this form",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/* ------------------------------------------------------------------ */
/* OTP                                                                 */
/* ------------------------------------------------------------------ */

@Composable
private fun OtpDialog(
    phone: String,
    leadId: String?,
    taskId: String?,
    onDismiss: () -> Unit,
    onVerified: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repo = remember { Repository.get(context) }

    var otpId by remember { mutableStateOf<String?>(null) }
    var manualCode by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    // Sent as the dialog opens: the farmer is standing there, and a second tap
    // to start something they are already waiting for is a wasted second.
    LaunchedEffect(phone) {
        busy = true
        when (val result = withContext(Dispatchers.IO) { repo.sendOtp(phone, leadId, taskId) }) {
            is ApiResult.Ok -> {
                otpId = result.value.optString("otpId")
                // Present ONLY when no SMS provider is configured or delivery
                // failed — the server hands the code back for the employee to
                // read out, and says so rather than pretending it was sent.
                manualCode = result.value.optString("manualCode").ifBlank { null }
            }
            is ApiResult.Offline -> message = "No signal. The code cannot be sent from here — record the visit without it, or move and try again."
            is ApiResult.Unauthorised -> message = "Your session expired. Sign in again."
            is ApiResult.Failed -> message = result.message
        }
        busy = false
    }

    fun verify() {
        if (busy || code.length != 4 || otpId == null) return
        busy = true
        message = null
        scope.launch {
            when (val result = withContext(Dispatchers.IO) { repo.verifyOtp(otpId!!, phone, code, leadId) }) {
                is ApiResult.Ok -> onVerified(otpId!!)
                is ApiResult.Offline -> message = "No signal — the code cannot be checked from here."
                is ApiResult.Unauthorised -> message = "Your session expired."
                is ApiResult.Failed -> message = result.message
            }
            busy = false
        }
    }

    com.matrubhoomi.field.ui.components.AppDialog(
        title = "Verify the customer",
        message = "A code was sent to $phone. Ask for the four digits they received.",
        icon = androidx.compose.material.icons.Icons.Outlined.Sms,
        tone = com.matrubhoomi.field.ui.components.Tone.Positive,
        confirmLabel = "Verify",
        confirmEnabled = code.length == 4 && otpId != null,
        busy = busy,
        error = message,
        onDismiss = onDismiss,
        onConfirm = { verify() },
    ) {
        manualCode?.let {
            Notice(
                title = "Read this code out: $it",
                body = "No SMS could be delivered, so the customer has not received it. " +
                    "Read it to them and have them tell it back — the record will show it was verified this way.",
            )
            Spacer(Modifier.height(12.dp))
        }
        OtpBoxes(code = code, onChange = { code = it; message = null }, onComplete = { verify() })
        if (otpId == null && busy) {
            Spacer(Modifier.height(10.dp))
            Text(
                "Sending the code…",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }
}

/**
 * Four digit boxes over one hidden text field — the shape an OTP has on every
 * other app the customer and the employee use, and it shows a missing digit at
 * a glance. The keyboard is the number pad; the fourth digit verifies.
 */
@Composable
private fun OtpBoxes(code: String, onChange: (String) -> Unit, onComplete: () -> Unit) {
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    androidx.compose.foundation.text.BasicTextField(
        value = code,
        onValueChange = { v ->
            val digits = v.filter(Char::isDigit).take(4)
            onChange(digits)
            if (digits.length == 4) onComplete()
        },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth().focusRequester(focus),
        decorationBox = {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally)) {
                repeat(4) { i ->
                    val ch = code.getOrNull(i)?.toString().orEmpty()
                    val active = i == code.length
                    androidx.compose.foundation.layout.Box(
                        Modifier
                            .size(width = 54.dp, height = 60.dp)
                            .border(
                                width = if (active) 2.dp else 1.dp,
                                color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                                shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(ch, style = MaterialTheme.typography.headlineSmall)
                    }
                }
            }
        },
    )
}

/* ------------------------------------------------------------------ */
/* Plumbing                                                            */
/* ------------------------------------------------------------------ */

private val OUTCOMES = listOf(
    "progressed" to "Went ahead",
    "not_interested" to "Not interested",
    "unreachable" to "Not available",
    "reschedule" to "Come back later",
)

/** Conditional fields, evaluated the same way the server does. */
private fun FormField.isVisible(values: Map<String, Any?>): Boolean {
    val dependsOn = showWhenField ?: return true
    val actual = values[dependsOn]?.toString()
    return actual != null && actual == showWhenEquals
}

private fun validate(
    fields: List<FormField>,
    values: Map<String, Any?>,
    photos: List<PendingPhoto>,
    taskRequiresPhoto: Boolean,
    outcome: String,
): List<String> {
    // A visit that did not happen cannot answer questions about it. The server
    // applies the same exemption — see `progressing` in recordSubmission().
    if (outcome != "progressed") return emptyList()

    val problems = mutableListOf<String>()

    fields.filter { it.isVisible(values) }.forEach { field ->
        if (field.type == "heading") return@forEach

        if (field.type == "photo") {
            val count = photos.count { it.fieldKey == field.key }
            if (field.required && count == 0) problems.add("${field.label} needs a photo")
            return@forEach
        }

        val raw = values[field.key]
        val blank = raw == null || raw.toString().isBlank() || (raw is List<*> && raw.isEmpty())
        if (field.required && blank) {
            problems.add("${field.label} is required")
            return@forEach
        }
        if (blank) return@forEach

        when (field.type) {
            "number", "currency", "area", "rating" -> {
                val n = raw.toString().toDoubleOrNull()
                if (n == null) problems.add("${field.label} must be a number")
                else {
                    field.min?.let { if (n < it) problems.add("${field.label} must be at least ${it.pretty()}") }
                    field.max?.let { if (n > it) problems.add("${field.label} must be at most ${it.pretty()}") }
                }
            }
            "phone" -> if (raw.toString().filter(Char::isDigit).length != 10) {
                problems.add("${field.label} must be a 10-digit number")
            }
            "email" -> if (!raw.toString().contains("@")) problems.add("${field.label} must be an email address")
        }
    }

    if (taskRequiresPhoto && photos.isEmpty()) problems.add("This visit needs at least one photograph")

    return problems
}

private fun Double.pretty(): String = if (this == toLong().toDouble()) toLong().toString() else toString()

private fun Map<String, Any?>.toJson(): JSONObject = JSONObject().also { json ->
    forEach { (key, value) ->
        when (value) {
            null -> {}
            is List<*> -> json.put(key, JSONArray(value))
            else -> json.put(key, value)
        }
    }
}

/**
 * Hands a just-entered farmer from the new-lead screen to the form screen.
 *
 * A navigation argument would mean URL-encoding a JSON object into a route, and
 * a route is a string somebody will eventually log. This is one object, read
 * once, cleared on read — so a second visit to the form cannot resurrect a
 * farmer entered an hour ago.
 */
object NewLeadCarrier {
    private var held: JSONObject? = null

    fun put(lead: JSONObject) { held = lead }

    fun take(): JSONObject? {
        val value = held
        held = null
        return value
    }
}
