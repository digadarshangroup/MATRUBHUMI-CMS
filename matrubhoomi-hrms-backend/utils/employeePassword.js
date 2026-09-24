// utils/employeePassword.js
//
// How an employee's password is checked — in one place.
//
// There are four ways an employee credential can currently be valid, and they
// accumulated across three files that each knew about a different subset:
//
//   1. A bcrypt hash            — the normal case
//   2. A PLAINTEXT string       — legacy rows written before hashing existed
//   3. Firstname@MMDDYYYY       — derived from first name + date of birth
//                                 (routes/HrRoutes/Passwordmanagement.js)
//   4. A phone-derived default  — (routes/Employee_Routes/login.js)
//
// The department portal originally checked only (1), so anyone still on a
// derived or legacy password was told "invalid email or password" while the
// employee app let them straight in. Same person, same password, two answers.
//
// A successful match on (2), (3) or (4) UPGRADES the stored value to a bcrypt
// hash, so each account converts the first time its owner signs in and the
// legacy paths quietly drain away rather than living forever.
//
// THE DERIVED DEFAULTS ARE ONLY FOR A SYSTEM-ISSUED PASSWORD
// ----------------------------------------------------------
// (3) and (4) used to be accepted even after a bcrypt MISMATCH, "so a stale
// hash cannot block a valid derived password". What that actually did: an
// employee's phone number — also their login id, and printed on their public
// profile card — opened their account forever, however many times they
// changed their password, and signing in with it reset the password back to
// the phone number.
//
// They are accepted now only while the account is still on a credential the
// system handed out: no stored password at all, or the stored one is still the
// untouched `temporaryPassword` an Excel import generated (those employees were
// never told the random string, and the phone number is how they get in). HR's
// "reset password" writes a bcrypt hash OF the default, so a reset account
// matches at step (1) and never needs this path.

"use strict";

const bcrypt = require("bcryptjs");

/** Firstname@MMDDYYYY — mirrors Passwordmanagement.js exactly. */
function defaultFromNameAndDob(firstName, dateOfBirth) {
  if (!firstName || !dateOfBirth) return null;

  const name =
    firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

  const date = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  if (!date || isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${name}@${month}${day}${year}`;
}

/** The phone-number default used by the employee mobile app. */
function defaultFromPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

/**
 * Does `plain` authenticate `employee`?
 *
 * @param employee  a full Employee document (needs password, firstName,
 *                  dateOfBirth, phone) — NOT a partially-selected one
 * @param plain     the submitted password
 * @returns {Promise<{ ok: boolean, via: string|null, needsUpgrade: boolean }>}
 */
async function matchesEmployeePassword(employee, plain) {
  const submitted = String(plain || "");
  if (!employee || !submitted) return { ok: false, via: null, needsUpgrade: false };

  const stored = employee.password || "";

  // 1. bcrypt — the only path that should exist long-term.
  if (stored.startsWith("$2")) {
    const ok = await bcrypt.compare(submitted, stored);
    if (ok) return { ok: true, via: "hash", needsUpgrade: false };
  } else if (stored && stored === submitted) {
    // 2. Legacy plaintext.
    return { ok: true, via: "plaintext", needsUpgrade: true };
  }

  // 3 and 4 — the derived defaults. Worked out first, because deciding whether
  // they are allowed costs a lookup and is only worth paying when one matches.
  const nameDefault = defaultFromNameAndDob(employee.firstName, employee.dateOfBirth);
  const phoneDefault = defaultFromPhone(employee.phone);
  const via =
    nameDefault && submitted === nameDefault ? "default-name-dob"
      : phoneDefault && submitted === phoneDefault ? "default-phone"
        : null;
  if (!via) return { ok: false, via: null, needsUpgrade: false };

  if (await isOnSystemIssuedPassword(employee, stored)) {
    return { ok: true, via, needsUpgrade: true };
  }
  return { ok: false, via: null, needsUpgrade: false };
}

/**
 * Is the stored credential still one the employee never chose?
 *
 * See the header: true when nothing is stored, or when what is stored is still
 * the import's `temporaryPassword`. That field is `select: false`, so it is
 * read here rather than trusted to be on the document the caller loaded.
 */
async function isOnSystemIssuedPassword(employee, stored) {
  if (!stored) return true;

  let temp = employee.temporaryPassword;
  if (temp === undefined && employee._id) {
    try {
      const Employee = require("../models/Employee");
      const row = await Employee.findById(employee._id).select("+temporaryPassword").lean();
      temp = row?.temporaryPassword;
    } catch {
      return false;
    }
  }
  if (!temp) return false;

  if (stored.startsWith("$2")) {
    try {
      return await bcrypt.compare(String(temp), stored);
    } catch {
      return false;
    }
  }
  return stored === String(temp);
}

/**
 * Store a password the EMPLOYEE chose, and close the derived-default door.
 *
 * `temporaryPassword` is cleared in the same write: once somebody has picked
 * their own password, the import's random string — and with it the
 * phone-number fallback above — must stop opening the account.
 */
async function setChosenEmployeePassword(EmployeeModel, employeeId, plain) {
  const hash = await bcrypt.hash(String(plain), 10);
  await EmployeeModel.updateOne(
    { _id: employeeId },
    { $set: { password: hash, updatedAt: new Date() }, $unset: { temporaryPassword: 1 } },
  );
}

/**
 * Persist a bcrypt hash for an account that just authenticated by a legacy or
 * derived route.
 *
 * Written with updateOne rather than .save() on purpose: Employee has a
 * pre-save hook that recalculates and re-encrypts the entire salary block, and
 * running payroll code as a side effect of somebody signing in is both slow and
 * a way to corrupt salary on a partially-loaded document.
 */
async function upgradeEmployeePassword(EmployeeModel, employeeId, plain) {
  try {
    const hash = await bcrypt.hash(String(plain), 10);
    await EmployeeModel.updateOne({ _id: employeeId }, { $set: { password: hash } });
    return true;
  } catch (err) {
    // Never fail a valid login because the upgrade failed — they authenticated.
    console.error("[employeePassword] upgrade failed:", err.message);
    return false;
  }
}

module.exports = {
  matchesEmployeePassword,
  upgradeEmployeePassword,
  setChosenEmployeePassword,
  defaultFromNameAndDob,
  defaultFromPhone,
};
