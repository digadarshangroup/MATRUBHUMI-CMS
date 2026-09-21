package com.matrubhoomi.field

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.matrubhoomi.field.location.Tracking
import com.matrubhoomi.field.ui.AppViewModel
import com.matrubhoomi.field.ui.FieldBottomBar
import com.matrubhoomi.field.ui.components.DutyBar
import com.matrubhoomi.field.ui.Routes
import com.matrubhoomi.field.ui.Tab
import com.matrubhoomi.field.ui.screens.FormScreen
import com.matrubhoomi.field.ui.screens.LeadDetailScreen
import com.matrubhoomi.field.ui.screens.LeadsScreen
import com.matrubhoomi.field.ui.screens.LoginScreen
import com.matrubhoomi.field.ui.screens.AttendanceScreen
import com.matrubhoomi.field.ui.screens.LeaveScreen
import com.matrubhoomi.field.ui.screens.MapScreen
import com.matrubhoomi.field.ui.screens.MeScreen
import com.matrubhoomi.field.ui.screens.MoreScreen
import com.matrubhoomi.field.ui.screens.NewLeadScreen
import com.matrubhoomi.field.ui.screens.RouteScreen
import com.matrubhoomi.field.ui.screens.TaskDetailScreen
import com.matrubhoomi.field.ui.screens.TodayScreen
import com.matrubhoomi.field.ui.screens.WorkScreen
import com.matrubhoomi.field.ui.showsBottomBar
import com.matrubhoomi.field.ui.theme.FieldTheme

/**
 * The whole app's navigation, in one file.
 *
 * TWO LAYERS, ON PURPOSE
 * ----------------------
 * The five TABS are the places the app has, and the bar at the bottom moves
 * between them. Everything else — a task, a form, one farmer's history — is
 * PUSHED on top, with the bar hidden and a back arrow in its place. That
 * distinction is what stops "record this visit" from feeling like a place you
 * can wander away from and back into: it is a job you finish or abandon.
 *
 * PERMISSIONS ARE ASKED FOR IN THE RIGHT ORDER, ONCE
 * --------------------------------------------------
 * Android will not grant background location in the same request as foreground
 * location — asking for both together silently drops the background one, and the
 * app then runs blind whenever the screen is off with nothing to indicate why.
 * So the foreground pair (and notifications) are requested here on first launch,
 * and the "all the time" upgrade is asked for from the Today screen, in context,
 * where the consequence of refusing it can be explained.
 */
class MainActivity : ComponentActivity() {

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

        setContent {
            FieldTheme {
                val vm: AppViewModel = viewModel()
                val state by vm.state.collectAsState()
                val nav = rememberNavController()

                val permissionLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestMultiplePermissions(),
                ) {
                    // Whatever was granted, Today re-reads the real state and
                    // shows what is still missing. Nothing here needs the
                    // result — asking twice is the failure mode to avoid.
                    vm.refreshCounts()
                }

                LaunchedEffect(Unit) {
                    val wanted = buildList {
                        add(Manifest.permission.ACCESS_FINE_LOCATION)
                        add(Manifest.permission.ACCESS_COARSE_LOCATION)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            add(Manifest.permission.POST_NOTIFICATIONS)
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
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    FieldApp(vm = vm, nav = nav, signedIn = state.signedIn, state = state)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Same reasoning as the LaunchedEffect above, for the case where the
        // activity was never recreated — the app was simply backgrounded.
        Tracking.ensure(this)
    }
}

@Composable
private fun FieldApp(
    vm: AppViewModel,
    nav: NavHostController,
    signedIn: Boolean,
    state: AppViewModel.UiState,
) {
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val barVisible = signedIn && showsBottomBar(route)

    // Signed out is a destination, not a different graph. `popUpTo(0)` clears
    // everything behind it so the back button cannot walk into the app from the
    // sign-in screen.
    LaunchedEffect(signedIn) {
        if (!signedIn && route != Routes.LOGIN) {
            nav.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } }
        }
    }

    // The number of ASSIGNMENTS still open, not the units of work inside them.
    // Summing the units showed "6" above a tab holding two tasks, which reads
    // as six things to open. The badge counts what tapping the tab reveals.
    val openWork = state.bootstrap?.tasks.orEmpty().count { it.doneCount < it.targetCount }
    val needsAttention = state.pendingRecords + state.rejectedRecords

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

