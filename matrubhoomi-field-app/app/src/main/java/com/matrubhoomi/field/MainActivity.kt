package com.matrubhoomi.field

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.matrubhoomi.field.core.Prefs
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.sync.Notifier
import com.matrubhoomi.field.ui.AppBottomBar
import com.matrubhoomi.field.ui.AppDrawer
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.Routes
import com.matrubhoomi.field.ui.components.Chrome
import com.matrubhoomi.field.ui.components.DutyBar
import com.matrubhoomi.field.ui.components.AppSnackbarHost
import com.matrubhoomi.field.ui.components.LocalChrome
import com.matrubhoomi.field.ui.components.LocalToast
import com.matrubhoomi.field.ui.components.Toaster
import com.matrubhoomi.field.ui.screens.ApprovalsScreen
import com.matrubhoomi.field.ui.screens.AttendanceScreen
import com.matrubhoomi.field.ui.screens.DocumentsScreen
import com.matrubhoomi.field.ui.screens.FormScreen
import com.matrubhoomi.field.ui.screens.HolidaysScreen
import com.matrubhoomi.field.ui.screens.LeadDetailScreen
import com.matrubhoomi.field.ui.screens.LeadsScreen
import com.matrubhoomi.field.ui.screens.LeaveScreen
import com.matrubhoomi.field.ui.screens.LockScreen
import com.matrubhoomi.field.ui.screens.LoginScreen
import com.matrubhoomi.field.ui.screens.MapScreen
import com.matrubhoomi.field.ui.screens.MeScreen
import com.matrubhoomi.field.ui.screens.MoreScreen
import com.matrubhoomi.field.ui.screens.NewLeadScreen
import com.matrubhoomi.field.ui.screens.NotificationsScreen
import com.matrubhoomi.field.ui.screens.OvertimeScreen
import com.matrubhoomi.field.ui.screens.PayslipsScreen
import com.matrubhoomi.field.ui.screens.ProfileScreen
import com.matrubhoomi.field.ui.screens.RegularizeScreen
import com.matrubhoomi.field.ui.screens.RouteScreen
import com.matrubhoomi.field.ui.screens.SetPasswordScreen
import com.matrubhoomi.field.ui.screens.StandingsScreen
import com.matrubhoomi.field.ui.screens.TaskDetailScreen
import com.matrubhoomi.field.ui.screens.TodayScreen
import com.matrubhoomi.field.ui.screens.WorkScreen
import com.matrubhoomi.field.ui.tabsFor
import com.matrubhoomi.field.ui.theme.FieldTheme
import kotlinx.coroutines.launch

/**
 * The whole app's navigation, in one file.
 *
 * THREE LAYERS, ON PURPOSE
 * ------------------------
 *   the MENU (drawer)   every place this person may go — see ui/Drawer.kt;
 *   the TABS            the five they go to most, chosen by role — ui/Nav.kt;
 *   PUSHED pages        a task, a form, one farmer's history — the bar hidden
 *                       and a back arrow in its place. "Record this visit" is a
 *                       job you finish or abandon, not a place you wander in.
 *
 * WHAT THE SERVER DECIDES, NOT THIS FILE
 * --------------------------------------
 * Whether this person is field staff, whether their location may be recorded,
 * whether they have a team to approve for. Location is asked for ONLY when the
 * server says this person is tracked — an accountant opening the app is never
 * shown a location prompt. And Android will not grant background location in
 * the same request as foreground location, so the "all the time" upgrade is
 * asked for later, from the Today screen, where the reason can be explained.
 */
class MainActivity : FragmentActivity() {

    /** A route a notification asked to open, applied once signed in. */
    private var pendingOpen by mutableStateOf<String?>(null)

    /** The app lock, when on: shown at a cold start and after a minute away. */
    private var locked by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Explicitly LIGHT bars — dark icons on a transparent background.
        // The no-argument enableEdgeToEdge() picks its icon colour from the
        // SYSTEM's dark-mode setting, so on a phone set to dark it drew white
        // status icons over this app's white top bar: an invisible clock and an
        // invisible battery meter. The app's theme is light by choice
        // (Theme.kt), so the bars have to be told the same thing.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )

        val prefs = Prefs.get(this)
        locked = prefs.appLockEnabled && prefs.isSignedIn
        pendingOpen = intent?.getStringExtra(Notifier.EXTRA_OPEN)

