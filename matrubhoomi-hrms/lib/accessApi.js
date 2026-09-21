// lib/accessApi.js
//
// Every call the Access Control screens make.
//
// Lives outside app/ because the screens that use it live in the CEO dashboard
// and could be embedded elsewhere later; an API client is not a route.
//
// One place, because this is the tool that grants and revokes access — the last
// thing it should do is drift into three different ways of handling a 401.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/** Thrown for any non-2xx so callers can show the server's own message. */
export class AccessApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.isAuthError = status === 401 || status === 403;
    // A machine-readable reason (e.g. "POSSIBLE_DUPLICATE") plus whatever else
    // the route attached — most callers only read `.message`, but the
    // duplicate-department confirm flow needs the `similar` list too, and
    // grafting it onto the thrown error is simpler than adding a second
    // request/response path just for the one route that needs it.
    this.code = body?.code || null;
    this.body = body || null;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  // A body is not guaranteed — a proxy can return HTML for a 502.
  const data = await res.json().catch(() => null);

  if (!res.ok || (data && data.success === false)) {
    throw new AccessApiError(
      data?.message || `Request failed (HTTP ${res.status})`,
      res.status,
      data,
    );
  }

  return data;
}

/* ── session ─────────────────────────────────────────────────────── */

export const verify = () => request("/api/auth/verify", { method: "POST" });

/* ── departments ─────────────────────────────────────────────────── */

export const listDepartments = () => request("/api/admin/departments");

export const createDepartment = (payload) =>
  request("/api/admin/departments", { method: "POST", body: payload });

export const updateDepartment = (id, payload) =>
  request(`/api/admin/departments/${id}`, { method: "PATCH", body: payload });

export const deleteDepartment = (id) =>
  request(`/api/admin/departments/${id}`, { method: "DELETE" });

/* ── department logins ───────────────────────────────────────────── */

export const listUsers = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "" && v != null),
  );
  return request(`/api/admin/users${qs.toString() ? `?${qs}` : ""}`);
};

export const createUser = (payload) =>
  request("/api/admin/users", { method: "POST", body: payload });

export const updateUser = (id, payload) =>
  request(`/api/admin/users/${id}`, { method: "PATCH", body: payload });

export const resetPassword = (id, password) =>
  request(`/api/admin/users/${id}/reset-password`, {
    method: "POST",
    body: password ? { password } : {},
  });

/* ── employees ───────────────────────────────────────────────────── */

export const listEmployees = (params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "" && v != null),
  );
  return request(`/api/admin/employees${qs.toString() ? `?${qs}` : ""}`);
};

/** Pass null to revoke — takes effect on their next request, not on expiry. */
export const assignEmployee = (id, accessDepartmentId) =>
  request(`/api/admin/employees/${id}`, {
    method: "PATCH",
    body: { accessDepartmentId: accessDepartmentId || null },
  });

/**
 * Departments this employee may open BEYOND their primary — a project manager
 * who also needs Store, a supervisor covering QC. An empty array clears them.
 */
export const setEmployeeExtraDepartments = (id, additionalDepartmentIds) =>
  request(`/api/admin/employees/${id}`, {
    method: "PATCH",
    body: { additionalDepartmentIds },
  });

/** Set an employee's sign-in password. Omit `password` to generate one. */
export const setEmployeePassword = (id, password) =>
  request(`/api/admin/employees/${id}/set-password`, {
    method: "POST",
    body: password ? { password } : {},
  });

/** Give an employee with no email on file one. */
export const setEmployeeEmail = (id, email) =>
  request(`/api/admin/employees/${id}/set-email`, {
    method: "PATCH",
    body: { email },
  });


/* ── accountant roles ────────────────────────────────────────────── */
//
// These read and write Acc_User — the SAME collection the accounting module's
// own team page manages. There is one row per person, so a change made on
// either side is immediately visible on the other.

export const listAccountantRoles = () => request("/api/admin/accountant-roles");

/** Everyone holding an accounting role, employees and external users alike. */
export const listAccountantUsers = () => request("/api/admin/accountant-users");

/** Hard delete. Only valid for people with no employee record. */
export const deleteAccountantUser = (email) =>
  request(`/api/admin/accountant-users/${encodeURIComponent(email)}`, {
    method: "DELETE",
  });

/** Only valid for external users — employees keep the password on their HR record. */
export const setAccountantPassword = (email, password) =>
  request(`/api/admin/accountant-users/${encodeURIComponent(email)}/set-password`, {
    method: "POST",
    body: { password },
  });

export const getAccountantRole = (email) =>
  request(`/api/admin/accountant-role/${encodeURIComponent(email)}`);

/** Pass role: null to revoke. `password` is only needed to create a new login. */
export const setAccountantRole = ({ email, name, role, password }) =>
  request("/api/admin/accountant-role", {
    method: "PUT",
    body: { email, name, role, password },
  });

/* ── generic per-department roles ─────────────────────────────────── */
//
// The department-agnostic version of the accountant calls above, backed by the
// DepartmentRole collection (services/departmentRoles.js). Accounting keeps its
// own store; every other department is assigned through these.

/** Everyone holding a role in this department: { holders, roles }. */
export const listDepartmentRoleHolders = (slug) =>
  request(`/api/admin/department-roles/${encodeURIComponent(slug)}`);

/** Grant/change/revoke (role: null revokes). password only for external logins. */
export const setDepartmentRole = ({ slug, email, name, role, password }) =>
  request(`/api/admin/department-roles/${encodeURIComponent(slug)}`, {
    method: "PUT",
    body: { email, name, role, password },
  });

export const bulkAssignEmployees = (employeeIds, accessDepartmentId) =>
  request("/api/admin/employees/bulk-assign", {
    method: "POST",
    body: { employeeIds, accessDepartmentId: accessDepartmentId || null },
  });

/* ── change log ──────────────────────────────────────────────────── */

/** History for one record: { entries: [{ createdAt, actorName, actorEmail, summary, action, before, after }] }. */
export const getChangeLog = ({ entity, entityId, limit }) =>
  request(
    `/api/admin/change-log?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}${
      limit ? `&limit=${limit}` : ""
    }`,
  );
