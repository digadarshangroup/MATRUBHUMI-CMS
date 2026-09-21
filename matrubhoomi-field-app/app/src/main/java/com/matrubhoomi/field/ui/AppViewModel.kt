package com.matrubhoomi.field.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.Bootstrap
import com.matrubhoomi.field.data.FieldTask
import com.matrubhoomi.field.data.FormTemplate
import com.matrubhoomi.field.data.Scheme
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.location.Tracking
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * One view model for the whole app.
 *
 * WHY ONE AND NOT SEVEN
 * ---------------------
 * Every screen here reads from the same object: the working set that /bootstrap
 * returned. Tasks, the forms those tasks need, the stage ladder and today's
 * figures are one consistent snapshot, and splitting them across per-screen view
 * models would mean four screens each holding their own copy, refreshing at
 * different moments, and disagreeing about how many visits are left.
 *
 * The app is small enough that the usual argument for splitting — this class
 * becoming a dumping ground — is answered by there being exactly one thing in
 * it: the snapshot, and the two operations that refresh or replace it.
 */
class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = Repository.get(app)
    private val prefs = Prefs.get(app)

    data class UiState(
        val loading: Boolean = false,
        val signedIn: Boolean = false,
        val bootstrap: Bootstrap? = null,
        /** Set when the last refresh failed. The screen stays usable regardless. */
        val error: String? = null,
        /** True when what is on screen came from the cache, not the network. */
        val stale: Boolean = false,
        val onDuty: Boolean = false,
        val pendingRecords: Int = 0,
        val rejectedRecords: Int = 0,
        val queuedPings: Int = 0,
        val employeeName: String = "",
        /* ── The duty bar's live figures ──────────────────────────── */
        val dutyStartedAt: Long = 0L,
        val dutyKm: Double = 0.0,
        val dutyMovingMinutes: Int = 0,
        /** Last fix the SERVER holds, so the bar can say "not reporting". */
        val dutyLastPingAt: String = "",
    )

    private val _state = MutableStateFlow(
        UiState(
            signedIn = prefs.isSignedIn,
            onDuty = prefs.onDuty,
            employeeName = prefs.employeeName,
            dutyStartedAt = prefs.dutyStartedAt,
        ),
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        // The cache is shown FIRST, before the network is even attempted. A
        // handset opened in a dead spot shows this morning's tasks instantly
        // rather than a spinner that resolves into an error.
        repo.cachedBootstrap()?.let { cached ->
            _state.value = _state.value.copy(bootstrap = cached, stale = true)
        }
        if (prefs.isSignedIn) refresh()
        refreshCounts()
    }

    /* ── Session ──────────────────────────────────────────────────── */

    fun signIn(phoneNumber: String, password: String, onResult: (String?) -> Unit) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                com.matrubhoomi.field.data.Api.get(getApplication()).login(phoneNumber.trim(), password)
            }
            _state.value = _state.value.copy(loading = false)

            when (result) {
                is ApiResult.Ok -> {
                    _state.value = _state.value.copy(signedIn = true, employeeName = prefs.employeeName)
                    refresh()
                    onResult(null)
                }
                is ApiResult.Offline -> onResult("No connection. Signing in needs one — everything after this does not.")
                is ApiResult.Unauthorised -> onResult("That phone number or password was not accepted.")
                is ApiResult.Failed -> onResult(result.message)
            }
        }
    }

    fun signOut() {
        Tracking.stopDuty(getApplication())
        prefs.signOut()
        _state.value = UiState(signedIn = false)
    }

    /* ── The working set ──────────────────────────────────────────── */

    fun refresh() {
        _state.value = _state.value.copy(loading = true)
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { repo.bootstrap() }
            _state.value = when (result) {
                is ApiResult.Ok -> _state.value.copy(
                    loading = false,
                    bootstrap = result.value,
                    // `bootstrap()` falls back to the cache when offline, so an
                    // Ok can still be stale. The screen says which.
                    stale = false,
                    error = null,
                    signedIn = true,
                    employeeName = prefs.employeeName,
                )
                is ApiResult.Offline -> _state.value.copy(
                    loading = false,
                    stale = true,
                    error = "Working offline — showing what was last downloaded.",
                )
                is ApiResult.Unauthorised -> {
                    prefs.signOut()
                    UiState(signedIn = false, error = "Your session expired. Sign in again.")
                }
                is ApiResult.Failed -> _state.value.copy(loading = false, error = result.message)
            }
            refreshCounts()
        }
    }

    fun refreshCounts() {
        viewModelScope.launch {
            val (pending, rejected, pings) = withContext(Dispatchers.IO) {
                Triple(repo.pendingCount(), repo.rejectedCount(), repo.queuedPings())
            }
            _state.value = _state.value.copy(
                pendingRecords = pending,
                rejectedRecords = rejected,
                queuedPings = pings,
                onDuty = prefs.onDuty,
            )
        }
    }

    /* ── Duty ─────────────────────────────────────────────────────── */

    fun setDuty(on: Boolean) {
        if (on) Tracking.startDuty(getApplication()) else Tracking.stopDuty(getApplication())
        _state.value = _state.value.copy(
            onDuty = prefs.onDuty,
            dutyStartedAt = prefs.dutyStartedAt,
            // Zeroed on the way out so the bar cannot leave yesterday's distance
            // on screen at tomorrow's first tap.
            dutyKm = if (prefs.onDuty) _state.value.dutyKm else 0.0,
            dutyMovingMinutes = if (prefs.onDuty) _state.value.dutyMovingMinutes else 0,
        )
    }

    /**
     * The figures behind the on-duty bar, from the SERVER.
     *
     * Read from the office's own count rather than totted up on the handset, for
     * the same reason the Route screen does: an employee watching one number
     * while the desk reads another has no reason to trust either.
     */
    fun refreshDuty() {
        if (!prefs.onDuty || !prefs.isSignedIn) return
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) { repo.myDay() }
            if (result is ApiResult.Ok) {
                _state.value = _state.value.copy(
                    dutyKm = result.value.distanceKm,
                    dutyMovingMinutes = result.value.movingMinutes,
                    dutyLastPingAt = result.value.lastPingAt,
                    dutyStartedAt = prefs.dutyStartedAt,
                )
            }
            refreshCounts()
        }
    }

    /* ── Lookups the screens need ─────────────────────────────────── */

    fun task(id: String): FieldTask? = _state.value.bootstrap?.tasks?.firstOrNull { it.id == id }

    fun templateFor(task: FieldTask): FormTemplate? = repo.templateFor(task, _state.value.bootstrap)

    fun stageName(key: String): String {
        val boot = _state.value.bootstrap
        boot?.stages?.firstOrNull { it.key == key }?.name?.let { return it }
        // A follow-up's step belongs to the customer's scheme, not the default
        // pipeline. Every scheme's steps came down in the bootstrap.
        boot?.schemes?.forEach { s -> s.steps.firstOrNull { it.key == key }?.name?.let { return it } }
        return key
    }

    /**
     * The step's name as the task was ASSIGNED, frozen on the server. Preferred
     * over a live lookup so a step renamed since still reads as it did when the
     * employee was sent out.
     */
    fun stageName(task: FieldTask): String =
        task.stageName.ifBlank { stageName(task.stageKey) }

    fun schemes(): List<Scheme> = _state.value.bootstrap?.schemes ?: emptyList()

    fun acceptTask(task: FieldTask) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { repo.acceptTask(task.id) }
            refresh()
        }
    }
}
