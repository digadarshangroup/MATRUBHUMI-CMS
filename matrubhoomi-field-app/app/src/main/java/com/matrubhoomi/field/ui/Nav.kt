package com.matrubhoomi.field.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.outlined.Assignment
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
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController

/**
 * The five places this app has, and the bar that moves between them.
 *
 * WHY FIVE, AND WHY THESE
 * -----------------------
 * They are the five questions a field employee actually asks, in the order a
 * day asks them: what am I doing today, what is the list, who is this farmer,
 * where have I been, and where do I stand — attendance, leave, and my own
 * settings. Anything that is not one of those is reached FROM one of them — a
 * form from a task, a lead's history from the lead, leave from Me — because a
 * destination nobody navigates to directly does not earn a permanent seat at
 * the bottom of the screen.
 *
 * A sixth would push the labels to two lines on a 5" handset, which is where
 * this runs.
 */
enum class Tab(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val icon: ImageVector,
) {
    Today("today", "Today", Icons.Filled.Home, Icons.Outlined.Home),
    Work("work", "Work", Icons.Filled.Assignment, Icons.Outlined.Assignment),
    Leads("leads", "Leads", Icons.Filled.Groups, Icons.Outlined.Groups),
    Route("route", "Route", Icons.Filled.Map, Icons.Outlined.Map),
    Me("me", "Me", Icons.Filled.Person, Icons.Outlined.Person),
}

/** Routes that are pushed ON TOP of a tab, where the bar hides. */
object Routes {
    const val LOGIN = "login"
    const val TASK = "task/{taskId}"
    const val FORM = "form/{taskId}?leadId={leadId}"
    const val NEW_LEAD = "newLead?taskId={taskId}"
    const val LEAD_DETAIL = "lead/{leadId}"
    const val SETTINGS = "settings"
    const val ATTENDANCE = "attendance"
    const val LEAVE = "leave"
    const val MAP = "map"

    fun task(id: String) = "task/$id"
    fun form(taskId: String, leadId: String? = null) =
        if (leadId == null) "form/$taskId" else "form/$taskId?leadId=$leadId"
    fun newLead(taskId: String? = null) = if (taskId == null) "newLead" else "newLead?taskId=$taskId"
    fun leadDetail(id: String) = "lead/$id"
}

@Composable
fun FieldBottomBar(
    nav: NavHostController,
    currentRoute: String?,
    workBadge: Int,
    moreBadge: Int,
) {
    NavigationBar(
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp2(),
    ) {
        Tab.entries.forEach { tab ->
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
                    val badge = when (tab) {
                        Tab.Work -> workBadge
                        Tab.Me -> moreBadge
                        else -> 0
                    }
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
                        Icon(
                            if (selected) tab.selectedIcon else tab.icon,
                            contentDescription = tab.label,
                        )
                    }
                },
                label = { Text(tab.label) },
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

/** Local shorthand so the import list above stays about navigation. */
private fun Int.dp2() = androidx.compose.ui.unit.Dp(this.toFloat())

/** True when the bottom bar belongs on this route. */
fun showsBottomBar(route: String?): Boolean = Tab.entries.any { it.route == route }
