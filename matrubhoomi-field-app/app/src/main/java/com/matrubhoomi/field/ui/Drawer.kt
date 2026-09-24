package com.matrubhoomi.field.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.BuildCircle
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.unit.em
import com.matrubhoomi.field.BuildConfig
import com.matrubhoomi.field.data.Capabilities
import com.matrubhoomi.field.data.Profile
import com.matrubhoomi.field.ui.components.Avatar
import com.matrubhoomi.field.ui.components.Chip

private data class Entry(val route: String, val label: String, val icon: ImageVector, val badge: Int = 0)

/**
 * The menu — every place this person may go, grouped the way a working day is.
 *
 * It lists only what the server's capabilities allow. Field work and the route
 * appear for field staff and for nobody else; Approvals appears only for
 * somebody people report to. An employee never sees a door they cannot open,
 * and never has to wonder why the tracking screen is empty.
 */
@Composable
fun AppDrawer(
    profile: Profile,
    caps: Capabilities,
    onDuty: Boolean,
    currentRoute: String?,
    approvals: Int,
    unread: Int,
    openWork: Int,
    onNavigate: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    // At most 85% of the screen: on a narrow phone the default 360dp sheet
    // covered all of it, and nothing showed it was a menu you could close.
    val maxWidth = (androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp * 0.85f).dp
    ModalDrawerSheet(
        drawerContainerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier.widthIn(max = minOf(maxWidth, 330.dp)),
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
            /* ── Who ─────────────────────────────────────────────── */
            Row(Modifier.padding(start = 8.dp, top = 20.dp, bottom = 14.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(profile.name.ifBlank { "You" }, size = 50.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(profile.name.ifBlank { "Signed in" }, style = MaterialTheme.typography.titleMedium)
                    Text(
                        listOf(profile.designation, profile.department).filter { it.isNotBlank() }.joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    profile.manager?.let {
                        Text(
                            "Reports to ${it.name}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (caps.field) {
                Row(Modifier.padding(start = 8.dp, bottom = 10.dp)) {
                    Chip(if (onDuty) "on duty — recording" else "off duty", if (onDuty) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            /* ── Where ───────────────────────────────────────────── */
            val sections = buildList {
                if (caps.field) {
                    add(
                        "Field work" to listOf(
                            Entry(Routes.TODAY, "Today", Icons.Outlined.Home),
                            Entry(Routes.WORK, "Assignments", Icons.AutoMirrored.Outlined.Assignment, openWork),
                            Entry(Routes.LEADS, "Customers", Icons.Outlined.Groups),
                            Entry(Routes.ROUTE, "My route", Icons.Outlined.Map),
                            Entry(Routes.newLead(), "Add a customer", Icons.Outlined.AddCircleOutline),
                        ),
                    )
                }
                add(
                    "My workday" to buildList {
                        if (!caps.field) add(Entry(Routes.TODAY, "Home", Icons.Outlined.Home))
                        add(Entry(Routes.ATTENDANCE, "Attendance", Icons.Outlined.CalendarMonth))
                        add(Entry(Routes.LEAVE, "Leave", Icons.Outlined.EventAvailable))
                        add(Entry("regularize", "Fix attendance", Icons.Outlined.BuildCircle))
                        if (caps.overtime) add(Entry(Routes.OVERTIME, "Overtime", Icons.Outlined.AccessTime))
                        add(Entry(Routes.HOLIDAYS, "Holidays", Icons.Outlined.BeachAccess))
                    },
                )
                add(
                    "Pay and papers" to listOf(
                        Entry(Routes.PAYSLIPS, "Payslips", Icons.Outlined.AccountBalanceWallet),
                        Entry(Routes.DOCUMENTS, "Documents", Icons.Outlined.Description),
                    ),
                )
                if (caps.manager) {
                    add("My team" to listOf(Entry(Routes.APPROVALS, "Approvals", Icons.AutoMirrored.Outlined.FactCheck, approvals)))
                }
                add(
                    "More" to buildList {
                        if (caps.standings) add(Entry(Routes.STANDINGS, "Standings", Icons.Outlined.EmojiEvents))
                        add(Entry(Routes.NOTIFICATIONS, "Notifications", Icons.Outlined.Notifications, unread))
                        add(Entry(Routes.PROFILE, "My profile", Icons.Outlined.Badge))
                        add(Entry(Routes.SETTINGS, "Settings", Icons.Outlined.Settings))
                    },
                )
            }

            sections.forEach { (title, entries) ->
                Text(
                    title.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    letterSpacing = 0.08.em,
                    modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 6.dp),
                )
                entries.forEach { e ->
                    val here = currentRoute == e.route || (e.route == "regularize" && currentRoute?.startsWith("regularize") == true)
                    NavigationDrawerItem(
                        label = { Text(e.label) },
                        icon = { Icon(e.icon, contentDescription = null) },
                        selected = here,
                        badge = {
                            if (e.badge > 0) {
                                Text(
                                    if (e.badge > 99) "99+" else "${e.badge}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onError,
                                    modifier = Modifier
                                        .background(MaterialTheme.colorScheme.error, RoundedCornerShape(999.dp))
                                        .padding(horizontal = 8.dp, vertical = 2.dp),
                                )
                            }
                        },
                        onClick = { onNavigate(e.route) },
                        colors = NavigationDrawerItemDefaults.colors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.height(48.dp),
                    )
                }
            }

            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            NavigationDrawerItem(
                label = { Text("Sign out", color = MaterialTheme.colorScheme.error) },
                icon = { Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                selected = false,
                onClick = onSignOut,
            )
            Text(
                "Matrubhoomi ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 16.dp, top = 4.dp, bottom = 24.dp),
            )
        }
    }
}
