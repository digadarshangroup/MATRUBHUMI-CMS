// utils/employeeActive.js
//
// What "this person still works here" means — in ONE place.
//
// WHY THIS EXISTS
// ---------------
// An employee is switched off in two fields, not one: HR's Delete sets both
// `isActive:false` and `status:"inactive"`, but bulk edit and the edit form can
// set either on its own. Each reader had its own reading of the pair:
//
//   - the app login required EITHER flag to be positive, so an employee with
//     `status:"inactive"` and `isActive:true` could still sign in;
//   - the app guard checked NEITHER, so a token issued before the deactivation
//     kept opening leave, payslips and approvals for up to thirty days;
//   - the field guard checked only `isActive`.
//
// So the same person was fired on one screen and employed on the next. Every
// reader now asks this module.
//
// `status` is free text in the schema. Only "active" / "inactive" are written
// by the product today, but the words HR would reach for when typing an exit
// into a spreadsheet import are treated as inactive too — refusing a leaver is
// the safe mistake, admitting one is not.

"use strict";

const EXIT_STATUS = /^(inactive|terminated|resigned|exited|relieved|absconded|left|separated)$/i;

/** True when the record describes someone who may still use the app. */
function isEmployeeActive(emp) {
  if (!emp) return false;
  if (emp.isActive === false) return false;
  if (emp.status && EXIT_STATUS.test(String(emp.status).trim())) return false;
  return true;
}

/**
 * The same rule as a Mongo filter, merged into `extra` under `$and` so a caller
 * that already has its own `$or` cannot have it silently replaced.
 */
function activeEmployeeFilter(extra = {}) {
  return {
    $and: [
      extra,
      { isActive: { $ne: false } },
      { status: { $not: EXIT_STATUS } },
    ],
  };
}

module.exports = { isEmployeeActive, activeEmployeeFilter, EXIT_STATUS };
