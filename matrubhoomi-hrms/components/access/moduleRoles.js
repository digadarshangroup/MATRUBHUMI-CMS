// components/access/moduleRoles.js
//
// Modules that carry their OWN role vocabulary on top of a department grant.
//
// WHY A REGISTRY AND NOT A TAB
// ----------------------------
// Accounting is not special. It is simply the first department whose module
// draws a distinction the department grant does not — owner / approver / editor
// / viewer. Payroll, Purchasing and Quality will each want their own the moment
// somebody asks "can this person approve, or only enter?".
//
// Giving each of those a tab would mean the access screen grows a tab per
// module and the person you are looking for is spread across all of them. So
// there is one People list, and a module contributes a control to the rows of
// the people who hold it. Adding the next module is one entry in this array and
// no change to any screen.
//
// A module may also declare that it accepts people with no HR record —
// an external bookkeeper, an auditor. Those people appear in the same People
// list, badged, and are created from the same button.

import {
  listAccountantUsers,
  setAccountantRole,
  setAccountantPassword,
  deleteAccountantUser,
  listDepartmentRoleHolders,
  setDepartmentRole,
} from "@/lib/accessApi";

/** The standard four-role vocabulary every non-accounting department uses. */
const STD_ROLES = [
  { value: "viewer",   label: "Viewer · read-only" },
  { value: "editor",   label: "Editor · create and edit" },
  { value: "approver", label: "Approver · edit and approve" },
  { value: "owner",    label: "Owner · full control" },
];

/**
 * A role vocabulary for any department, backed by the generic DepartmentRole
 * store. Adding a department to the People screen is one line — see the array
 * below. (Accounting is NOT built this way; it keeps its own Acc_User store.)
 */
function genericDeptRole(slug, label) {
  return {
    key: `dept-${slug}`,
    deptSlug: slug,
    label,
    roles: STD_ROLES,
    unsetWarning:
      `They can open ${label}, but role-gated actions inside it are refused ` +
      `until a role is set.`,
    note:
      `Exactly one Owner per ${label}: promoting somebody to Owner ` +
      `demotes the current one to Approver.`,
    supportsExternal: false,
    listMembers: async () => {
      const data = await listDepartmentRoleHolders(slug);
      return {
        users: (data?.holders || []).map((h) => ({
          email: h.email, name: h.name, role: h.role, isActive: h.isActive,
        })),
      };
    },
    setRole: ({ email, name, role, password }) =>
      setDepartmentRole({ slug, email, name, role, password }),
  };
}

export const MODULE_ROLES = [
  {
    key: "accounting",

    /** The AccessDepartment slug this vocabulary belongs to. */
    deptSlug: "accountant",
    label: "Accounting",

    roles: [
      { value: "viewer",   label: "Viewer · read-only" },
      { value: "editor",   label: "Editor · changes need approval" },
      { value: "approver", label: "Approver · edits and approves" },
      { value: "owner",    label: "Owner · full control" },
    ],

    /** Shown under the dropdown when a holder of this module has no role yet. */
    unsetWarning:
      "They can open Accounting, but every action inside it will be refused " +
      "until a role is set.",

    /** Exactly one of these may exist; promoting demotes the incumbent. */
    note:
      "The organisation must always have exactly one Owner. Promoting somebody " +
      "to Owner automatically demotes the current one to Approver.",

    /** People with no employee record may hold this module. */
    supportsExternal: true,

    /* -- data access ------------------------------------------------- */
    // Every one of these reads and writes acc_users, the same rows the
    // accounting module's own Team page manages. Not a mirror: one row per
    // person, so the two views cannot disagree.
    listMembers: listAccountantUsers,
    setRole: setAccountantRole,
    setPassword: setAccountantPassword,
    // Only reachable for people with no employee record — for them this row IS
    // the account, so "remove access" has to delete it rather than leave a dead
    // entry behind. The server refuses it for employees.
    deleteMember: deleteAccountantUser,
  },

  // HR — assigned through the generic DepartmentRole store. Clone this line for
  // any other department once you start assigning roles there:
  //   genericDeptRole("sales", "Sales"), genericDeptRole("qc", "Quality"), …
  genericDeptRole("hr", "HR"),
  genericDeptRole("store", "Store & Purchase"),
  genericDeptRole("sales", "Sales"),
  genericDeptRole("project-manager", "Production"),
  genericDeptRole("merchandiser", "Merchandiser"),
];

/** The modules a person holds, by the departments granted to them. */
export function modulesFor(slugs = []) {
  const held = new Set(slugs.filter(Boolean));
  return MODULE_ROLES.filter((m) => held.has(m.deptSlug));
}

/** Every department slug a person can currently reach. */
export function departmentSlugsOf(person) {
  return [
    person.accessDepartment?.slug,
    ...(person.additionalDepartments || []).map((d) => d.slug),
  ].filter(Boolean);
}

/** Departments that can hold somebody without an HR record. */
export function externalCapableModules() {
  return MODULE_ROLES.filter((m) => m.supportsExternal);
}
