package com.matrubhoomi.field.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The pieces that give this app a shape of its own.
 *
 * WHY THESE AND NOT MORE STYLING
 * ------------------------------
 * The screens were correct and readable and looked like a settings menu: every
 * fact in a white card, every card the same weight, nothing on the screen
 * saying which of them mattered. That is a real usability problem, not a
 * cosmetic one — an employee glancing at this in a doorway with one hand full
 * has to find the one number they came for.
 *
 * So each piece here exists to do a job no amount of type and spacing could:
 *
 *   ProgressRing  a proportion read at a glance, from arm's length
 *   WeekBars      today put in the context of the days around it
 *   Avatar        a name recognised before it is read
 *   TimelineRow   a sequence that LOOKS like a sequence
 *   Skeleton      a screen that is loading rather than a screen that is empty
 *   AnimatedCount a figure whose change is noticed
 *
 * WHAT IS DELIBERATELY ABSENT: decoration that carries no fact. No gradients on
 * things that are not statuses, no shadows to suggest depth that means nothing,
 * no motion on anything except a value that actually changed. This is read in
 * sunlight by somebody working.
 */

/* ── The company's other materials ────────────────────────────────── */

/**
 * The logo's secondary colours, matching --g-brick / --g-water / --g-harvest on
 * the web side. Accents only — nothing structural is ever painted in them.
 */
object Accent {
    val Brick = Color(0xFFAC4F2C)
    val Water = Color(0xFF2C7DA0)
    val Harvest = Color(0xFF946A07)
}

/* ── A proportion, as a ring ──────────────────────────────────────── */

/**
 * A circular gauge with whatever you like in the middle.
 *
 * A bar answers "how much" and a ring answers "how far through" — and the
 * day's round is a "how far through" question. It also survives being glanced
 * at: the difference between a quarter and three quarters of a circle is
 * legible at arm's length, where the difference between two bar widths is not.
 *
 * The sweep animates from wherever it was, so a task completed while the screen
 * is open is SEEN rather than silently already true.
 */
@Composable
fun ProgressRing(
    fraction: Float,
    modifier: Modifier = Modifier,
    size: Dp = 72.dp,
    stroke: Dp = 7.dp,
    colour: Color = MaterialTheme.colorScheme.primary,
    track: Color = colour.copy(alpha = 0.18f),
    content: @Composable () -> Unit = {},
) {
    val target = fraction.coerceIn(0f, 1f)
    val swept by animateFloatAsState(
        targetValue = target,
        animationSpec = tween(durationMillis = 700),
        label = "ring",
    )

    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val width = stroke.toPx()
            val inset = width / 2
            val arcSize = Size(this.size.width - width, this.size.height - width)

            drawArc(
                color = track,
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(width = width, cap = StrokeCap.Round),
            )
            // From the top, clockwise — the direction every clock and every
            // other progress ring on the handset already turns.
            if (swept > 0f) {
                drawArc(
                    color = colour,
                    startAngle = -90f,
                    sweepAngle = 360f * swept,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = arcSize,
                    style = Stroke(width = width, cap = StrokeCap.Round),
                )
            }
        }
        content()
    }
}

/* ── A week, as bars ──────────────────────────────────────────────── */

/** One column of [WeekBars]. */
data class DayBar(
    /** A single letter under the bar — M, T, W … */
    val letter: String,
    val value: Double,
    val isToday: Boolean = false,
)

/**
 * The last several days, so today has something to mean.
 *
 * "6.4 km" on its own is a number. "6.4 km, against 3, 4 and 11 on the days
 * before" is a day. This is the smallest thing that turns the first into the
 * second, and it is the employee's own record rather than anything the desk
 * sends them — which is the point: it is theirs to read.
 *
 * Bars are scaled to the WEEK'S OWN MAXIMUM, not to a fixed ceiling. A quiet
 * week should still show its shape rather than seven stubs along the floor.
 */
