package com.matrubhoomi.field.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * The same palette as the web side, in the same roles.
 *
 * These values are copied from app/globals.css in matrubhoomi-hrms — the paper
 * ground, the field green, the neutral ink. They are duplicated rather than
 * fetched because a phone must render correctly with no network, and a theme
 * that arrives over HTTP is a theme that sometimes does not.
 *
 * DYNAMIC COLOUR IS OFF, DELIBERATELY.
 * Material You would repaint this app in whatever hue the user's wallpaper
 * happens to be. This is a company tool used alongside a company web app, and
 * the two looking like one system matters more than the handset looking like
 * one system.
 */

private val Brand = Color(0xFF1F6B33)
private val BrandStrong = Color(0xFF14471F)
private val BrandLift = Color(0xFF4FBF6B)   // dark theme only — see DESIGN.md

private val Ground = Color(0xFFF6F7F9)
private val Surface = Color(0xFFFFFFFF)
private val Surface2 = Color(0xFFF0F2F5)
private val Line = Color(0xFFE2E5EA)
private val LineStrong = Color(0xFFCBD1D8)
private val Ink = Color(0xFF16191D)
private val Ink2 = Color(0xFF454B53)
private val Ink3 = Color(0xFF626A73)
private val Danger = Color(0xFFB0392A)
private val Water = Color(0xFF2C7DA0)
private val BrandWash = Color(0xFFE6F0E8)
private val WaterWash = Color(0xFFE3EFF4)

private val DarkGround = Color(0xFF0D1013)
private val DarkSurface = Color(0xFF16191D)
private val DarkSurface2 = Color(0xFF1C2026)
private val DarkLine = Color(0xFF272C33)
private val DarkInk = Color(0xFFECEFF3)
private val DarkInk3 = Color(0xFF99A1AB)

private val LightColours = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = BrandWash,
    onPrimaryContainer = BrandStrong,

    // EVERY ROLE IS SET, INCLUDING THE ONES NOTHING OBVIOUSLY USES.
    //
    // Material3 fills any role left unspecified from its own BASELINE palette,
    // which is purple. That is not a theoretical problem: `secondaryContainer`
    // is what a selected FilterChip paints itself with, so leaving it out put a
    // lilac chip in the middle of a green-and-paper form — and `surfaceTint`
    // pushes the same purple through every elevated surface, and
    // `surfaceContainerHigh` through every dialog.
    //
    // So the whole set is declared. An unset role is not a default here, it is
    // a colour from another product leaking into this one.
    secondary = Water,
    onSecondary = Color.White,
    secondaryContainer = BrandWash,
    onSecondaryContainer = BrandStrong,

    tertiary = Water,
    onTertiary = Color.White,
    tertiaryContainer = WaterWash,
    onTertiaryContainer = Color(0xFF0C3D52),

    background = Ground,
    onBackground = Ink,
    surface = Surface,
    onSurface = Ink,
    surfaceVariant = Surface2,
    onSurfaceVariant = Ink2,

    // Tonal elevation. M3 tints a raised surface with this colour; the default
    // would tint every card faintly purple.
    surfaceTint = Brand,
    surfaceBright = Surface,
    surfaceDim = Color(0xFFE7EAEE),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Ground,
    surfaceContainer = Surface2,
    surfaceContainerHigh = Color(0xFFEBEEF2),
    surfaceContainerHighest = Color(0xFFE7EAEE),

    inverseSurface = Ink,
    inverseOnSurface = Ground,
    inversePrimary = BrandLift,

    // `outline` and `outlineVariant` are NOT the same value, and the difference
    // is what stopped this app looking washed out.
    //
    // Material3 draws a text field's border with `outline` and a divider with
    // `outlineVariant`. Set to one faint hairline, every input on the screen
    // became a suggestion of a box — which, next to labels in the muted ink M3
    // also takes from this palette, is what "everything is grey" looks like.
    //
    // So `outline` is the CONTROL edge (a real, visible border) and
    // `outlineVariant` is the hairline between things. The web side makes the
    // same split as --g-line-strong and --g-line.
    outline = LineStrong,
    outlineVariant = Line,

    error = Danger,
    onError = Color.White,
    errorContainer = Color(0xFFFDF2F0),
    onErrorContainer = Danger,
    scrim = Color(0xFF000000),
)

