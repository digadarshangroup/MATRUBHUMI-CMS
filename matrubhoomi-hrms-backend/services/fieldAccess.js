// services/fieldAccess.js
//
// Who is FIELD STAFF — the people the sales desk sends out, and the only people
// whose position this system ever records.
//
// WHY THIS IS ONE FUNCTION IN ONE FILE
// ------------------------------------
// The employee app is now the whole workforce's app, not the sales team's. An
// accountant signs into the same APK as a salesperson, and the one thing that
// must never happen is the accountant's phone being asked for its location, or
// recording it. So "is this person field staff" gets answered in three places —
// what the app shows (bootstrap capabilities), what /api/field/* accepts
// (requireFieldStaff), and who the desk may assign work to (salesEmployeeFilter)
// — and if those three ever disagree, somebody is tracked who should not be, or
// somebody is sent out whose route is never recorded. Hence one definition.
//
// THE DEFINITION
// --------------
// Unchanged from what the desk already used: the HR department label contains
// "sales", OR the person holds the Sales access grant. The two disagree in
// practice — a new joiner labelled Sales by HR before anybody granted desk
// access, and a desk user with a different HR label — and a desk that cannot
// see somebody cannot give them work.
//
// NOTHING HERE IS SELF-EDITABLE. The profile route used to let an employee
// write their own access ids; it now takes an allow-list of personal fields
// only (routes/Employee_Routes/employeeAuth.js), so membership is HR's to set.

"use strict";

const AccessDepartment = require("../models/Access/AccessDepartment");

const SALES_LABEL = /sales/i;

// The Sales access department's id, looked up once and remembered. It is a
// boot-time row (services/ensureAccessDepartments.js) and never changes id.
let salesDeptId = null;
let salesDeptLookedUpAt = 0;
const SALES_DEPT_TTL_MS = 10 * 60 * 1000;

async function salesAccessDepartmentId() {
  if (salesDeptId && Date.now() - salesDeptLookedUpAt < SALES_DEPT_TTL_MS) return salesDeptId;
  try {
    const dept = await AccessDepartment.findOne({ key: "sales" }).select("_id").lean();
    salesDeptId = dept ? String(dept._id) : null;
    salesDeptLookedUpAt = Date.now();
  } catch {
    // Keep whatever we had. The HR label still decides on its own.
  }
  return salesDeptId;
}

/**
 * Is this employee field staff?
 *
 * @param emp  needs `department`, `accessDepartmentId`, `additionalDepartmentIds`
 */
async function isFieldStaff(emp) {
  if (!emp) return false;
  if (emp.department && SALES_LABEL.test(String(emp.department))) return true;
  const sales = await salesAccessDepartmentId();
  if (!sales) return false;
  if (emp.accessDepartmentId && String(emp.accessDepartmentId) === sales) return true;
  return (emp.additionalDepartmentIds || []).some((id) => String(id) === sales);
}

/** The same rule as a Mongo filter over ACTIVE employees — for the desk's lists. */
async function salesEmployeeFilter() {
  const sales = await salesAccessDepartmentId();
  const or = [{ department: SALES_LABEL }];
  if (sales) or.push({ accessDepartmentId: sales }, { additionalDepartmentIds: sales });
  const { activeEmployeeFilter } = require("../utils/employeeActive");
  return activeEmployeeFilter({ $or: or });
}

/**
 * Express guard for the parts of /api/field that only field staff may use:
 * tasks, leads, forms, OTPs and the location trail.
 *
 * Runs after FieldEmployeeContext, which has already worked out
 * `req.employee.isFieldStaff`. The message deliberately avoids the word
 * "token": the app reads a 403 mentioning one as "your session is over".
 */
function requireFieldStaff(req, res, next) {
  if (req.employee?.isFieldStaff) return next();
  return res.status(403).json({
    success: false,
    code: "NOT_FIELD_STAFF",
    message: "This part of the app is for the sales field team.",
  });
}

module.exports = { isFieldStaff, salesEmployeeFilter, salesAccessDepartmentId, requireFieldStaff };