@Composable
fun WeekBars(
    days: List<DayBar>,
    modifier: Modifier = Modifier,
    height: Dp = 64.dp,
    colour: Color = MaterialTheme.colorScheme.primary,
    valueLabel: (Double) -> String = { if (it >= 10) it.roundToInt().toString() else ((it * 10).roundToInt() / 10.0).toString() },
) {
    if (days.isEmpty()) return
    val peak = days.maxOf { it.value }.coerceAtLeast(0.001)

    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        for (day in days) {
            val share = (day.value / peak).toFloat().coerceIn(0f, 1f)
            val grown by animateFloatAsState(
                targetValue = share,
                animationSpec = tween(600),
                label = "bar-${day.letter}",
            )

            Column(
                Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // The figure sits above its own bar only when there is one, so
                // a day off does not carry a "0" that has to be read and
                // dismissed.
                Text(
                    if (day.value > 0) valueLabel(day.value) else "",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (day.isToday) colour else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                Spacer(Modifier.height(3.dp))

                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(height),
                    contentAlignment = Alignment.BottomCenter,
                ) {
                    // The track, so an empty day is still a column rather than
                    // a gap — seven bars with one missing reads as a fault.
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(height)
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                    )
                    Box(
                        Modifier
                            .fillMaxWidth()
                            // A floor of 3dp: a day with a little travel on it
                            // must not round down to invisible.
                            .height((height.value * grown).dp.coerceAtLeast(if (day.value > 0) 3.dp else 0.dp))
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (day.isToday) colour else colour.copy(alpha = 0.42f)),
                    )
                }

                Spacer(Modifier.height(5.dp))
                Text(
                    day.letter,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (day.isToday) colour else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (day.isToday) FontWeight.Medium else FontWeight.Normal,
                )
            }
        }
    }
}

/* ── A name, recognised before it is read ─────────────────────────── */

/**
 * Initials in a colour derived from the name.
 *
 * The colour is not decoration. A list of twenty farmers is twenty lines of
 * similar-looking text, and a stable colour per name is the thing that lets
 * somebody find the one they visited yesterday without reading all twenty.
 * Derived from the name itself, so it is the same colour on every screen and
 * after every reinstall.
 *
 * Only ever the company's own materials — a name never comes out lilac.
 */
@Composable
fun Avatar(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
) {
    val palette = listOf(
        MaterialTheme.colorScheme.primary,
        Accent.Water,
        Accent.Brick,
        Accent.Harvest,
    )
    val tone = palette[abs(name.trim().lowercase().hashCode()) % palette.size]

    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(999.dp))
            .background(tone.copy(alpha = 0.14f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initialsOf(name),
            style = MaterialTheme.typography.titleSmall,
            color = tone,
            fontWeight = FontWeight.Medium,
        )
    }
}

/** First letter of the first two words — "Ramesh Patil" → "RP". */
fun initialsOf(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(1).uppercase()
        else -> (parts[0].take(1) + parts[1].take(1)).uppercase()
    }
}

/* ── A sequence that looks like one ───────────────────────────────── */

/**
 * One step of a vertical timeline — a dot, a connector, and the content.
 *
 * Used for a lead's stage history and for the day's route. A list of rows says
 * "these things"; a timeline says "this then this then this", which is the
 * whole point of both.
 *
 * @param first no connector above — this is the top of the run
 * @param last  no connector below
 */