        setContent {
            val vm: AppViewModel = viewModel()
            val state by vm.state.collectAsState()
            FieldTheme(textScale = state.textScale) {
                val nav = rememberNavController()

                val permissionLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestMultiplePermissions(),
                ) { vm.permissionsChanged() }

                // Notifications for everybody — approvals and decisions arrive
                // as notifications. Location ONLY for somebody the server says
                // is tracked, and only once it has said so. Nothing is asked
                // before sign-in: a prompt on the very first screen, before the
                // app has said what it is, is the one most people refuse.
                LaunchedEffect(state.signedIn, state.caps.tracking, state.mustChangePassword) {
                    // Not over the choose-your-password screen: one thing at a time.
                    if (!state.signedIn || state.mustChangePassword) return@LaunchedEffect
                    val wanted = buildList {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
                        if (state.caps.tracking && !com.matrubhoomi.field.location.Tracking.hasForegroundLocation(this@MainActivity)) {
                            add(Manifest.permission.ACCESS_FINE_LOCATION)
                            add(Manifest.permission.ACCESS_COARSE_LOCATION)
                        }
                    }.filterNot {
                        androidx.core.content.ContextCompat.checkSelfPermission(this@MainActivity, it) ==
                            android.content.pm.PackageManager.PERMISSION_GRANTED
                    }
                    if (wanted.isNotEmpty()) permissionLauncher.launch(wanted.toTypedArray())
                }

                // Coming back to the app is the moment to re-assert the
                // recording: if an OEM cleaner killed the service while the
                // phone was in a pocket, this puts it back before the employee
                // has finished reading their task list.
                LaunchedEffect(state.signedIn) {
                    if (state.signedIn) Tracking.ensure(this@MainActivity)
                }

                // The ground, painted once, behind every route. Without it a
                // screen that is not a Scaffold renders on whatever the window
                // happens to be, which on a dark-mode handset is black.
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    if (locked && state.signedIn) {
                        LockScreen(
                            activity = this@MainActivity,
                            name = state.profile.name.ifBlank { state.employeeName },
                            onUnlocked = { locked = false },
                            onSignOut = { vm.signOut { locked = false } },
                        )
                    } else if (state.signedIn && state.mustChangePassword) {
                        // Before anything else: a password of their own. See
                        // SetPasswordScreen for why nothing opens until then.
                        SetPasswordScreen(vm)
                    } else {
                        AppShell(vm = vm, nav = nav, state = state, pendingOpen = pendingOpen, onOpened = { pendingOpen = null })
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(Notifier.EXTRA_OPEN)?.let { pendingOpen = it }
    }

    override fun onStart() {
        super.onStart()
        val prefs = Prefs.get(this)
        if (prefs.appLockEnabled && prefs.isSignedIn && prefs.backgroundedAt > 0 &&
            System.currentTimeMillis() - prefs.backgroundedAt > LOCK_AFTER_MS
        ) {
            locked = true
        }
    }

    override fun onStop() {
        super.onStop()
        Prefs.get(this).backgroundedAt = System.currentTimeMillis()
    }

    override fun onResume() {
        super.onResume()
        // Same reasoning as the LaunchedEffect above, for the case where the
        // activity was never recreated — the app was simply backgrounded.
        Tracking.ensure(this)
    }

    companion object {
        /** A quick switch to another app does not relock; a minute away does. */
        private const val LOCK_AFTER_MS = 60_000L
    }
}

@Composable
private fun AppShell(
    vm: AppViewModel,
    nav: NavHostController,
    state: AppViewModel.UiState,
    pendingOpen: String?,
    onOpened: () -> Unit,
) {
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val tabs = tabsFor(state.caps)
    val isTab: (String?) -> Boolean = { r -> r != null && tabs.any { it.route == r } }
    val barVisible = state.signedIn && isTab(route)
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    val snack = androidx.compose.runtime.remember { androidx.compose.material3.SnackbarHostState() }
    val toaster = androidx.compose.runtime.remember(snack, scope) { Toaster(snack, scope) }

    // Signed out is a destination, not a different graph. `popUpTo(0)` clears
    // everything behind it so the back button cannot walk into the app from the
    // sign-in screen.
    //
    // The menu is put away on every change of session, in both directions: a
    // menu left open at sign-out would greet the next person to sign in on this
    // phone with the previous one's name.
    LaunchedEffect(state.signedIn) {
        drawer.snapTo(DrawerValue.Closed)
        if (!state.signedIn && route != Routes.LOGIN) {
            nav.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } }
        }
    }

    // Resuming re-reads what can change behind the app's back.
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) vm.onResume()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    fun go(target: String) {
        val resolved = Routes.resolve(target).let { if (target.startsWith("newLead")) target else it }
        if (tabs.any { it.route == resolved }) {
            nav.navigate(resolved) {
                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        } else {
            nav.navigate(resolved) { launchSingleTop = true }
        }
    }

    // A notification tapped while signed in opens the screen it is about.
    LaunchedEffect(pendingOpen, state.signedIn, state.bootstrap != null) {
        val target = pendingOpen ?: return@LaunchedEffect
        if (state.signedIn && state.bootstrap != null) {
            go(target)
            onOpened()
        }
    }

    // The duty figures tick while the recording runs, and only then. The bar is
    // a live readout; a static one that says "on duty" without moving is the
    // thing a frozen app also says.
    LaunchedEffect(state.onDuty) {
        if (!state.onDuty) return@LaunchedEffect
        vm.refreshDuty()
        while (true) {
            kotlinx.coroutines.delay(30_000)
            vm.refreshDuty()
        }
    }

    // The number of ASSIGNMENTS still open, not the units of work inside them.
    val openWork = state.bootstrap?.tasks.orEmpty().count { it.doneCount < it.targetCount }
    val needsAttention = state.pendingRecords + state.rejectedRecords

    var confirmEndDuty by androidx.compose.runtime.remember { mutableStateOf(false) }
    if (confirmEndDuty) {
        com.matrubhoomi.field.ui.components.EndDutyDialog(
            onConfirm = { vm.setDuty(false) },
            onDismiss = { confirmEndDuty = false },
            fieldAttendance = state.caps.fieldAttendance,
        )
    }

    val chrome = Chrome(
        isTab = isTab,
        currentRoute = { route },
        openDrawer = { scope.launch { drawer.open() } },
        back = { if (!nav.popBackStack()) go(Routes.TODAY) },
        open = { go(it) },
    )

    CompositionLocalProvider(LocalChrome provides chrome, LocalToast provides toaster) {
        ModalNavigationDrawer(
            drawerState = drawer,
            // Swiping the menu open only from a tab: on a pushed page the edge
            // swipe belongs to the page (a map, a form) and to Back.
            gesturesEnabled = barVisible || drawer.isOpen,
            // ALWAYS a sheet, even signed out. With no sheet the drawer has no
            // width, so its closed and open positions are the same point — and
            // when the menu arrives at sign-in it arrives at that point: open,
            // over the home screen, with nobody having asked for it.
            drawerContent = {
                if (!state.signedIn) {
                    androidx.compose.material3.ModalDrawerSheet { }
                } else {
                    AppDrawer(
                        profile = state.profile,
                        caps = state.caps,
                        onDuty = state.onDuty,
                        currentRoute = route,
                        approvals = state.approvals,
                        unread = state.unread,
                        openWork = openWork,
                        onNavigate = { target ->
                            scope.launch { drawer.close() }
                            go(target)
                        },
                        onSignOut = {
                            scope.launch { drawer.close() }
                            vm.signOut()
                        },
                    )
                }
            },
        ) {
            Scaffold(
                snackbarHost = { AppSnackbarHost(snack) },
                bottomBar = {
                    // Slid rather than swapped: a bar that vanishes the instant a
                    // form opens makes the screen appear to jump.
                    AnimatedVisibility(
                        visible = barVisible,
                        enter = slideInVertically { it },
                        exit = slideOutVertically { it },
                    ) {
                        Column {
                            // Above the tabs, not inside them: the recording is
                            // not a place in the app, it is a thing happening
                            // regardless of which place you are looking at.
                            AnimatedVisibility(visible = state.onDuty && state.caps.tracking) {
                                DutyBar(
                                    startedAt = state.dutyStartedAt,
                                    km = state.dutyKm,
                                    movingMinutes = state.dutyMovingMinutes,
                                    lastPingAt = state.dutyLastPingAt,
                                    onEnd = { confirmEndDuty = true },
                                )
                            }
                            AppBottomBar(
                                nav = nav,
                                tabs = tabs,
                                currentRoute = route,
                                badges = mapOf(
                                    Routes.WORK to openWork,
                                    Routes.ME to needsAttention,
                                ),
                            )
                        }
                    }
                },
            ) { padding ->
                AppRoutes(vm = vm, nav = nav, go = ::go, modifier = Modifier.padding(bottom = padding.calculateBottomPadding()))
            }
        }
    }
}

