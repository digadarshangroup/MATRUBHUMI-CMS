"use strict";
// scripts/employeeAppFlow_test.js
//
// The employee app's whole life, end to end, against a REAL server and a
// SCRATCH database: HR hires four people, they sign in, the app learns who is
// field staff, a salesperson's day is recorded — stops, names, speed — duty
// ends and files field attendance, their ONE manager approves it and a leave,
// the inbox fills, and HR finally lets the salesperson go and watches the app
// lose access on the next request.
//
// Sibling of salesFlow_test.js and salesSchemeFlow_test.js; all three should be
// green before an employee-app or sales change ships.
//
// RUN IT AGAINST A SCRATCH DATABASE. NOT PRODUCTION, AND NOT YOUR DEV DATABASE.
//
//   # terminal 1 — every outside integration blanked, geocoding off
//   MONGODB_URI=mongodb://127.0.0.1:27017/app_scratch PORT=5099 \
//     JWT_SECRET=smoke_secret_key SALARY_ENCRYPTION_KEY=<64 hex chars> \
//     ENABLE_EMAILS=false GEOCODE_PROVIDER=none node server.js
//
//   # terminal 2
//   MONGODB_URI=<the same> SALARY_ENCRYPTION_KEY=<the same> node scripts/employeeAppFlow_test.js
//
// Place names come from GeoPlace rows this script seeds, so the naming is
// deterministic and no request ever leaves the machine.

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:5099";
const SECRET = process.env.JWT_SECRET || "smoke_secret_key";
const TZ = process.env.FIELD_TIMEZONE || "Asia/Kolkata";
let pass = 0, fail = 0;

function check(label, ok, detail) {
  if (ok) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label, detail !== undefined ? "->" + JSON.stringify(detail) : ""); }
}
function heading(n, text) { console.log(`\n${n}. ${text}`); }

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Poll until `fn` returns something truthy — for work the server does after answering. */
async function waitFor(fn, ms = 4000) {
  const until = Date.now() + ms;
  let last;
  while (Date.now() < until) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  return last;
}

