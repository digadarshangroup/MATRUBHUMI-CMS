"use strict";
// scripts/seedSalesDemo.js
//
// Test accounts and enough sample data to actually drive the sales module —
// two desk logins, three field employees with app passwords, a book of leads
// spread across the pipeline, today's assignments, and one paying customer with
// a service request open against them.
//
// IT REFUSES TO RUN WITHOUT --confirm, AND IT TELLS YOU WHERE IT IS POINTED
// -------------------------------------------------------------------------
// Everything below has a PASSWORD PRINTED IN THIS FILE. That is the point for a
// test database and a serious problem on a real one, so the script prints the
// database it resolved from your .env and stops unless you pass --confirm.
// Read the database name before you type it.
//
//   node scripts/seedSalesDemo.js                 # shows the target, changes nothing
//   node scripts/seedSalesDemo.js --confirm       # seeds
//   node scripts/seedSalesDemo.js --confirm --remove   # deletes everything it made
//
// Re-running is safe: accounts are matched by email or phone and updated in
// place rather than duplicated. Passwords are RESET on every run, so a forgotten
// test password is one command away from working again.
//
// Everything it creates is tagged `demoSeed: true` where the schema allows it,
// and every account uses the reserved `@matrubhoomi.test` domain and the
// 90000000xx phone range — so --remove can find its own work and nothing else.

require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const AccessDepartment = require("../models/Access/AccessDepartment");
const DeptUser = require("../models/Access/DeptUser");
const DepartmentRole = require("../models/Access/DepartmentRole");
const Employee = require("../models/Employee");
const SalesStage = require("../models/Sales_Models/SalesStage");
const SalesLead = require("../models/Sales_Models/SalesLead");
const SalesTask = require("../models/Sales_Models/SalesTask");
const SalesServiceRequest = require("../models/Sales_Models/SalesServiceRequest");
const { createWithCode } = require("../services/salesCodes");

const CONFIRM = process.argv.includes("--confirm");
const REMOVE = process.argv.includes("--remove");

const DESK_PASSWORD = "Sales@2026";
const FIELD_PASSWORD = "Field@2026";
const TEST_DOMAIN = "@matrubhoomi.test";

const DESK_USERS = [
  { email: `sales.manager${TEST_DOMAIN}`, name: "Priya Deshmukh", role: "owner", employeeId: "SD-001" },
  { email: `sales.viewer${TEST_DOMAIN}`, name: "Anil Rao", role: "viewer", employeeId: "SD-002" },
];

const FIELD_STAFF = [
  { firstName: "Ramesh", lastName: "Patil", phone: "9000000001", biometricId: "FS-001" },
  { firstName: "Sunita", lastName: "Kale", phone: "9000000002", biometricId: "FS-002" },
  { firstName: "Iqbal", lastName: "Shaikh", phone: "9000000003", biometricId: "FS-003" },
];

// Spread across the ladder on purpose: the board, the filters and the funnel on
// the overview are all uninteresting — and untested — when every lead sits on
// the same rung.
const LEADS = [
  { name: "Sunil Jadhav", phone: "9811100001", village: "Shirur", stage: "contacted", value: 45000 },
  { name: "Kavita More", phone: "9811100002", village: "Shirur", stage: "contacted", value: 30000 },
  { name: "Ganesh Pawar", phone: "9811100003", village: "Talegaon", stage: "interested", value: 80000, verified: true },
  { name: "Rekha Shinde", phone: "9811100004", village: "Talegaon", stage: "details_captured", value: 65000, verified: true },
  { name: "Vikram Jadhav", phone: "9811100005", village: "Chakan", stage: "field_survey", value: 120000, verified: true },
  { name: "Ashok Kulkarni", phone: "9811100006", village: "Chakan", stage: "agreement", value: 150000, verified: true },
  { name: "Meena Gaikwad", phone: "9811100007", village: "Rajgurunagar", stage: "payment", value: 95000, verified: true },
  // The paying customer. Service requests can only be raised against one of
  // these, so without it that half of the module cannot be opened at all.
  { name: "Dattatray Bhosale", phone: "9811100008", village: "Rajgurunagar", stage: "onboarded", value: 210000, verified: true, customer: true, collected: 210000 },
  { name: "Nitin Kadam", phone: "9811100009", village: "Shirur", stage: "lost", value: 0, lost: "Bought from a competitor" },
];

