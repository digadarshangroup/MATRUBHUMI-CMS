package com.matrubhoomi.field.ui.components

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp

/**
 * Fitting the screen of whoever is holding the phone.
 *
 * Phones differ twice over: in how wide they are, and in the text size their
 * owner has chosen. On a real handset with a large font the bottom bar broke
 * "Customers" into "Custo / mers", and a top bar's second line spilled out of
 * the bar onto the card beneath it. Two rules answer that everywhere:
 *
 *  - a word that MUST stay whole — a tab, a segment, a button, a figure in a
 *    narrow tile — is set on one line and shrinks until it fits ([FitText]);
 *  - the owner's font setting is honoured, but only up to [MAX_FONT_SCALE].
 *    This app's type is already a step larger than Android's defaults (read in
 *    sunlight at arm's length), so an unbounded system scale on top of it made
 *    the largest settings unusable rather than readable ([CappedFontScale]).
 */

/** The largest system font scale the app follows. Beyond it, layouts break. */
const val MAX_FONT_SCALE = 1.15f

/** Apply [MAX_FONT_SCALE] to everything inside. Used once, at the root. */
@Composable
fun CappedFontScale(content: @Composable () -> Unit) {
    val density = LocalDensity.current
    if (density.fontScale <= MAX_FONT_SCALE) {
        content()
        return
    }
    CompositionLocalProvider(
        LocalDensity provides Density(density = density.density, fontScale = MAX_FONT_SCALE),
        content = content,
    )
}

/**
 * One line of text that shrinks to fit its space instead of wrapping or being
 * cut mid-word. Measured, then drawn: nothing is shown until it fits, so a
 * label never flashes at the wrong size.
 *
 * @param minScale how far it may shrink; past that the end is clipped. (Clip,
 *   not an ellipsis: with an ellipsis the text is laid out to the box, and the
 *   overflow that drives the shrinking is never reported.)
 */
@Composable
fun FitText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    textAlign: TextAlign? = null,
    minScale: Float = 0.72f,
) {
    var scale by remember(text, style) { mutableFloatStateOf(1f) }
    var ready by remember(text, style) { mutableStateOf(false) }
    val base = if (style.fontSize.isSpecified) style.fontSize else 14.sp
    Text(
        text,
        modifier = modifier.drawWithContent { if (ready) drawContent() },
        style = style.copy(
            fontSize = base * scale,
            lineHeight = if (style.lineHeight.isSpecified) style.lineHeight * scale else style.lineHeight,
        ),
        color = color,
        fontWeight = fontWeight,
        textAlign = textAlign,
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Clip,
        onTextLayout = { layout ->
            if (layout.didOverflowWidth && scale > minScale) {
                scale = (scale - 0.06f).coerceAtLeast(minScale)
            } else {
                ready = true
            }
        },
    )
}

/**
 * Up to [maxLines] lines that break BETWEEN words only: if a word would be
 * split ("Fix attendanc / e" on a narrow button), the text shrinks a little
 * and tries again.
 */
@Composable
fun WrapText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    maxLines: Int = 2,
    textAlign: TextAlign? = null,
    minScale: Float = 0.75f,
) {
    var scale by remember(text, style) { mutableFloatStateOf(1f) }
    var ready by remember(text, style) { mutableStateOf(false) }
    val base = if (style.fontSize.isSpecified) style.fontSize else 14.sp
    Text(
        text,
        modifier = modifier.drawWithContent { if (ready) drawContent() },
        style = style.copy(
            fontSize = base * scale,
            lineHeight = if (style.lineHeight.isSpecified) style.lineHeight * scale else style.lineHeight,
        ),
        color = color,
        textAlign = textAlign,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
        onTextLayout = { layout ->
            val splitsAWord = (0 until layout.lineCount - 1).any { line ->
                val end = layout.getLineEnd(line, visibleEnd = true)
                end in 1 until text.length && text[end - 1].isLetterOrDigit() && text[end].isLetterOrDigit()
            }
            if ((splitsAWord || layout.hasVisualOverflow) && scale > minScale) {
                scale = (scale - 0.06f).coerceAtLeast(minScale)
            } else {
                ready = true
            }
        },
    )
}
