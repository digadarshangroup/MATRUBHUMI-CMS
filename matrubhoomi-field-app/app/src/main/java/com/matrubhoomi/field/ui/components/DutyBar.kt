package com.matrubhoomi.field.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * The strip that sits above the bottom bar while the round is being recorded.
 *
 * MODELLED ON A NAVIGATION APP, AND FOR THE SAME REASON
 * -----------------------------------------------------
 * When a phone is doing something continuous in the background — recording a
 * route, in this case — the one thing a person needs at every moment is
 * confirmation that it is still doing it, and one tap to stop. Buried on a
 * settings screen, "am I still being recorded?" becomes a question somebody has
 * to go and check, and the honest answer to a question like that should never
 * be more than a glance away.
 *
 * So it carries four things and no more: that it is live, how long, how far, and
 * the way out. The dot pulses because a static green dot is indistinguishable
 * from a frozen screen.
 *
 * IT ALSO REPORTS WHEN IT IS NOT WORKING. If the server has heard nothing for a
 * while the bar says so, in place of the distance. A recording that has silently
 * stopped looks exactly like one that is running, and that is the failure this
 * whole app is built against.
 */
@Composable
fun DutyBar(
    startedAt: Long,
    km: Double,
    movingMinutes: Int,
    lastPingAt: String,
    onEnd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val minutes = if (startedAt > 0) ((System.currentTimeMillis() - startedAt) / 60000).toInt() else 0
    val stale = minutesSince(lastPingAt)?.let { it > 15 } ?: false

    val pulse by rememberInfiniteTransition(label = "duty").animateFloat(
        initialValue = 1f,
        targetValue = 0.25f,
        animationSpec = infiniteRepeatable(tween(1100), RepeatMode.Reverse),
        label = "pulse",
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = if (stale) MaterialTheme.colorScheme.errorContainer
        else MaterialTheme.colorScheme.primaryContainer,
        shape = RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp),
    ) {
        Row(
            Modifier.padding(start = 16.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(10.dp)
                    .alpha(if (stale) 1f else pulse)
                    .background(
                        if (stale) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                        RoundedCornerShape(999.dp),
                    ),
            )
            Spacer(Modifier.width(12.dp))

            Column(Modifier.weight(1f)) {
                Text(
                    if (stale) "Not reporting" else "On duty",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (stale) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Text(
                    if (stale)
                        "The office has not heard from this phone recently. Check signal and location."
                    else
                        listOf(
                            duration(minutes),
                            "%.1f km".format(km),
                            "${duration(movingMinutes)} moving",
                        ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }

            TextButton(onClick = onEnd) {
                Text("End", fontWeight = FontWeight.Medium)
            }
        }
    }
}

private fun duration(minutes: Int): String = when {
    minutes < 1 -> "just started"
    minutes < 60 -> "${minutes}m"
    minutes % 60 == 0 -> "${minutes / 60}h"
    else -> "${minutes / 60}h ${minutes % 60}m"
}

private fun minutesSince(iso: String): Int? {
    if (iso.isBlank()) return null
    val at = runCatching {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        f.parse(iso.take(19))?.time
    }.getOrNull() ?: return null
    return ((System.currentTimeMillis() - at) / 60000).toInt()
}