@Composable
fun TimelineRow(
    modifier: Modifier = Modifier,
    tone: Color = MaterialTheme.colorScheme.primary,
    filled: Boolean = true,
    first: Boolean = false,
    last: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    Row(modifier.fillMaxWidth()) {
        Column(
            Modifier.width(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier
                    .width(2.dp)
                    .height(if (first) 6.dp else 10.dp)
                    .background(
                        if (first) Color.Transparent
                        else MaterialTheme.colorScheme.outlineVariant,
                    ),
            )
            Box(
                Modifier
                    .size(11.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (filled) tone else MaterialTheme.colorScheme.surface)
                    .then(
                        if (filled) Modifier
                        else Modifier.background(
                            MaterialTheme.colorScheme.surface,
                            RoundedCornerShape(999.dp),
                        ),
                    ),
            ) {
                // A hollow dot for something not yet reached: the ring is drawn
                // by insetting the surface colour inside the tone.
                if (!filled) {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .padding(2.5.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(MaterialTheme.colorScheme.surface),
                    )
                }
            }
            // Weight(1f) makes the connector reach whatever height the content
            // turned out to be, so a two-line step and a five-line step both
            // stay joined up.
            Box(
                Modifier
                    .width(2.dp)
                    .weight(1f)
                    .background(
                        if (last) Color.Transparent
                        else MaterialTheme.colorScheme.outlineVariant,
                    ),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(
            Modifier
                .weight(1f)
                .padding(bottom = if (last) 0.dp else 14.dp),
            content = content,
        )
    }
}

/* ── Loading, rather than empty ───────────────────────────────────── */

/**
 * A shimmering placeholder.
 *
 * A blank screen and a loading screen look identical, and on a handset with one
 * bar of signal the difference matters: one means wait, the other means there
 * is nothing there. The sweep is slow (1.2s) and low-contrast on purpose —
 * fast shimmer on a screen full of them is a strobe.
 */
@Composable
fun Skeleton(
    modifier: Modifier = Modifier,
    height: Dp = 16.dp,
    corner: Dp = 8.dp,
) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val shift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shift",
    )

    val base = MaterialTheme.colorScheme.surfaceVariant
    val glint = MaterialTheme.colorScheme.surface

    Box(
        modifier
            .height(height)
            .clip(RoundedCornerShape(corner))
            .background(
                Brush.linearGradient(
                    colors = listOf(base, glint, base),
                    start = Offset(shift * 600f - 300f, 0f),
                    end = Offset(shift * 600f, 0f),
                ),
            ),
    )
}

/** Three skeleton lines in a card — the usual "a list is coming" shape. */
@Composable
fun SkeletonRows(rows: Int = 3, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        repeat(rows) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Skeleton(Modifier.size(40.dp), height = 40.dp, corner = 999.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Skeleton(Modifier.fillMaxWidth(0.55f), height = 13.dp)
                    Skeleton(Modifier.fillMaxWidth(0.35f), height = 11.dp)
                }
            }
        }
    }
}

/* ── A figure whose change is noticed ─────────────────────────────── */

/**
 * A number that travels to its new value instead of jumping to it.
 *
 * The only motion in this app that is not a direct response to a tap, and it
 * earns its place: the km figure changes while the employee is looking at it,
 * and a silent replacement is a change nobody sees happen.
 *
 * @param decimals 0 for counts, 1 for kilometres
 */
@Composable
fun AnimatedCount(
    value: Double,
    modifier: Modifier = Modifier,
    decimals: Int = 0,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.titleLarge,
    colour: Color = MaterialTheme.colorScheme.onSurface,
) {
    val shown by animateFloatAsState(
        targetValue = value.toFloat(),
        animationSpec = tween(600),
        label = "count",
    )
    Text(
        if (decimals == 0) shown.roundToInt().toString()
        else ((shown * 10).roundToInt() / 10.0).toString(),
        modifier = modifier,
        style = style,
        color = colour,
        maxLines = 1,
    )
}

/* ── A row worth tapping ──────────────────────────────────────────── */

/**
 * A list row with a medallion, two lines, and something on the right.
 *
 * The medallion is what makes a list scannable — the eye finds a shape far
 * faster than it reads a word, and every list in this app is read in a hurry.
 */
