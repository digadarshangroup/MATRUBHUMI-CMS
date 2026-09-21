// lib/roles.js
//
// The client-side mirror of the backend DepartmentRole vocabulary
// (services/departmentRoles.js + models/Access/DepartmentRole.js). One ranking,
// used by the RoleGate/useDeptRole structure so every section can ask "is this
// person at least an editor here?" the same way.
//
// The SERVER is the real enforcer (requireDepartmentRole). These helpers only
// drive what the UI offers — hiding a button the server would refuse anyway.

export const ROLE_RANK = { viewer: 1, editor: 2, approver: 3, owner: 4 };

export const ROLE_LABELS = {
  viewer: "Viewer",
  editor: "Editor",
  approver: "Approver",
  owner: "Owner",
};

/** Is `role` at least `min` in the ranking? Unknown role → false. */
export function roleAtLeast(role, min) {
  if (!role || !min) return false;
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);
}
