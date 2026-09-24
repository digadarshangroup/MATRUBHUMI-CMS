"use strict";
// scripts/leaveCases_test.js
//
// Every way an employee can ask for a day off, and every way a manager can
// answer — against a REAL server and a SCRATCH database.
//
// The employee app's own suite (employeeAppFlow_test.js) walks one leave through
// its life. This one is the rulebook: validation, the joining waiting period,
// PL eligibility, balances and what "reserved" means, the monthly caps that
// split the excess into unpaid days, half days, overlaps and duplicates, quick
// leave and its classification, cancelling, withdrawing an approved leave (and
// changing one's mind), rejection, and who may act on whose request.
//
// RUN IT AGAINST A SCRATCH DATABASE. NOT PRODUCTION, AND NOT YOUR DEV DATABASE.
//
//   # terminal 1 — every outside integration blanked
//   MONGODB_URI=mongodb://127.0.0.1:27017/leave_scratch PORT=5099 \
//     JWT_SECRET=smoke_secret_key SALARY_ENCRYPTION_KEY=<64 hex chars> \
//     ENABLE_EMAILS=false node server.js
//
//   # terminal 2
//   MONGODB_URI=<the same> SALARY_ENCRYPTION_KEY=<the same> node scripts/leaveCases_test.js

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

