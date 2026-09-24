// services/employeeValidation.js
//
// What a saveable employee record needs, decided once, on the side that cannot
// be bypassed.
//
// WHY THIS EXISTS
// ---------------
// The HR form asks for a dozen fields and marks them required, and until this
// module existed that was the ONLY thing enforcing them. `POST /api/employees`
// accepted `{ "gender": "Male" }` and wrote an employee with no name, no email,
// no phone and no department — the single reason an empty body was refused at
// all was the `gender` enum, whose message named a field that was not the
// problem. Anything that is not the form — a script, a bulk import, a second
// client, a mistake — could write a record nothing downstream can use.
//
// The list mirrors REQUIRED in
// matrubhoomi-hrms/app/hr/dashboard/employees/new-employee/components/EmployeeForm.js.
// Keep the two in step: the form is what people read, this is what holds.
//
// Deliberately NOT applied to updates. Records created before these rules
// exist are allowed to be incomplete, and an edit to somebody's address must
// not be refused because their file predates a field.

"use strict";

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

/** A plain email check — enough to catch a typo, not enough to argue with. */
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

/** Ten digits, which is what the app's login expects to be handed. */
const looksLikePhone = (v) => /^\d{10}$/.test(String(v || "").replace(/\D/g, ""));

const isIntern = (b) => b?.employmentType === "intern";

const RULES = [
  { field: "firstName", label: "First Name" },
  { field: "lastName", label: "Last Name" },
  {
    field: "email",
    label: "Employee Login (Email)",
    ok: (b) => looksLikeEmail(b.email),
    message: (b) =>
      isBlank(b.email)
        ? "This field is required — it is how they sign in."
        : "Enter a valid email address, like name@company.com.",
  },
  {
    field: "phone",
    label: "Mobile",
    ok: (b) => looksLikePhone(b.phone),
    message: (b) =>
      isBlank(b.phone)
        ? "This field is required — it is also their first password."
        : "Enter a 10-digit mobile number.",
  },
  { field: "departmentId", label: "Department" },
  { field: "designation", label: "Designation" },
  { field: "dateOfJoining", label: "Date of Joining" },
  {
    field: "confirmationDate",
    label: "Confirmation Date",
    when: (b) => !isIntern(b),
    message: () => "This field is required. It may be the same as the date of joining.",
  },
  { field: "employmentType", label: "Employment Type" },
  {
    field: "workShiftMode",
    label: "Shift",
    // The form sends it flat; the payload builder nests it. Either is fine.
    ok: (b) => !isBlank(b.workShiftMode ?? b.workShift?.mode),
    message: () => "This field is required — pick Core, General or Custom.",
  },
  {
    field: "workShiftStart",
    label: "Shift Starts",
    when: (b) => (b.workShiftMode ?? b.workShift?.mode) === "custom",
    ok: (b) => !isBlank(b.workShiftStart ?? b.workShift?.start),
  },
  {
    field: "workShiftEnd",
    label: "Shift Ends",
    when: (b) => (b.workShiftMode ?? b.workShift?.mode) === "custom",
    ok: (b) => !isBlank(b.workShiftEnd ?? b.workShift?.end),
  },
  {
    field: "stipend",
    label: "Monthly Stipend",
    when: (b) => isIntern(b) && (b.internStipendType ?? b.internship?.stipendType ?? "paid") === "paid",
    ok: (b) => Number(b.stipend ?? b.internship?.stipend) > 0,
    message: () =>
      "This internship is marked as paid — set the monthly stipend, or change " +
      "the arrangement to unpaid or self-paid.",
  },
  {
    field: "grossSalary",
    label: "Gross Salary",
    when: (b) => !isIntern(b),
    ok: (b) => Number(b.grossSalary ?? b.salary?.gross) > 0,
    message: () => "This field is required — every payroll component is derived from it.",
  },
];

const DEFAULT_MESSAGE = "This field is required.";

/**
 * @returns {Array<{field, label, message}>} empty when the record is saveable
 */
function missingRequired(body = {}) {
  return RULES.filter((r) => !r.when || r.when(body))
    .filter((r) => (r.ok ? !r.ok(body) : isBlank(body[r.field])))
    .map((r) => ({
      field: r.field,
      label: r.label,
      message: r.message ? r.message(body) : DEFAULT_MESSAGE,
    }));
}

/**
 * The refusal, in the shape the form already renders: one line for the banner
 * and a field→message map for the inputs themselves.
 */
function requiredFieldsError(missing) {
  return {
    success: false,
    code: "MISSING_REQUIRED_FIELDS",
    message:
      missing.length === 1
        ? `${missing[0].label} is required.`
        : `${missing.length} required fields are missing: ${missing.map((m) => m.label).join(", ")}.`,
    fields: missing.reduce((acc, m) => ({ ...acc, [m.field]: m.message }), {}),
  };
}

module.exports = { missingRequired, requiredFieldsError, looksLikeEmail, looksLikePhone };
