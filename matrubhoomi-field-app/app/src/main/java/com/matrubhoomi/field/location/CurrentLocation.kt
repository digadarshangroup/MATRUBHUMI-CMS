package com.matrubhoomi.field.location

import android.annotation.SuppressLint
import android.content.Context
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.matrubhoomi.field.data.FieldDb
import com.matrubhoomi.field.data.LocationFix
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * One fresh fix, for the moment a form is submitted.
 *
 * WHY NOT JUST USE THE LAST FIX THE SERVICE RECORDED
 * --------------------------------------------------
 * Because "where the form was filled" is a claim, and the service's last fix
 * could be four minutes and two hundred metres old — or, if the phone has been
 * still and the service dropped to its idle cadence, considerably older. A
 * submission that says a farmer was visited at a place the employee had already
 * left is worse than one that says the location could not be established.
 *
 * So this asks for a CURRENT fix, waits a bounded time for it, and falls back
 * to the last known one only when nothing fresh arrives — and the fallback is
 * visible to the caller, which shows it as "approximate" rather than passing it
 * off as a live reading.
 */
object CurrentLocation {

    data class Result(val fix: LocationFix?, val approximate: Boolean, val reason: String? = null)

    @SuppressLint("MissingPermission")
    suspend fun get(context: Context, timeoutMs: Long = 15_000): Result {
        if (!Tracking.hasForegroundLocation(context)) {
            return Result(null, false, "Location permission has not been granted.")
        }

        val client = LocationServices.getFusedLocationProviderClient(context)

        val fresh = withTimeoutOrNull(timeoutMs) {
            suspendCancellableCoroutine { cont ->
                val request = CurrentLocationRequest.Builder()
                    .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                    // Anything under half a minute old is "now" for this
                    // purpose and saves waking the GPS for a fix we have.
                    .setMaxUpdateAgeMillis(30_000)
                    .setDurationMillis(timeoutMs)
                    .build()

                val task = client.getCurrentLocation(request, null)
                task.addOnSuccessListener { location -> if (cont.isActive) cont.resume(location) }
                task.addOnFailureListener { if (cont.isActive) cont.resume(null) }
                cont.invokeOnCancellation { /* the task completes or is dropped; nothing to unwind */ }
            }
        }

        if (fresh != null) {
            return Result(
                LocationFix(
                    lat = fresh.latitude,
                    lng = fresh.longitude,
                    accuracy = if (fresh.hasAccuracy()) fresh.accuracy else null,
                    isMock = FieldDb.isMockLocation(fresh),
                    capturedAt = fresh.time,
                ),
                approximate = false,
            )
        }

        // Nothing fresh — indoors, or a cold GPS under cloud. The last known
        // fix is offered, flagged, so the employee can decide whether to step
        // outside or record it as it is.
        val last = withTimeoutOrNull(3_000) {
            suspendCancellableCoroutine { cont ->
                client.lastLocation
                    .addOnSuccessListener { if (cont.isActive) cont.resume(it) }
                    .addOnFailureListener { if (cont.isActive) cont.resume(null) }
            }
        }

        return if (last != null) {
            Result(
                LocationFix(
                    lat = last.latitude,
                    lng = last.longitude,
                    accuracy = if (last.hasAccuracy()) last.accuracy else null,
                    isMock = FieldDb.isMockLocation(last),
                    capturedAt = last.time,
                ),
                approximate = true,
                reason = "Could not get a fresh fix — using the last known position.",
            )
        } else {
            Result(null, false, "No location could be established. Step outside and try again.")
        }
    }
}