@Composable
fun MedallionRow(
    icon: ImageVector,
    title: String,
    subtitle: String = "",
    modifier: Modifier = Modifier,
    tone: Color = MaterialTheme.colorScheme.primary,
    trailing: String = "",
    showChevron: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(vertical = 10.dp, horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(tone.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = tone, modifier = Modifier.size(19.dp))
        }
        Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
            if (subtitle.isNotBlank()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
        if (trailing.isNotBlank()) {
            Text(
                trailing,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (showChevron) {
            Spacer(Modifier.width(4.dp))
            Icon(
                Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

/* ── Choosing between a few things ────────────────────────────────── */

/**
 * A segmented control.
 *
 * For two or three views of the SAME list — this month against last, mine
 * against everybody's. Not for navigation: a segment that changes the screen
 * rather than the contents is a tab, and this app has a bottom bar for that.
 */
@Composable
fun SegmentedTabs(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(Modifier.padding(3.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            options.forEachIndexed { index, label ->
                val chosen = index == selectedIndex
                val background by animateColorAsState(
                    if (chosen) MaterialTheme.colorScheme.surface else Color.Transparent,
                    label = "seg-bg",
                )
                val ink by animateColorAsState(
                    if (chosen) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    label = "seg-ink",
                )
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(background)
                        .clickable { onSelect(index) }
                        .padding(vertical = 9.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    FitText(
                        label,
                        style = MaterialTheme.typography.labelLarge,
                        color = ink,
                        textAlign = TextAlign.Center,
                        fontWeight = if (chosen) FontWeight.Medium else FontWeight.Normal,
                    )
                }
            }
        }
    }
}

/* ── The one panel allowed to be loud ─────────────────────────────── */

/**
 * The duty panel's ground: the brand green with a lift towards the top right.
 *
 * A FLAT fill and a gradient carry the same information, so this needs a reason
 * beyond taste. It has one — this panel is the only thing on the screen with a
 * state worth seeing from across a room, and the gradient is what separates it
 * from every other coloured surface the handset draws. Two stops, eight percent
 * apart. Anything more is a sunset.
 */
@Composable
fun brandGradient(): Brush = Brush.linearGradient(
    colors = listOf(
        MaterialTheme.colorScheme.primary,
        MaterialTheme.colorScheme.primary.copy(alpha = 0.88f),
    ),
    start = Offset(0f, Float.POSITIVE_INFINITY),
    end = Offset(Float.POSITIVE_INFINITY, 0f),
)

/**
 * A small pill for a live status — a dot and a word.
 *
 * Distinct from [Chip]: this one PULSES while the thing it describes is
 * happening, which is how the recording announces itself without a second line
 * of text on an already busy panel.
 */
@Composable
fun LivePill(
    text: String,
    modifier: Modifier = Modifier,
    tone: Color = MaterialTheme.colorScheme.onPrimary,
    pulsing: Boolean = true,
) {
    val transition = rememberInfiniteTransition(label = "pulse")
    val alpha by transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.35f,
        animationSpec = infiniteRepeatable(
            animation = tween(1100, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "alpha",
    )

    Row(
        modifier
            .clip(RoundedCornerShape(999.dp))
            .background(tone.copy(alpha = 0.16f))
            .padding(horizontal = 9.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(6.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(tone.copy(alpha = if (pulsing) alpha else 1f)),
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = tone,
            letterSpacing = 0.08.em,
            fontWeight = FontWeight.Medium,
        )
    }
}

/**
 * A card that carries a tone down its leading edge.
 *
 * For a card whose STATUS is the first thing about it — an overdue assignment,
 * a lead that has stalled. The stripe is 4dp: enough to see down a scrolling
 * list, not enough to be furniture.
 */
@Composable
fun AccentCard(
    tone: Color,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            Modifier
                // IntrinsicSize.Min IS WHAT MAKES THE STRIPE APPEAR.
                //
                // A Row inside a scrolling list is measured with an unbounded
                // height, so `fillMaxHeight` on a child resolves against
                // infinity and the child collapses to nothing — the stripe was
                // there, zero pixels tall, on every card. Asking the Row for its
                // minimum intrinsic height first gives the stripe a real number
                // to fill: the height of the tallest thing in the row, which is
                // the text column beside it.
                .height(IntrinsicSize.Min)
                .then(
                    if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier,
                ),
        ) {
            Box(
                Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(tone),
            )
            Column(Modifier.padding(16.dp), content = content)
        }
    }
}