private val DarkColours = darkColorScheme(
    primary = BrandLift,
    onPrimary = Color(0xFF08210E),
    primaryContainer = Color(0xFF16321E),
    onPrimaryContainer = Color(0xFF85DA9A),

    secondary = Color(0xFF64B6D8),
    onSecondary = Color(0xFF07222E),
    secondaryContainer = Color(0xFF16321E),
    onSecondaryContainer = Color(0xFF85DA9A),

    tertiary = Color(0xFF64B6D8),
    onTertiary = Color(0xFF07222E),
    tertiaryContainer = Color(0xFF14313E),
    onTertiaryContainer = Color(0xFF9FD4EA),

    background = DarkGround,
    onBackground = DarkInk,
    surface = DarkSurface,
    onSurface = DarkInk,
    surfaceVariant = DarkSurface2,
    onSurfaceVariant = DarkInk3,

    surfaceTint = BrandLift,
    surfaceBright = Color(0xFF23272D),
    surfaceDim = DarkGround,
    surfaceContainerLowest = Color(0xFF090C0E),
    surfaceContainerLow = Color(0xFF131619),
    surfaceContainer = DarkSurface2,
    surfaceContainerHigh = Color(0xFF23272D),
    surfaceContainerHighest = Color(0xFF2A2F36),

    inverseSurface = DarkInk,
    inverseOnSurface = DarkGround,
    inversePrimary = Brand,

    outline = Color(0xFF363D45),
    outlineVariant = DarkLine,

    error = Color(0xFFF3A18C),
    onError = Color(0xFF3A0F08),
    errorContainer = Color(0xFF3A1912),
    onErrorContainer = Color(0xFFF3A18C),
    scrim = Color(0xFF000000),
)

/**
 * One step larger than Material's defaults throughout.
 *
 * This is read at arm's length, in sunlight, by somebody standing in a field —
 * often over forty and often without their glasses. Fourteen-point body text is
 * a reasonable default for a phone held at a desk and is not readable in that
 * situation, and a form nobody can read is a form filled in wrong.
 */
private val FieldTypography = Typography(
    // Android's own sizes, a touch smaller for the denser screens, and medium
    // weight at most. The first version set everything a step LARGER than
    // Android's, in semibold: with a phone's font turned up as well, whole
    // screens became headings. The owner's text-size setting (and the app's
    // own Smaller / Standard / Larger) now does the enlarging — see Fit.kt.
    headlineMedium = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Medium),
    headlineSmall = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.Medium),
    titleLarge = TextStyle(fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium),
    titleMedium = TextStyle(fontSize = 15.sp, lineHeight = 21.sp, fontWeight = FontWeight.Medium),
    titleSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.5.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 15.sp, fontWeight = FontWeight.Medium),
)


/**
 * LIGHT BY DEFAULT, REGARDLESS OF THE PHONE'S SETTING.
 *
 * This used to follow `isSystemInDarkTheme()`, which meant a handset with the
 * system dark mode on — the default on a lot of phones now — rendered the whole
 * app dark while the web side it sits beside stayed on paper. Two halves of one
 * product, looking like two products, decided by a setting nobody made for this
 * app's benefit.
 *
 * The dark palette below is kept and stays in step, because a field employee
 * working at dusk is a real case and this is the one line that turns it on. It
 * is simply not chosen for them by the operating system.
 */
@Composable
fun FieldTheme(darkTheme: Boolean = false, textScale: Float = 1f, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColours else LightColours,
        typography = FieldTypography,
    ) {
        // See ui/components/Fit.kt: this type is already a step larger than
        // Android's, so the system scale is followed only up to a point.
        com.matrubhoomi.field.ui.components.CappedFontScale(textScale, content)
    }
}
