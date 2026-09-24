package com.matrubhoomi.field.ui.components

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.LocationOff
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority
import com.matrubhoomi.field.location.Tracking

/**
 * The checks between "Start duty" and a recording that actually records.
 *
 * Duty used to start on a phone with its location switched OFF: the switch
 * turned green, the notification said "recording", and the day's route came
 * out empty. Starting duty now goes through, in order:
 *
 *   1. the location PERMISSION — asked for in the system dialog if missing;
 *   2. the phone's location SWITCH — Play services' own "Turn on location?"
 *      dialog, one tap, without leaving the app;
 *   3. only then, duty.
 *
 * A refusal at either step explains what it costs and offers the settings
 * screen that fixes it, instead of starting a duty that records nothing.
 */
class DutyGate(val start: () -> Unit)

private enum class GateProblem { NoPermission, LocationOff }

@Composable
fun rememberDutyGate(onReady: () -> Unit): DutyGate {
    val context = LocalContext.current
    val ready by rememberUpdatedState(onReady)
    var problem by remember { mutableStateOf<GateProblem?>(null) }

    val resolution = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) {
        // Whatever the dialog returned, the switch itself is the truth.
        if (Tracking.isLocationSwitchOn(context)) ready() else problem = GateProblem.LocationOff
    }

    fun switchThenStart() {
        if (Tracking.isLocationSwitchOn(context)) {
            ready()
            return
        }
        val request = LocationSettingsRequest.Builder()
            .addLocationRequest(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L).build())
            .setAlwaysShow(true)
            .build()
        LocationServices.getSettingsClient(context).checkLocationSettings(request)
            .addOnSuccessListener { if (Tracking.isLocationSwitchOn(context)) ready() else problem = GateProblem.LocationOff }
            .addOnFailureListener { e ->
                if (e is ResolvableApiException) {
                    runCatching { resolution.launch(IntentSenderRequest.Builder(e.resolution).build()) }
                        .onFailure { problem = GateProblem.LocationOff }
                } else {
                    // No Play services dialog on this phone: the settings screen.
                    problem = GateProblem.LocationOff
                }
            }
    }

    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (Tracking.hasForegroundLocation(context)) switchThenStart() else problem = GateProblem.NoPermission
    }

    when (problem) {
        GateProblem.LocationOff -> AppDialog(
            title = "Turn on location to start duty",
            message = "Your phone's location is switched off, so nothing about your round could be recorded. " +
                "Turn it on, then start duty again.",
            icon = Icons.Outlined.LocationOff,
            tone = Tone.Warning,
            confirmLabel = "Open location settings",
            onConfirm = {
                problem = null
                runCatching {
                    context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            },
            onDismiss = { problem = null },
            dismissLabel = "Not now",
        )
        GateProblem.NoPermission -> AppDialog(
            title = "Allow location to start duty",
            message = "Your route is recorded only while you are on duty. Allow location for this app — " +
                "\"While using the app\" first, then \"Allow all the time\" so it keeps recording with the screen off.",
            icon = Icons.Outlined.LocationOn,
            tone = Tone.Warning,
            confirmLabel = "Open app settings",
            onConfirm = {
                problem = null
                Tracking.openAppSettings(context)
            },
            onDismiss = { problem = null },
            dismissLabel = "Not now",
        )
        null -> Unit
    }

    return DutyGate {
        if (Tracking.hasForegroundLocation(context)) {
            switchThenStart()
        } else {
            permissions.launch(
                buildList {
                    add(Manifest.permission.ACCESS_FINE_LOCATION)
                    add(Manifest.permission.ACCESS_COARSE_LOCATION)
                    // The on-duty notice is what keeps the recording alive; ask
                    // for it in the same breath if it is missing.
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !Tracking.hasNotifications(context)) {
                        add(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }.toTypedArray(),
            )
        }
    }
}

/** "End duty?" — ending files the day with the manager, so it is never a slip of the thumb. */
@Composable
fun EndDutyDialog(onConfirm: () -> Unit, onDismiss: () -> Unit, fieldAttendance: Boolean) {
    AppDialog(
        title = "End duty?",
        message = if (fieldAttendance) "Recording stops, and today's field day goes to your manager to confirm."
        else "Recording stops for today.",
        icon = Icons.Outlined.WarningAmber,
        tone = Tone.Warning,
        confirmLabel = "End duty",
        onConfirm = { onConfirm(); onDismiss() },
        onDismiss = onDismiss,
        dismissLabel = "Keep recording",
    )
}
