package com.matrubhoomi.field.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.core.Session
import com.matrubhoomi.field.data.Api
import com.matrubhoomi.field.data.ApiResult
import com.matrubhoomi.field.data.Bootstrap
import com.matrubhoomi.field.data.Capabilities
import com.matrubhoomi.field.data.FieldDb
import com.matrubhoomi.field.data.FieldTask
import com.matrubhoomi.field.data.FormTemplate
import com.matrubhoomi.field.data.Profile
import com.matrubhoomi.field.data.Scheme
import com.matrubhoomi.field.data.Repository
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.sync.InboxWorker
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
 * Every screen reads from the same object: the working set /bootstrap returned
 * — who this is, what their app shows them, their field work. Splitting it
 * across per-screen view models would mean screens disagreeing about how many
 * visits are left, or whether this person is a manager.
 *
 * The HR screens (leave, payslips, approvals…) load their own records when
 * opened: they are online-only and nothing else reads them.
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
        /* ── Badges ───────────────────────────────────────────────── */
        val approvals: Int = 0,
        val unread: Int = 0,
        /** What happened to today's field attendance when duty ended. */
        val attendanceNote: String = "",
        /**
         * Bumped whenever a permission may have changed — the system dialog
         * closing, or coming back from Settings. Android tells nobody when a
         * permission is granted, so the screens that warn about a missing one
         * read this to know it is time to look again; without it, a warning
         * stayed on screen after the very tap that fixed it.
         */
        val permissionsVersion: Int = 0,
        /** Still on the password HR issued — the app asks for their own first. */
        val mustChangePassword: Boolean = false,
        /** A newer build HR has published, when there is one. */
        val update: com.matrubhoomi.field.data.AppRelease? = null,
        /** The app's own text size (Settings), on top of the phone's. */
        val textScale: Float = 1f,
    ) {
        val profile: Profile get() = bootstrap?.profile ?: Profile.EMPTY
        /** Before the first bootstrap, a signed-in person gets nothing role-dependent. */
        val caps: Capabilities get() = bootstrap?.capabilities ?: Capabilities.NONE
    }

    private val _state = MutableStateFlow(
        UiState(
            signedIn = prefs.isSignedIn,
            onDuty = prefs.onDuty,
            employeeName = prefs.employeeName,
            dutyStartedAt = prefs.dutyStartedAt,
            attendanceNote = prefs.attendanceNote,
            mustChangePassword = prefs.isSignedIn && prefs.mustChangePassword,
            update = cachedUpdate(prefs),
            textScale = prefs.textScale,
        ),
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

    /**
     * Duty and the attendance note change behind the screen's back: the sync
     * worker stores what happened to the field day a few seconds AFTER duty
     * ends, and "End duty" can be pressed on the notification. Held in a field
     * because SharedPreferences keeps its listeners only weakly.
     */
    private val prefsWatcher = prefs.watch { refreshCounts() }

    override fun onCleared() {
        prefs.unwatch(prefsWatcher)
        super.onCleared()
    }

    init {
        // The cache is shown FIRST, before the network is even attempted. A
        // handset opened in a dead spot shows this morning's tasks instantly
        // rather than a spinner that resolves into an error.
        repo.cachedBootstrap()?.let { cached ->
            _state.value = _state.value.copy(
                bootstrap = cached,
                stale = true,
                approvals = cached.counts.approvals,
                unread = cached.counts.unreadNotifications,
            )
        }
        if (prefs.isSignedIn) refresh()
        refreshCounts()

        // The server can end the session from any request — HR deactivating
        // somebody, a token expiring. Whichever request notices, this puts the
        // screen back to signed-out.
        viewModelScope.launch {
            Session.ended.collect { _state.value = UiState(signedIn = false, error = it) }
        }
    }

    /* ── Session ──────────────────────────────────────────────────── */

    fun signIn(phoneNumber: String, password: String, onResult: (String?) -> Unit) {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                Api.get(getApplication()).login(phoneNumber.trim(), password)
            }
            _state.value = _state.value.copy(loading = false)

            when (result) {
                is ApiResult.Ok -> {
                    prefs.signedOutReason = ""
                    // The first inbox check after signing in only remembers
                    // where the inbox is — it must not replay last month.
                    prefs.inboxSeenAt = ""
                    // Kept in memory only, for the set-your-own-password screen
                    // that follows: it is the "current password" that change
                    // needs, and asking for it again seconds later is absurd.
                    justTypedPassword = password
                    _state.value = _state.value.copy(
                        signedIn = true,
                        employeeName = prefs.employeeName,
                        mustChangePassword = prefs.mustChangePassword,
                    )
                    refresh()
                    InboxWorker.schedule(getApplication())
                    InboxWorker.now(getApplication())
                    onResult(null)
                }
                is ApiResult.Offline -> onResult("No connection. Signing in needs one — everything after this does not.")
                is ApiResult.Unauthorised -> onResult("That phone number or password was not accepted.")
                is ApiResult.Failed -> onResult(result.message)
            }
        }
    }

    /**
     * Signing out on purpose. On duty, the office is told duty ended BEFORE the
     * session goes — afterwards there is nobody to send it as.
     */
    fun signOut(onDone: () -> Unit = {}) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                if (prefs.onDuty) {
                    Tracking.stopDuty(getApplication())
                    val db = FieldDb.get(getApplication())
                    val (ids, events) = db.takeDutyEvents(prefs.employeeId)
                    if (ids.isNotEmpty() && Api.get(getApplication()).sendDutyEvents(events) is ApiResult.Ok) {
                        db.deleteEvents(ids)
                    }
                }
                prefs.signOut()
                InboxWorker.cancel(getApplication())
            }
            _state.value = UiState(signedIn = false)
            onDone()
        }
    }

    /** A permission may have changed: have every warning look again. */
    fun permissionsChanged() {
        _state.value = _state.value.copy(permissionsVersion = _state.value.permissionsVersion + 1)
        refreshCounts()
    }

    /** Re-read what can change behind the app's back: the session, duty, permissions. */
    /** The password typed at sign-in, while the set-your-own screen needs it. Never stored. */
    var justTypedPassword: String? = null
        private set

    fun setTextScale(factor: Float) {
        prefs.textScale = factor
        _state.value = _state.value.copy(textScale = factor)
    }

    /** The server accepted a password of their own. */
    fun passwordChosen() {
        prefs.mustChangePassword = false
        justTypedPassword = null
        _state.value = _state.value.copy(mustChangePassword = false)
    }

    /**
     * Is there a newer build? Asked at most every six hours (or when [force]d
     * from Settings) — the answer changes when HR publishes, not by the minute.
     */
    fun checkForUpdate(force: Boolean = false, onDone: (Boolean) -> Unit = {}) {
        if (!force && System.currentTimeMillis() - prefs.updateCheckedAt < 6 * 3600_000L) return
        viewModelScope.launch {
            val r = withContext(Dispatchers.IO) { repo.latestRelease() }
            if (r is ApiResult.Ok) {
                prefs.updateCheckedAt = System.currentTimeMillis()
                val newer = r.value?.takeIf { it.versionCode > com.matrubhoomi.field.BuildConfig.VERSION_CODE && it.url.isNotBlank() }
                prefs.updateJson = newer?.toJson().orEmpty()
                _state.value = _state.value.copy(update = newer)
                onDone(true)
            } else onDone(false)
        }
    }

    fun onResume() {
        if (!prefs.isSignedIn && _state.value.signedIn) {
            _state.value = UiState(signedIn = false, error = prefs.signedOutReason.ifBlank { null })
            return
        }
        if (prefs.isSignedIn) {
            _state.value = _state.value.copy(permissionsVersion = _state.value.permissionsVersion + 1)
            refreshCounts()
            refreshBadges()
            InboxWorker.now(getApplication())
        }
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
                    approvals = result.value.counts.approvals,
                    unread = result.value.counts.unreadNotifications,
                    onDuty = prefs.onDuty,
                )
                is ApiResult.Offline -> _state.value.copy(
                    loading = false,
                    stale = true,
                    error = "Working offline — showing what was last downloaded.",
                )
                // Already signed out by the session guard (core/Session.kt).
                is ApiResult.Unauthorised -> UiState(signedIn = false, error = prefs.signedOutReason.ifBlank { null })
                is ApiResult.Failed -> _state.value.copy(loading = false, error = result.message)
            }
            refreshCounts()
            if (result is ApiResult.Ok) checkForUpdate()
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
                dutyStartedAt = prefs.dutyStartedAt,
                attendanceNote = prefs.attendanceNote,
            )
        }
    }

    /** The two numbers in the menu: approvals waiting on me, and unread notifications. */
    fun refreshBadges() {
        if (!prefs.isSignedIn) return
        viewModelScope.launch {
            val (summary, inbox) = withContext(Dispatchers.IO) {
                repo.approvalsSummary() to repo.inbox(limit = 1)
            }
            var s = _state.value
            if (summary is ApiResult.Ok) s = s.copy(approvals = summary.value.total)
            if (inbox is ApiResult.Ok) s = s.copy(unread = inbox.value.unread)
            _state.value = s
        }
    }

    fun setUnread(count: Int) {
        _state.value = _state.value.copy(unread = count)
    }

    /* ── Duty ─────────────────────────────────────────────────────── */

    /** @return false when this person may not record — not field staff. */
    fun setDuty(on: Boolean): Boolean {
        val ok = if (on) Tracking.startDuty(getApplication()) else { Tracking.stopDuty(getApplication()); true }
        _state.value = _state.value.copy(
            onDuty = prefs.onDuty,
            dutyStartedAt = prefs.dutyStartedAt,
            // Zeroed on the way out so the bar cannot leave yesterday's distance
            // on screen at tomorrow's first tap.
            dutyKm = if (prefs.onDuty) _state.value.dutyKm else 0.0,
            dutyMovingMinutes = if (prefs.onDuty) _state.value.dutyMovingMinutes else 0,
        )
        return ok
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

/** The release the last check found, if this build is still older than it. */
private fun cachedUpdate(prefs: Prefs): com.matrubhoomi.field.data.AppRelease? =
    prefs.updateJson.takeIf { it.isNotBlank() }
        ?.let { runCatching { com.matrubhoomi.field.data.AppRelease.from(org.json.JSONObject(it)) }.getOrNull() }
        ?.takeIf { it.versionCode > com.matrubhoomi.field.BuildConfig.VERSION_CODE }
