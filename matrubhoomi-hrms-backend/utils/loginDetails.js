"use strict";
/**
 * What an employee needs in order to sign in, gathered in one place for the
 * three emails that carry it: the welcome email when HR creates them, the
 * "Email sign-in details" button on their profile, and a password reset.
 *
 * The employee app signs in with the 10-digit PHONE NUMBER and a password. The
 * first password is the phone number itself, and the app makes them choose
 * their own before anything else (routes/Employee_Routes/login.js). The old
 * welcome email sent people to a web address with their email instead, which
 * the app never accepted. Only staff with desk access (an access department)
 * can also use the CMS, with their work email and the same password.
 */
const AppVersion = require("../models/Appversion");

const cmsBase = () =>
  String(process.env.CMS_PUBLIC_URL || "https://cms.matrubhumi.net").replace(/\/+$/, "");

/** Where the employee app can be downloaded — the release HR last published. */
async function appDownloadUrl() {
  try {
    const latest =
      (await AppVersion.findOne({ app: "employee", isLatest: true }).lean()) ||
      (await AppVersion.findOne({ app: "employee" }).sort({ createdAt: -1 }).lean());
    return latest?.driveDownloadUrl || latest?.driveViewUrl || "";
  } catch {
    return "";
  }
}

/** Everything the sign-in email says about this person. */
async function loginDetailsFor(employee) {
  const name =
    [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() || "";
  const hasDesk =
    !!employee.accessDepartmentId || (employee.additionalDepartmentIds || []).length > 0;
  return {
    name,
    firstName: employee.firstName || name,
    email: employee.email || "",
    phone: String(employee.phone || "").replace(/\D/g, ""),
    employeeId: employee.biometricId || "",
    department: employee.department || "",
    designation: employee.designation || employee.jobPosition || "",
    managerName: employee.primaryManager?.managerName || "",
    appUrl: await appDownloadUrl(),
    cmsUrl: hasDesk ? `${cmsBase()}/login` : "",
  };
}

module.exports = { loginDetailsFor, appDownloadUrl };
