package com.matrubhoomi.field.core

import android.content.Context
import com.matrubhoomi.field.location.Tracking
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * How a session ends when the SERVER ends it.
 *
 * WHY THIS IS ONE PLACE
 * ---------------------
 * An employee is signed out from under the app in three ways: their token
 * expires, HR deactivates them (fired, resigned — the server then answers
 * EMPLOYEE_INACTIVE to every request), or their record is gone. Whichever
 * request notices first — a screen, the sync worker at 3am, the location
 * service's batch — the same four things must happen, immediately:
 *
 *   1. the location recording STOPS. A deactivated employee's phone must not
 *      keep recording their movements into an outbox nobody will accept;
 *   2. the session is cleared, so nothing else keeps asking;
 *   3. the reason is kept, so the sign-in screen can say why;
 *   4. whatever screen is open is told, and goes to sign-in.
 *
 * Before this, the worker simply stopped syncing while the service carried on
 * recording, and the app kept showing its last screen.
 */
object Session {

    /** Emits once per forced sign-out. The UI listens and navigates. */
    private val _ended = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val ended: SharedFlow<String> = _ended.asSharedFlow()

    fun reasonFor(body: String): String = when {
        body.contains("EMPLOYEE_INACTIVE") ->
            "This account is no longer active. If that is a mistake, speak to HR."
        body.contains("INTERN_NO_APP_ACCESS") ->
            "The Matrubhoomi app is for employees. Interns do not have access."
        body.contains("EMPLOYEE_NOT_FOUND") ->
            "Your employee record could not be found. Speak to HR."
        else -> "Your session has ended. Sign in again."
    }

    /**
     * End the session because the server said so. Safe to call from any
     * thread and more than once — the second call finds nothing to undo.
     */
    fun endedByServer(context: Context, reason: String) {
        val prefs = Prefs.get(context)
        val wasSignedIn = prefs.isSignedIn
        if (prefs.onDuty) Tracking.stopDuty(context, reason = Tracking.StopReason.SignedOut)
        prefs.signOut()
        if (wasSignedIn) {
            prefs.signedOutReason = reason
            _ended.tryEmit(reason)
        }
    }

    /**
     * The server says this person is not field staff any more — moved out of
     * Sales. The session stays; the recording and the field work do not.
     */
    fun noLongerFieldStaff(context: Context) {
        val prefs = Prefs.get(context)
        prefs.isFieldStaff = false
        prefs.trackingEnabled = false
        if (prefs.onDuty) Tracking.stopDuty(context, reason = Tracking.StopReason.RoleChanged)
    }
}