    Scaffold(
        bottomBar = {
            // Slid rather than swapped: a bar that vanishes the instant a form
            // opens makes the screen appear to jump. Sliding it out reads as
            // the form covering it, which is what is actually happening.
            AnimatedVisibility(
                visible = barVisible,
                enter = slideInVertically { it },
                exit = slideOutVertically { it },
            ) {
                Column {
                    // Above the tabs, not inside them: the recording is not a
                    // place in the app, it is a thing happening regardless of
                    // which place you are looking at.
                    AnimatedVisibility(visible = state.onDuty) {
                        DutyBar(
                            startedAt = state.dutyStartedAt,
                            km = state.dutyKm,
                            movingMinutes = state.dutyMovingMinutes,
                            lastPingAt = state.dutyLastPingAt,
                            onEnd = { vm.setDuty(false) },
                        )
                    }
                    FieldBottomBar(
                        nav = nav,
                        currentRoute = route,
                        workBadge = openWork,
                        moreBadge = needsAttention,
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            /*
             * FIXED, ALWAYS. NOT `if (signedIn) Today else Login`.
             *
             * A nav graph is built once and remembered. Making the start
             * destination conditional meant that an app opened signed-OUT kept
             * `login` as its start destination forever — including after
             * sign-in popped `login` off the stack with `inclusive = true`.
             *
             * Every bottom-bar tap then ran
             * `popUpTo(findStartDestination())` against a destination that no
             * longer existed, and with `restoreState` the host restored to
             * nothing. The symptom: start duty, use a couple of tabs, come back
             * to Today — blank screen, no crash, nothing in the log.
             *
             * With a fixed start destination the bar always pops to Today,
             * which is what it means to be a bottom bar. Being signed out is
             * handled where it belongs — by navigating — in the effect below.
             */
            startDestination = Tab.Today.route,
            modifier = Modifier.padding(bottom = padding.calculateBottomPadding()),
        ) {
            /* ── The way in ────────────────────────────────────── */

            composable(Routes.LOGIN) {
                LoginScreen(vm) {
                    nav.navigate(Tab.Today.route) { popUpTo(Routes.LOGIN) { inclusive = true } }
                }
            }

            /* ── The five tabs ─────────────────────────────────── */

            composable(Tab.Today.route) {
                TodayScreen(
                    vm = vm,
                    onOpenTask = { nav.navigate(Routes.task(it)) },
                    onOpenWork = { nav.navigate(Tab.Work.route) },
                    onOpenLeads = { nav.navigate(Tab.Leads.route) },
                    onNewLead = { nav.navigate(Routes.newLead()) },
                )
            }

            composable(Tab.Work.route) {
                WorkScreen(vm = vm, onOpenTask = { nav.navigate(Routes.task(it)) })
            }

            composable(Tab.Leads.route) {
                LeadsScreen(vm = vm, onOpenLead = { nav.navigate(Routes.leadDetail(it)) })
            }

            composable(Tab.Route.route) {
                RouteScreen(vm = vm, onOpenMap = { nav.navigate(Routes.MAP) })
            }

            composable(Tab.Me.route) {
                MeScreen(
                    vm = vm,
                    onOpenAttendance = { nav.navigate(Routes.ATTENDANCE) },
                    onOpenLeave = { nav.navigate(Routes.LEAVE) },
                    onOpenSettings = { nav.navigate(Routes.SETTINGS) },
                )
            }

            /* ── Pushed on top ─────────────────────────────────── */

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
                    navArgument("leadId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
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
                        nav.popBackStack(Tab.Today.route, inclusive = false)
                    },
                )
            }

            composable(
                Routes.NEW_LEAD,
                arguments = listOf(
                    navArgument("taskId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
                ),
            ) { entry ->
                val taskId = entry.arguments?.getString("taskId")
                NewLeadScreen(
                    vm = vm,
                    taskId = taskId,
                    onBack = { nav.popBackStack() },
                    onContinueToForm = { id ->
                        nav.navigate(Routes.form(id)) {
                            // The lead screen is finished with — going back
                            // from the form should reach the task, not a
                            // half-filled form for a farmer already recorded.
                            popUpTo(Routes.NEW_LEAD) { inclusive = true }
                        }
                    },
                    onCreated = { nav.popBackStack() },
                )
            }

            composable(Routes.SETTINGS) {
                MoreScreen(
                    vm = vm,
                    onBack = { nav.popBackStack() },
                    onSignedOut = { nav.navigate(Routes.LOGIN) { popUpTo(0) { inclusive = true } } },
                )
            }

            composable(Routes.MAP) {
                MapScreen(vm = vm, onBack = { nav.popBackStack() })
            }

            composable(Routes.ATTENDANCE) {
                AttendanceScreen(onBack = { nav.popBackStack() })
            }

            composable(Routes.LEAVE) {
                LeaveScreen(onBack = { nav.popBackStack() })
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
}
