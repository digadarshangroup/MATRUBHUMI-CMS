// routes/Sales_Routes/_deskAuth.js
//
// The guard chain every sales desk route sits behind, written once.
//
// Two layers, and they answer different questions:
//   EmployeeAuthMiddleware  — is this a signed-in CMS session at all
//   requireDepartmentRole   — does this person hold enough rank in `sales`
//
// The second FAILS OPEN while the department has no roles assigned, which is
// deliberate and documented in services/departmentRoles.js: a department nobody
// has been granted a role in yet would otherwise lock out the very
// administrator who has to grant the first one.

"use strict";

const EmployeeAuthMiddleware = require("../../Middlewear/EmployeeAuthMiddlewear");
const { requireDepartmentRole } = require("../../services/departmentRoles");

/** Read-only screens. */
const deskRead = [EmployeeAuthMiddleware, requireDepartmentRole("sales", "viewer")];

/** Anything that writes a lead, a task, a template or a stage. */
const deskWrite = [EmployeeAuthMiddleware, requireDepartmentRole("sales", "editor")];

/** Reserved for pipeline surgery — reordering stages, deleting templates. */
const deskApprove = [EmployeeAuthMiddleware, requireDepartmentRole("sales", "approver")];

/** The signed-in desk user, in the shape the services expect. */
function actorFrom(req) {
  return {
    kind: "desk",
    id: req.user?.id,
    name: req.user?.name || req.user?.email || "Sales desk",
    email: req.user?.email || "",
  };
}

/**
 * Render an error the services threw.
 *
 * They attach `status` to anything a caller did wrong and leave everything else
 * bare — so a bare error is a bug here, gets logged in full, and is reported as
 * a 500 without leaking its message to the client.
 */
function sendError(res, err, context = "sales") {
  const status = err?.status || 500;
  if (status >= 500) {
    console.error(`[${context}]`, err);
    return res.status(500).json({ success: false, message: "Something went wrong at our end." });
  }
  return res.status(status).json({
    success: false,
    message: err.message,
    ...(err.fields ? { fields: err.fields } : {}),
    ...(err.leadId ? { leadId: err.leadId, code: err.code } : {}),
    // A refusal the caller can do something about. `canOverride` turns the
    // dialog from "no" into "somebody already has this — do it anyway?", and
    // `archiveInstead` turns a refused delete into the offer of an archive.
    // Dropping these here would leave the screen with a message and no action.
    ...(err.canOverride ? { canOverride: true, activeTask: err.activeTask || null } : {}),
    ...(err.archiveInstead ? { archiveInstead: true } : {}),
  });
}

module.exports = { deskRead, deskWrite, deskApprove, actorFrom, sendError };
