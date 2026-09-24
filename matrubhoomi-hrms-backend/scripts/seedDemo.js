"use strict";
// scripts/seedDemo.js
//
// A DEMO company in ONE local database — for showing the employee app and the
// CMS together: the same people, the same leave, the same field day on both.
//
// Everything that has an API is created THROUGH the API (hiring, leave,
// corrections, overtime, tasks, a recorded route, announcements), so the demo
// data is exactly what the real flows produce. Only what has no API of its own
// — holidays, a month of punch-machine attendance, place names — is written
// directly.
//
// LOCAL DATABASES ONLY. It refuses any MONGODB_URI that is not on this machine.
//
//   # 1. the backend, on the demo database (see the Matrubhoomi-Demo folder)
//   # 2. then:
//   MONGODB_URI=mongodb://127.0.0.1:27017/matrubhoomi_demo DEMO_BASE=http://127.0.0.1:5000 \
//     JWT_SECRET=<the backend's> SALARY_ENCRYPTION_KEY=<the backend's> \
//     CEO_SEED_EMAIL=<the backend's> CEO_SEED_PASSWORD=<the backend's> node scripts/seedDemo.js

const mongoose = require("mongoose");

const BASE = process.env.DEMO_BASE || "http://127.0.0.1:5000";
const URI = process.env.MONGODB_URI || "";
const PASSWORD = process.env.DEMO_PASSWORD || "Demo@1234";
const DESK_PASSWORD = process.env.DEMO_DESK_PASSWORD || "Demo@2026";
const DOMAIN = "matrubhoomi.demo";

if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(URI)) {
  console.error("seedDemo: refusing — MONGODB_URI must be a LOCAL database (mongodb://127.0.0.1/...).");
  process.exit(1);
}

