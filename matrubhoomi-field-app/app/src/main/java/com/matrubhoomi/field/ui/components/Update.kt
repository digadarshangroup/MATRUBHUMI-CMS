package com.matrubhoomi.field.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.BuildConfig
import com.matrubhoomi.field.data.AppRelease

/**
 * "A newer version is out" — HR published it from the CMS (Mobile app page),
 * and this phone's build is older. The download opens in the browser, which
 * hands the APK to Android's installer; the app cannot install itself.
 */
@Composable
fun UpdateCard(release: AppRelease, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val brand = MaterialTheme.colorScheme.primary
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = brand.copy(alpha = 0.07f),
        border = BorderStroke(1.dp, brand.copy(alpha = 0.25f)),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.size(40.dp).background(brand.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.SystemUpdate, contentDescription = null, tint = brand, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Update available", style = MaterialTheme.typography.titleMedium, color = brand, fontWeight = FontWeight.Medium)
                Text(
                    "Version ${release.version} is out — you have ${BuildConfig.VERSION_NAME}.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (release.notes.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(release.notes, style = MaterialTheme.typography.bodySmall, maxLines = 4)
                }
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = {
                        runCatching {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(release.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                ) { Text("Download update") }
            }
        }
    }
}
