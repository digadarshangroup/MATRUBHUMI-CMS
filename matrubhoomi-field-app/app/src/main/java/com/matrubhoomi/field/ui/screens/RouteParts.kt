package com.matrubhoomi.field.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.DirectionsWalk
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.matrubhoomi.field.core.agoOf
import com.matrubhoomi.field.core.clockOf
import com.matrubhoomi.field.core.epochOf
import com.matrubhoomi.field.core.formatKm
import com.matrubhoomi.field.core.formatMinutes
import com.matrubhoomi.field.core.trimNumber
import com.matrubhoomi.field.data.DayLeg
import com.matrubhoomi.field.data.DayStop
import com.matrubhoomi.field.data.MyDay
import com.matrubhoomi.field.ui.components.Accent
import com.matrubhoomi.field.ui.components.LivePill
import com.matrubhoomi.field.ui.components.MapMarker
import com.matrubhoomi.field.ui.components.MapPoint
import com.matrubhoomi.field.ui.components.MarkerKind
import com.matrubhoomi.field.ui.components.brandGradient

/**
 * The pieces of the day's route that the Route screen and the full-screen map
 * share: what the office thinks you are doing now, the pins, and the day as a
 * list of places — "Stayed in Kalmeshwar 10:42–11:27 (45 min)".
 *
 * Everything here reads the SERVER's day (/api/field/me/day), the same one the
 * sales desk reads, so the employee never sees a different story from the one
 * they will be asked about.
 */

/** Headline and second line for "right now". */
data class NowWords(val headline: String, val detail: String, val live: Boolean)

fun nowWords(day: MyDay?, onDuty: Boolean): NowWords {
    if (day == null) return NowWords(if (onDuty) "On duty" else "Off duty", "", onDuty)
    val now = day.now
    val where = now.placeName
    return when (now.state) {
        "moving" -> NowWords(
            headline = now.speedKmh?.takeIf { it >= 1 }?.let { "Moving · ${it.toInt()} km/h" } ?: "Moving",
            detail = if (where.isNotBlank()) "Near $where" else "",
            live = true,
        )
        "stopped" -> NowWords(
            headline = if (where.isNotBlank()) "Stopped in $where" else "Stopped",
            detail = listOfNotNull(
                now.minutes?.let { "for ${formatMinutes(it)}" },
                now.since.takeIf { it.isNotBlank() }?.let { "since ${clockOf(it)}" },
            ).joinToString(" · "),
            live = true,
        )
        "not_reporting" -> NowWords(
            headline = "Not reporting",
            detail = if (day.lastPingAt.isNotBlank()) "Last heard ${agoOf(day.lastPingAt)}" + (if (where.isNotBlank()) " near $where" else "") +
                ". Check the phone has signal and location is on."
            else "Nothing has arrived from this phone today.",
            live = false,
        )
        "off_duty" -> NowWords(
            headline = "Duty ended",
            detail = listOfNotNull(
                day.dutyEndedAt.takeIf { it.isNotBlank() }?.let { "at ${clockOf(it)}" },
                where.takeIf { it.isNotBlank() }?.let { "last near $it" },
            ).joinToString(" · "),
            live = false,
        )
        else -> NowWords(
            headline = if (onDuty) "Waiting for the first position" else "Not on duty",
            detail = if (onDuty) "It appears within a minute of setting off." else "Start duty from Today when you set off.",
            live = onDuty,
        )
    }
}

/** The pins: stays numbered in order, visits small, and where the phone is now. */
fun routeMarkers(day: MyDay, onDuty: Boolean): List<MapMarker> {
    val stays = day.stops.filter { it.isStay }
    val visits = day.stops.filter { !it.isStay && !it.insideStay }
    return visits.map { MapMarker(MapPoint(it.lat, it.lng), kind = MarkerKind.Visit) } +
        stays.mapIndexed { i, s -> MapMarker(MapPoint(s.lat, s.lng), label = "${i + 1}", kind = MarkerKind.Numbered) } +
        listOfNotNull(
            day.position
                ?.takeIf { onDuty && day.now.state != "off_duty" && day.now.state != "not_reporting" }
                ?.let { MapMarker(MapPoint(it.lat, it.lng), kind = MarkerKind.Current) },
        )
}

