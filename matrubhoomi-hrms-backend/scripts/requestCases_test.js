"use strict";
// scripts/requestCases_test.js
//
// The other two things an employee asks their manager for — fixing a day's
// attendance, and being credited for staying late — in every shape the app or
// a curious user can send them. Against a REAL server and a SCRATCH database.
//
// Sibling of leaveCases_test.js (the leave rulebook) and employeeAppFlow_test.js
// (one person's whole life in the app).
//
// RUN IT AGAINST A SCRATCH DATABASE. NOT PRODUCTION, AND NOT YOUR DEV DATABASE.
//
//   # terminal 1 — every outside integration blanked
//   MONGODB_URI=mongodb://127.0.0.1:27017/request_scratch PORT=5099 \
//     JWT_SECRET=smoke_secret_key SALARY_ENCRYPTION_KEY=<64 hex chars> \
//     ENABLE_EMAILS=false node server.js
//
//   # terminal 2
//   MONGODB_URI=<the same> SALARY_ENCRYPTION_KEY=<the same> node scripts/requestCases_test.js

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:5099";
const SECRET = process.env.JWT_SECRET || "smoke_secret_key";
let pass = 0, fail = 0;

function check(label, ok, detail) {
  if (ok) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label, detail !== undefined ? "->" + JSON.stringify(detail) : ""); }
}
function heading(n, text) { console.log(`\n${n}. ${text}`); }

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** The IST calendar date `offset` days from today. */
function istDay(offset = 0) {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offset * 86400000).toISOString().slice(0, 10);
}
/** A Date for HH:mm IST on an IST calendar date. */
function istAt(dateStr, hhmm) {
  return new Date(`${dateStr}T${hhmm}:00+05:30`);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/request_scratch");
  await require("./_waitForIndexes")(mongoose);
  const Employee = require("../models/Employee");
  const Department = require("../models/HR_Models/Departments");
  const DailyAttendance = require("../models/HR_Models/Dailyattendance");
  const { RegularizationRequest } = require("../models/HR_Models/LeaveManagement");

  const DOMAIN = "requestcases.test";
  const PHONES = { mgr: "9833000001", emp: "9833000002", loner: "9833000003", fresh: "9833000004" };
  await Employee.deleteMany({ email: new RegExp(`@${DOMAIN.replace(".", "\\.")}$`) });
  await Employee.deleteMany({ phone: { $in: Object.values(PHONES) } });
  const dept = await Department.findOneAndUpdate(
    { name: "Accounts" },
    { $setOnInsert: { name: "Accounts", designations: [{ name: "Accountant" }] } },
    { upsert: true, new: true },
  );

  const hr = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: "hr_manager", email: "hr@example.test", name: "HR Tester" }, SECRET, { expiresIn: "1h" });
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const hire = async (key, first, joinedDaysAgo, manager) => {
    const r = await call("POST", "/api/employees", hr, {
      firstName: first, lastName: "Req", email: `${key}@${DOMAIN}`, phone: PHONES[key], gender: "Male",
      department: dept.name, departmentId: String(dept._id), designation: "Accountant",
      dateOfJoining: daysAgo(joinedDaysAgo), confirmationDate: daysAgo(joinedDaysAgo), employmentType: "full_time",
      workShift: { mode: "general" }, salary: { gross: 25000 }, biometricId: `RQC${Object.keys(PHONES).indexOf(key)}`,
      ...(manager ? { primaryManager: { managerId: manager.id, managerName: manager.name } } : {}),
    });
    if (r.status !== 201) throw new Error(`hire ${key}: ${r.status} ${r.json?.message}`);
    return { id: String(r.json.data._id), name: `${first} Req`, bid: `RQC${Object.keys(PHONES).indexOf(key)}` };
  };
  const mgr = await hire("mgr", "Madhav", 900);
  const emp = await hire("emp", "Eshan", 400, mgr);
  const loner = await hire("loner", "Lalit", 400, null);
  const fresh = await hire("fresh", "Farhan", 3, mgr);

  const tok = {};
  for (const [k, phone] of Object.entries(PHONES)) {
    const r = await call("POST", "/api/employee/auth/login", null, { phoneNumber: phone, password: phone });
    tok[k] = r.json?.data?.token;
  }
  const REG = "/api/employee/regularizations";
  const file = (who, body) => call("POST", REG, tok[who], { reason: "Machine did not read my finger", ...body });

  /* ================================================================ */
  heading(1, "Fixing a day — what the server refuses, and says why");

  const d3 = istDay(-3), d4 = istDay(-4), d5 = istDay(-5);
  let r = await file("emp", { type: "miss_punch", inTime: "09:30" });
  check("no date", r.status === 400 && /date/i.test(r.json?.message || ""), [r.status, r.json?.message]);
  r = await file("emp", { dateStr: "2026-02-30", type: "miss_punch", inTime: "09:30" });
  check("30 February", r.status === 400, [r.status, r.json?.message]);
  r = await file("emp", { dateStr: istDay(2), type: "miss_punch", inTime: "09:30" });
  check("a day that has not happened yet", r.status === 400 && /hasn't happened/i.test(r.json?.message || ""), [r.status, r.json?.message]);
  r = await file("emp", { dateStr: d3, type: "teleported", inTime: "09:30" });
  check("a kind of problem that does not exist", r.status === 400, r.status);
  r = await file("emp", { dateStr: d3, type: "miss_punch", inTime: "09:30", reason: "   " });
  check("a reason of only spaces", r.status === 400 && /reason/i.test(r.json?.message || ""), [r.status, r.json?.message]);
  r = await file("emp", { dateStr: d3, type: "miss_punch" });
  check("a missed punch with no time at all", r.status === 400 && r.json?.code === "TIME_REQUIRED", [r.status, r.json?.code]);
  r = await file("emp", { dateStr: d3, type: "miss_punch", inTime: "25:10" });
  check("a time that is not a time", r.status === 400 && r.json?.code === "BAD_TIME", [r.status, r.json?.code]);
  r = await file("emp", { dateStr: d3, type: "miss_punch", inTime: "18:30", outTime: "09:30" });
  check("out before in", r.status === 400 && r.json?.code === "BAD_RANGE", [r.status, r.json?.code]);
  r = await file("emp", { dateStr: d3, type: "wrong_status" });
  check("'wrong status' without saying what it should be", r.status === 400 && r.json?.code === "STATUS_REQUIRED", [r.status, r.json?.code]);
  r = await file("emp", { dateStr: d3, type: "wrong_status", requestedStatus: "PAID_HOLIDAY" });
  check("a status nobody may ask for", r.status === 400 && r.json?.code === "BAD_STATUS", [r.status, r.json?.code]);
  r = await file("fresh", { dateStr: istDay(-10), type: "miss_punch", inTime: "09:30" });
  check("a day before he joined", r.status === 400 && r.json?.code === "BEFORE_JOINING", [r.status, r.json?.code]);
  r = await file("loner", { dateStr: d3, type: "miss_punch", inTime: "09:30" });
  check("nobody to send it to: told to ask HR", r.status === 400 && r.json?.code === "NO_MANAGER", [r.status, r.json?.code]);
  r = await call("POST", REG, null, { dateStr: d3, type: "miss_punch", inTime: "09:30", reason: "x" });
  check("nobody signed in", r.status === 401, r.status);

  /* ================================================================ */
  heading(2, "One request per day, and taking it back");

  r = await file("emp", { dateStr: d3, type: "miss_punch", inTime: "09:30", outTime: "18:30" });
  check("a missed punch is filed, waiting", r.status === 201 && r.json?.data?.status === "pending", [r.status, r.json?.message]);
  const c1 = r.json?.data?._id;
  check("…with his one manager on it", (r.json?.data?.managersNotified || []).length === 1 && String(r.json.data.managersNotified[0].managerId) === mgr.id, r.json?.data?.managersNotified);
  r = await file("emp", { dateStr: d3, type: "forgot_punch", outTime: "18:45" });
  check("a second request for the same day is refused", r.status === 409 && r.json?.code === "OPEN_REQUEST", [r.status, r.json?.code]);
  r = await call("PATCH", `${REG}/${c1}/cancel`, tok.fresh, {});
  check("somebody else cannot cancel it", r.status === 404, r.status);
  r = await call("PATCH", `${REG}/${c1}/cancel`, tok.emp, { reason: "Found the right time" });
  check("he takes it back", r.status === 200 && r.json?.data?.status === "cancelled", [r.status, r.json?.data?.status]);
  r = await call("PATCH", `${REG}/${c1}/cancel`, tok.emp, {});
  check("taking it back twice is refused", r.status === 400, r.status);
  r = await call("PATCH", `${REG}/not-an-id/cancel`, tok.emp, {});
  check("a malformed id is 'not found'", r.status === 404, r.status);
  r = await file("emp", { dateStr: d3, type: "miss_punch", inTime: "09:25", outTime: "18:40" });
  check("the day is free to be asked about again", r.status === 201, [r.status, r.json?.message]);
  const c2 = r.json?.data?._id;

  /* ================================================================ */
  heading(3, "The manager decides");

  const q = await call("GET", `${REG}/manager/pending`, tok.mgr);
  check("it is in his manager's queue", (q.json?.data || []).some((x) => String(x._id) === String(c2)), (q.json?.data || []).length);
  const q2 = await call("GET", `${REG}/manager/pending`, tok.loner);
  check("and in nobody else's", !(q2.json?.data || []).some((x) => String(x._id) === String(c2)), (q2.json?.data || []).length);
  r = await call("PATCH", `${REG}/manager/${c2}/approve`, tok.emp, {});
  check("he cannot approve his own", r.status === 404, r.status);
  r = await call("PATCH", `${REG}/manager/${c2}/approve`, tok.loner, {});
  check("nor can a colleague", r.status === 404, r.status);
  r = await call("PATCH", `${REG}/manager/${c2}/approve`, tok.mgr, { remarks: "OK" });
  check("his manager approves, and it is final", r.status === 200 && r.json?.data?.status === "hr_approved", [r.status, r.json?.data?.status]);
  r = await call("PATCH", `${REG}/manager/${c2}/approve`, tok.mgr, {});
  check("approving twice is refused", r.status === 400, r.status);
  r = await call("PATCH", `${REG}/${c2}/cancel`, tok.emp, {});
  check("an approved correction cannot be pulled back by the employee", r.status === 400, r.status);
  r = await call("PATCH", `${REG}/manager/undefined/approve`, tok.mgr, {});
  check("a malformed id on the manager's side is 'not found'", r.status === 404, r.status);

  r = await file("emp", { dateStr: d4, type: "wrong_status", requestedStatus: "WFH", reason: "Worked from home, cleared with Madhav" });
  const c3 = r.json?.data?._id;
  check("a 'should have been WFH' request", r.status === 201, [r.status, r.json?.message]);
  r = await call("PATCH", `${REG}/manager/${c3}/reject`, tok.mgr, { rejectionReason: "No WFH that week" });
  check("rejected with a reason", r.status === 200 && r.json?.data?.status === "manager_rejected" && r.json?.data?.rejectionReason === "No WFH that week", [r.status, r.json?.data?.status]);
  r = await call("PATCH", `${REG}/manager/${c3}/reject`, tok.mgr, { rejectionReason: "again" });
  check("rejecting twice is refused", r.status === 400, r.status);
  r = await file("emp", { dateStr: d4, type: "wrong_status", requestedStatus: "HD", reason: "Half day then" });
  check("after a rejection he may ask again, differently", r.status === 201, [r.status, r.json?.message]);

  const mine = await call("GET", REG, tok.emp);
  const owners = new Set((mine.json?.data || []).map((x) => String(x.employeeId)));
  check("his list is his alone", owners.size === 1 && owners.has(emp.id), [...owners]);
  const inbox = await call("GET", "/api/employee/notifications", tok.emp);
  check("he was told about both decisions", (inbox.json?.data || []).filter((n) => /approved|wasn't approved/i.test(`${n.title} ${n.body}`)).length >= 2, (inbox.json?.data || []).map((n) => n.title));

  /* ================================================================ */
  heading(4, "Staying late — the overtime report");

  const today = istDay(0);
  const ym = today.slice(0, 7);
  const seedDay = async (dateStr, bid, outHHMM) => {
    await DailyAttendance.updateOne(
      { dateStr },
      {
        $setOnInsert: { dateStr, date: new Date(`${dateStr}T00:00:00+05:30`), yearMonth: dateStr.slice(0, 7) },
        $push: { employees: { biometricId: bid, inTime: istAt(dateStr, "09:28"), finalOut: istAt(dateStr, outHHMM) } },
      },
      { upsert: true },
    );
  };
  await seedDay(today, emp.bid, "20:10"); // an hour and forty minutes past 18:30
  await seedDay(d5, emp.bid, "21:00"); // long ago: the report window has closed

  const OT = "/api/employee/overtime";
  r = await call("GET", `${OT}/check`, tok.emp);
  const due = (r.json?.data || []).find((x) => x.dateStr === today);
  check("the app is told there is a report to write for today", !!due && due.stayOverMins === 100, r.json?.data);
  check("…and not for the day whose window has closed", !(r.json?.data || []).some((x) => x.dateStr === d5), (r.json?.data || []).map((x) => x.dateStr));
  r = await call("GET", `${OT}/check`, tok.loner);
  check("nobody else is asked about Eshan's evening", (r.json?.data || []).length === 0, r.json?.data);

  const submit = (who, body) => call("POST", `${OT}/submit`, tok[who], body);
  r = await submit("emp", { dateStr: today, description: "   " });
  check("a blank description is refused", r.status === 400, [r.status, r.json?.message]);
  r = await submit("emp", { dateStr: "2026-02-30", description: "Month-end close" });
  check("an impossible date is refused", r.status === 400, [r.status, r.json?.message]);
  r = await submit("emp", { dateStr: istDay(-1), description: "Month-end close" });
  check("a day he did not stay late is refused", r.status === 400 && /stay-over|expired/i.test(r.json?.message || ""), [r.status, r.json?.message]);
  r = await submit("emp", { dateStr: d5, description: "Month-end close" });
  check("a closed window is refused, saying so", r.status === 400 && /expired/i.test(r.json?.message || ""), [r.status, r.json?.message]);
  r = await submit("emp", { dateStr: today, description: "Month-end close with the auditors" });
  check("today's report is filed", r.status === 201 && r.json?.data?.status === "pending" && r.json?.data?.stayOverMins === 100, [r.status, r.json?.message]);
  const ot1 = r.json?.data?._id;
  check("staying to 20:10 earns fifteen minutes' grace tomorrow", r.json?.data?.graceMinutes === 15, r.json?.data?.graceMinutes);
  r = await submit("emp", { dateStr: today, description: "again" });
  check("a second report for the same evening is refused", r.status === 400, r.status);

  r = await call("GET", `${OT}/manager/pending`, tok.mgr);
  check("his manager sees it", (r.json?.data || []).some((x) => String(x._id) === String(ot1)), (r.json?.data || []).length);
  r = await call("PATCH", `${OT}/manager/${ot1}/approve`, tok.loner, {});
  check("a colleague cannot approve it", r.status === 404, r.status);
  r = await call("PATCH", `${OT}/manager/${ot1}/approve`, tok.emp, {});
  check("nor can he", r.status === 404, r.status);
  r = await call("PATCH", `${OT}/manager/nope/approve`, tok.mgr, {});
  check("a malformed id is 'not found'", r.status === 404, r.status);
  r = await call("PATCH", `${OT}/manager/${ot1}/approve`, tok.mgr, { remarks: "Thank you" });
  check("his manager approves it", r.status === 200 && r.json?.data?.status === "manager_approved", [r.status, r.json?.data?.status]);
  r = await call("PATCH", `${OT}/manager/${ot1}/approve`, tok.mgr, {});
  check("approving twice finds nothing to approve", r.status === 404, r.status);
  r = await call("PATCH", `${OT}/manager/${ot1}/reject`, tok.mgr, { remarks: "changed my mind" });
  check("and an approved report cannot then be rejected", r.status === 404, r.status);
  r = await call("GET", `${OT}/my`, tok.emp);
  check("it is in his month's history", (r.json?.data || []).some((x) => String(x._id) === String(ot1) && x.dateStr.startsWith(ym)), (r.json?.data || []).length);
  r = await call("GET", `${OT}/check`, tok.emp);
  check("and he is no longer asked to write it", !(r.json?.data || []).some((x) => x.dateStr === today), r.json?.data);

  const left = await RegularizationRequest.countDocuments({ employeeId: emp.id });
  check("every correction he filed is on record, cancelled ones included", left === 4, left);

  console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed\n${"=".repeat(60)}`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