/** YYYY-MM-DD for `n` days after the first of the month `monthsAhead` from now. */
function dayIn(monthsAhead, n) {
  const d = new Date();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsAhead, 1));
  first.setUTCDate(first.getUTCDate() + n);
  return first.toISOString().slice(0, 10);
}
function istToday(offsetDays = 0) {
  const t = new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000);
  return t.toISOString().slice(0, 10);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/leave_scratch");
  await require("./_waitForIndexes")(mongoose);
  const Employee = require("../models/Employee");
  const Department = require("../models/HR_Models/Departments");
  const { LeaveApplication, LeaveBalance } = require("../models/HR_Models/LeaveManagement");

  const DOMAIN = "leavecases.test";
  const PHONES = { mgr: "9822000001", vet: "9822000002", newbie: "9822000003", orphan: "9822000004", junior: "9822000005", other: "9822000006" };
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
      firstName: first, lastName: "Case", email: `${key}@${DOMAIN}`, phone: PHONES[key], gender: "Female",
      department: dept.name, departmentId: String(dept._id), designation: "Accountant",
      dateOfJoining: daysAgo(joinedDaysAgo), confirmationDate: daysAgo(joinedDaysAgo), employmentType: "full_time",
      workShift: { mode: "general" }, salary: { gross: 25000 }, biometricId: `LVC${Object.keys(PHONES).indexOf(key)}`,
      ...(manager ? { primaryManager: { managerId: manager.id, managerName: manager.name } } : {}),
    });
    if (r.status !== 201) throw new Error(`hire ${key}: ${r.status} ${r.json?.message}`);
    return { id: String(r.json.data._id), name: `${first} Case` };
  };
  const mgr = await hire("mgr", "Mala", 900);
  const other = await hire("other", "Otto", 900);
  const vet = await hire("vet", "Veena", 400, mgr);
  const newbie = await hire("newbie", "Nita", 5, mgr);
  const orphan = await hire("orphan", "Omar", 400, null);
  const junior = await hire("junior", "Jaya", 100, mgr);

  const tok = {};
  for (const [k, phone] of Object.entries(PHONES)) {
    const r = await call("POST", "/api/employee/auth/login", null, { phoneNumber: phone, password: phone });
    tok[k] = r.json?.data?.token;
  }
  const today = istToday();
  const apply = (who, body) => call("POST", "/api/employee/leave-applications", tok[who], { applicationDate: today, reason: "Family function", ...body });
  const balance = async (who) => (await call("GET", "/api/employee/leave-applications/balance", tok[who])).json?.data;
  const left = async (who, type) => (await balance(who))?.effectiveAvailable?.[type];

  /* ================================================================ */
  heading(1, "Validation — the server refuses what it cannot make sense of");

  const D = (n) => dayIn(1, n); // next month
  let r = await apply("vet", { leaveType: "CL", fromDate: D(2), toDate: D(2), reason: "" });
  check("no reason is refused", r.status === 400, r.json?.message);
  r = await apply("vet", { leaveType: "CL", fromDate: D(2), toDate: D(2), reason: "    " });
  check("a reason of only spaces is refused", r.status === 400, [r.status, r.json?.message]);
  r = await apply("vet", { leaveType: "XL", fromDate: D(2), toDate: D(2) });
  check("an unknown leave type is refused", r.status === 400, r.json?.message);
  r = await apply("vet", { leaveType: "CL", fromDate: D(5), toDate: D(2) });
  check("an end before the start is refused", r.status === 400, r.json?.message);
  r = await apply("vet", { leaveType: "CL", fromDate: "2026-13-45", toDate: "2026-13-46" });
  check("an impossible date is refused plainly, not with a crash", r.status === 400, [r.status, r.json?.message]);
  r = await apply("vet", { leaveType: "CL", fromDate: "tomorrow", toDate: "tomorrow" });
  check("a date that is not a date is refused", r.status === 400, [r.status, r.json?.message]);
  r = await apply("vet", { leaveType: "CL", fromDate: "2026-02-30", toDate: "2026-02-30" });
  check("30 February is refused", r.status === 400 && r.json?.code === "BAD_DATE", [r.status, r.json?.code]);
  r = await apply("vet", { leaveType: "CL", fromDate: D(2), toDate: D(3), isHalfDay: true, halfDaySlot: "first_half" });
  check("a half day spanning two dates is refused", r.status === 400, [r.status, r.json?.message]);
  r = await apply("vet", { leaveType: "CL", fromDate: D(2), toDate: D(2), isHalfDay: true, halfDaySlot: "evening" });
  check("a half day that is neither half is refused", r.status === 400, [r.status, r.json?.message]);
  r = await call("PATCH", "/api/employee/leave-applications/not-an-id/cancel", tok.vet, {});
  check("a malformed leave id is 'not found', not a crash", r.status === 404, r.status);
  r = await call("PATCH", "/api/employee/leave-applications/manager/undefined/approve", tok.mgr, {});
  check("…on the manager's side too", r.status === 404, r.status);
  r = await call("POST", "/api/employee/leave-applications", null, { leaveType: "CL", fromDate: D(2), toDate: D(2), reason: "x", applicationDate: today });
  check("nobody signed in cannot apply at all", r.status === 401, r.status);

  /* ================================================================ */
  heading(2, "The joining waiting period, and PL eligibility");

  r = await apply("newbie", { leaveType: "CL", fromDate: D(3), toDate: D(3) });
  check("a five-day-old joiner cannot take CL", r.status === 400 && r.json?.code === "WAITING_PERIOD", [r.status, r.json?.code]);
  r = await apply("newbie", { leaveType: "SL", fromDate: D(3), toDate: D(3) });
  check("…nor paid SL", r.status === 400 && r.json?.code === "WAITING_PERIOD", [r.status, r.json?.code]);
  r = await apply("newbie", { leaveType: "LOP", fromDate: D(3), toDate: D(3), reason: "Fever" });
  check("…but CAN tell their manager they will be off unpaid", r.status === 201 && r.json?.data?.paidDays === 0, [r.status, r.json?.message]);
  r = await apply("junior", { leaveType: "PL", fromDate: D(4), toDate: D(4) });
  check("PL before 240 days is refused", r.status === 400 && r.json?.code === "PL_NOT_ELIGIBLE", [r.status, r.json?.code]);
  r = await apply("vet", { leaveType: "PL", fromDate: D(20), toDate: D(21) });
  check("PL after 400 days is accepted", r.status === 201 && r.json?.data?.paidDays === 2, [r.status, r.json?.message]);
  const vetPL = r.json?.data?._id;

  /* ================================================================ */
  heading(3, "Casual leave, the balance, and what 'held' means");

  const clBefore = await left("vet", "CL");
  check("a fresh year starts with 5 CL", clBefore === 5, clBefore);
  r = await apply("vet", { leaveType: "CL", fromDate: D(2), toDate: D(2) });
  check("one day of CL is accepted as waiting", r.status === 201 && r.json?.data?.status === "pending", [r.status, r.json?.message]);
  const cl1 = r.json?.data?._id;
  check("and the day is held off the balance at once", (await left("vet", "CL")) === 4, await left("vet", "CL"));
  r = await apply("vet", { leaveType: "CL", fromDate: D(2), toDate: D(2) });
  check("asking again for the same day creates no duplicate", r.status === 200 && r.json?.replaced === true, [r.status, r.json?.replaced]);
  check("…and holds nothing twice", (await left("vet", "CL")) === 4, await left("vet", "CL"));
  r = await apply("vet", { leaveType: "SL", fromDate: D(2), toDate: D(3) });
  check("a different leave over the same day is refused with what to do", r.status === 409 && r.json?.code === "OVERLAP_WITHDRAW_FIRST" && /withdraw/i.test(r.json?.message || ""), [r.status, r.json?.code]);
  r = await apply("vet", { leaveType: "CL", fromDate: D(8), toDate: D(13) });
  check("more CL than is left is refused, saying how much is left", r.status === 400 && r.json?.code === "INSUFFICIENT_BALANCE" && /4 days of CL left/.test(r.json?.message || ""), [r.status, r.json?.message]);

  /* ================================================================ */
  heading(4, "Half days");

  r = await apply("vet", { leaveType: "CL", fromDate: D(6), toDate: D(6), isHalfDay: true, halfDaySlot: "first_half" });
  check("a morning off is half a day", r.status === 201 && r.json?.data?.totalDays === 0.5 && r.json?.data?.halfDaySlot === "first_half", [r.status, r.json?.data?.totalDays]);
  const morning = r.json?.data?._id;
  r = await apply("vet", { leaveType: "CL", fromDate: D(6), toDate: D(6), isHalfDay: true, halfDaySlot: "second_half" });
  check("the afternoon of the same day is its OWN request, not a duplicate of the morning", r.status === 201 && r.json?.data?.halfDaySlot === "second_half" && r.json?.data?._id !== morning, [r.status, r.json?.replaced, r.json?.data?.halfDaySlot]);
  r = await apply("vet", { leaveType: "CL", fromDate: D(6), toDate: D(6), isHalfDay: true, halfDaySlot: "second_half" });
  check("asking for that afternoon again is the duplicate", r.status === 200 && r.json?.replaced === true, [r.status, r.json?.replaced]);
  r = await apply("vet", { leaveType: "SL", fromDate: D(6), toDate: D(6) });
  check("a full day over two booked halves is refused", r.status === 409, r.status);
  check("two halves hold one day of CL", (await left("vet", "CL")) === 3, await left("vet", "CL"));

  /* ================================================================ */
  heading(5, "Sick leave and the medical certificate");

  r = await apply("vet", { leaveType: "SL", fromDate: D(9), toDate: D(9), reason: "Fever" });
  check("one day of SL needs no certificate", r.status === 201 && r.json?.requiresDocument === false, [r.status, r.json?.requiresDocument]);
  r = await apply("vet", { leaveType: "SL", fromDate: D(14), toDate: D(16), reason: "Viral fever" });
  check("three days of SL asks for a certificate", r.status === 201 && r.json?.requiresDocument === true && /certificate/i.test(r.json?.message || ""), [r.status, r.json?.message]);
  r = await apply("vet", { leaveType: "SL", fromDate: D(24), toDate: D(25), reason: "Dental" });
  check("SL beyond what is left is refused", r.status === 400 && r.json?.code === "INSUFFICIENT_BALANCE", [r.status, r.json?.code]);
  const up = await call("POST", `/api/employee/leave-applications/${cl1}/upload-document`, tok.vet);
  check("a certificate cannot be attached to a leave that needs none", up.status === 400, up.status);

  /* ================================================================ */
  heading(6, "Unpaid leave, and the monthly caps");

  const M2 = (n) => dayIn(2, n); // the month after next — a clean month
  r = await apply("vet", { leaveType: "LOP", fromDate: M2(0), toDate: M2(4), reason: "Travelling home" });
  check("five days unpaid are all unpaid", r.status === 201 && r.json?.data?.paidDays === 0 && r.json?.data?.lwpDays === 5, [r.status, r.json?.data?.paidDays]);
  r = await apply("other", { leaveType: "CL", fromDate: M2(10), toDate: M2(11) });
  check("two CL in a month under the cap are both paid", r.status === 201 && r.json?.data?.paidDays === 2, [r.status, r.json?.data?.paidDays]);
  r = await apply("other", { leaveType: "CL", fromDate: M2(12), toDate: M2(13) });
  check("CL past three in a month: the excess becomes unpaid, not refused", r.status === 201 && r.json?.data?.paidDays === 1 && r.json?.data?.lwpDays === 1 && /LWP/.test(r.json?.message || ""), [r.status, r.json?.data?.paidDays, r.json?.data?.lwpDays]);

  /* ================================================================ */
  heading(7, "Somebody with no reporting manager");

  r = await apply("orphan", { leaveType: "CL", fromDate: D(4), toDate: D(4) });
  check("the request is still accepted", r.status === 201, [r.status, r.json?.message]);
  check("with nobody to notify but HR", Array.isArray(r.json?.data?.managersNotified) && r.json.data.managersNotified.length === 0, r.json?.data?.managersNotified);
  const orphanLeave = r.json?.data?._id;

  /* ================================================================ */
  heading(8, "Cancelling a request nobody has decided yet");

  r = await call("PATCH", `/api/employee/leave-applications/${cl1}/cancel`, tok.vet, { cancelReason: "Plans changed" });
  check("a waiting request is cancelled outright", r.status === 200 && r.json?.data?.status === "cancelled", [r.status, r.json?.data?.status]);
  check("and its day comes back", (await left("vet", "CL")) === 4, await left("vet", "CL"));
  r = await call("PATCH", `/api/employee/leave-applications/${cl1}/cancel`, tok.vet, {});
  check("cancelling it twice is refused", r.status === 400, r.status);
  r = await apply("vet", { leaveType: "SL", fromDate: D(2), toDate: D(2), reason: "Migraine" });
  check("the freed day can be asked for again, as anything", r.status === 201, [r.status, r.json?.message]);

  /* ================================================================ */
  heading(9, "The manager decides — and only the manager");

  const pending = await call("GET", "/api/employee/leave-applications/manager/pending", tok.mgr);
  const mine = (pending.json?.data || []).filter((a) => String(a.employeeId) === vet.id);
  check("the manager sees Veena's waiting requests", mine.length >= 4, mine.length);
  const byOther = await call("PATCH", `/api/employee/leave-applications/manager/${vetPL}/approve`, tok.other, { remarks: "" });
  check("another manager cannot approve it", byOther.status === 404, byOther.status);
  const bySelf = await call("PATCH", `/api/employee/leave-applications/manager/${vetPL}/approve`, tok.vet, { remarks: "" });
  check("nor can Veena approve her own", bySelf.status === 404, bySelf.status);
  r = await call("PATCH", `/api/employee/leave-applications/manager/${vetPL}/approve`, tok.mgr, { remarks: "Enjoy" });
  check("her manager approves the PL, and that is final", r.status === 200 && r.json?.data?.status === "hr_approved", [r.status, r.json?.data?.status]);
  r = await call("PATCH", `/api/employee/leave-applications/manager/${vetPL}/approve`, tok.mgr, { remarks: "" });
  check("approving it again is refused", r.status === 400, r.status);
  const plBal = await LeaveBalance.findOne({ employeeId: vet.id, year: Number(D(20).slice(0, 4)) }).lean();
  check("two days of PL are now used", plBal?.consumed?.PL === 2, plBal?.consumed);

  const sl3 = (await LeaveApplication.findOne({ employeeId: vet.id, leaveType: "SL", fromDate: D(14) }).lean())._id;
  r = await call("PATCH", `/api/employee/leave-applications/manager/${sl3}/reject`, tok.mgr, { remarks: "Please bring the certificate and apply again" });
  check("a rejection carries its reason", r.status === 200 && r.json?.data?.status === "manager_rejected" && /certificate/.test(r.json?.data?.rejectionReason || ""), [r.status, r.json?.data?.status]);
  check("and returns the held days", (await left("vet", "SL")) >= 3, await left("vet", "SL"));
  r = await call("PATCH", `/api/employee/leave-applications/manager/${sl3}/reject`, tok.mgr, { remarks: "again" });
  check("rejecting a decided request is refused", r.status === 400, r.status);

  /* ================================================================ */
  heading(10, "Withdrawing an APPROVED leave — the manager has to agree");

  r = await call("PATCH", `/api/employee/leave-applications/${vetPL}/cancel`, tok.vet, { cancelReason: "Trip cancelled" });
  check("asking to withdraw an approved leave sends it to the manager", r.status === 200 && r.json?.data?.status === "withdraw_pending", [r.status, r.json?.data?.status]);
  r = await call("PATCH", `/api/employee/leave-applications/${vetPL}/cancel`, tok.vet, {});
  check("asking twice does NOT cancel it behind the manager's back", r.status === 200 && r.json?.data?.status === "withdraw_pending", [r.status, r.json?.data?.status]);
  const wq = await call("GET", "/api/employee/leave-applications/manager/withdraw-pending", tok.mgr);
  check("the manager sees the withdrawal", (wq.json?.data || []).some((a) => String(a._id) === String(vetPL)), (wq.json?.data || []).length);
  r = await call("PATCH", `/api/employee/leave-applications/manager/${vetPL}/reject-withdraw`, tok.mgr, { remarks: "Audit week — please take it" });
  check("the manager can keep the leave", r.status === 200 && r.json?.data?.status === "hr_approved", [r.status, r.json?.data?.status]);
  r = await call("PATCH", `/api/employee/leave-applications/${vetPL}/cancel`, tok.vet, { cancelReason: "Really cannot go" });
  check("Veena asks again", r.json?.data?.status === "withdraw_pending", r.json?.data?.status);
  r = await call("PATCH", `/api/employee/leave-applications/${vetPL}/cancel-withdraw`, tok.vet, {});
  check("…and changes her mind: the leave stands", r.status === 200 && r.json?.data?.status === "hr_approved", [r.status, r.json?.data?.status]);
  r = await call("PATCH", `/api/employee/leave-applications/${vetPL}/cancel`, tok.vet, { cancelReason: "Final answer" });
  r = await call("PATCH", `/api/employee/leave-applications/manager/${vetPL}/approve-withdraw`, tok.mgr, {});
  check("the manager lets her withdraw", r.status === 200, [r.status, r.json?.message]);
  const afterW = await LeaveApplication.findById(vetPL).lean();
  check("the leave is cancelled", afterW?.status === "cancelled", afterW?.status);
  const plBack = await LeaveBalance.findOne({ employeeId: vet.id, year: Number(D(20).slice(0, 4)) }).lean();
  check("and the PL days are back", plBack?.consumed?.PL === 0, plBack?.consumed);

  /* ================================================================ */
  heading(11, "Quick leave — the manager decides what it counts as");

  r = await call("POST", "/api/employee/leave-applications/quick-apply", tok.junior, { targetDate: "tomorrow", isHalfDay: false, reason: "   " });
  check("a quick leave needs a real reason too", r.status === 400, r.status);
  r = await call("POST", "/api/employee/leave-applications/quick-apply", tok.junior, { targetDate: istToday(1), isHalfDay: false, reason: "Child unwell" });
  check("a quick leave is only for today or tomorrow", r.status === 400, r.status);
  r = await call("POST", "/api/employee/leave-applications/quick-apply", tok.junior, { targetDate: "tomorrow", isHalfDay: false, reason: "Child unwell" });
  check("a one-tap day off for tomorrow is accepted", r.status === 201 || r.status === 200, [r.status, r.json?.message]);
  const q1 = r.json?.data?._id;
  r = await call("POST", "/api/employee/leave-applications/quick-apply", tok.junior, { targetDate: "tomorrow", isHalfDay: false, reason: "again" });
  check("a second one for the same day is refused", r.status >= 400 && r.status < 500, [r.status, r.json?.code]);
  r = await call("PATCH", `/api/employee/leave-applications/manager/${q1}/approve`, tok.mgr, { remarks: "" });
  check("a quick leave cannot simply be approved — it must be classified", r.status === 400, r.status);
  r = await call("PATCH", `/api/employee/leave-applications/quick-apply/${q1}/resolve`, tok.mgr, { resolvedType: "LOP" });
  check("unpaid while paid leave is left needs a reason", r.status === 400 && r.json?.code === "LOP_REASON_REQUIRED", [r.status, r.json?.code]);
  r = await call("PATCH", `/api/employee/leave-applications/quick-apply/${q1}/resolve`, tok.mgr, { resolvedType: "CL" });
  check("counted as CL, and final", r.status === 200 && r.json?.data?.status === "hr_approved" && r.json?.data?.leaveType === "CL", [r.status, r.json?.data?.status]);
  check("the message no longer mentions a second manager", !/secondary/i.test(r.json?.message || ""), r.json?.message);

  const q2 = await call("POST", "/api/employee/leave-applications/quick-apply", tok.junior, { targetDate: "today", isHalfDay: true, halfDaySlot: "second_half", reason: "Bank work" });
  check("a half-day quick leave", q2.status === 201 || q2.status === 200, [q2.status, q2.json?.message]);
  r = await call("PATCH", `/api/employee/leave-applications/quick-apply/${q2.json?.data?._id}/resolve`, tok.mgr, { resolvedType: "LOP", forceLOPReason: "Already took CL this week" });
  check("counted unpaid, with the reason recorded", r.status === 200 && r.json?.data?.leaveType === "LOP", [r.status, r.json?.data?.leaveType]);
  r = await call("POST", "/api/employee/leave-applications/quick-apply", tok.junior, { targetDate: "today", isHalfDay: true, halfDaySlot: "first_half", reason: "Doctor in the morning" });
  check("the morning of that same day is still free", r.status === 201 || r.status === 200, [r.status, r.json?.message]);

  r = await apply("vet", { leaveType: "LOP", fromDate: istToday(0), toDate: istToday(2), reason: "Out of town" });
  check("Veena books three unpaid days from today", r.status === 201, [r.status, r.json?.message]);
  r = await call("POST", "/api/employee/leave-applications/quick-apply", tok.vet, { targetDate: "tomorrow", isHalfDay: false, reason: "Unwell" });
  check("a quick leave on a day inside a longer leave is refused", r.status === 400 && /already/i.test(r.json?.message || ""), [r.status, r.json?.message]);
  r = await call("POST", "/api/employee/leave-applications/quick-apply", tok.orphan, { targetDate: "tomorrow", isHalfDay: false, reason: "Unwell" });
  check("somebody with no manager is told to ask HR", r.status === 400, [r.status, r.json?.code]);

  /* ================================================================ */
  heading(12, "HR decides for somebody with no manager");

  const orphanDoc = await LeaveApplication.findById(orphanLeave).lean();
  check("Omar's request waits, with no manager chain", orphanDoc?.status === "pending" && (orphanDoc?.managersNotified || []).length === 0, orphanDoc?.status);
  r = await call("PATCH", `/api/employee/leave-applications/${orphanLeave}/cancel`, tok.orphan, {});
  check("he can still cancel it himself", r.status === 200 && r.json?.data?.status === "cancelled", [r.status, r.json?.data?.status]);

  /* ================================================================ */
  heading(13, "Editing a request that is still waiting");

  r = await apply("mgr", { leaveType: "CL", fromDate: D(15), toDate: D(15) });
  check("Mala asks for one CL", r.status === 201 && r.json?.data?.paidDays === 1, [r.status, r.json?.message]);
  const ed = r.json?.data?._id;
  r = await call("PUT", `/api/employee/leave-applications/${ed}`, tok.mgr, { toDate: D(24) });
  check("stretching it past her balance is refused", r.status === 400 && r.json?.code === "INSUFFICIENT_BALANCE", [r.status, r.json?.code]);
  r = await call("PUT", `/api/employee/leave-applications/${ed}`, tok.mgr, { toDate: D(19) });
  check("five days: split again — three paid (the monthly CL cap), two unpaid", r.status === 200 && r.json?.data?.totalDays === 5 && r.json?.data?.paidDays === 3 && r.json?.data?.lwpDays === 2, [r.status, r.json?.data?.totalDays, r.json?.data?.paidDays, r.json?.data?.lwpDays]);
  r = await call("PUT", `/api/employee/leave-applications/${ed}`, tok.mgr, { reason: "   " });
  check("an edit cannot blank the reason", r.status === 400, r.status);
  r = await call("PUT", `/api/employee/leave-applications/${ed}`, tok.mgr, { fromDate: "2026-02-30" });
  check("an edit to an impossible date is refused", r.status === 400 && r.json?.code === "BAD_DATE", [r.status, r.json?.code]);
  r = await apply("mgr", { leaveType: "SL", fromDate: D(26), toDate: D(26), reason: "Check-up" });
  r = await call("PUT", `/api/employee/leave-applications/${ed}`, tok.mgr, { fromDate: D(25), toDate: D(26) });
  check("an edit onto another leave is refused", r.status === 409, [r.status, r.json?.code]);
  r = await call("PUT", `/api/employee/leave-applications/${ed}`, tok.mgr, { fromDate: D(15), isHalfDay: true, halfDaySlot: "second_half" });
  check("shrinking it to an afternoon", r.status === 200 && r.json?.data?.totalDays === 0.5 && r.json?.data?.paidDays === 0.5 && r.json?.data?.toDate === D(15), [r.status, r.json?.data?.totalDays, r.json?.data?.toDate]);
  r = await call("PUT", `/api/employee/leave-applications/${ed}`, tok.vet, { toDate: D(16) });
  check("nobody else can edit it", r.status === 404, r.status);

  /* ================================================================ */
  heading(14, "The manager files a leave on somebody's behalf");

  r = await apply("junior", { leaveType: "CL", fromDate: D(10), toDate: D(12) });
  check("Jaya holds three CL, waiting", r.status === 201 && r.json?.data?.paidDays === 3, [r.status, r.json?.message]);
  const jYear = Number(D(20).slice(0, 4));
  const jUsed = (await LeaveBalance.findOne({ employeeId: junior.id, year: jYear }).lean())?.consumed?.CL || 0;
  r = await call("POST", "/api/employee/leave-applications/manager/add-on-behalf", tok.mgr, { employeeId: junior.id, leaveType: "CL", fromDate: D(20), toDate: D(21), reason: "Called in sick twice" });
  const expPaid = Math.max(0, Math.min(2, 5 - jUsed - 3));
  check("what her waiting request holds is not spent twice", r.status === 201 && r.json?.data?.paidDays === expPaid && r.json?.data?.lwpDays === 2 - expPaid, [r.status, r.json?.data?.paidDays, r.json?.data?.lwpDays, expPaid]);
  check("…and it is approved at once", r.json?.data?.status === "hr_approved", r.json?.data?.status);
  r = await call("POST", "/api/employee/leave-applications/manager/add-on-behalf", tok.mgr, { employeeId: other.id, leaveType: "LOP", fromDate: D(22), toDate: D(22), reason: "x" });
  check("not for somebody who does not report to her", r.status === 403, r.status);
  r = await call("POST", "/api/employee/leave-applications/manager/add-on-behalf", tok.mgr, { employeeId: newbie.id, leaveType: "LOP", fromDate: D(22), toDate: D(22), reason: "No-show, unpaid" });
  check("unpaid for a new joiner is fine", r.status === 201 && r.json?.data?.paidDays === 0, [r.status, r.json?.message]);
  r = await call("POST", "/api/employee/leave-applications/manager/add-on-behalf", tok.mgr, { employeeId: "nope", leaveType: "LOP", fromDate: D(22), toDate: D(22), reason: "x" });
  check("a malformed employee id is not found", r.status === 404, r.status);

  /* ================================================================ */
  heading(15, "Listing: the employee sees their own, newest first, and nobody else's");

  const list = await call("GET", "/api/employee/leave-applications", tok.vet);
  const ids = (list.json?.data || []).map((a) => String(a.employeeId));
  check("Veena's list is hers alone", ids.length > 0 && ids.every((x) => x === vet.id), [...new Set(ids)]);
  const other2 = await call("GET", `/api/employee/leave-applications/${vetPL}`, tok.junior);
  check("Jaya cannot open Veena's leave", other2.status === 404, other2.status);

  console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed\n${"=".repeat(60)}`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