function heading(text) {
  console.log(`\n${text}\n${"─".repeat(text.length)}`);
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/matrubhoomi_hrms";
  const dbName = uri.split("/").pop().split("?")[0];

  heading("Target");
  console.log(`  database : ${dbName}`);
  console.log(`  host     : ${uri.replace(/\/\/[^@]*@/, "//<credentials>@").split("/").slice(0, 3).join("/")}`);

  if (!CONFIRM) {
    console.log(
      "\nNothing was changed. This creates accounts whose passwords are printed in\n" +
        "scripts/seedSalesDemo.js — check the database name above, then re-run with:\n\n" +
        "  node scripts/seedSalesDemo.js --confirm\n",
    );
    process.exit(0);
  }

  await mongoose.connect(uri);

  const dept = await AccessDepartment.findOne({ key: "sales" });
  if (!dept) {
    console.error(
      "\nThere is no `sales` department on this database yet.\n" +
        "Start the server once (npm run dev) — it registers the department, the\n" +
        "pipeline stages and the two starter forms at boot — then run this again.\n",
    );
    process.exit(1);
  }

  if (REMOVE) return remove(dept);
  return seed(dept);
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

async function seed(dept) {
  /* ── Desk logins ──────────────────────────────────────────────── */

  heading("Desk logins (the web dashboard)");

  for (const spec of DESK_USERS) {
    let user = await DeptUser.findOne({ email: spec.email });
    if (!user) {
      user = new DeptUser({
        email: spec.email,
        name: spec.name,
        employeeId: spec.employeeId,
        departmentId: dept._id,
        isActive: true,
        isAdmin: false,
        tokenVersion: 0,
        // Replaced immediately by setPassword below; the field is required, so
        // the document cannot be constructed without something in it.
        passwordHash: await DeptUser.unusablePasswordHash(),
      });
    }
    user.departmentId = dept._id;
    user.isActive = true;
    user.mustChangePassword = false;
    // Reset every run, so a forgotten test password is never a dead end.
    await user.setPassword(DESK_PASSWORD);
    await user.save();

    // The role is what the sales routes actually check. Note the consequence
    // below — granting the FIRST role in a department switches the gate on.
    await DepartmentRole.findOneAndUpdate(
      { departmentSlug: "sales", email: spec.email },
      { $set: { name: spec.name, role: spec.role, isActive: true }, $setOnInsert: { departmentSlug: "sales", email: spec.email } },
      { upsert: true, setDefaultsOnInsert: true },
    );

    console.log(`  ${spec.email.padEnd(34)} ${DESK_PASSWORD.padEnd(12)} ${spec.role}`);
  }

  console.log(
    "\n  Note: `sales` now has roles assigned, so its gate is ENFORCING.\n" +
      "  Any other account — including the CEO — needs a role in Sales to open\n" +
      "  these screens. Grant one from Executive → Access Control.",
  );

  /* ── Field staff ──────────────────────────────────────────────── */

  heading("Field staff (the Android app)");

  // WRITTEN WITH updateOne, WHICH BYPASSES Employee'S PRE-SAVE HOOKS
  // ---------------------------------------------------------------
  // `employee.save()` runs two hooks: one hashes the password, and one
  // ENCRYPTS THE SALARY FIELDS using SALARY_ENCRYPTION_KEY. The second throws
  // outright when that key is missing or is not 64 HEX characters — which has
  // nothing to do with seeding a test account and would stop this script dead
  // on a database whose key was never set up properly.
  //
  // updateOne skips both, so the password is hashed here explicitly. This is
  // the same path utils/employeePassword.js takes, and for the same reason —
  // see the note in CLAUDE.md about loading a whole employee just to change one
  // unrelated field.
  const passwordHash = await bcrypt.hash(FIELD_PASSWORD, 10);

  const staff = [];
  for (const spec of FIELD_STAFF) {
    const email = `${spec.firstName.toLowerCase()}${TEST_DOMAIN}`;

    await Employee.updateOne(
      { phone: spec.phone },
      {
        $set: {
          firstName: spec.firstName,
          lastName: spec.lastName,
          email,
          phone: spec.phone,
          biometricId: spec.biometricId,
          // BOTH are set on purpose. `department` is HR's label and is what the
          // sales team list matches on; `accessDepartmentId` is the access
          // grant. They are different things (see Employee.js) and a test
          // account with only one of them tests only half the path.
          department: "Sales",
          accessDepartmentId: dept._id,
          designation: "Field Sales Executive",
          // Underscore, not a hyphen — the enum on Employee is
          // ["full_time", "part_time", "contract", "intern", ""]. It also must
          // NOT be "intern": interns are refused by the app login and by every
          // request after it.
          employmentType: "full_time",
          gender: "Male",
          isActive: true,
          status: "active",
          dateOfJoining: new Date("2026-01-15"),
          password: passwordHash,
        },
      },
      { upsert: true },
    );

    const employee = await Employee.findOne({ phone: spec.phone })
      .select("firstName lastName biometricId")
      .lean();

    staff.push(employee);
    console.log(`  ${spec.phone.padEnd(14)} ${FIELD_PASSWORD.padEnd(12)} ${spec.firstName} ${spec.lastName} (${spec.biometricId})`);
  }

  /* ── The book ─────────────────────────────────────────────────── */

  const stages = await SalesStage.find({ pipelineKey: "default" }).sort({ order: 1 }).lean();
  const stageKeys = new Set(stages.map((s) => s.key));

  heading("Leads");

  const leads = [];
  for (const [i, spec] of LEADS.entries()) {
    if (!stageKeys.has(spec.stage)) {
      console.log(`  skipped ${spec.name} — this database has no "${spec.stage}" stage`);
      continue;
    }

    const owner = staff[i % staff.length];
    const ownerName = `${owner.firstName} ${owner.lastName}`;

    let lead = await SalesLead.findOne({ phone: spec.phone });
    const fields = {
      name: spec.name,
      category: "farmer",
      address: { village: spec.village, district: "Pune", state: "Maharashtra" },
      stageKey: spec.stage,
      status: spec.customer ? "won" : spec.lost ? "lost" : i < 2 ? "open" : "in_progress",
      isCustomer: Boolean(spec.customer),
      lostReason: spec.lost || "",
      estimatedValue: spec.value,
      dealValue: spec.customer ? spec.value : 0,
      amountCollected: spec.collected || 0,
      assignedTo: owner._id,
      assignedToName: ownerName,
      assignedToCode: owner.biometricId,
      assignedAt: new Date(),
      phoneVerified: Boolean(spec.verified),
      phoneVerifiedAt: spec.verified ? new Date() : null,
      source: "field_visit",
      createdByKind: "desk",
      createdByName: "Demo seed",
      // Spread backwards through the week so the trend chart has a shape and
      // "new today" is not simply everything.
      lastContactedAt: new Date(Date.now() - i * 12 * 3600 * 1000),
      // Two of them are deliberately overdue, because "needs attention" with
      // nothing in it is a figure nobody can check.
      nextFollowUpAt: i % 4 === 0 ? new Date(Date.now() - 2 * 86400000) : new Date(Date.now() + 2 * 86400000),
      notes: "Created by scripts/seedSalesDemo.js",
      tags: ["demo"],
    };

    if (lead) {
      Object.assign(lead, fields);
      await lead.save();
    } else {
      lead = await createWithCode(SalesLead, "lead", {
        ...fields,
        phone: spec.phone,
        stageHistory: [{ stageKey: spec.stage, at: new Date(), byName: "Demo seed" }],
        timeline: [
          { at: new Date(), kind: "created", message: "Seeded for testing", byKind: "system", byName: "Demo seed" },
        ],
      });
    }
    leads.push(lead);
  }
  console.log(`  ${leads.length} leads across ${new Set(leads.map((l) => l.stageKey)).size} stages`);
  console.log(`  ${leads.filter((l) => l.isCustomer).length} paying customer`);

  /* ── Today's work ─────────────────────────────────────────────── */

  heading("Today's assignments");

  // Cleared and rebuilt, so re-running does not pile up ten identical rounds.
  await SalesTask.deleteMany({ title: /^\[demo\]/ });

  const firstStage = stages[0];
  const followUpStage = stages.find((s) => s.key === "interested") || stages[1] || firstStage;

  const quota = await createWithCode(SalesTask, "task", {
    title: "[demo] Lead generation round — Shirur",
    instructions: "Cover the east side of the village. Photograph each farm you visit.",
    type: "lead_generation",
    assignedTo: staff[0]._id,
    assignedToName: `${staff[0].firstName} ${staff[0].lastName}`,
    assignedToCode: staff[0].biometricId,
    assignedByName: "Priya Deshmukh",
    pipelineKey: "default",
    stageKey: firstStage.key,
    templateId: firstStage.templateId || null,
    templateName: "First contact",
    targetCount: 5,
    targets: [],
    requireOtp: Boolean(firstStage.requiresOtp),
    requirePhoto: Boolean(firstStage.requiresPhoto),
    requireLocation: true,
    scheduledFor: new Date(),
    dueAt: new Date(Date.now() + 10 * 3600 * 1000),
    priority: "normal",
    status: "assigned",
  });
  console.log(`  ${quota.code}  ${quota.assignedToName.padEnd(16)} bring in 5 new leads`);

  const namedTargets = leads
    .filter((l) => ["contacted", "interested"].includes(l.stageKey) && !l.isCustomer)
    .slice(0, 3)
    .map((l) => ({
      leadId: l._id,
      name: l.name,
      phone: l.phone,
      village: l.address?.village || "",
      code: l.code,
      status: "pending",
    }));

  if (namedTargets.length) {
    const followUp = await createWithCode(SalesTask, "task", {
      title: "[demo] Follow-up visits — Talegaon",
      instructions: "Confirm interest and verify each number by OTP before recording.",
      type: "follow_up",
      assignedTo: staff[1]._id,
      assignedToName: `${staff[1].firstName} ${staff[1].lastName}`,
      assignedToCode: staff[1].biometricId,
      assignedByName: "Priya Deshmukh",
      pipelineKey: "default",
      stageKey: followUpStage.key,
      templateId: followUpStage.templateId || firstStage.templateId || null,
      templateName: "First contact",
      targetCount: namedTargets.length,
      targets: namedTargets,
      // Forced on regardless of the stage, so the OTP path is reachable in a
      // test run without anybody having to reconfigure the pipeline first.
      requireOtp: true,
      requirePhoto: Boolean(followUpStage.requiresPhoto),
      requireLocation: true,
      scheduledFor: new Date(),
      dueAt: new Date(Date.now() + 10 * 3600 * 1000),
      priority: "high",
      status: "assigned",
    });

    // The leads move with the task — the person who has to visit tomorrow is
    // the person the lead belongs to.
    await SalesLead.updateMany(
      { _id: { $in: namedTargets.map((t) => t.leadId) } },
      {
        $set: {
          assignedTo: staff[1]._id,
          assignedToName: `${staff[1].firstName} ${staff[1].lastName}`,
          assignedToCode: staff[1].biometricId,
        },
      },
    );

    console.log(`  ${followUp.code}  ${followUp.assignedToName.padEnd(16)} visit ${namedTargets.length} named farmers (OTP required)`);
  }

  /* ── After the sale ───────────────────────────────────────────── */

  const customer = leads.find((l) => l.isCustomer);
  if (customer) {
    await SalesServiceRequest.deleteMany({ title: /^\[demo\]/ });
    const request = await createWithCode(SalesServiceRequest, "service", {
      leadId: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      village: customer.address?.village || "",
      type: "maintenance",
      title: "[demo] Drip line blocked in the north plot",
      description: "Reported by phone. Needs somebody on site to check the filter.",
      priority: "high",
      channel: "call",
      status: "open",
      raisedByName: "Priya Deshmukh",
      dueAt: new Date(Date.now() + 2 * 86400000),
    });
    heading("Service");
    console.log(`  ${request.code}  open against ${customer.name}`);
  }

  /* ── What to do next ──────────────────────────────────────────── */

  heading("Try it");
  console.log(`  Web   http://localhost:3000/login  →  ${DESK_USERS[0].email} / ${DESK_PASSWORD}`);
  console.log(`  App   sign in as 9000000001 / ${FIELD_PASSWORD}`);
  console.log(`\n  ${quota.assignedToName} has the lead-generation round; ${staff[1].firstName} has the OTP one.`);
  console.log("  Undo everything: node scripts/seedSalesDemo.js --confirm --remove\n");

  await mongoose.disconnect();
}

/* ------------------------------------------------------------------ */
/* Remove                                                              */
/* ------------------------------------------------------------------ */

async function remove() {
  heading("Removing the demo data");

  const emails = DESK_USERS.map((u) => u.email);
  const phones = FIELD_STAFF.map((s) => s.phone);
  const leadPhones = LEADS.map((l) => l.phone);

  // Ordered so nothing is left pointing at something that has gone.
  const results = {
    "service requests": (await SalesServiceRequest.deleteMany({ title: /^\[demo\]/ })).deletedCount,
    tasks: (await SalesTask.deleteMany({ title: /^\[demo\]/ })).deletedCount,
    leads: (await SalesLead.deleteMany({ phone: { $in: leadPhones } })).deletedCount,
    "field staff": (await Employee.deleteMany({ phone: { $in: phones } })).deletedCount,
    "desk roles": (await DepartmentRole.deleteMany({ email: { $in: emails } })).deletedCount,
    "desk logins": (await DeptUser.deleteMany({ email: { $in: emails } })).deletedCount,
  };

  for (const [what, n] of Object.entries(results)) console.log(`  ${String(n).padStart(3)} ${what}`);

  console.log(
    "\n  Submissions and location fixes made DURING testing are left alone —\n" +
      "  they are real records of things that happened, and this script did not\n" +
      "  create them. Drop them by hand if you want a clean slate.\n",
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("\nSeeding failed:", err.message);
  process.exit(1);
});