/** How long duty has run, from the server's start time. */
fun dutyLength(day: MyDay?, now: Long = System.currentTimeMillis()): String? {
    val start = day?.dutyStartedAt?.let { epochOf(it) } ?: return null
    val end = day.dutyEndedAt.takeIf { it.isNotBlank() && !day.dutyOn }?.let { epochOf(it) } ?: now
    val mins = ((end - start) / 60000).toInt()
    return if (mins < 0) null else formatMinutes(mins)
}

/**
 * The status panel at the top of the Route screen — the CallTrack-style
 * "where are they now" card, about yourself.
 */
@Composable
fun NowPanel(day: MyDay?, onDuty: Boolean) {
    val words = nowWords(day, onDuty)
    val loud = onDuty && words.live
    Surface(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = if (loud) Color.Transparent else MaterialTheme.colorScheme.surface,
        border = if (loud) null else androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        val ink = if (loud) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
        val soft = if (loud) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f) else MaterialTheme.colorScheme.onSurfaceVariant
        Column(
            (if (loud) Modifier.background(brandGradient()) else Modifier).padding(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (onDuty) LivePill(if (words.live) "live" else "on duty", tone = if (loud) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary, pulsing = words.live)
                else LivePill("off duty", tone = MaterialTheme.colorScheme.onSurfaceVariant, pulsing = false)
                Spacer(Modifier.weight(1f))
                if (day != null && day.lastPingAt.isNotBlank()) {
                    Text("updated ${agoOf(day.lastPingAt)}", style = MaterialTheme.typography.labelSmall, color = soft)
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (day?.now?.state == "moving") Icons.AutoMirrored.Outlined.DirectionsWalk else Icons.Outlined.Place,
                    contentDescription = null,
                    tint = ink,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(words.headline, style = MaterialTheme.typography.titleLarge, color = ink, fontWeight = FontWeight.SemiBold)
            }
            if (words.detail.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(words.detail, style = MaterialTheme.typography.bodyMedium, color = soft, modifier = Modifier.padding(start = 30.dp))
            }
            val length = dutyLength(day)
            if (day != null && day.dutyStartedAt.isNotBlank() && length != null) {
                Spacer(Modifier.height(10.dp))
                Text(
                    (if (day.dutyOn) "On duty since ${clockOf(day.dutyStartedAt)}" else "Duty ${clockOf(day.dutyStartedAt)} – ${clockOf(day.dutyEndedAt)}") + " · $length",
                    style = MaterialTheme.typography.bodySmall,
                    color = soft,
                )
            }
        }
    }
}

/**
 * The day as a list of places, in order: each stay numbered to match its pin,
 * the visits recorded there inside it, and the drive between stays.
 */
@Composable
fun DayTimeline(day: MyDay) {
    // By identity, not equality: two stays with the same readings are still
    // two stops, and must keep their own numbers.
    val stayNumber = java.util.IdentityHashMap<DayStop, Int>()
    day.stops.filter { it.isStay }.forEachIndexed { i, s -> stayNumber[s] = i }
    val rows = day.stops.filter { it.isStay || !it.insideStay }

    Column {
        rows.forEachIndexed { index, stop ->
            val n = stayNumber[stop]
            // The drive that ENDS at this stay, drawn just above it.
            if (n != null && n > 0) {
                day.legs.firstOrNull { it.toIndex == n }?.let { LegRow(it) }
            }
            if (stop.isStay) StayRow(stop, (n ?: 0) + 1, last = index == rows.lastIndex)
            else VisitRow(stop, last = index == rows.lastIndex)
        }
    }
}

