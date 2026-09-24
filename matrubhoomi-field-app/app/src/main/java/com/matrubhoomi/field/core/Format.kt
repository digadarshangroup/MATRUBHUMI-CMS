package com.matrubhoomi.field.core

import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.TimeZone

/**
 * How numbers, times and dates are written — once, so every screen says
 * "1h 5m" and "Wed 26 Aug" the same way.
 */

/** 65 → "1h 5m", 45 → "45 min", 120 → "2h". */
fun formatMinutes(minutes: Int): String = when {
    minutes < 1 -> "under a minute"
    minutes < 60 -> "$minutes min"
    minutes % 60 == 0 -> "${minutes / 60}h"
    else -> "${minutes / 60}h ${minutes % 60}m"
}

/** 9.5 → "9.5 km", 0.0 → "0 km". */
fun formatKm(km: Double): String =
    if (km == km.toLong().toDouble()) "${km.toLong()} km" else "%.1f km".format(Locale.US, km)

/** 12.0 reads as an error on a balance; 12 reads as a number of days. */
fun trimNumber(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString() else "%.1f".format(Locale.US, value)

private fun parseIso(iso: String): java.util.Date? = runCatching {
    val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
    f.timeZone = TimeZone.getTimeZone("UTC")
    f.parse(iso.take(19))
}.getOrNull()

/** "2026-09-24T09:32:00.000Z" → "3:02 pm" in the phone's own zone. */
fun clockOf(iso: String): String {
    if (iso.isBlank() || iso == "null") return ""
    val date = parseIso(iso) ?: return ""
    return SimpleDateFormat("h:mm a", Locale.US).format(date).lowercase(Locale.US)
}

/** Milliseconds since the epoch, or null. */
fun epochOf(iso: String): Long? = if (iso.isBlank() || iso == "null") null else parseIso(iso)?.time

/** "2 min ago", "3 h ago", "yesterday". */
fun agoOf(iso: String, now: Long = System.currentTimeMillis()): String {
    val at = epochOf(iso) ?: return ""
    val mins = ((now - at) / 60000).toInt()
    return when {
        mins < 1 -> "just now"
        mins < 60 -> "$mins min ago"
        mins < 24 * 60 -> "${mins / 60} h ago"
        mins < 48 * 60 -> "yesterday"
        else -> "${mins / (24 * 60)} days ago"
    }
}

/** "2026-08-26" → "Wed 26 Aug". Hand-parsed: the string is already in a fixed shape. */
fun dayLabel(dateStr: String): String = runCatching {
    val d = LocalDate.parse(dateStr.take(10))
    d.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.US))
}.getOrDefault(dateStr)

/** "2026-08-26" → "26 Aug 2026". */
fun longDate(dateStr: String): String = runCatching {
    val d = LocalDate.parse(dateStr.take(10))
    d.format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US))
}.getOrDefault(dateStr)

fun rangeLabel(from: String, to: String): String =
    if (from.take(10) == to.take(10) || to.isBlank()) dayLabel(from) else "${dayLabel(from)} – ${dayLabel(to)}"

fun rupees(value: Double): String {
    val whole = Math.round(value)
    val s = whole.toString()
    // Indian grouping: 12,34,567.
    if (s.length <= 3) return "₹$s"
    val last3 = s.takeLast(3)
    var rest = s.dropLast(3)
    val groups = ArrayList<String>()
    while (rest.length > 2) {
        groups.add(0, rest.takeLast(2))
        rest = rest.dropLast(2)
    }
    if (rest.isNotEmpty()) groups.add(0, rest)
    return "₹" + groups.joinToString(",") + "," + last3
}
