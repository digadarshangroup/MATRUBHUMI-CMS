"use strict";
// scripts/seedLiveTesters.js
//
// A few clearly-marked TEST people on the live system, so the employee app and
// the CMS can be tried end to end before real staff are added — and removed
// again, completely, with one command.
//
//   node scripts/seedLiveTesters.js                  # add them; prints the logins ONCE
//   node scripts/seedLiveTesters.js --remove         # list everything that would go
//   node scripts/seedLiveTesters.js --remove --yes   # and remove it
//
// Everything it makes is marked, so nothing real can be mistaken for it:
//   - every email ends @matrubhumi.test — a reserved domain no mail reaches;
//   - every phone number starts 555 — no Indian mobile does, so no real
//     person's number is used and none can clash with a real hire later;
//   - every biometric ID starts TEST (the punch machine has none);
//   - every name ends "(Test)".
//
// Nothing is created through the API, so no welcome email goes out. No
// department ROLE rows are written: the HR and Sales departments have none,
// and adding the first one would start enforcing roles on everybody else in
// them (services/departmentRoles.js). No department gets a default manager, so
// a real hire never inherits a test manager.
//
// It writes to whatever MONGODB_URI (the backend's .env) points at — that is
// its job. Run it once; a second run changes nothing.

require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const mongoose = require("mongoose");

const REMOVE = process.argv.includes("--remove");
const YES = process.argv.includes("--yes");
const DOMAIN = "matrubhumi.test";
const MARK = /@matrubhumi\.test$/i;

/** Two words and four digits: strong enough behind the login lockout, easy to type on a phone. */
function passphrase() {
  const words = ["Mango", "River", "Paddy", "Lotus", "Guava", "Cedar", "Monsoon", "Harvest",
    "Banyan", "Sunrise", "Tamarind", "Coconut", "Jasmine", "Orchard", "Meadow", "Pepper",
    "Saffron", "Bamboo", "Lantern", "Pebble", "Falcon", "Kestrel", "Marigold", "Neem"];
  const pick = () => words[crypto.randomInt(words.length)];
  let a = pick(), b = pick();
  while (b === a) b = pick();
  return `${a}-${b}-${String(crypto.randomInt(1000, 10000))}`;
}

const DEPARTMENTS = [
  { name: "Sales", designations: ["Sales Manager", "Field Sales Executive"] },
  { name: "Operations", designations: ["Operations Supervisor", "Storekeeper"] },
  { name: "Accounts", designations: ["Accountant"] },
];

// key, first, last, dept, designation, phone, days since joining, manager key
const PEOPLE = [
  ["rakesh", "Rakesh", "Mohanty (Test)", "Sales", "Sales Manager", "5550000101", 900, null],
  ["priya", "Priya", "Das (Test)", "Sales", "Field Sales Executive", "5550000102", 400, "rakesh"],
  ["arjun", "Arjun", "Nayak (Test)", "Sales", "Field Sales Executive", "5550000103", 60, "rakesh"],
  ["meera", "Meera", "Patnaik (Test)", "Operations", "Operations Supervisor", "5550000104", 700, null],
  ["sunil", "Sunil", "Behera (Test)", "Operations", "Storekeeper", "5550000105", 300, "meera"],
  ["anita", "Anita", "Sahoo (Test)", "Accounts", "Accountant", "5550000106", 150, "meera"],
];

const DESK = [
  ["hr", "hr.test", "HR Desk (Test)"],
  ["sales", "sales.test", "Sales Desk (Test)"],
];

