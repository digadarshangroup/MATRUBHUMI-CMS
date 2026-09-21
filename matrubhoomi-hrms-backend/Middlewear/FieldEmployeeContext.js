// Middlewear/FieldEmployeeContext.js
//
// Puts the employee's NAME and CODE on the request, not just their id.
//
// WHY IT IS NEEDED AT ALL
// -----------------------
// The app's token carries `{ id, email, type }` and nothing else. Every sales
// record the field writes is stamped with who wrote it — a submission, a lead's
// timeline, a day's rollup — and stamping an ObjectId alone means every screen
// that ever displays one has to join back to Employee to render a name. That
// join, on a list of fifty submissions, is fifty lookups for information that
// never changes.
//
// So it is resolved once per request here, and cached for five minutes. It
// mirrors what AllEmployeeAppMiddleware already does for its intern check —
// same shape, same reasoning, same cost.
//
// Runs AFTER AllEmployeeAppMiddleware, never instead of it. It does no
// authentication of its own; it decorates a request that has already been
// authenticated, and answers 401 only when there is no id to decorate.

"use strict";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // employeeId -> { at, employee }

/** Call after an employee's name or code changes, so it is not stale for 5 min. */
function invalidateFieldEmployee(employeeId) {
  if (employeeId) cache.delete(String(employeeId));
}

async function loadEmployee(id) {
  const key = String(id);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.employee;

  const Employee = require("../models/Employee");
  const row = await Employee.findById(key)
    .select("firstName middleName lastName biometricId phone designation department isActive")
    .lean();
  if (!row) return null;

  const employee = {
    id: row._id,
    name: [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ").trim(),
    code: row.biometricId || "",
    phone: row.phone || "",
    designation: row.designation || "",
    department: row.department || "",
    isActive: row.isActive !== false,
  };

  cache.set(key, { at: Date.now(), employee });
  return employee;
}

async function FieldEmployeeContext(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Not authorized" });
    }

    const employee = await loadEmployee(req.user.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        code: "EMPLOYEE_NOT_FOUND",
        message: "Your employee record could not be found. Contact HR.",
      });
    }
    if (!employee.isActive) {
      return res.status(403).json({
        success: false,
        code: "EMPLOYEE_INACTIVE",
        message: "This account is no longer active.",
      });
    }

    req.employee = employee;
    next();
  } catch (err) {
    // A lookup failure is infrastructure, not authorization. Reporting it as a
    // 401 would send the app to its login screen to retry something that was
    // never a credential problem — and on a field handset that reads as "the
    // app logged me out again".
    console.error("[field] Could not resolve the employee:", err.message);
    res.status(503).json({ success: false, message: "Could not reach the employee directory. Try again." });
  }
}

module.exports = FieldEmployeeContext;
module.exports.invalidateFieldEmployee = invalidateFieldEmployee;
