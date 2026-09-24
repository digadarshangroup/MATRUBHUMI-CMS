package com.matrubhoomi.field.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import com.matrubhoomi.field.data.Capabilities

/**
 * Where everything is, for whoever is holding the phone.
 *
 * ONE APP, TWO SHAPES
 * -------------------
 * The whole workforce signs into this app now. What differs is the bottom bar —
 * the five places a person goes most — and it is chosen from the SERVER's
 * capabilities, never from a department name on the handset:
 *
 *   field staff   Today · Work · Customers · Route · Me
 *   everybody     Home · Attendance · Leave · Pay · Me
 *
 * Everything else — corrections, overtime, documents, holidays, standings,
 * approvals, the inbox — is one tap away in the MENU (the drawer), which lists
 * every place this person may go and nothing they may not. A salesperson's
 * attendance and leave live there; an accountant never sees Route, because
 * nothing about them is tracked.
 *
 * Five tabs is still the ceiling: a sixth pushes the labels to two lines on a
 * 5" handset, which is where this runs.
 */
enum class Tab(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val icon: ImageVector,
) {
    Today(Routes.TODAY, "Today", Icons.Filled.Home, Icons.Outlined.Home),
    Home(Routes.TODAY, "Home", Icons.Filled.Home, Icons.Outlined.Home),
    Work(Routes.WORK, "Work", Icons.AutoMirrored.Filled.Assignment, Icons.AutoMirrored.Outlined.Assignment),
    Leads(Routes.LEADS, "Customers", Icons.Filled.Groups, Icons.Outlined.Groups),
    Route(Routes.ROUTE, "Route", Icons.Filled.Map, Icons.Outlined.Map),
    Attendance(Routes.ATTENDANCE, "Attendance", Icons.Filled.CalendarMonth, Icons.Outlined.CalendarMonth),
    Leave(Routes.LEAVE, "Leave", Icons.Filled.EventAvailable, Icons.Outlined.EventAvailable),
    Pay(Routes.PAYSLIPS, "Pay", Icons.Filled.AccountBalanceWallet, Icons.Outlined.AccountBalanceWallet),
    Me(Routes.ME, "Me", Icons.Filled.Person, Icons.Outlined.Person),
}

/** The bottom bar for this person. */
fun tabsFor(caps: Capabilities): List<Tab> =
    if (caps.field) listOf(Tab.Today, Tab.Work, Tab.Leads, Tab.Route, Tab.Me)
    else listOf(Tab.Home, Tab.Attendance, Tab.Leave, Tab.Pay, Tab.Me)

/** Every route in the app. Tabs and pushed pages share this one namespace. */
object Routes {
    const val LOGIN = "login"

    const val TODAY = "today"
    const val WORK = "work"
    const val LEADS = "leads"
    const val ROUTE = "route"
    const val ME = "me"

    const val ATTENDANCE = "attendance"
    const val LEAVE = "leave"
    const val PAYSLIPS = "payslips"
    const val REGULARIZE = "regularize?date={date}"
    const val OVERTIME = "overtime"
    const val DOCUMENTS = "documents"
    const val HOLIDAYS = "holidays"
    const val STANDINGS = "standings"
    const val APPROVALS = "approvals"
    const val NOTIFICATIONS = "notifications"
    const val PROFILE = "profile"
    const val SETTINGS = "settings"
    const val MAP = "map"

    const val TASK = "task/{taskId}"
    const val FORM = "form/{taskId}?leadId={leadId}"
    const val NEW_LEAD = "newLead?taskId={taskId}"
    const val LEAD_DETAIL = "lead/{leadId}"

    fun task(id: String) = "task/$id"
    fun form(taskId: String, leadId: String? = null) =
        if (leadId == null) "form/$taskId" else "form/$taskId?leadId=$leadId"
    fun newLead(taskId: String? = null) = if (taskId == null) "newLead" else "newLead?taskId=$taskId"
    fun leadDetail(id: String) = "lead/$id"
    fun regularize(date: String? = null) = if (date == null) "regularize" else "regularize?date=$date"

    /**
     * A short name from a notification or the menu → a real route. Unknown
     * names land on the inbox rather than nowhere.
     */
    fun resolve(name: String): String = when (name) {
        "today", "home" -> TODAY
        "work" -> WORK
        "leads", "customers" -> LEADS
        "route" -> ROUTE
        "me" -> ME
        "attendance" -> ATTENDANCE
        "leave" -> LEAVE
        "payslips", "pay" -> PAYSLIPS
        "regularize" -> "regularize"
        "overtime" -> OVERTIME
        "documents" -> DOCUMENTS
        "holidays" -> HOLIDAYS
        "standings" -> STANDINGS
        "approvals" -> APPROVALS
        "profile" -> PROFILE
        "settings" -> SETTINGS
        else -> NOTIFICATIONS
    }
}

@Composable
fun AppBottomBar(
    nav: NavHostController,
    tabs: List<Tab>,
    currentRoute: String?,
    badges: Map<String, Int>,
) {
    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        tabs.forEach { tab ->
            val selected = currentRoute == tab.route

            NavigationBarItem(
                selected = selected,
                onClick = {
                    if (selected) return@NavigationBarItem
                    nav.navigate(tab.route) {
                        // The three flags that make a bottom bar behave like a
                        // bottom bar rather than a stack of history:
                        //   popUpTo(start)  — tapping tabs does not pile up a
                        //                     back stack twenty deep
                        //   saveState       — a half-typed search survives a
                        //                     trip to another tab and back
                        //   launchSingleTop — tapping the tab you are on does
                        //                     not push a second copy
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = {
                    val badge = badges[tab.route] ?: 0
                    BadgedBox(
                        badge = {
                            if (badge > 0) {
                                Badge(
                                    containerColor = MaterialTheme.colorScheme.error,
                                    contentColor = MaterialTheme.colorScheme.onError,
                                ) { Text(if (badge > 99) "99+" else "$badge") }
                            }
                        },
                    ) {
                        Icon(if (selected) tab.selectedIcon else tab.icon, contentDescription = tab.label)
                    }
                },
                // One line, shrunk to fit — "Customers" used to break into
                // "Custo / mers" on a narrow phone with a large font.
                label = { com.matrubhoomi.field.ui.components.FitText(tab.label, style = MaterialTheme.typography.labelMedium) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    selectedTextColor = MaterialTheme.colorScheme.primary,
                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}