@Composable
private fun AppRoutes(
    vm: AppViewModel,
    nav: NavHostController,
    go: (String) -> Unit,
    modifier: Modifier,
) {
    NavHost(
        navController = nav,
        /*
         * FIXED, ALWAYS. NOT `if (signedIn) Today else Login`.
         *
         * A nav graph is built once and remembered. Making the start
         * destination conditional meant that an app opened signed-OUT kept
         * `login` as its start destination forever — including after sign-in
         * popped `login` off the stack with `inclusive = true`. Every
         * bottom-bar tap then ran `popUpTo(findStartDestination())` against a
         * destination that no longer existed, and the host restored to nothing:
         * a blank screen, no crash, nothing in the log.
         */
        startDestination = Routes.TODAY,
        modifier = modifier,
    ) {
        /* ── The way in ────────────────────────────────────────── */

        composable(Routes.LOGIN) {
            LoginScreen(vm) {
                nav.navigate(Routes.TODAY) { popUpTo(Routes.LOGIN) { inclusive = true } }
            }
        }

        /* ── Tabs (which five depends on the person) ───────────── */

        composable(Routes.TODAY) {
            TodayScreen(
                vm = vm,
                onOpen = go,
                onOpenTask = { nav.navigate(Routes.task(it)) },
                onNewLead = { nav.navigate(Routes.newLead()) },
            )
        }
        composable(Routes.WORK) { WorkScreen(vm = vm, onOpenTask = { nav.navigate(Routes.task(it)) }) }
        composable(Routes.LEADS) { LeadsScreen(vm = vm, onOpenLead = { nav.navigate(Routes.leadDetail(it)) }) }
        composable(Routes.ROUTE) { RouteScreen(vm = vm, onOpenMap = { nav.navigate(Routes.MAP) }) }
        composable(Routes.ME) { MeScreen(vm = vm, onOpen = go) }
        composable(Routes.ATTENDANCE) { AttendanceScreen(onFixDay = { nav.navigate(Routes.regularize(it)) }) }
        composable(Routes.LEAVE) { LeaveScreen(vm = vm, onOpen = go) }
        composable(Routes.PAYSLIPS) { PayslipsScreen() }

        /* ── Everybody's other places, from the menu ───────────── */

        composable(
            Routes.REGULARIZE,
            arguments = listOf(navArgument("date") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry -> RegularizeScreen(initialDate = entry.arguments?.getString("date")) }
        composable(Routes.OVERTIME) { OvertimeScreen() }
        composable(Routes.DOCUMENTS) { DocumentsScreen() }
        composable(Routes.HOLIDAYS) { HolidaysScreen() }
        composable(Routes.STANDINGS) { StandingsScreen(vm = vm) }
        composable(Routes.APPROVALS) { ApprovalsScreen(vm = vm) }
        composable(Routes.NOTIFICATIONS) { NotificationsScreen(vm = vm, onOpen = go) }
        composable(Routes.PROFILE) { ProfileScreen(vm = vm) }
        composable(Routes.SETTINGS) {
            MoreScreen(
                vm = vm,
                onSignedOut = { nav.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } } },
            )
        }
        composable(Routes.MAP) { MapScreen(vm = vm) }

        /* ── Field work, pushed on top ─────────────────────────── */

        composable(
            Routes.TASK,
            arguments = listOf(navArgument("taskId") { type = NavType.StringType }),
        ) { entry ->
            TaskDetailScreen(
                vm = vm,
                taskId = entry.arguments?.getString("taskId").orEmpty(),
                onBack = { nav.popBackStack() },
                onRecordVisit = { id, leadId -> nav.navigate(Routes.form(id, leadId)) },
                onAddLead = { id -> nav.navigate(Routes.newLead(id)) },
            )
        }

        composable(
            Routes.FORM,
            arguments = listOf(
                navArgument("taskId") { type = NavType.StringType },
                navArgument("leadId") { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
        ) { entry ->
            FormScreen(
                vm = vm,
                taskId = entry.arguments?.getString("taskId").orEmpty(),
                leadId = entry.arguments?.getString("leadId"),
                onBack = { nav.popBackStack() },
                onDone = {
                    // Straight back to the task, not to a confirmation
                    // screen: the next farmer is waiting and the record is
                    // already safe on the phone.
                    vm.refresh()
                    nav.popBackStack(Routes.TODAY, inclusive = false)
                },
            )
        }

        composable(
            Routes.NEW_LEAD,
            arguments = listOf(navArgument("taskId") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { entry ->
            NewLeadScreen(
                vm = vm,
                taskId = entry.arguments?.getString("taskId"),
                onBack = { nav.popBackStack() },
                onContinueToForm = { id ->
                    nav.navigate(Routes.form(id)) {
                        // The lead screen is finished with — going back from the
                        // form should reach the task, not a half-filled form for
                        // a farmer already recorded.
                        popUpTo(Routes.NEW_LEAD) { inclusive = true }
                    }
                },
                onCreated = { nav.popBackStack() },
            )
        }

        composable(
            Routes.LEAD_DETAIL,
            arguments = listOf(navArgument("leadId") { type = NavType.StringType }),
        ) { entry ->
            LeadDetailScreen(
                vm = vm,
                leadId = entry.arguments?.getString("leadId").orEmpty(),
                onBack = { nav.popBackStack() },
            )
        }
    }
}