@Composable
private fun StayRow(stop: DayStop, number: Int, last: Boolean) {
    val tone = if (stop.ongoing) Color(0xFF1A73E8) else MaterialTheme.colorScheme.primary
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        Column(Modifier.width(34.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(26.dp).clip(RoundedCornerShape(999.dp)).background(tone),
                contentAlignment = Alignment.Center,
            ) {
                Text("$number", style = MaterialTheme.typography.labelMedium, color = Color.White, fontWeight = FontWeight.Bold)
            }
            if (!last) Box(Modifier.width(2.dp).weight(1f).background(MaterialTheme.colorScheme.outlineVariant))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f).padding(bottom = if (last) 0.dp else 14.dp)) {
            val name = stop.placeName.ifBlank { "an unnamed spot" }
            Text(
                if (stop.ongoing) "Here now — $name" else "Stayed in $name",
                style = MaterialTheme.typography.titleMedium,
            )
            // The road, when the short name carries one — "Katol Road" from
            // "Katol Road, Kalmeshwar" — and the district. The village is
            // already the headline; saying it twice is noise.
            val road = stop.place.removeSuffix(", ${stop.locality}").takeIf { it != stop.placeName && it != stop.locality }.orEmpty()
            val where = listOf(road, stop.district).filter { it.isNotBlank() }.joinToString(", ")
            if (where.isNotBlank()) {
                Text(where, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                if (stop.ongoing) "since ${clockOf(stop.arrivedAt)} · ${formatMinutes(stop.minutes)} so far"
                else "${clockOf(stop.arrivedAt)} – ${clockOf(stop.leftAt)} · ${formatMinutes(stop.minutes)}",
                style = MaterialTheme.typography.bodySmall,
                color = if (stop.ongoing) tone else MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = if (stop.ongoing) FontWeight.SemiBold else FontWeight.Normal,
            )
            stop.visits.forEach { v ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                    Box(Modifier.size(6.dp).clip(RoundedCornerShape(999.dp)).background(Accent.Water))
                    Spacer(Modifier.width(6.dp))
                    Text("Recorded $v", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun VisitRow(stop: DayStop, last: Boolean) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        Column(Modifier.width(34.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.padding(top = 6.dp).size(12.dp).clip(RoundedCornerShape(999.dp)).background(Accent.Water))
            if (!last) Box(Modifier.width(2.dp).weight(1f).background(MaterialTheme.colorScheme.outlineVariant))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f).padding(bottom = if (last) 0.dp else 14.dp)) {
            Text("Visit — ${stop.label.ifBlank { "recorded" }}", style = MaterialTheme.typography.bodyLarge)
            Text(
                listOf(clockOf(stop.arrivedAt), stop.placeName).filter { it.isNotBlank() }.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LegRow(leg: DayLeg) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        Box(Modifier.width(34.dp).fillMaxHeight(), contentAlignment = Alignment.Center) {
            Box(Modifier.width(2.dp).fillMaxHeight().background(MaterialTheme.colorScheme.outlineVariant))
        }
        Spacer(Modifier.width(10.dp))
        Text(
            listOfNotNull(
                "${formatKm(leg.km)} travelled",
                "${formatMinutes(leg.minutes)}",
                leg.avgKmh?.let { "avg ${trimNumber(it)} km/h" },
            ).joinToString(" · "),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 12.dp),
        )
    }
}

/** A small key under the map, so the pins mean something at first sight. */
@Composable
fun MapKey() {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        KeyDot(MaterialTheme.colorScheme.primary, "1", "stops")
        KeyDot(Accent.Water, null, "visits")
        KeyDot(Color(0xFF1A73E8), null, "you now")
    }
}

@Composable
private fun KeyDot(tone: Color, text: String?, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(if (text != null) 16.dp else 10.dp).clip(RoundedCornerShape(999.dp)).background(tone), contentAlignment = Alignment.Center) {
            if (text != null) Text(text, style = MaterialTheme.typography.labelSmall, color = Color.White)
        }
        Spacer(Modifier.width(5.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