function dayKey(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
function msSinceLocalMidnight(nowMs) {
  const local = new Date(new Date(nowMs).toLocaleString("en-US", { timeZone: TZ }));
  return local.getHours() * 3600000 + local.getMinutes() * 60000 + local.getSeconds() * 1000;
}

/** Metres → degrees of latitude, and of longitude at this latitude. */
const dLat = (m) => m / 111320;
const dLng = (m, lat) => m / (111320 * Math.cos((lat * Math.PI) / 180));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/app_scratch");
  await require("./_waitForIndexes")(mongoose);
  const Employee = require("../models/Employee");
  const Department = require("../models/HR_Models/Departments");
  const FieldDay = require("../models/Sales_Models/FieldDay");
  const GeoPlace = require("../models/Sales_Models/GeoPlace");
  const DailyAttendance = require("../models/HR_Models/Dailyattendance");
  const { RegularizationRequest, LeaveApplication } = require("../models/HR_Models/LeaveManagement");

  const now = Date.now();
  // The day is simulated in the two hours before now; after midnight there is
  // not enough of "today" for that, and the day-keyed rollups would split it.
  if (msSinceLocalMidnight(now) < 130 * 60 * 1000) {
    console.log("SKIP — run this after 02:10 local time; the scenario needs two hours of today.");
    process.exit(0);
  }

  const DOMAIN = "employeeapp.test";
  const PHONES = { meera: "9811000001", ravi: "9811000002", anil: "9811000003", priya: "9811000004" };
  await Employee.deleteMany({ email: new RegExp(`@${DOMAIN.replace(".", "\\.")}$`) });
  await Employee.deleteMany({ phone: { $in: Object.values(PHONES) } });

  const salesDept = await Department.findOneAndUpdate(
    { name: "Sales" },
    { $setOnInsert: { name: "Sales", designations: [{ name: "Sales Manager" }, { name: "Field Sales Executive" }] } },
    { upsert: true, new: true },
  );
  const acctDept = await Department.findOneAndUpdate(
    { name: "Accounts" },
    { $setOnInsert: { name: "Accounts", designations: [{ name: "Accounts Head" }, { name: "Accountant" }] } },
    { upsert: true, new: true },
  );

  // The two villages the salesperson stays in, named the way Nominatim would.
  const A = { lat: 20.3204, lng: 85.8504, name: "Katol Road, Kalmeshwar", road: "Katol Road", locality: "Kalmeshwar", district: "Khordha" };
  const B = { lat: 20.3504, lng: 85.8804, name: "Pipli Chhak, Mahimapur", road: "Pipli Chhak", locality: "Mahimapur", district: "Puri" };
  for (const v of [A, B]) {
    const key = `${v.lat.toFixed(3)},${v.lng.toFixed(3)}`;
    await GeoPlace.updateOne(
      { key },
      { $set: { key, lat: v.lat, lng: v.lng, name: v.name, road: v.road, locality: v.locality, district: v.district, found: true, source: "test", fetchedAt: new Date() } },
      { upsert: true },
    );
  }

  const hr = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: "hr_manager", email: "hr@example.test", name: "HR Tester" }, SECRET, { expiresIn: "1h" });
  const desk = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: "sales_manager", email: "desk@example.test", name: "Sales Desk" }, SECRET, { expiresIn: "1h" });

  /* ================================================================ */
  heading(1, "HR hires four people — two in Sales, two in Accounts");

  const joining = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const hire = (p) => call("POST", "/api/employees", hr, {
    firstName: p.first, lastName: p.last, email: `${p.first.toLowerCase()}@${DOMAIN}`, phone: p.phone,
    gender: p.gender || "Female",
    department: p.dept.name, departmentId: String(p.dept._id), designation: p.designation,
    dateOfJoining: joining, confirmationDate: joining, employmentType: "full_time",
    workShift: { mode: "general" }, salary: { gross: 30000 }, biometricId: p.bid,
    ...(p.manager ? { primaryManager: { managerId: p.manager.id, managerName: p.manager.name } } : {}),
    ...(p.secondary ? { secondaryManager: { managerId: p.secondary.id, managerName: p.secondary.name } } : {}),
  });

  const meeraRes = await hire({ first: "Meera", last: "Sahu", phone: PHONES.meera, dept: salesDept, designation: "Sales Manager", bid: "APPT01" });
  check("the sales manager is created", meeraRes.status === 201, meeraRes.json?.message);
  const meera = { id: String(meeraRes.json?.data?._id), name: "Meera Sahu" };
  const anilRes = await hire({ first: "Anil", last: "Das", phone: PHONES.anil, dept: acctDept, designation: "Accounts Head", bid: "APPT03" });
  check("the accounts head is created", anilRes.status === 201, anilRes.json?.message);
  const anil = { id: String(anilRes.json?.data?._id), name: "Anil Das" };
  const raviRes = await hire({
    first: "Ravi", last: "Nayak", phone: PHONES.ravi, dept: salesDept, designation: "Field Sales Executive", bid: "APPT02",
    manager: meera, secondary: anil,
  });
  check("the salesperson is created", raviRes.status === 201, raviRes.json?.message);
  const ravi = { id: String(raviRes.json?.data?._id), name: "Ravi Nayak" };
  const priyaRes = await hire({ first: "Priya", last: "Mishra", phone: PHONES.priya, dept: acctDept, designation: "Accountant", bid: "APPT04", manager: anil });
  check("the accountant is created", priyaRes.status === 201, priyaRes.json?.message);
  const priya = { id: String(priyaRes.json?.data?._id), name: "Priya Mishra" };

  const raviDoc = await Employee.findById(ravi.id).lean();
  check("ONE manager: Ravi reports to Meera", String(raviDoc?.primaryManager?.managerId) === meera.id, raviDoc?.primaryManager);
  check("and the secondary manager HR sent was not stored", !raviDoc?.secondaryManager?.managerId, raviDoc?.secondaryManager);

  /* ================================================================ */
  heading(2, "Signing in — and the phone-number back door is closed");

  const login = (phone, password) => call("POST", "/api/employee/auth/login", null, { phoneNumber: phone, password, rememberMe: true });
  const tokens = {};
  for (const [who, phone] of Object.entries(PHONES)) {
    const r = await login(phone, phone);
    check(`${who} signs in with the first password (their number)`, r.status === 200 && !!r.json?.data?.token, r.json?.message);
    tokens[who] = r.json?.data?.token;
  }

  const firstNameAsCurrent = await call("PUT", "/api/employee/change-password", tokens.ravi, { currentPassword: "Ravi", newPassword: "Nope@2026" });
  // 400, not 401: a 401 is "your session has ended" to every client, and the
  // app used to sign its user out for mistyping the old password here.
  check("a first name is NOT accepted as the current password", firstNameAsCurrent.status === 400 && firstNameAsCurrent.json?.code === "WRONG_PASSWORD", [firstNameAsCurrent.status, firstNameAsCurrent.json?.code]);
  const changed = await call("PUT", "/api/employee/change-password", tokens.ravi, { currentPassword: PHONES.ravi, newPassword: "Ravi@2026" });
  check("Ravi changes his password", changed.status === 200, changed.json?.message);
  const byPhoneAfter = await login(PHONES.ravi, PHONES.ravi);
  check("his phone number no longer opens the account", byPhoneAfter.status === 401, byPhoneAfter.json?.message);
  const byNew = await login(PHONES.ravi, "Ravi@2026");
  check("his new password does", byNew.status === 200, byNew.json?.message);
  tokens.ravi = byNew.json?.data?.token || tokens.ravi;
  const stillHashed = await Employee.findById(ravi.id).select("+password").lean();
  check("and the failed phone attempt did not reset it", stillHashed.password && (await require("bcryptjs").compare("Ravi@2026", stillHashed.password)), "reset");

  /* ================================================================ */
  heading(3, "The app learns who is field staff from the server");

  const boots = {};
  for (const who of Object.keys(PHONES)) boots[who] = (await call("GET", "/api/field/bootstrap", tokens[who])).json?.data;
  const cap = (who) => boots[who]?.capabilities || {};
  check("Ravi (Sales) is field staff", cap("ravi").field === true, cap("ravi"));
  check("and is tracked", cap("ravi").tracking === true && boots.ravi?.tracking?.enabled === true, boots.ravi?.tracking);
  check("his field attendance is on", cap("ravi").fieldAttendance === true, cap("ravi"));
  check("the heartbeat cadence is supplied", boots.ravi?.tracking?.heartbeatSeconds > 0, boots.ravi?.tracking);
  check("his manager is Meera", boots.ravi?.profile?.manager?.id === meera.id, boots.ravi?.profile?.manager);
  check("Priya (Accounts) is NOT field staff", cap("priya").field === false, cap("priya"));
  check("and is NEVER tracked", cap("priya").tracking === false && boots.priya?.tracking?.enabled === false, boots.priya?.tracking);
  check("and gets no field work", Array.isArray(boots.priya?.tasks) && boots.priya.tasks.length === 0 && boots.priya.templates.length === 0, boots.priya?.tasks);
  check("Meera is a manager with one report", cap("meera").manager === true && cap("meera").teamSize === 1, cap("meera"));
  check("Anil is a manager but not field staff", cap("anil").manager === true && cap("anil").field === false, cap("anil"));
  check("Ravi is not a manager", cap("ravi").manager === false, cap("ravi"));
  check("overtime and standings are offered", cap("priya").overtime === true && cap("priya").standings === true, cap("priya"));

  /* ================================================================ */
  heading(4, "Field work and location are refused to everybody else");

  for (const [method, path, body] of [
    ["GET", "/api/field/tasks"],
    ["GET", "/api/field/leads"],
    ["GET", "/api/field/me/day"],
    ["POST", "/api/field/location/batch", { pings: [{ lat: 20.3, lng: 85.8, recordedAt: new Date().toISOString() }] }],
    ["POST", "/api/field/duty", { events: [{ state: "on", at: new Date().toISOString(), ref: "p1" }] }],
  ]) {
    const r = await call(method, path, tokens.priya, body);
    check(`Priya: ${method} ${path} → 403 NOT_FIELD_STAFF`, r.status === 403 && r.json?.code === "NOT_FIELD_STAFF", [r.status, r.json?.code]);
  }
  const priyaPings = await mongoose.connection.db.collection("field_location_pings").countDocuments({ employeeId: new mongoose.Types.ObjectId(priya.id) });
  check("and not one position of hers was stored", priyaPings === 0, priyaPings);

  /* ================================================================ */
  heading(5, "Only employee tokens open the employee API");

  const customerToken = jwt.sign({ leadId: new mongoose.Types.ObjectId().toString(), type: "customer_portal" }, SECRET, { expiresIn: "1h" });
  const asCustomer = await call("GET", "/api/employee/leave-applications", customerToken);
  check("a customer-portal token is refused", asCustomer.status === 401, asCustomer.status);
  const asDesk = await call("GET", "/api/employee/leave-applications", desk);
  check("a desk token is refused", asDesk.status === 401, asDesk.status);

  /* ================================================================ */
  heading(6, "An employee edits only their own contact details");

  const before6 = await Employee.findById(priya.id).lean();
  const edit = await call("PUT", "/api/employee/profile", tokens.priya, {
    alternatePhone: "9000099999",
    department: "Executive Office",
    status: "inactive",
    designation: "CFO",
    accessDepartmentId: new mongoose.Types.ObjectId().toString(),
    salary: { gross: 999999 },
    bankDetails: { accountNumber: "000111" },
  });
  check("the edit is accepted", edit.status === 200, edit.json?.message);
  const after6 = await Employee.findById(priya.id).lean();
  check("the alternate phone changed", after6.alternatePhone === "9000099999", after6.alternatePhone);
  check("department, status and designation did not", after6.department === before6.department && after6.status === before6.status && after6.designation === before6.designation, [after6.department, after6.status, after6.designation]);
  check("no access grant was written", String(after6.accessDepartmentId || "") === String(before6.accessDepartmentId || ""), after6.accessDepartmentId);
  check("salary and bank details are untouched", JSON.stringify(after6.salary) === JSON.stringify(before6.salary) && JSON.stringify(after6.bankDetails || {}) === JSON.stringify(before6.bankDetails || {}), "changed");
  const onlyForbidden = await call("PUT", "/api/employee/profile", tokens.priya, { salary: { gross: 1 } });
  check("a request with nothing editable is refused plainly", onlyForbidden.status === 400 && onlyForbidden.json?.code === "NOTHING_EDITABLE", onlyForbidden.status);

  /* ================================================================ */
  heading(7, "Duty on — recorded once however often it is delivered");

  const t = (minsAgo) => new Date(now - minsAgo * 60 * 1000).toISOString();
  const on1 = await call("POST", "/api/field/duty", tokens.ravi, { events: [{ state: "on", at: t(110), ref: "duty-on-1", lat: 20.2961, lng: 85.8245 }] });
  check("duty on accepted", on1.status === 200, on1.json?.message);
  await call("POST", "/api/field/duty", tokens.ravi, { events: [{ state: "on", at: t(110), ref: "duty-on-1" }] });
  let day = await FieldDay.findOne({ employeeId: ravi.id, day: dayKey(now) }).lean();
  check("one duty session, not two", (day?.dutySessions || []).length === 1, (day?.dutySessions || []).length);
  check("duty is on", day?.dutyOn === true, day?.dutyOn);

  /* ================================================================ */
  heading(8, "A day in the field — driven, stopped, driven, stopped");

  // Built as the app would send it: fixes with speed and accuracy, and while
  // standing still a heartbeat every two minutes, delivered in several batches.
  const fixes = [];
  const push = (minsAgo, lat, lng, speed, accuracy, source = "service") =>
    fixes.push({ lat, lng, speed, accuracy, recordedAt: t(minsAgo), battery: 80, activity: speed > 3 ? "in_vehicle" : speed > 0.6 ? "walking" : "still", source, isMoving: speed > 0.6 });

  // Leg 1: 100 → 88 min ago, origin to A (about 3.3 km).
  const O = { lat: 20.2961, lng: 85.8245 };
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    push(100 - i, O.lat + (A.lat - O.lat) * f, O.lng + (A.lng - O.lng) * f, 5.5, 8);
  }
  // Stay at A: 88 → 64 min ago, heartbeats every 2 minutes with a few metres of jitter.
  for (let m = 86, k = 0; m >= 64; m -= 2, k++) {
    const j = (k % 3) - 1;
    push(m, A.lat + dLat(4 * j), A.lng + dLng(3 * j, A.lat), 0, 10, "heartbeat");
  }
  const stayAEnds = fixes.length;
  // Leg 2: 63 → 50 min ago, A to B (about 4.5 km).
  for (let i = 1; i <= 13; i++) {
    const f = i / 13;
    push(63 - i + 1, A.lat + (B.lat - A.lat) * f, A.lng + (B.lng - A.lng) * f, 8, 7);
  }
  // Stay at B: 50 → 42 min ago.
  for (let m = 48, k = 0; m >= 42; m -= 2, k++) push(m, B.lat + dLat(3 * ((k % 2) ? 1 : -1)), B.lng, 0, 9, "heartbeat");
  // Leaving B: 41 → 39 min ago.
  for (let i = 1; i <= 3; i++) push(42 - i, B.lat + dLat(300 * i), B.lng + dLng(200 * i, B.lat), 7, 8);

  const send = (slice, batchId) => call("POST", "/api/field/location/batch", tokens.ravi, { pings: slice, batchId });

  // Everything up to the middle of the stay at A, in three batches.
  const midA = stayAEnds - 3;
  const b1 = await send(fixes.slice(0, 10), "b1");
  const b2 = await send(fixes.slice(10, 18), "b2");
  const b3 = await send(fixes.slice(18, midA), "b3");
  check("batches accepted", [b1, b2, b3].every((r) => r.status === 200), [b1.status, b2.status, b3.status]);

  day = await FieldDay.findOne({ employeeId: ravi.id, day: dayKey(now) }).lean();
  check("the open stay at Kalmeshwar is carried between batches", day?.stay && Math.abs(day.stay.lat - A.lat) < dLat(20), day?.stay);
  check("it has been going for over fifteen minutes", day?.stay && (new Date(day.stay.lastAt) - new Date(day.stay.since)) / 60000 >= 15,
    day?.stay && (new Date(day.stay.lastAt) - new Date(day.stay.since)) / 60000);

  // The desk sees where he is. The stay's minutes run to NOW, because the
  // simulated fixes are in the past; the phone reports its last fix as recent
  // in real use. What is checked is the state and the name.
  const namedStay = await waitFor(async () => {
    const d = await FieldDay.findOne({ employeeId: ravi.id, day: dayKey(now) }).lean();
    return d?.stay?.named ? d : null;
  });
  check("the stay is named after the village", namedStay?.stay?.locality === "Kalmeshwar", namedStay?.stay);

  // The rest of the stay, then the drive to B — and a retry of an old batch.
  const b4 = await send(fixes.slice(midA, stayAEnds + 6), "b4");
  const moving = b4.json?.now;
  check("the batch answer says where the office thinks he is", !!moving?.state, b4.json?.now);
  const retry = await send(fixes.slice(10, 18), "b2-retry");
  check("a retried batch stores nothing twice", retry.json?.data?.accepted === 0 && retry.json?.data?.duplicates === 8, retry.json?.data);
  const distBefore = (await FieldDay.findOne({ employeeId: ravi.id, day: dayKey(now) }).lean()).distanceMeters;
  await send(fixes.slice(10, 18), "b2-retry-again");
  const distAfter = (await FieldDay.findOne({ employeeId: ravi.id, day: dayKey(now) }).lean()).distanceMeters;
  check("and adds no distance", distBefore === distAfter, [distBefore, distAfter]);

  const b5 = await send(fixes.slice(stayAEnds + 6), "b5");
  check("the last batch is accepted", b5.status === 200, b5.json);

  day = await waitFor(async () => {
    const d = await FieldDay.findOne({ employeeId: ravi.id, day: dayKey(now) }).lean();
    const stays = (d?.stops || []).filter((s) => (s.kind || (s.leadId ? "visit" : "stay")) === "stay");
    return stays.length >= 2 && stays.every((s) => s.named) ? d : null;
  }, 6000) || (await FieldDay.findOne({ employeeId: ravi.id, day: dayKey(now) }).lean());
  const stays = (day?.stops || []).filter((s) => (s.kind || (s.leadId ? "visit" : "stay")) === "stay");
  check("two stops were found across batches", stays.length === 2, stays.map((s) => [s.minutes, s.locality]));
  // Arrived at A 88 min ago, last heartbeat there 64 min ago: 24 minutes.
  check("the first lasted twenty-four minutes", stays[0] && stays[0].minutes >= 23 && stays[0].minutes <= 25, stays[0]?.minutes);
  // Arrived at B 51 min ago, last heartbeat 42 min ago: 9 minutes.
  check("the second nine", stays[1] && stays[1].minutes >= 8 && stays[1].minutes <= 10, stays[1]?.minutes);
  check("the stops carry the village names", stays[0]?.locality === "Kalmeshwar" && stays[1]?.locality === "Mahimapur", stays.map((s) => s.locality));
  // 3.8 km + 4.6 km + 1.1 km leaving B; the heartbeat jitter adds nothing.
  check("distance is about nine and a half km", day.distanceMeters > 8800 && day.distanceMeters < 10200, day.distanceMeters);
  const elapsed = (new Date(day.lastPingAt) - new Date(day.firstPingAt)) / 1000;
  check("moving + still time never exceeds the day", day.movingSeconds + day.idleSeconds <= elapsed + 1, [day.movingSeconds, day.idleSeconds, elapsed]);
  check("the last speed is recorded", typeof day.lastSpeed === "number" && day.lastSpeed > 5, day.lastSpeed);

  /* ================================================================ */
  heading(9, "The salesperson sees their own day; the desk sees the same");

  const mine = await call("GET", "/api/field/me/day", tokens.ravi);
  const tl = mine.json?.data?.timeline || [];
  check("his timeline lists both stays in order", tl.filter((e) => e.kind === "stay").map((e) => e.locality).join(",") === "Kalmeshwar,Mahimapur", tl.map((e) => [e.kind, e.locality, e.minutes]));
  check("with arrival and departure times", tl.every((e) => e.arrivedAt && e.leftAt), tl);
  check("and the drive between them", mine.json?.data?.legs?.length === 1 && mine.json.data.legs[0].km > 3, mine.json?.data?.legs);
  check("a count is still there for older builds", mine.json?.data?.stops === 2, mine.json?.data?.stops);
  check("he can see his own state", !!mine.json?.data?.now?.state, mine.json?.data?.now);

  const live = await call("GET", "/api/sales/team/live", desk);
  const row = (live.json?.data || []).find((r) => r.employeeId === ravi.id);
  check("the live board lists Ravi", !!row, live.json?.data?.map((r) => r.name));
  check("with a state and his distance", row && ["moving", "stopped", "not_reporting"].includes(row.state) && row.distanceKm > 6, row);
  check("and his duty", row?.dutyOn === true && !!row?.dutyStartedAt, row);
  check("with two stops and the last one named", row?.stops === 2 && row?.lastStop?.place === "Mahimapur", row?.lastStop);
  const meeraRow = (live.json?.data || []).find((r) => r.employeeId === meera.id);
  check("field staff who have not started are listed as not started", meeraRow?.state === "not_started", meeraRow);
  check("Priya (not field staff) is not on the board", !(live.json?.data || []).some((r) => r.employeeId === priya.id), "listed");

  const deskDay = await call("GET", `/api/sales/team/${ravi.id}/day`, desk);
  check("the desk's day carries the timeline", (deskDay.json?.data?.timeline || []).filter((e) => e.kind === "stay").length === 2, deskDay.json?.data?.timeline);
  check("and `submissions`, which the page reads", typeof deskDay.json?.data?.submissions === "number", deskDay.json?.data?.submissions);

  /* ================================================================ */
  heading(10, "Ending duty files the field attendance for his ONE manager");

  const off1 = await call("POST", "/api/field/duty", tokens.ravi, { events: [{ state: "off", at: t(38), ref: "duty-off-1" }] });
  const att1 = off1.json?.data?.attendance?.[0];
  check("duty off files the day's attendance", att1?.status === "filed" && !!att1?.requestId, off1.json?.data);
  const reg = await RegularizationRequest.findById(att1?.requestId).lean();
  check("as a field-duty correction", reg?.source === "field_duty" && reg?.type === "client_visit", [reg?.source, reg?.type]);
  check("waiting on Meera alone", (reg?.managersNotified || []).length === 1 && String(reg.managersNotified[0].managerId) === meera.id, reg?.managersNotified);
  check("with the day's summary in the reason", /Field duty .* km .* visit/.test(reg?.reason || ""), reg?.reason);
  check("and the figures kept for the manager", reg?.fieldSummary?.distanceKm > 6 && reg?.fieldSummary?.stops === 2, reg?.fieldSummary);

  const onAgain = await call("POST", "/api/field/duty", tokens.ravi, { events: [{ state: "on", at: t(30), ref: "duty-on-2" }] });
  const off2 = await call("POST", "/api/field/duty", tokens.ravi, { events: [{ state: "off", at: t(5), ref: "duty-off-2" }] });
  check("a second duty the same day extends it", onAgain.status === 200 && off2.json?.data?.attendance?.[0]?.status === "updated", off2.json?.data);
  const regExtended = await RegularizationRequest.findById(att1?.requestId).lean();
  check("its out time moved to the later end", new Date(regExtended.proposedOutTime) > new Date(reg.proposedOutTime), [reg.proposedOutTime, regExtended.proposedOutTime]);
  const regCount = await RegularizationRequest.countDocuments({ employeeId: ravi.id, dateStr: dayKey(now) });
  check("still one request for the day", regCount === 1, regCount);

  const summary = await call("GET", "/api/employee/approvals/summary", tokens.meera);
  check("Meera's badge counts it", summary.json?.data?.regularization === 1 && summary.json?.data?.isManager === true, summary.json?.data);
  const queue = await call("GET", "/api/employee/regularizations/manager/pending", tokens.meera);
  check("it is in her queue", (queue.json?.data || []).some((r) => String(r._id) === String(att1?.requestId)), queue.json?.data?.length);
  const approve = await call("PATCH", `/api/employee/regularizations/manager/${att1?.requestId}/approve`, tokens.meera, { remarks: "Seen the route" });
  check("she approves it", approve.status === 200, approve.json?.message);
  const regFinal = await RegularizationRequest.findById(att1?.requestId).lean();
  check("and ONE approval is final", regFinal?.status === "hr_approved", regFinal?.status);
  const att = await DailyAttendance.findOne({ dateStr: dayKey(now), "employees.biometricId": "APPT02" }, { "employees.$": 1 }).lean();
  check("the muster roll now has his in and out times", !!att?.employees?.[0]?.inTime && !!att?.employees?.[0]?.finalOut, att?.employees?.[0]);

  /* ================================================================ */
  heading(11, "Leave goes to the one manager and her approval is final");

  let leaveDay = new Date(now + 24 * 60 * 60 * 1000);
  while (![2, 3, 4].includes(leaveDay.getUTCDay())) leaveDay = new Date(leaveDay.getTime() + 24 * 60 * 60 * 1000);
  const leaveDate = dayKey(leaveDay);
  const applied = await call("POST", "/api/employee/leave-applications", tokens.ravi, {
    leaveType: "LOP", applicationDate: dayKey(now), fromDate: leaveDate, toDate: leaveDate, reason: "Family function", isHalfDay: false,
  });
  check("Ravi applies for a day", applied.status === 201 || applied.status === 200, applied.json?.message);
  const leaveId = applied.json?.data?._id;
  const leaveDoc = await LeaveApplication.findById(leaveId).lean();
  check("it waits on Meera only", (leaveDoc?.managersNotified || []).length === 1 && leaveDoc.managersNotified[0].type === "primary", leaveDoc?.managersNotified);
  const lq = await call("GET", "/api/employee/leave-applications/manager/pending", tokens.meera);
  check("it is in her leave queue", (lq.json?.data || []).some((l) => String(l._id) === String(leaveId)), lq.json?.data?.length);
  const la = await call("PATCH", `/api/employee/leave-applications/manager/${leaveId}/approve`, tokens.meera, { remarks: "" });
  check("she approves", la.status === 200, la.json?.message);
  const leaveFinal = await LeaveApplication.findById(leaveId).lean();
  check("and it is final — no second manager", leaveFinal?.status === "hr_approved", leaveFinal?.status);
  const team = await call("GET", "/api/employee/leave-applications/manager/my-team", tokens.anil);
  check("the dropped secondary does not make Anil part of Ravi's team", !(team.json?.data || []).some((e) => String(e._id) === ravi.id), team.json?.data?.map((e) => e.firstName));

  /* ================================================================ */
  heading(12, "The inbox the app reads");

  const assign = await call("POST", "/api/sales/tasks", desk, {
    type: "lead_generation", title: "Tomorrow — Kalmeshwar", instructions: "East side.", stageKey: "contacted",
    assignments: [{ employeeId: ravi.id, targetCount: 3 }],
  });
  check("the desk assigns Ravi a round", assign.status === 201, assign.json?.message);
  const inbox = await waitFor(async () => {
    const r = await call("GET", "/api/employee/notifications", tokens.ravi);
    const titles = (r.json?.data || []).map((n) => n.title);
    return titles.some((x) => /New assignment/.test(x)) && titles.some((x) => /approved/i.test(x)) ? r : null;
  }) || (await call("GET", "/api/employee/notifications", tokens.ravi));
  const titles = (inbox.json?.data || []).map((n) => n.title);
  check("Ravi's inbox has the new assignment", titles.some((x) => /New assignment/.test(x)), titles);
  check("and his approved leave", titles.some((x) => /Request approved/.test(x)), titles);
  check("and his confirmed field day, said as such", titles.some((x) => /Field day confirmed/.test(x)), titles);
  check("with an unread count", inbox.json?.unread >= 3, inbox.json?.unread);
  const meeraInbox = await call("GET", "/api/employee/notifications", tokens.meera);
  check("Meera was told about the field day and the leave", (meeraInbox.json?.data || []).some((n) => /Field attendance/.test(n.title)) && (meeraInbox.json?.data || []).some((n) => /leave/i.test(n.title)), (meeraInbox.json?.data || []).map((n) => n.title));
  const readAll = await call("POST", "/api/employee/notifications/read", tokens.ravi, { all: true });
  const after = await call("GET", "/api/employee/notifications", tokens.ravi);
  check("marking all read clears the count", readAll.status === 200 && after.json?.unread === 0, after.json?.unread);
  const cross = await call("POST", "/api/employee/notifications/read", tokens.priya, { ids: (inbox.json?.data || []).map((n) => n.id) });
  check("nobody can mark another person's notifications", cross.json?.data?.marked === 0, cross.json?.data);

  /* ================================================================ */
  heading(13, "HR lets Ravi go — the app loses access on its next request");

  // On duty when it happens — the case that matters: his phone stops the
  // moment it is refused, but can no longer tell the server so.
  const onBeforeFire = await call("POST", "/api/field/duty", tokens.ravi, { events: [{ state: "on", at: new Date().toISOString(), ref: "duty-on-before-fire" }] });
  check("Ravi is back on duty", onBeforeFire.status === 200, onBeforeFire.json?.message);
  const fired = await call("DELETE", `/api/employees/${ravi.id}`, hr);
  check("HR deactivates him", fired.status === 200, fired.json?.message);
  const closedDuty = await waitFor(async () => {
    const d = await FieldDay.findOne({ employeeId: ravi.id, day: dayKey(now) }).lean();
    return d && d.dutyOn === false ? d : null;
  });
  check("the server closes his open duty itself", closedDuty?.dutyOn === false, closedDuty?.dutyOn);
  check("marked as ended by the deactivation", (closedDuty?.dutySessions || []).some((x) => x.endRef === "deactivated"), closedDuty?.dutySessions);
  const afterFire = [
    await call("GET", "/api/field/bootstrap", tokens.ravi),
    await call("POST", "/api/field/location/batch", tokens.ravi, { pings: [{ lat: B.lat, lng: B.lng, recordedAt: new Date().toISOString() }] }),
    await call("GET", "/api/employee/leave-applications", tokens.ravi),
    await call("GET", `/api/employee/payslip/${ravi.id}/history`, tokens.ravi),
  ];
  check("every app route now answers EMPLOYEE_INACTIVE", afterFire.every((r) => r.status === 403 && r.json?.code === "EMPLOYEE_INACTIVE"), afterFire.map((r) => [r.status, r.json?.code]));
  const verify = await call("GET", "/api/employee/auth/verify", tokens.ravi);
  check("session restore fails", verify.status === 401, verify.status);
  const relogin = await login(PHONES.ravi, "Ravi@2026");
  check("and he cannot sign in again", relogin.status === 401, relogin.json?.message);
  const liveAfter = await call("GET", "/api/sales/team/live", desk);
  const gone = (liveAfter.json?.data || []).find((r) => r.employeeId === ravi.id);
  check("the board keeps his day but marks him as gone", gone?.inactive === true, gone);
  const assignGone = await call("POST", "/api/sales/tasks", desk, {
    type: "lead_generation", title: "Should fail", stageKey: "contacted", assignments: [{ employeeId: ravi.id, targetCount: 1 }],
  });
  check("the desk can no longer give him work", assignGone.status >= 400, assignGone.status);

  const managerGone = await call("DELETE", `/api/employees/${anil.id}`, hr);
  check("deactivating a manager says who still reports to them", managerGone.json?.data?.reportsToReassign === 1 && /still reports/.test(managerGone.json?.message || ""), managerGone.json);

  // A status-only exit (bulk edit sets `status` without `isActive`) is an exit too.
  const statusOnly = await call("PUT", `/api/employees/${priya.id}`, hr, { status: "inactive" });
  check("HR marks Priya inactive by status alone", statusOnly.status === 200, statusOnly.json?.message);
  const priyaAfter = await call("GET", "/api/employee/leave-applications", tokens.priya);
  check("her token is refused at once", priyaAfter.status === 403 && priyaAfter.json?.code === "EMPLOYEE_INACTIVE", [priyaAfter.status, priyaAfter.json?.code]);
  const priyaLogin = await login(PHONES.priya, PHONES.priya);
  check("and her login is refused", priyaLogin.status === 401, priyaLogin.json?.message);

  /* ================================================================ */
  heading(14, "The stay rules, directly");

  const { advanceStays, timelineOf, presentState } = require("../services/fieldTracking");

  // "Moving · 0 km/h" is not a figure: a crawl is shown as moving, no speed.
  const crawl = presentState({ day: dayKey(now), lastPingAt: new Date(), lastSpeed: 0.1, lastLat: A.lat, lastLng: A.lng });
  check("a crawl reads as moving with no speed", crawl.state === "moving" && crawl.speedKmh == null, crawl);
  // A place name looked up kilometres back is not said about where they are now.
  const farFromName = presentState({
    day: dayKey(now), lastPingAt: new Date(), lastSpeed: 12,
    lastLat: B.lat, lastLng: B.lng, lastPlace: A.name, lastLocality: A.locality, lastPlaceKey: `${A.lat.toFixed(3)},${A.lng.toFixed(3)}`,
  });
  check("a stale place name is not claimed", farFromName.place === "" && farFromName.locality === "", farFromName);
  const nearName = presentState({
    day: dayKey(now), lastPingAt: new Date(), lastSpeed: 12,
    lastLat: A.lat + dLat(200), lastLng: A.lng, lastPlace: A.name, lastLocality: A.locality, lastPlaceKey: `${A.lat.toFixed(3)},${A.lng.toFixed(3)}`,
  });
  check("a name for somewhere close by still is", nearName.locality === A.locality, nearName);
  const at = (m) => new Date(now - m * 60000);
  // A slow walk down a lane (half a metre a second, a fix every twenty
  // seconds) must not become one long stop drifting along with the walker.
  const walk = [];
  for (let i = 0; i <= 90; i++) walk.push({ lat: A.lat + dLat(10 * i), lng: A.lng, t: new Date(now - 60 * 60000 + i * 20000), q: "good", acc: 6 });
  const walked = advanceStays(null, walk);
  check("thirty minutes of slow walking is not a stop", walked.closed.length === 0 && (walked.stay ? (walked.stay.lastAt - walked.stay.since) / 60000 < 5 : true), walked.closed);
  // Indoors, vague fixes keep a stay alive but never start or break one.
  const indoors = [{ lat: A.lat, lng: A.lng, t: at(40), q: "good", acc: 10 }];
  for (let m = 38; m >= 20; m -= 2) indoors.push({ lat: A.lat + dLat(45), lng: A.lng, t: at(m), q: "vague", acc: 60 });
  const kept = advanceStays(null, indoors);
  check("vague indoor fixes extend the stay", kept.stay && (kept.stay.lastAt - kept.stay.since) / 60000 >= 19, kept.stay);
  check("without moving where it is", kept.stay && Math.abs(kept.stay.lat - A.lat) < 1e-9, kept.stay?.lat);
  // A visit recorded during a stay is shown inside it.
  const tlRow = {
    day: dayKey(now),
    stops: [
      { kind: "stay", lat: A.lat, lng: A.lng, arrivedAt: at(50), leftAt: at(20), minutes: 30, locality: "Kalmeshwar" },
      { kind: "visit", lat: A.lat, lng: A.lng, arrivedAt: at(35), leftAt: at(35), label: "Ramesh Kumar", leadId: new mongoose.Types.ObjectId() },
    ],
    path: [],
  };
  const t14 = timelineOf(tlRow);
  const host = t14.entries.find((e) => e.kind === "stay");
  check("a visit during a stay is shown inside it", host?.visits?.[0]?.label === "Ramesh Kumar", t14.entries);

  console.log(`\n${"=".repeat(60)}\n${pass} passed, ${fail} failed\n${"=".repeat(60)}`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error("CRASHED:", err);
  process.exit(2);
});