(async () => {
  const uri = process.env.MONGODB_URI || "";
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  console.log(`database: ${db.databaseName} on ${uri.replace(/\/\/[^@]*@/, "//***@").split("/")[2]}\n`);

  const Employee = require("../models/Employee");
  const Department = require("../models/HR_Models/Departments");
  const AccessDepartment = require("../models/Access/AccessDepartment");
  const DeptUser = require("../models/Access/DeptUser");

  if (REMOVE) {
    await removeEverything({ db, Employee, DeptUser });
    await mongoose.disconnect();
    return;
  }

  if (await Employee.exists({ email: MARK }) || await DeptUser.exists({ email: MARK })) {
    console.log("Test people are already here — nothing added. (Remove them with --remove --yes, then run again for fresh passwords.)");
    await mongoose.disconnect();
    return;
  }

  /* ── Departments: reuse any that exist, add the missing ones ─────── */
  const deptByName = {};
  for (const d of DEPARTMENTS) {
    let row = await Department.findOne({ name: d.name });
    if (!row) {
      row = await Department.create({ name: d.name, status: "active", designations: d.designations.map((name) => ({ name })) });
      console.log(`department added: ${d.name}`);
    } else {
      const have = new Set((row.designations || []).map((x) => x.name));
      const missing = d.designations.filter((n) => !have.has(n));
      if (missing.length) {
        await Department.updateOne({ _id: row._id }, { $push: { designations: { $each: missing.map((name) => ({ name })) } } });
        console.log(`department ${d.name}: added designations ${missing.join(", ")}`);
      }
    }
    deptByName[d.name] = row;
  }

  /* ── The people, managers first ──────────────────────────────────── */
  const appPassword = passphrase();
  const made = {};
  const daysAgo = (n) => new Date(Date.now() - n * 86400000);
  for (const [key, first, last, deptName, designation, phone, joined, managerKey] of PEOPLE) {
    const dept = deptByName[deptName];
    const manager = managerKey ? made[managerKey] : null;
    const emp = new Employee({
      firstName: first,
      lastName: last,
      email: `${key}.test@${DOMAIN}`,
      phone,
      gender: ["priya", "meera", "anita"].includes(key) ? "Female" : "Male",
      department: dept.name,
      departmentId: dept._id,
      designation,
      dateOfJoining: daysAgo(joined),
      confirmationDate: daysAgo(joined),
      employmentType: "full_time",
      workShift: { mode: "general" },
      salary: { gross: 20000 },
      biometricId: `TEST${phone.slice(-3)}`,
      ...(manager ? { primaryManager: { managerId: manager._id, managerName: `${manager.firstName} ${manager.lastName}` } } : {}),
      isActive: true,
      status: "active",
      // Hashed by the model's own pre-save hook, like every other employee.
      password: appPassword,
      createdByName: "Test data (scripts/seedLiveTesters.js)",
    });
    await emp.save();
    made[key] = emp;
    console.log(`employee added: ${first} ${last} — ${designation}, ${dept.name}${manager ? ` (reports to ${manager.firstName})` : ""}`);
  }

  /* ── CMS logins ───────────────────────────────────────────────────── */
  const deskPasswords = {};
  for (const [slug, local, name] of DESK) {
    const dept = await AccessDepartment.findOne({ slug });
    if (!dept) { console.log(`(no "${slug}" department in Access Control — ${name} not added)`); continue; }
    const user = new DeptUser({
      name,
      email: `${local}@${DOMAIN}`,
      departmentId: dept._id,
      legacyModel: dept.legacyModel,
      legacyRole: dept.legacyRole || dept.slug,
      isActive: true,
      passwordHash: "pending",
    });
    deskPasswords[slug] = passphrase();
    await user.setPassword(deskPasswords[slug]);
    user.mustChangePassword = false;
    await user.save();
    console.log(`CMS login added: ${name} (${dept.name})`);
  }

  /* ── Proof, before anybody tries: the stored hashes open with these ── */
  const bcrypt = require("bcryptjs");
  for (const emp of Object.values(made)) {
    const stored = await Employee.findById(emp._id).select("password").lean();
    if (!(await bcrypt.compare(appPassword, stored.password))) throw new Error(`password check failed for ${emp.firstName}`);
  }
  for (const [slug, local] of DESK) {
    if (!deskPasswords[slug]) continue;
    const u = await DeptUser.findOne({ email: `${local}@${DOMAIN}` });
    if (!(await u.verifyPassword(deskPasswords[slug]))) throw new Error(`password check failed for ${local}`);
  }
  console.log("\nall passwords verified against what was stored.");

  console.log("\n================ SHOWN ONCE — keep it somewhere safe ================");
  console.log("EMPLOYEE APP  (phone number + password)");
  for (const [key, first, last, deptName, designation, phone] of PEOPLE) {
    console.log(`  ${phone}  ${first} ${last} — ${designation}${deptName === "Sales" ? " · tracked (sales)" : ""}`);
  }
  console.log(`  password for all six: ${appPassword}`);
  console.log("\nCMS  (email + password)");
  for (const [slug, local, name] of DESK) {
    if (deskPasswords[slug]) console.log(`  ${local}@${DOMAIN}  ${deskPasswords[slug]}   ${name}`);
  }
  console.log("====================================================================");
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error("seedLiveTesters failed:", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

/**
 * Everything the test people made or were given, found through their ids —
 * dry run unless --yes. Departments are left: an empty department is harmless
 * and HR may well keep it.
 */
async function removeEverything({ db, Employee, DeptUser }) {
  const people = await Employee.find({ email: MARK }).select("_id firstName lastName biometricId").lean();
  const ids = people.map((p) => p._id);
  const idStrings = ids.map(String);
  const bios = people.map((p) => p.biometricId).filter(Boolean);
  const desk = await DeptUser.find({ email: MARK }).select("_id email").lean();
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);

  // [collection, filter] — only collections that exist are touched.
  const plan = [
    ["employees", { _id: { $in: ids } }],
    ["dept_users", { _id: { $in: desk.map((d) => d._id) } }],
    ["leavebalances", { employeeId: { $in: ids } }],
    ["leaveapplications", { employeeId: { $in: ids } }],
    ["regularizationrequests", { employeeId: { $in: ids } }],
    ["overtimereports", { employeeId: { $in: ids } }],
    ["employee_notifications", { employeeId: { $in: ids } }],
    ["employee_documents", { employeeId: { $in: ids } }],
    ["sales_tasks", { assignedTo: { $in: ids } }],
    ["sales_form_submissions", { submittedBy: { $in: ids } }],
    // Customers a test salesperson ADDED. Real customers only handed to one
    // are left alone — reassign them.
    ["sales_leads", { createdByKind: "employee", createdBy: { $in: ids } }],
    ["sales_otps", { requestedBy: { $in: ids } }],
    ["field_days", { employeeId: { $in: ids } }],
    ["field_location_pings", { employeeId: { $in: ids } }],
    ["pushsubscriptions", { ownerId: { $in: [...ids, ...idStrings] } }],
    ["dailyattendances", null], // punches live inside a day's document — handled below
  ];

  console.log(`${REMOVE && YES ? "Removing" : "Would remove"} (test people: ${people.map((p) => `${p.firstName} ${p.lastName}`).join(", ") || "none"}; CMS logins: ${desk.map((d) => d.email).join(", ") || "none"})`);
  for (const [coll, filter] of plan) {
    if (!names.includes(coll)) continue;
    if (coll === "dailyattendances") {
      if (!bios.length) continue;
      const n = await db.collection(coll).countDocuments({ "employees.biometricId": { $in: bios } });
      if (YES && n) await db.collection(coll).updateMany({ "employees.biometricId": { $in: bios } }, { $pull: { employees: { biometricId: { $in: bios } } } });
      console.log(`  ${coll.padEnd(24)} ${n} day(s) with their rows${YES && n ? " — their rows pulled" : ""}`);
      continue;
    }
    const n = await db.collection(coll).countDocuments(filter);
    if (YES && n) await db.collection(coll).deleteMany(filter);
    console.log(`  ${coll.padEnd(24)} ${n}${YES && n ? " — removed" : ""}`);
  }
  if (!YES) console.log("\nNothing was changed. Run again with --remove --yes to remove it.");
  else console.log("\nDone. The Sales / Operations / Accounts departments were left in place.");
}
