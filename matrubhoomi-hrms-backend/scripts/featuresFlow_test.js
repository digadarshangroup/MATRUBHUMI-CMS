"use strict";
// scripts/featuresFlow_test.js
//
// The desk-and-app features added around the employee app, end to end against
// a REAL server and a SCRATCH database:
//
//   1. the first sign-in — the phone-number password HR issues must be changed,
//      and a wrong current password is NOT the end of the session;
//   2. who uses the app — the app's own requests keep Employee.appInfo current;
//   3. announcements — HR or the CEO writes, the right inboxes receive, reads
//      are counted, and taking one back empties the inboxes;
//   4. the CEO overview — every figure agrees with the records behind it;
//   5. releases — the native app is offered only its own builds.
//
// RUN IT AGAINST A SCRATCH DATABASE. NOT PRODUCTION, AND NOT YOUR DEV DATABASE.
//
//   # terminal 1 — every outside integration blanked
//   MONGODB_URI=mongodb://127.0.0.1:27017/features_scratch PORT=5099 \
//     JWT_SECRET=smoke_secret_key SALARY_ENCRYPTION_KEY=<64 hex chars> \
//     ENABLE_EMAILS=false node server.js
//
//   # terminal 2
//   MONGODB_URI=<the same> SALARY_ENCRYPTION_KEY=<the same> node scripts/featuresFlow_test.js

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
const istDay = (o = 0) => new Date(Date.now() + 5.5 * 3600 * 1000 + o * 86400000).toISOString().slice(0, 10);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/features_scratch");
  await require("./_waitForIndexes")(mongoose);
  const Employee = require("../models/Employee");
  const Department = require("../models/HR_Models/Departments");
  const EmployeeNotification = require("../models/EmployeeNotification");
  const AppVersion = require("../models/Appversion");
  const { LeaveApplication } = require("../models/HR_Models/LeaveManagement");

  const DOMAIN = "features.test";
  const PHONES = { ravi: "9844000001", sita: "9844000002", arun: "9844000003", intern: "9844000004" };
  await Employee.deleteMany({ email: new RegExp(`@${DOMAIN.replace(".", "\\.")}$`) });
  await Employee.deleteMany({ phone: { $in: Object.values(PHONES) } });
  const mkDept = (name, desig) => Department.findOneAndUpdate(
    { name }, { $setOnInsert: { name, designations: [{ name: desig }] } }, { upsert: true, new: true });
  const accounts = await mkDept("Accounts", "Accountant");
  const stores = await mkDept("Stores", "Storekeeper");

  const desk = (role, name) => jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role, email: `${role}@example.test`, name }, SECRET, { expiresIn: "1h" });
  const hr = desk("hr_manager", "Hema HR");
  const ceo = desk("ceo", "Chandra CEO");
  const salesDesk = desk("sales_manager", "Sam Sales");

  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const hire = async (key, first, dept, desig, extra = {}) => {
    const r = await call("POST", "/api/employees", hr, {
      firstName: first, lastName: "Feat", email: `${key}@${DOMAIN}`, phone: PHONES[key], gender: "Male",
      department: dept.name, departmentId: String(dept._id), designation: desig,
      dateOfJoining: daysAgo(300), confirmationDate: daysAgo(300), employmentType: "full_time",
      workShift: { mode: "general" }, salary: { gross: 22000 }, biometricId: `FTR${Object.keys(PHONES).indexOf(key)}`,
      ...extra,
    });
    if (r.status !== 201) throw new Error(`hire ${key}: ${r.status} ${r.json?.message}`);
    return { id: String(r.json.data._id), phone: PHONES[key] };
  };
  const ravi = await hire("ravi", "Ravi", accounts, "Accountant");
  const sita = await hire("sita", "Sita", stores, "Storekeeper");
  const arun = await hire("arun", "Arun", stores, "Storekeeper");
  await hire("intern", "Ishan", stores, "Storekeeper", { employmentType: "intern", stipend: 8000, salary: { stipend: 8000 } });

  const login = (phone, password) => call("POST", "/api/employee/auth/login", null, { phoneNumber: phone, password, rememberMe: true });

  /* ================================================================ */
  heading(1, "The first sign-in, and choosing a password");

  let r = await login(ravi.phone, ravi.phone);
  check("a new hire signs in with their phone number", r.status === 200, r.status);
  check("…and is told to choose their own password", r.json?.data?.mustChangePassword === true, r.json?.data?.mustChangePassword);
  let tRavi = r.json?.data?.token;

  const change = (tok, currentPassword, newPassword) => call("PUT", "/api/employee/change-password", tok, { currentPassword, newPassword });
  r = await change(tRavi, "not-my-password", "Mango#2026");
  check("a wrong current password is a 400 — not a 401 that ends the session", r.status === 400 && r.json?.code === "WRONG_PASSWORD", [r.status, r.json?.code]);
  r = await call("GET", "/api/employee/notifications", tRavi);
  check("…and the session is still good", r.status === 200, r.status);
  r = await change(tRavi, ravi.phone, "12345");
  check("too short is refused", r.status === 400, r.status);
  r = await change(tRavi, ravi.phone, ravi.phone);
  check("the same password again is refused", r.status === 400 && r.json?.code === "SAME_PASSWORD", [r.status, r.json?.code]);
  r = await change(tRavi, ravi.phone, "Mango#2026");
  check("a real password is accepted", r.status === 200, [r.status, r.json?.message]);
  r = await login(ravi.phone, ravi.phone);
  check("the phone number no longer opens the account", r.status === 401, r.status);
  r = await change(tRavi, ravi.phone, "Stolen#2026");
  check("…nor stands in for the current password (anyone with his ID card knows it)", r.status === 400 && r.json?.code === "WRONG_PASSWORD", [r.status, r.json?.code]);
  r = await login(ravi.phone, "Mango#2026");
  check("the new one does, with nothing more to change", r.status === 200 && r.json?.data?.mustChangePassword === false, [r.status, r.json?.data?.mustChangePassword]);
  tRavi = r.json?.data?.token;
  r = await change(tRavi, "Mango#2026", ravi.phone);
  check("the phone number cannot be chosen as a password", r.status === 400 && r.json?.code === "PHONE_AS_PASSWORD", [r.status, r.json?.code]);

  // HR resets it — back to the phone number, and back to being asked.
  r = await call("POST", `/api/hr/password-management/reset-password/employee/${ravi.id}`, hr, {});
  check("HR resets Ravi's password", r.status === 200, [r.status, r.json?.message]);
  r = await login(ravi.phone, ravi.phone);
  check("after a reset the phone number works, and he is asked again", r.status === 200 && r.json?.data?.mustChangePassword === true, [r.status, r.json?.data?.mustChangePassword]);
  tRavi = r.json?.data?.token;

  const tSita = (await login(sita.phone, sita.phone)).json?.data?.token;
  const tArun = (await login(arun.phone, arun.phone)).json?.data?.token;
  r = await login(PHONES.intern, PHONES.intern);
  check("an intern still has no app", r.status === 403 && r.json?.code === "INTERN_NO_APP_ACCESS", [r.status, r.json?.code]);

  /* ================================================================ */
  heading(2, "Who is using the app");

  const APP = { "X-App-Version": "1.4.0", "X-App-Build": "14", "X-Device": "Xiaomi Redmi Note 12", "X-OS": "Android 14" };
  r = await call("GET", "/api/employee/notifications", tRavi, null, APP);
  r = await call("GET", "/api/employee/notifications", tSita, null, { ...APP, "X-App-Version": "1.3.0", "X-App-Build": "13" });
  r = await call("GET", "/api/employee/notifications", tArun); // the web portal: no app headers
  await sleep(400);
  const seenRavi = (await Employee.findById(ravi.id).lean()).appInfo;
  check("the app's request records the version and the handset", seenRavi?.version === "1.4.0" && seenRavi?.build === 14 && /Redmi/.test(seenRavi?.device || "") && !!seenRavi?.lastSeenAt, seenRavi);
  check("…and when he first used it", !!seenRavi?.firstSeenAt, seenRavi?.firstSeenAt);
  const seenArun = (await Employee.findById(arun.id).lean()).appInfo;
  check("a browser request records nothing", !seenArun?.lastSeenAt, seenArun);
  const salaryStill = await Employee.findById(ravi.id).select("salary").lean();
  check("recording it never touched the salary block", !!salaryStill?.salary, Object.keys(salaryStill?.salary || {}));

  /* ================================================================ */
  heading(3, "Announcements");

  const ANN = "/api/hr/announcements";
  r = await call("POST", ANN, hr, { title: "   ", body: "x" });
  check("no title is refused", r.status === 400, r.status);
  r = await call("POST", ANN, hr, { title: "Hello", body: "" });
  check("no message is refused", r.status === 400, r.status);
  r = await call("POST", ANN, hr, { title: "x".repeat(121), body: "y" });
  check("an over-long title is refused", r.status === 400, r.status);
  r = await call("POST", ANN, hr, { title: "Hello", body: "y", audience: "departments", departments: [] });
  check("'some departments' with none picked is refused", r.status === 400, r.status);
  r = await call("POST", ANN, hr, { title: "Hello", body: "y", audience: "departments", departments: ["Nowhere"] });
  check("a department with nobody in it is refused, saying so", r.status === 400 && r.json?.code === "NO_RECIPIENTS", [r.status, r.json?.code]);
  r = await call("POST", ANN, tRavi, { title: "Hello", body: "y" });
  check("an employee cannot send one", r.status === 403 || r.status === 401, r.status);
  r = await call("POST", ANN, salesDesk, { title: "Hello", body: "y" });
  check("nor can the sales desk", r.status === 403, r.status);

  const reach = await call("GET", `${ANN}/reach?audience=departments&departments=Stores`, hr);
  check("the form can say how many a draft reaches — interns excluded", reach.json?.data?.recipients === 2, reach.json?.data);

  const everyone = await Employee.countDocuments({ ...{ isActive: { $ne: false } }, employmentType: { $ne: "intern" } });
  r = await call("POST", ANN, hr, { title: "Office closed on Friday", body: "The office is closed for Durga Puja. Field staff: no duty that day." });
  check("HR tells everybody", r.status === 201 && r.json?.data?.recipients >= 3, [r.status, r.json?.data?.recipients, everyone]);
  const a1 = r.json?.data?._id;
  r = await call("GET", "/api/employee/notifications", tSita);
  const inSita = (r.json?.data || []).find((n) => n.kind === "announcement" && n.refId === String(a1));
  check("it is in Sita's inbox, unread, where the app will raise it", !!inSita && inSita.read === false && inSita.title === "Office closed on Friday", inSita);
  const internGot = await EmployeeNotification.countDocuments({ refId: String(a1), employeeId: (await Employee.findOne({ phone: PHONES.intern }).lean())._id });
  check("the intern (no app) was not sent one", internGot === 0, internGot);

  r = await call("POST", "/api/ceo/announcements", ceo, { title: "Stores stock-take", body: "Stock-take on Saturday, 9am.", audience: "departments", departments: ["Stores"] });
  check("the CEO writes to one department", r.status === 201 && r.json?.data?.recipients === 2 && r.json?.data?.sentByRole === "ceo", [r.status, r.json?.data?.recipients]);
  const a2 = r.json?.data?._id;
  const raviGot = await EmployeeNotification.countDocuments({ refId: String(a2), employeeId: ravi.id });
  check("Ravi in Accounts did not get the Stores notice", raviGot === 0, raviGot);

  await call("POST", "/api/employee/notifications/read", tSita, { ids: [inSita?.id] });
  r = await call("GET", ANN, hr);
  const row1 = (r.json?.data || []).find((x) => String(x._id) === String(a1));
  check("the list counts who has read it", row1?.read === 1 && row1?.delivered >= 3, [row1?.read, row1?.delivered]);

  r = await call("DELETE", `${ANN}/${a2}`, hr);
  check("taking one back", r.status === 200 && !!r.json?.data?.retractedAt, [r.status, r.json?.message]);
  const left = await EmployeeNotification.countDocuments({ refId: String(a2) });
  check("…empties every inbox it was in", left === 0, left);
  r = await call("DELETE", `${ANN}/${a2}`, hr);
  check("taking it back twice is harmless", r.status === 200, r.status);
  r = await call("DELETE", `${ANN}/not-an-id`, hr);
  check("a malformed id is 'not found'", r.status === 404, r.status);

  /* ================================================================ */
  heading(4, "The CEO overview");

  // Something for it to count: a leave today, one waiting, one with nobody to decide it.
  const today = istDay(0);
  await LeaveApplication.create({ employeeId: sita.id, employeeName: "Sita Feat", department: "Stores", leaveType: "CL", applicationDate: today, fromDate: today, toDate: today, totalDays: 1, paidDays: 1, reason: "x", status: "hr_approved", managersNotified: [] });
  await LeaveApplication.create({ employeeId: arun.id, employeeName: "Arun Feat", department: "Stores", leaveType: "CL", applicationDate: today, fromDate: istDay(5), toDate: istDay(5), totalDays: 1, paidDays: 1, reason: "x", status: "pending", managersNotified: [] });

  r = await call("GET", "/api/ceo/overview", tRavi);
  check("an employee cannot open it", r.status === 401 || r.status === 403, r.status);
  r = await call("GET", "/api/ceo/overview", salesDesk);
  check("nor can the sales desk", r.status === 403, r.status);
  r = await call("GET", "/api/ceo/overview", ceo);
  const o = r.json?.data;
  check("the CEO opens it", r.status === 200 && !!o, r.status);
  const headcount = await Employee.countDocuments(require("../utils/employeeActive").activeEmployeeFilter());
  check("headcount agrees with the records", o?.people?.headcount === headcount, [o?.people?.headcount, headcount]);
  check("Sita is on leave today", o?.onLeave?.count >= 1 && (o?.onLeave?.people || []).some((p) => p.name === "Sita Feat"), o?.onLeave);
  const openLeaves = await LeaveApplication.countDocuments({ status: { $in: ["pending", "manager_approved", "withdraw_pending"] } });
  check("approvals waiting agree with the queue", o?.approvals?.leave === openLeaves && o?.approvals?.leaveWaitingForHr >= 1, o?.approvals);
  check("app use: two people this week", o?.app?.activeThisWeek === 2 && o?.app?.everSignedIn === 2, o?.app);
  check("…with their versions", (o?.app?.versions || []).some((v) => v.version === "1.4.0"), o?.app?.versions);
  check("the latest announcement and its reads", o?.announcement?.title === "Office closed on Friday" && o?.announcement?.read === 1, o?.announcement);
  check("the field block is there even on a quiet day", typeof o?.field?.onDutyNow === "number" && typeof o?.field?.km === "number", o?.field);
  r = await call("GET", "/api/ceo/overview", hr);
  check("HR can open it too", r.status === 200, r.status);

  /* ================================================================ */
  heading(5, "Releases, and the update prompt");

  await AppVersion.create({ version: "9.9.9", fileName: "old.apk", driveFileId: "legacy", driveDownloadUrl: "https://example.test/old.apk", isLatest: true });
  const REL = "/api/hr/app";
  r = await call("POST", `${REL}/versions`, hr, { version: "1.5.0", versionCode: 15, downloadUrl: "not a link" });
  check("a release needs a real link", r.status === 400, r.status);
  r = await call("POST", `${REL}/versions`, hr, { version: "1.5.0", downloadUrl: "https://example.test/m.apk" });
  check("…and a version code", r.status === 400, r.status);
  r = await call("POST", `${REL}/versions`, hr, { version: "1.5.0", versionCode: 15, downloadUrl: "https://example.test/matrubhoomi-1.5.0.apk", releaseNotes: "Announcements; a new leave screen." });
  check("HR publishes 1.5.0 for the employee app", r.status === 201 && r.json?.data?.app === "employee" && r.json?.data?.isLatest === true, [r.status, r.json?.message]);
  r = await call("POST", `${REL}/versions`, hr, { version: "1.5.1", versionCode: 15, downloadUrl: "https://example.test/x.apk" });
  check("the same version code twice is refused", r.status === 409, r.status);
  r = await call("GET", `${REL}/latest?app=employee`);
  check("the employee app is offered 1.5.0", r.json?.data?.version === "1.5.0" && r.json?.data?.versionCode === 15, r.json?.data);
  r = await call("GET", `${REL}/latest`);
  check("the old app is still offered only its own build", r.json?.data?.version === "9.9.9", r.json?.data?.version);
  r = await call("GET", `${REL}/adoption`, hr);
  const ad = r.json?.data;
  check("adoption lists everybody but the intern", r.status === 200 && ad?.summary?.total === (await Employee.countDocuments({ isActive: { $ne: false }, employmentType: { $ne: "intern" } })), ad?.summary);
  check("…two using it, the rest never signed in", ad?.summary?.active === 2 && ad?.summary?.never === ad?.summary?.total - 2, ad?.summary);
  check("…and both are behind the new release", ad?.summary?.behind === 2 && ad?.latest?.versionCode === 15, [ad?.summary?.behind, ad?.latest]);
  const ravisRow = (ad?.rows || []).find((x) => String(x.id) === ravi.id);
  check("Ravi's row names his phone", ravisRow?.device === "Xiaomi Redmi Note 12" && ravisRow?.state === "active", ravisRow);

  console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed\n${"=".repeat(60)}`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