async function call(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
function must(r, what) {
  if (r.status >= 300) throw new Error(`${what}: ${r.status} ${r.json?.message || JSON.stringify(r.json)}`);
  return r.json;
}

const IST = 5.5 * 3600 * 1000;
const istDay = (offset = 0) => new Date(Date.now() + IST + offset * 86400000).toISOString().slice(0, 10);
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00+05:30`);
const dow = (day) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 Sunday
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

(async () => {
  await mongoose.connect(URI);
  const Employee = require("../models/Employee");
  const Department = require("../models/HR_Models/Departments");
  const DailyAttendance = require("../models/HR_Models/Dailyattendance");
  const GeoPlace = require("../models/Sales_Models/GeoPlace");
  const { CompanyHoliday } = require("../models/HR_Models/LeaveManagement");
  const { setChosenEmployeePassword } = require("../utils/employeePassword");

  if (await Employee.exists({ email: new RegExp(`@${DOMAIN.replace(".", "\\.")}$`) })) {
    console.log("seedDemo: this database already has the demo company. Drop it first to reseed.");
    process.exit(0);
  }

  /* ── 1. The desk: the CEO signs in, and makes HR and Sales logins ─────── */
  const ceoEmail = (process.env.CEO_SEED_EMAIL || "").toLowerCase();
  const ceo = must(await call("POST", "/api/auth/login", null, { email: ceoEmail, password: process.env.CEO_SEED_PASSWORD }), "CEO login");
  const ceoToken = ceo.token;
  const depts = must(await call("GET", "/api/admin/departments", ceoToken), "departments");
  const deptList = depts.data || depts.departments || [];
  const deptId = (slug) => String((deptList.find((d) => d.slug === slug) || {})._id || "");
  for (const [slug, name, email] of [
    ["hr", "Hemant Rath (HR)", `hr@${DOMAIN}`],
    ["sales", "Sneha Patnaik (Sales desk)", `sales@${DOMAIN}`],
  ]) {
    must(await call("POST", "/api/admin/users", ceoToken, { name, email, departmentId: deptId(slug), password: DESK_PASSWORD }), `desk user ${slug}`);
  }
  const hrToken = must(await call("POST", "/api/auth/login", null, { email: `hr@${DOMAIN}`, password: DESK_PASSWORD }), "HR login").token;
  const salesToken = must(await call("POST", "/api/auth/login", null, { email: `sales@${DOMAIN}`, password: DESK_PASSWORD }), "Sales login").token;
  console.log("desk logins ready");

  /* ── 2. Departments and people ────────────────────────────────────────── */
  const dept = async (name, designations) =>
    Department.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, designations: designations.map((d) => ({ name: d })) } },
      { upsert: true, new: true },
    );
  const sales = await dept("Sales", ["Sales Manager", "Field Sales Executive"]);
  const accounts = await dept("Accounts", ["Accounts Head", "Accountant"]);
  const ops = await dept("Operations", ["Operations Manager", "Site Supervisor"]);

  const daysAgo = (n) => istDay(-n);
  const hire = async (p) => {
    const body = {
      firstName: p.first, lastName: p.last, email: `${p.first.toLowerCase()}@${DOMAIN}`, phone: p.phone,
      gender: p.gender || "Male", department: p.dept.name, departmentId: String(p.dept._id), designation: p.designation,
      dateOfJoining: daysAgo(p.joined || 500), confirmationDate: daysAgo(p.joined || 500),
      employmentType: p.type || "full_time", workShift: { mode: "general" },
      salary: p.type === "intern" ? { stipend: 8000 } : { gross: p.gross || 28000 },
      ...(p.type === "intern" ? { stipend: 8000 } : {}),
      biometricId: p.bid,
      address: { current: { state: "Odisha", city: "Bhubaneswar" }, permanent: { state: "Odisha" } },
      ...(p.manager ? { primaryManager: { managerId: p.manager.id, managerName: p.manager.name } } : {}),
    };
    const r = must(await call("POST", "/api/employees", hrToken, body), `hire ${p.first}`);
    const person = { id: String(r.data._id), name: `${p.first} ${p.last}`, phone: p.phone, bid: p.bid };
    if (p.password !== "phone") await setChosenEmployeePassword(Employee, person.id, PASSWORD);
    return person;
  };
  const rakesh = await hire({ first: "Rakesh", last: "Mohanty", phone: "9000000001", dept: sales, designation: "Sales Manager", bid: "MB001", gross: 45000 });
  const priya = await hire({ first: "Priya", last: "Das", phone: "9000000002", dept: sales, designation: "Field Sales Executive", bid: "MB002", gender: "Female", manager: rakesh });
  const amit = await hire({ first: "Amit", last: "Behera", phone: "9000000003", dept: sales, designation: "Field Sales Executive", bid: "MB003", manager: rakesh });
  const sunita = await hire({ first: "Sunita", last: "Nayak", phone: "9000000004", dept: sales, designation: "Field Sales Executive", bid: "MB004", gender: "Female", manager: rakesh });
  const manoj = await hire({ first: "Manoj", last: "Panda", phone: "9000000005", dept: accounts, designation: "Accounts Head", bid: "MB005", gross: 42000 });
  const anjali = await hire({ first: "Anjali", last: "Sahu", phone: "9000000006", dept: accounts, designation: "Accountant", bid: "MB006", gender: "Female", manager: manoj });
  const deepak = await hire({ first: "Deepak", last: "Jena", phone: "9000000007", dept: ops, designation: "Operations Manager", bid: "MB007", gross: 40000 });
  const kiran = await hire({ first: "Kiran", last: "Swain", phone: "9000000008", dept: ops, designation: "Site Supervisor", bid: "MB008", manager: deepak, password: "phone" });
  const ritu = await hire({ first: "Ritu", last: "Mishra", phone: "9000000009", dept: accounts, designation: "Accountant", bid: "MB009", gender: "Female", manager: manoj, joined: 10 });
  await hire({ first: "Arjun", last: "Rout", phone: "9000000010", dept: ops, designation: "Site Supervisor", bid: "MB010", type: "intern", manager: deepak, password: "phone" });
  const staff = [rakesh, priya, amit, sunita, manoj, anjali, deepak, kiran, ritu];
  console.log(`hired ${staff.length + 1} people`);

  const login = async (p, pw = PASSWORD) =>
    must(await call("POST", "/api/employee/auth/login", null, { phoneNumber: p.phone, password: pw, rememberMe: true }), `login ${p.name}`).data.token;
  const tok = {};
  for (const p of staff) tok[p.phone] = await login(p, p === kiran ? kiran.phone : PASSWORD);

  /* ── 3. Holidays ───────────────────────────────────────────────────────── */
  const year = Number(istDay().slice(0, 4));
  const holidays = [
    ["01-01", "New Year's Day", "company"], ["01-26", "Republic Day", "national"], ["03-04", "Holi", "national"],
    ["04-14", "Maha Vishuba Sankranti (Odia New Year)", "company"], ["07-16", "Rath Yatra", "company"],
    ["08-15", "Independence Day", "national"], ["10-02", "Gandhi Jayanti", "national"], ["10-19", "Durga Puja (Dashami)", "company"],
    ["11-08", "Diwali", "national"], ["11-24", "Kartika Purnima", "optional"], ["12-25", "Christmas", "national"],
  ];
  for (const y of [year, year + 1]) {
    for (const [md, name, type] of holidays) {
      await CompanyHoliday.updateOne({ date: `${y}-${md}` }, { $setOnInsert: { date: `${y}-${md}`, name, type } }, { upsert: true });
    }
  }

  /* ── 4. A month of the punch machine ───────────────────────────────────── */
  const holidaySet = new Set(holidays.map(([md]) => `${year}-${md}`));
  for (let back = 30; back >= 1; back--) {
    const day = istDay(-back);
    if (dow(day) === 0 || holidaySet.has(day)) continue;
    const entries = [];
    for (const p of staff) {
      if (p === ritu && back > 9) continue; // joined ten days ago
      if (Math.random() < 0.05) continue; // the odd absence
      const inMin = rnd(9 * 60 + 5, 9 * 60 + 50);
      const outMin = p === anjali && back === 1 ? 20 * 60 + 40 : rnd(18 * 60 + 30, 19 * 60 + 5);
      const late = inMin > 9 * 60 + 40;
      entries.push({
        biometricId: p.bid, employeeDbId: p.id, employeeName: p.name, employeeType: "executive",
        inTime: at(day, hhmm(inMin)), finalOut: at(day, hhmm(outMin)), punchCount: 2,
        isLate: late, lateMins: late ? inMin - (9 * 60 + 30) : 0,
        systemPrediction: late ? "LT" : "P", hrFinalStatus: late ? "LT" : "P",
      });
    }
    await DailyAttendance.updateOne(
      { dateStr: day },
      { $setOnInsert: { dateStr: day, date: at(day, "00:00"), yearMonth: day.slice(0, 7), dayOfWeek: dow(day), employees: entries } },
      { upsert: true },
    );
  }
  // Today, as far as the machine has got: everyone in, nobody out yet.
  {
    const day = istDay(0);
    const entries = staff.filter((p) => p !== sunita).map((p) => {
      const inMin = rnd(9 * 60 + 5, 9 * 60 + 45);
      const late = inMin > 9 * 60 + 40;
      return { biometricId: p.bid, employeeDbId: p.id, employeeName: p.name, employeeType: "executive", inTime: at(day, hhmm(inMin)), punchCount: 1, isLate: late, lateMins: late ? inMin - 570 : 0, systemPrediction: late ? "LT" : "P" };
    });
    await DailyAttendance.updateOne(
      { dateStr: day },
      { $setOnInsert: { dateStr: day, date: at(day, "00:00"), yearMonth: day.slice(0, 7), dayOfWeek: dow(day), employees: entries } },
      { upsert: true },
    );
  }
  console.log("attendance written");

  /* ── 5. Leave, corrections, overtime — through the employees' own routes ─ */
  const L = "/api/employee/leave-applications";
  const nextWeekday = (from, n) => { let d = from, k = 0; while (k < n) { d = istDay((Date.parse(d + "T12:00:00Z") - Date.parse(istDay(0) + "T12:00:00Z")) / 86400000 + 1); if (dow(d) !== 0) k++; } return d; };
  const today = istDay(0);
  // Sunita is on leave today — asked last week, approved by Rakesh.
  let r = must(await call("POST", L, tok[sunita.phone], { leaveType: "CL", applicationDate: istDay(-5), fromDate: today, toDate: today, reason: "Sister's engagement ceremony" }), "Sunita leave");
  must(await call("PATCH", `${L}/manager/${r.data._id}/approve`, tok[rakesh.phone], { remarks: "Enjoy the function" }), "approve Sunita");
  // Priya asks for two days next week — waiting for Rakesh.
  const p1 = nextWeekday(today, 4), p2 = nextWeekday(p1, 1);
  must(await call("POST", L, tok[priya.phone], { leaveType: "CL", applicationDate: today, fromDate: p1, toDate: p2, reason: "Family function in Cuttack" }), "Priya leave");
  // Amit: a one-tap day off tomorrow, for Rakesh to classify.
  must(await call("POST", `${L}/quick-apply`, tok[amit.phone], { targetDate: "tomorrow", isHalfDay: false, reason: "Not feeling well" }), "Amit quick leave");
  // Anjali: three days of sick leave next week — asks for a certificate.
  const s1 = nextWeekday(today, 6);
  must(await call("POST", L, tok[anjali.phone], { leaveType: "SL", applicationDate: today, fromDate: s1, toDate: nextWeekday(s1, 2), reason: "Minor surgery, advised rest" }), "Anjali SL");
  // Deepak had a day off last month, approved — nothing to do, just history.
  const dOld = istDay(-20);
  if (dow(dOld) !== 0) {
    r = must(await call("POST", L, tok[deepak.phone], { leaveType: "PL", applicationDate: istDay(-25), fromDate: dOld, toDate: dOld, reason: "Personal work" }), "Deepak PL");
  }
  // Anjali forgot to punch out three days ago — a correction for Manoj.
  let d3 = istDay(-3); if (dow(d3) === 0) d3 = istDay(-4);
  must(await call("POST", "/api/employee/regularizations", tok[anjali.phone], { dateStr: d3, type: "forgot_punch", outTime: "18:45", reason: "Left in a hurry for the bank, forgot to punch out" }), "Anjali correction");
  // Anjali stayed late — yesterday if that report can still be filed (before
  // noon), otherwise this evening once it is past 20:15.
  let ot = await call("POST", "/api/employee/overtime/submit", tok[anjali.phone], { dateStr: istDay(-1), description: "Month-end GST reconciliation with the auditors" });
  if (ot.status !== 201 && Date.now() > at(today, "20:20").getTime()) {
    await DailyAttendance.updateOne(
      { dateStr: today, "employees.biometricId": anjali.bid },
      { $set: { "employees.$.finalOut": at(today, "20:15"), "employees.$.punchCount": 2 } },
    );
    ot = await call("POST", "/api/employee/overtime/submit", tok[anjali.phone], { dateStr: today, description: "Month-end GST reconciliation with the auditors" });
  }
  console.log(ot.status === 201 ? "overtime report filed" : `overtime not filed (${ot.json?.message})`);
  // Anjali asks HR for a salary certificate.
  await call("POST", "/api/employee/documents/requests", tok[anjali.phone], { type: "salary_certificate", reason: "Home loan application" });
  console.log("requests filed");

  /* ── 6. Sales: work on the board, and yesterday's round ────────────────── */
  const route = [
    // Saheed Nagar office → Balakati → Pipili → back towards Bhubaneswar
    { lat: 20.2961, lng: 85.8440, name: "Saheed Nagar, Bhubaneswar", locality: "Saheed Nagar", district: "Khordha" },
    { lat: 20.2330, lng: 85.8960, name: "Balakati", locality: "Balakati", district: "Khordha" },
    { lat: 20.1150, lng: 85.8320, name: "Pipili", locality: "Pipili", district: "Puri" },
    { lat: 20.1980, lng: 85.7990, name: "Jatni", locality: "Jatni", district: "Khordha" },
  ];
  for (const v of route) {
    const key = `${v.lat.toFixed(3)},${v.lng.toFixed(3)}`;
    await GeoPlace.updateOne(
      { key },
      { $set: { key, lat: v.lat, lng: v.lng, name: v.name, road: "", locality: v.locality, district: v.district, found: true, source: "demo", fetchedAt: new Date() } },
      { upsert: true },
    );
  }
  must(await call("POST", "/api/sales/tasks", salesToken, {
    type: "lead_generation", title: "Village round — Pipili block", instructions: "Meet paddy farmers near the market; note irrigation.",
    stageKey: "contacted", assignments: [{ employeeId: priya.id, targetCount: 6 }, { employeeId: amit.id, targetCount: 5 }],
  }), "task 1");
  must(await call("POST", "/api/sales/tasks", salesToken, {
    type: "lead_generation", title: "New farmers — Balakati", instructions: "Focus on vegetable growers.",
    stageKey: "contacted", assignments: [{ employeeId: sunita.id, targetCount: 4 }],
  }), "task 2");
  for (const [name, phone, village] of [["Sanatan Pradhan", "9437000101", "Pipili"], ["Kuni Behera", "9437000102", "Balakati"], ["Bijay Sethi", "9437000103", "Jatni"]]) {
    await call("POST", "/api/sales/leads", salesToken, { name, phone, category: "farmer", address: { village } });
  }

  // Priya's day yesterday: on duty 09:40, three stops, off duty 17:20.
  const y = istDay(-1);
  const pt = tok[priya.phone];
  const APP = { "X-App-Version": "2.1.0", "X-App-Build": "3", "X-Device": "Samsung Galaxy M14", "X-OS": "Android 14" };
  await call("POST", "/api/field/duty", pt, { events: [{ state: "on", at: at(y, "09:40").toISOString(), ref: `demo-on-${y}`, lat: route[0].lat, lng: route[0].lng }] }, APP);
  const pings = [];
  let t = at(y, "09:41").getTime();
  const legs = [[0, 1, 25], [1, 2, 40], [2, 3, 35], [3, 0, 30]]; // from, to, minutes on the road
  const stays = { 1: 35, 2: 50, 3: 25 };
  for (const [a, b, mins] of legs) {
    const A = route[a], B = route[b];
    for (let i = 1; i <= mins; i += 2) {
      const f = i / mins;
      pings.push({ lat: A.lat + (B.lat - A.lat) * f + (Math.random() - 0.5) * 0.0004, lng: A.lng + (B.lng - A.lng) * f + (Math.random() - 0.5) * 0.0004, accuracy: rnd(6, 18), recordedAt: new Date(t).toISOString(), isMoving: true, speed: rnd(6, 12), battery: rnd(40, 90) });
      t += 120000;
    }
    if (stays[b]) {
      for (let i = 0; i < stays[b]; i += 3) {
        pings.push({ lat: B.lat + (Math.random() - 0.5) * 0.0003, lng: B.lng + (Math.random() - 0.5) * 0.0003, accuracy: rnd(5, 15), recordedAt: new Date(t).toISOString(), isMoving: false, speed: 0, battery: rnd(40, 90) });
        t += 180000;
      }
    }
  }
  for (let i = 0; i < pings.length; i += 40) {
    must(await call("POST", "/api/field/location/batch", pt, { batchId: `demo-${y}-${i}`, pings: pings.slice(i, i + 40) }, APP), "pings");
  }
  await call("POST", "/api/field/duty", pt, { events: [{ state: "off", at: new Date(Math.min(t, at(y, "17:20").getTime())).toISOString(), ref: `demo-off-${y}`, lat: route[0].lat, lng: route[0].lng }] }, APP);
  console.log(`Priya's round: ${pings.length} fixes`);

  // Two farmers she met on it — recorded on the phone, waiting for the desk.
  const boot = must(await call("GET", "/api/field/bootstrap", pt, null, APP), "bootstrap");
  const task = (boot.data.tasks || [])[0];
  const template = (boot.data.templates || []).find((x) => x.stageKey === "contacted");
  if (task && template) {
    // At the stops, while she was there: Balakati 10:07–10:43, Pipili 11:23–12:14.
    for (const [i, farmer] of [["Laxmi Nayak", "9437000202", 1, "10:25"], ["Gopinath Swain", "9437000201", 2, "11:45"]].entries()) {
      const stop = route[farmer[2]];
      const when = at(y, farmer[3]).toISOString();
      await call("POST", "/api/field/submissions", pt, {
        clientRef: `demo-visit-${i}`, taskId: task.id || task._id, templateId: template.id,
        newLead: { name: farmer[0], phone: farmer[1], category: "farmer", address: { village: stop.locality } },
        values: { met_in_person: true, crop: "paddy", land_size: 3 + i, irrigation: "yes", irrigation_type: "canal", interest: 4, remarks: "Interested in a demo plot" },
        location: { lat: stop.lat, lng: stop.lng, accuracy: 9, capturedAt: when },
        outcome: "progressed", capturedAt: when,
      }, APP);
    }
  }

  // The rest of the team opened the app this week (for HR's Mobile app page).
  for (const p of [rakesh, amit, sunita, manoj, anjali]) {
    await call("GET", "/api/employee/notifications", tok[p.phone], null, { ...APP, "X-Device": p === rakesh ? "OnePlus Nord CE 3" : "Redmi Note 12" });
  }

  /* ── 7. HR says hello ──────────────────────────────────────────────────── */
  must(await call("POST", "/api/hr/announcements", hrToken, {
    title: "Welcome to the Matrubhoomi employee app",
    body: "Attendance, leave, payslips, letters and approvals are all here now. Field staff: start duty when you leave for your round — your route and visits are recorded for you.",
  }), "announcement");

  await mongoose.disconnect();
  console.log("\nDemo company ready.");
})().catch(async (e) => {
  console.error("seedDemo failed:", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
