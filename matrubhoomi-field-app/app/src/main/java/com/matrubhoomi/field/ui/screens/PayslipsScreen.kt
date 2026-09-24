package com.matrubhoomi.field.ui.screens

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.matrubhoomi.field.core.rupees
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.PayslipItem
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.ui.components.BigButton
import com.matrubhoomi.field.ui.components.Card
import com.matrubhoomi.field.ui.components.Chip
import com.matrubhoomi.field.ui.components.EmptyState
import com.matrubhoomi.field.ui.components.LoadingBlock
import com.matrubhoomi.field.ui.components.Notice
import com.matrubhoomi.field.ui.components.ScreenBar
import com.matrubhoomi.field.ui.components.SectionLabel
import com.matrubhoomi.field.ui.components.rememberFetch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Payslips — the paid months, newest first, each one a PDF.
 *
 * Only PAID months are listed; a payroll still being worked on is HR's draft,
 * not the employee's payslip. The PDF is fetched with the session, written to
 * the app's private cache and handed to the phone's own viewer for that one
 * file — it is never saved anywhere another app could read it unasked.
 */
@Composable
fun PayslipsScreen() {
    val context = LocalContext.current
    val repo = remember { Repository.get(context) }
    val scope = rememberCoroutineScope()

    val list = rememberFetch("payslips") { repo.payslips() }
    var opening by remember { mutableStateOf<String?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }

    fun open(p: PayslipItem) {
        opening = "${p.year}-${p.month}"
        problem = null
        scope.launch {
            when (val r = withContext(Dispatchers.IO) { repo.downloadPayslip(p.month, p.year) }) {
                is ApiResult.Ok -> problem = viewPdf(context, r.value)
                is ApiResult.Offline -> problem = "No connection — a payslip is downloaded when you open it."
                is ApiResult.Unauthorised -> problem = "Your session has ended."
                is ApiResult.Failed -> problem = r.message
            }
            opening = null
        }
    }

    Scaffold(topBar = { ScreenBar("Payslips", "Paid months, as PDFs") }) { padding ->
        com.matrubhoomi.field.ui.components.RefreshableList(
            refreshing = (list.loading && list.data != null),
            onRefresh = { list.reload() },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(2.dp)) }
            problem?.let { item { Notice(title = "Could not open the payslip", body = it, severe = true) } }

            val slips = list.data.orEmpty()
            when {
                list.loading && list.data == null -> item { LoadingBlock() }
                list.problem != null && list.data == null -> item { Notice(title = "Could not load payslips", body = list.problem, severe = !list.offline) }
                slips.isEmpty() -> item {
                    Card {
                        EmptyState(
                            icon = Icons.Outlined.AccountBalanceWallet,
                            title = "No payslips yet",
                            body = "A month appears here once HR has run payroll and marked it paid.",
                        )
                    }
                }
                else -> {
                    val latest = slips.first()
                    item {
                        Card {
                            SectionLabel("Latest — ${latest.label}")
                            Spacer(Modifier.height(8.dp))
                            Text(rupees(latest.netPay), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                            Text("take-home", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Chip("gross ${rupees(latest.gross)}")
                                Chip("deductions ${rupees(latest.deductions)}")
                            }
                            Spacer(Modifier.height(12.dp))
                            BigButton(
                                text = if (opening == "${latest.year}-${latest.month}") "Opening…" else "Open payslip",
                                icon = Icons.Outlined.Download,
                                enabled = opening == null,
                            ) { open(latest) }
                        }
                    }
                    if (slips.size > 1) {
                        item { SectionLabel("Earlier", Modifier.padding(top = 6.dp)) }
                        items(slips.drop(1), key = { "${it.year}-${it.month}" }) { p ->
                            Card(Modifier.clickable(enabled = opening == null) { open(p) }) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(p.label, style = MaterialTheme.typography.titleMedium)
                                        Text(
                                            "Net ${rupees(p.netPay)} · gross ${rupees(p.gross)}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    if (opening == "${p.year}-${p.month}") {
                                        CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
                                    } else {
                                        Icon(Icons.Outlined.Download, contentDescription = "Open", tint = MaterialTheme.colorScheme.primary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
        }
    }
}

/** Hand one PDF to the phone's viewer. Returns a message when there is none. */
fun viewPdf(context: Context, file: File): String? {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/pdf")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        context.startActivity(intent)
        null
    } catch (e: ActivityNotFoundException) {
        "This phone has no app that opens PDFs. Install one (for example Google Drive) and try again."
    }
}
