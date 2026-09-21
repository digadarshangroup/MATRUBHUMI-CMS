// lib/salesApi.js
//
// One client for /api/sales/*, so no screen writes a URL or a fetch by hand.
//
// WHY A THIN WRAPPER AND NOT axios PER SCREEN
// -------------------------------------------
// Every sales route answers in the same envelope — `{ success, data, message }`
// — and every screen needs the same three things from a failure: the server's
// own message when there is one, a role-denied case that must be shown as
// "you cannot do this" rather than "something broke", and never a raw stack.
// Written per screen, that is fifteen slightly different versions of the same
// error handling, and the one that gets it wrong is the one somebody hits.
//
// `credentials: "include"` on every call: lib/authFetch.js additionally replays
// the CMS token as a Bearer header, which is the path that actually works when
// the frontend and backend are on different hosts.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/** An error carrying what the server said, and enough to act on it. */
export class SalesApiError extends Error {
  constructor(message, { status, code, fields, payload } = {}) {
    super(message);
    this.name = "SalesApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.payload = payload;
    // The two cases a screen renders differently from a generic failure.
    this.isPermission = status === 403;
    this.isConflict = status === 409;
  }
}

async function request(path, { method = "GET", body, signal, raw } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      signal,
      // FormData sets its own multipart boundary; setting Content-Type by hand
      // produces a boundary-less header and the server parses nothing.
      headers: raw ? undefined : { "Content-Type": "application/json" },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    // A network failure is not a server error and must not be reported as one:
    // "could not reach the server" is actionable, "500" is not.
    if (err?.name === "AbortError") throw err;
    throw new SalesApiError("Could not reach the server. Check your connection.", { status: 0 });
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok || payload?.success === false) {
    throw new SalesApiError(payload?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: payload?.code,
      fields: payload?.fields,
      payload,
    });
  }

  return payload;
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const salesApi = {
  /* Overview */
  overview: () => request("/api/sales/overview"),
  trend: (days = 30) => request(`/api/sales/overview/trend${qs({ days })}`),

  /* Leads */
  leads: (params) => request(`/api/sales/leads${qs(params)}`),
  leadBoard: () => request("/api/sales/leads/board"),
  lead: (id) => request(`/api/sales/leads/${id}`),
  createLead: (body) => request("/api/sales/leads", { method: "POST", body }),
  updateLead: (id, body) => request(`/api/sales/leads/${id}`, { method: "PATCH", body }),
  assignLead: (id, employeeId) => request(`/api/sales/leads/${id}/assign`, { method: "POST", body: { employeeId } }),
  moveLead: (id, stageKey, reason) => request(`/api/sales/leads/${id}/stage`, { method: "POST", body: { stageKey, reason } }),
  noteLead: (id, body) => request(`/api/sales/leads/${id}/note`, { method: "POST", body }),

  /* Tasks */
  tasks: (params) => request(`/api/sales/tasks${qs(params)}`),
  taskSummary: (day) => request(`/api/sales/tasks/summary${qs({ day })}`),
  task: (id) => request(`/api/sales/tasks/${id}`),
  assign: (body) => request("/api/sales/tasks", { method: "POST", body }),
  cancelTask: (id, reason) => request(`/api/sales/tasks/${id}/cancel`, { method: "POST", body: { reason } }),

  /* Forms and stages */
  templates: (params) => request(`/api/sales/templates${qs(params)}`),
  template: (id) => request(`/api/sales/templates/${id}`),
  createTemplate: (body) => request("/api/sales/templates", { method: "POST", body }),
  saveTemplate: (id, body) => request(`/api/sales/templates/${id}`, { method: "PUT", body }),
  duplicateTemplate: (id) => request(`/api/sales/templates/${id}/duplicate`, { method: "POST" }),
  deleteTemplate: (id) => request(`/api/sales/templates/${id}`, { method: "DELETE" }),

  stages: () => request("/api/sales/stages"),
  createStage: (body) => request("/api/sales/stages", { method: "POST", body }),
  updateStage: (id, body) => request(`/api/sales/stages/${id}`, { method: "PATCH", body }),
  reorderStages: (order) => request("/api/sales/stages/reorder", { method: "POST", body: { order } }),

  /* Schemes — a scheme IS a pipeline, and its steps are that pipeline's stages.
     See models/Sales_Models/SalesScheme.js for why they share `pipelineKey`. */
  schemes: (params) => request(`/api/sales/schemes${qs(params)}`),
  scheme: (id, params) => request(`/api/sales/schemes/${id}${qs(params)}`),
  createScheme: (body) => request("/api/sales/schemes", { method: "POST", body }),
  updateScheme: (id, body) => request(`/api/sales/schemes/${id}`, { method: "PATCH", body }),
  // Read BEFORE offering a destructive action, so the dialog can say what is in
  // the way rather than letting the server refuse after the click.
  schemeReferences: (id) => request(`/api/sales/schemes/${id}/references`),
  archiveScheme: (id, reason) => request(`/api/sales/schemes/${id}/archive`, { method: "POST", body: { reason } }),
  restoreScheme: (id) => request(`/api/sales/schemes/${id}/restore`, { method: "POST" }),
  deleteScheme: (id) => request(`/api/sales/schemes/${id}`, { method: "DELETE" }),

  /* Scheme steps */
  schemeSteps: (id, params) => request(`/api/sales/schemes/${id}/steps${qs(params)}`),
  createStep: (schemeId, body) => request(`/api/sales/schemes/${schemeId}/steps`, { method: "POST", body }),
  updateStep: (stepId, body) => request(`/api/sales/steps/${stepId}`, { method: "PATCH", body }),
  stepReferences: (stepId) => request(`/api/sales/steps/${stepId}/references`),
  archiveStep: (stepId, reason) => request(`/api/sales/steps/${stepId}/archive`, { method: "POST", body: { reason } }),
  reorderSteps: (schemeId, order) =>
    request(`/api/sales/schemes/${schemeId}/steps/reorder`, { method: "POST", body: { order } }),

  /* The one registration form */
  newCustomerForm: () => request("/api/sales/config/new-customer"),
  saveNewCustomerForm: (body) => request("/api/sales/config/new-customer", { method: "POST", body }),

  /* Approvals — the desk's answer to an employee's claim */
  approvals: (params) => request(`/api/sales/approvals${qs(params)}`),
  approval: (id) => request(`/api/sales/approvals/${id}`),
  approve: (id, note) => request(`/api/sales/approvals/${id}/approve`, { method: "POST", body: { note } }),
  reject: (id, reason) => request(`/api/sales/approvals/${id}/reject`, { method: "POST", body: { reason } }),

  /* Customers, their resolved workflow, and their durable history */
  customerSearch: (params) => request(`/api/sales/customers/search${qs(params)}`),
  customerWorkflow: (id) => request(`/api/sales/customers/${id}/workflow`),
  customerHistory: (id, params) => request(`/api/sales/customers/${id}/history${qs(params)}`),
  // Both are approver-level and both demand a reason; the server refuses
  // without one rather than recording a change nobody can explain later.
  changeCustomerScheme: (id, schemeKey, reason) =>
    request(`/api/sales/customers/${id}/scheme`, { method: "POST", body: { schemeKey, reason } }),
  overrideCustomerStep: (id, stageKey, reason) =>
    request(`/api/sales/customers/${id}/step`, { method: "POST", body: { stageKey, reason } }),

  reassignTask: (id, employeeId, reason) =>
    request(`/api/sales/tasks/${id}/reassign`, { method: "POST", body: { employeeId, reason } }),

  /* Team and tracking */
  team: () => request("/api/sales/team"),
  live: (day) => request(`/api/sales/team/live${qs({ day })}`),
  travel: (from, to) => request(`/api/sales/team/travel${qs({ from, to })}`),
  employeeDay: (employeeId, day, full) => request(`/api/sales/team/${employeeId}/day${qs({ day, full })}`),
  // The day's route written as place names — see the route's own header for
  // why the waypoints are spaced by distance travelled rather than by count.
  itinerary: (employeeId, day, every) =>
    request(`/api/sales/team/${employeeId}/itinerary${qs({ day, every })}`),

  // Erasing a trail. `all` clears every day on record; otherwise just the one.
  // Irreversible — the screen confirms before calling this.
  clearTracking: (employeeId, { day, all } = {}) =>
    request(`/api/sales/team/${employeeId}/tracking${qs({ day: all ? undefined : day, all: all || undefined })}`, {
      method: "DELETE",
    }),

  /* Service */
  serviceRequests: (params) => request(`/api/sales/service-requests${qs(params)}`),
  serviceRequest: (id) => request(`/api/sales/service-requests/${id}`),
  raiseService: (body) => request("/api/sales/service-requests", { method: "POST", body }),
  assignService: (id, body) => request(`/api/sales/service-requests/${id}/assign`, { method: "POST", body }),
  updateService: (id, body) => request(`/api/sales/service-requests/${id}`, { method: "PATCH", body }),
};

export default salesApi;
