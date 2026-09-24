"use strict";
// scripts/crossViewFlow_test.js
//
// The CMS and the employee app are two windows onto one database. This checks
// that what one side does shows up, correctly, on the other — for the things
// people notice first when it does not:
//
//   1. leave balances — the CMS list, the CMS add-leave panel and the phone
//      show the same days, before and after every kind of decision;
//   2. HR's add-leave — paid as far as the balance goes, unpaid beyond it;
//   3. documents — HR issues and withdraws, the employee asks, HR fulfils or
//      declines, and the phone sees each step and can open the PDF;
//   4. sales tasks — handed out, moved to someone else, called off, in order;
//   5. the sign-in email — sent when HR creates someone, again on request and
//      on a password reset, and saying what the app actually signs in with.
//
// No email leaves the machine: this script catches them itself on a local
// port, standing in for Brevo, and refuses to run if BREVO_API_URL points
// anywhere else.
//
// RUN IT AGAINST A SCRATCH DATABASE. NOT PRODUCTION, AND NOT YOUR DEV DATABASE.
//
//   # both terminals — every outside integration blanked, email caught locally
//   export MONGODB_URI=mongodb://127.0.0.1:27017/cross_scratch PORT=5099 \
//     JWT_SECRET=smoke_secret_key SALARY_ENCRYPTION_KEY=<64 hex chars> \
//     ENABLE_EMAILS=true BREVO_API_KEY=test-key \
//     BREVO_API_URL=http://127.0.0.1:5199/v3 MEDIA_STORAGE=local \
//     MEDIA_LOCAL_DIR=<a scratch folder> PUBLIC_API_BASE_URL=http://127.0.0.1:5099
//   node server.js                              # terminal 1
//   node scripts/crossViewFlow_test.js          # terminal 2

const http = require("http");
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
async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return null;
}

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** YYYY-MM-DD, `n` days after the first of next month (this month in December). */
function D(n) {
  const d = new Date();
  const ahead = d.getUTCMonth() === 11 ? 0 : 1;
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + ahead, 1));
  first.setUTCDate(first.getUTCDate() + n);
  return first.toISOString().slice(0, 10);
}

/* ── A stand-in for Brevo ─────────────────────────────────────────── */

const mail = [];
function startMailCatcher() {
  const url = new URL(process.env.BREVO_API_URL || "http://127.0.0.1:5199/v3");
  if (!/^(127\.0\.0\.1|localhost)$/.test(url.hostname)) {
    throw new Error("BREVO_API_URL must point at this machine for this test — refusing to risk a real email.");
  }
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.method === "POST" && req.url.endsWith("/smtp/email")) {
          try { mail.push({ apiKey: req.headers["api-key"], ...JSON.parse(body) }); } catch { /* counted as missing */ }
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ messageId: `<caught-${mail.length}@scratch>` }));
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end("{}");
        }
      });
    });
    srv.on("error", reject);
    srv.listen(Number(url.port || 80), "127.0.0.1", () => resolve(srv));
  });
}
const mailTo = (addr, subject) =>
  mail.filter((m) => (m.to || []).some((t) => t.email === addr) && (!subject || subject.test(m.subject || "")));

/* ── A tiny real PDF ──────────────────────────────────────────────── */

function tinyPdf(label) {
  const text = `BT /F1 18 Tf 72 720 Td (${label}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

(async () => {
  const catcher = await startMailCatcher();
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cross_scratch");
  await require("./_waitForIndexes")(mongoose);
  const Employee = require("../models/Employee");
  const Department = require("../models/HR_Models/Departments");
  const AccessDepartment = require("../models/Access/AccessDepartment");
  const { LeaveBalance, LeaveApplication } = require("../models/HR_Models/LeaveManagement");

  const DOMAIN = "crossview.test";
  const PHONES = { mgr: "9855000001", asha: "9855000002", ravi: "9855000003", nita: "9855000004", sam: "9855000005", tara: "9855000006" };
  await Employee.deleteMany({ email: new RegExp(`@${DOMAIN.replace(".", "\\.")}$`) });
  await Employee.deleteMany({ phone: { $in: Object.values(PHONES) } });
  const mkDept = (name, desig) => Department.findOneAndUpdate(
    { name }, { $setOnInsert: { name, designations: [{ name: desig }] } }, { upsert: true, new: true });
  const stores = await mkDept("Stores", "Storekeeper");
  const salesDept = await mkDept("Sales", "Field Sales Executive");

  const desk = (role, name) => jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role, email: `${role}@example.test`, name }, SECRET, { expiresIn: "1h" });
  const hr = desk("hr_manager", "Hema HR");
  const salesDesk = desk("sales_manager", "Sunil Desk");

  // A published app release, so the welcome email has something to link to.
  const APP_URL = "https://downloads.example.test/matrubhoomi-employee-2.1.2.apk";
  let r = await call("POST", "/api/hr/app/versions", hr, { version: "2.1.2", versionCode: 5, downloadUrl: APP_URL, app: "employee", releaseNotes: "Smaller text" });
  if (r.status >= 300) console.log("  (note) publishing the test release:", r.status, r.json?.message);

  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const people = {};
  const hire = async (key, first, dept, desig, joinedDaysAgo, manager) => {
    const res = await call("POST", "/api/employees", hr, {
      firstName: first, lastName: "Cross", email: `${key}@${DOMAIN}`, phone: PHONES[key], gender: "Female",
      department: dept.name, departmentId: String(dept._id), designation: desig,
      dateOfJoining: daysAgo(joinedDaysAgo), confirmationDate: daysAgo(joinedDaysAgo), employmentType: "full_time",
      workShift: { mode: "general" }, salary: { gross: 24000 }, biometricId: `CRV${Object.keys(PHONES).indexOf(key)}`,
      ...(manager ? { primaryManager: { managerId: manager.id, managerName: manager.name } } : {}),
    });
    if (res.status !== 201) throw new Error(`hire ${key}: ${res.status} ${res.json?.message}`);
    people[key] = { id: String(res.json.data._id), phone: PHONES[key], email: `${key}@${DOMAIN}`, name: `${first} Cross`, created: res.json };
    return people[key];
  };

  // Ravi's balance row predates his PL: written before he had 240 days in,
  // the way every row the old approve path created looked. HR's add-leave used
  // to cap the deduction at that stale 0.
  const Y = Number(D(3).slice(0, 4));
  const mgr = await hire("mgr", "Mala", stores, "Storekeeper", 900);
  const asha = await hire("asha", "Asha", stores, "Storekeeper", 400, mgr);
  const ravi = await hire("ravi", "Ravi", stores, "Storekeeper", 300);
  const nita = await hire("nita", "Nita", stores, "Storekeeper", 60, mgr);
  const sam = await hire("sam", "Sam", salesDept, "Field Sales Executive", 200);
  const tara = await hire("tara", "Tara", salesDept, "Field Sales Executive", 200);
  await LeaveBalance.deleteMany({ employeeId: { $in: Object.values(people).map((p) => p.id) } });
  await LeaveBalance.create({ employeeId: ravi.id, year: Y, entitlement: { CL: 5, SL: 5, PL: 0 }, consumed: { CL: 0, SL: 0, PL: 0 }, plEligible: false });

  const tok = {};
  for (const [k, phone] of Object.entries(PHONES)) {
    const res = await call("POST", "/api/employee/auth/login", null, { phoneNumber: phone, password: phone });
    tok[k] = res.json?.data?.token;
  }
  const inbox = async (who) => (await call("GET", "/api/employee/notifications", tok[who])).json?.data || [];
  const told = (who, re) => waitFor(async () => (await inbox(who)).find((n) => re.test(`${n.title} ${n.body}`)) || null, 4000);

  /* ================================================================ */
  heading(1, "Leave balances — the CMS and the phone show the same days");

  const cfg = (await call("GET", "/api/hr/leaves/config", hr)).json?.data;
  check("the leave policy is readable", cfg && cfg.clPerYear > 0 && cfg.plPerYear > 0, cfg);
  const CL = cfg.clPerYear, SL = cfg.slPerYear, PL = cfg.plPerYear;

  r = await call("POST", "/api/hr/leaves/add-on-behalf", hr, { employeeId: ravi.id, leaveType: "PL", startDate: D(3), endDate: D(4), reason: "Family trip" });
  check("HR adds 2 days of PL for Ravi in the CMS", r.status === 200 && r.json?.success, [r.status, r.json?.message]);
  check("…all of it paid: he earned PL long ago, whatever his old balance row said", r.json?.paidDays === 2 && r.json?.lwpDays === 0, [r.json?.paidDays, r.json?.lwpDays]);
  let row = await LeaveBalance.findOne({ employeeId: ravi.id, year: Y }).lean();
  check("…and the 2 days really came off his balance (they used to be capped at 0)",
    row?.consumed?.PL === 2 && row?.plEligible === true && row?.entitlement?.PL === PL, row && [row.consumed, row.entitlement, row.plEligible]);

  const cmsList = async () => (await call("GET", `/api/hr/leaves/all-balances?year=${Y}`, hr)).json?.data?.rows || [];
  const cmsPanel = async (id) => (await call("GET", `/api/hr/leaves/employee-balance/${id}?year=${Y}`, hr)).json?.data;
  const onPhone = async (who) => (await call("GET", `/api/employee/leave-applications/balance?year=${Y}`, tok[who])).json?.data;
  const same = (a, b) => ["CL", "SL", "PL"].every((t) => a?.[t] === b?.[t]);
  async function agree(label, who, expect = {}) {
    const id = people[who].id;
    const [list, panel, p] = [await cmsList(), await cmsPanel(id), await onPhone(who)];
    const c = list.find((x) => x.employeeId === id);
    const ok = c && panel && p &&
      same(c.entitlement, p.entitlement) && same(c.consumed, p.consumed) && same(c.available, p.available) &&
      same(c.reserved, p.reserved) && same(c.effectiveAvailable, p.effectiveAvailable) &&
      same(panel.available, p.available) && same(panel.reserved, p.reserved) && same(panel.effectiveAvailable, p.effectiveAvailable) &&
      c.plEligible === !!p.balance?.plEligible;
    check(`${label}: the CMS list, the CMS add-leave panel and the phone agree`, ok, {
      cms: c && { avail: c.available, held: c.reserved, left: c.effectiveAvailable, pl: c.plEligible },
      panel: panel && { avail: panel.available, held: panel.reserved },
      phone: p && { avail: p.available, held: p.reserved, left: p.effectiveAvailable, pl: p.balance?.plEligible },
    });
    for (const [path, want] of Object.entries(expect)) {
      const [bucket, t] = path.split(".");
      check(`   …${path} is ${want}`, p?.[bucket]?.[t] === want, p?.[bucket]?.[t]);
    }
  }

  await agree("Ravi, after HR's add-leave", "ravi", { "effectiveAvailable.PL": PL - 2, "consumed.PL": 2 });
  await agree("Asha (400 days in), before anything", "asha", { "entitlement.PL": PL, "effectiveAvailable.CL": CL });
  await agree("Nita (60 days in), before anything", "nita", { "entitlement.PL": 0, "effectiveAvailable.CL": CL });

  const apply = (who, body) => call("POST", "/api/employee/leave-applications", tok[who], { applicationDate: new Date().toISOString().slice(0, 10), reason: "Family function", ...body });
  r = await apply("asha", { leaveType: "CL", fromDate: D(6), toDate: D(7) });
  check("Asha applies for 2 days of CL on her phone", r.status === 201 || r.status === 200, [r.status, r.json?.message]);
  const ashaCL = r.json?.data?._id;
  await agree("Asha's request waiting", "asha", { "reserved.CL": 2, "available.CL": CL, "effectiveAvailable.CL": CL - 2 });
  const heldRow = (await cmsList()).find((x) => x.employeeId === asha.id);
  check("…the CMS list shows the 2 days as on hold", heldRow?.reserved?.CL === 2, heldRow?.reserved);

  r = await call("PATCH", `/api/employee/leave-applications/manager/${ashaCL}/approve`, tok.mgr, { remarks: "Enjoy" });
  check("Mala, her manager, approves it", r.status === 200, [r.status, r.json?.message]);
  await agree("Asha's leave approved", "asha", { "consumed.CL": 2, "reserved.CL": 0, "effectiveAvailable.CL": CL - 2 });
  check("…and Asha was told", !!(await told("asha", /approved/i)));

  r = await call("PATCH", `/api/hr/leaves/${ashaCL}/cancel`, hr, { cancelReason: "Stock audit that week." });
  check("HR withdraws it from the CMS", r.status === 200 && /restored/.test(r.json?.message || ""), [r.status, r.json?.message]);
  await agree("Asha's leave withdrawn by HR", "asha", { "consumed.CL": 0, "effectiveAvailable.CL": CL });
  const w = await told("asha", /withdrawn by HR/i);
  check("…and Asha is told, with the days back and HR's reason", !!w && /2 days went back/.test(w.body) && /Stock audit/.test(w.body), w && w.body);

  r = await apply("asha", { leaveType: "SL", fromDate: D(9), toDate: D(9) });
  const ashaSL = r.json?.data?._id;
  check("Asha applies for a day of SL", !!ashaSL, [r.status, r.json?.message]);
  r = await call("PATCH", `/api/hr/leaves/${ashaSL}/approve`, hr, { remarks: "" });
  check("HR cannot approve over her manager's head", r.status === 400, [r.status, r.json?.message]);
  r = await call("PATCH", `/api/hr/leaves/${ashaSL}/reject`, hr, { rejectionReason: "Please apply after the audit." });
  check("HR turns it down", r.status === 200, [r.status, r.json?.message]);
  await agree("Asha's SL turned down", "asha", { "reserved.SL": 0, "consumed.SL": 0, "effectiveAvailable.SL": SL });
  check("…and Asha is told why", !!(await told("asha", /after the audit/)));

  r = await apply("ravi", { leaveType: "CL", fromDate: D(10), toDate: D(10) });
  const raviCL = r.json?.data?._id;
  check("Ravi (no manager) applies for a day of CL", !!raviCL, [r.status, r.json?.message]);
  await agree("Ravi's request waiting", "ravi", { "reserved.CL": 1 });
  r = await call("PATCH", `/api/hr/leaves/${raviCL}/approve`, hr, { remarks: "OK" });
  check("HR approves it in the CMS", r.status === 200, [r.status, r.json?.message]);
  await agree("Ravi's CL approved by HR", "ravi", { "consumed.CL": 1, "reserved.CL": 0, "effectiveAvailable.CL": CL - 1 });

  r = await apply("nita", { leaveType: "CL", fromDate: D(11), toDate: D(11) });
  const nitaCL = r.json?.data?._id;
  await agree("Nita's request waiting", "nita", { "reserved.CL": 1 });
  r = await call("PATCH", `/api/employee/leave-applications/${nitaCL}/cancel`, tok.nita, { cancelReason: "Plans changed" });
  check("Nita withdraws her own request on the phone", r.status === 200, [r.status, r.json?.message]);
  await agree("Nita's request withdrawn", "nita", { "reserved.CL": 0, "effectiveAvailable.CL": CL });

  /* ================================================================ */
  heading(2, "HR's add-leave — paid as far as the balance goes, unpaid beyond");

  r = await call("POST", "/api/hr/leaves/add-on-behalf", hr, { employeeId: ravi.id, leaveType: "CL", startDate: D(14), endDate: D(14 + CL - 1), reason: "Village festival" });
  check(`HR adds ${CL} days of CL for Ravi, who has ${CL - 1} left`, r.status === 200, [r.status, r.json?.message]);
  check(`…${CL - 1} paid and 1 unpaid, and HR is told so`, r.json?.paidDays === CL - 1 && r.json?.lwpDays === 1 && /unpaid/.test(r.json?.message || ""), [r.json?.paidDays, r.json?.lwpDays, r.json?.message]);
  const booked = await LeaveApplication.findById(r.json?.data?._id).lean();
  check("…the leave itself records the unpaid day, which is what payroll reads", booked?.paidDays === CL - 1 && booked?.lwpDays === 1, booked && [booked.paidDays, booked.lwpDays]);
  await agree("Ravi after the festival", "ravi", { "consumed.CL": CL, "effectiveAvailable.CL": 0 });

  r = await call("POST", "/api/hr/leaves/add-on-behalf", hr, { employeeId: nita.id, leaveType: "PL", startDate: D(20), endDate: D(20), reason: "Wedding" });
  check("HR adds a day of PL for Nita, who has not earned PL yet — it goes down as unpaid", r.status === 200 && r.json?.paidDays === 0 && r.json?.lwpDays === 1, [r.status, r.json?.paidDays, r.json?.lwpDays]);
  await agree("Nita after it", "nita", { "consumed.PL": 0, "entitlement.PL": 0 });

  /* ================================================================ */
  heading(3, "Documents — issued in the CMS, seen and opened on the phone");

  const issue = async (fields, label = "Letter") => {
    const fd = new FormData();
    fd.append("document", new Blob([tinyPdf(label)], { type: "application/pdf" }), `${label.replace(/\W+/g, "-")}.pdf`);
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    const res = await fetch(`${BASE}/api/hr/documents`, { method: "POST", headers: { Authorization: "Bearer " + hr }, body: fd });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const myDocs = async (who) => (await call("GET", "/api/employee/documents", tok[who])).json?.data || [];
  const myDoc = async (who, id) => (await myDocs(who)).find((d) => d._id === id);

  r = await issue({ employeeId: asha.id, type: "appointment", releaseNow: "true" }, "Appointment letter");
  const appointment = r.json?.data?._id;
  check("HR issues Asha's appointment letter, released straight away", r.status === 201 && !!appointment && r.json?.released === true, [r.status, r.json?.message]);
  let doc = await myDoc("asha", appointment);
  check("…it is on Asha's phone, ready", doc?.status === "available" && !!doc?.file?.fileName, doc);
  check("…and she was told", !!(await told("asha", /Document ready/i)));
  r = await call("GET", `/api/employee/documents/${appointment}/file`, tok.asha);
  const fileUrl = r.json?.data?.fileUrl;
  check("…the phone gets a link to open it", r.status === 200 && /\/download\?t=/.test(fileUrl || ""), [r.status, fileUrl]);
  if (fileUrl) {
    const res = await fetch(fileUrl.startsWith("http") ? fileUrl : BASE + fileUrl);
    const bytes = Buffer.from(await res.arrayBuffer());
    check("…and the link opens the actual PDF", res.status === 200 && bytes.slice(0, 5).toString() === "%PDF-", [res.status, bytes.slice(0, 8).toString()]);
  }
  r = await call("GET", `/api/employee/documents/${appointment}/file`, tok.nita);
  check("…Nita cannot open Asha's letter", r.status === 404 || r.status === 403, r.status);

  r = await issue({ employeeId: asha.id, type: "salary_certificate" }, "Salary certificate");
  const salaryCert = r.json?.data?._id;
  check("HR prepares a salary certificate without releasing it", r.status === 201 && r.json?.released === false, [r.status, r.json?.released]);
  check("…Asha cannot see it yet", !(await myDoc("asha", salaryCert)));
  r = await call("PATCH", `/api/hr/documents/${salaryCert}/release`, hr, { note: "" });
  check("HR releases it", r.status === 200, [r.status, r.json?.message]);
  doc = await myDoc("asha", salaryCert);
  check("…now it is on her phone", doc?.status === "available", doc?.status);
  r = await call("PATCH", `/api/hr/documents/${salaryCert}/revoke`, hr, { reason: "Wrong month on it" });
  check("HR withdraws it", r.status === 200, [r.status, r.json?.message]);
  doc = await myDoc("asha", salaryCert);
  check("…her phone shows it as withdrawn", doc?.status === "withdrawn", doc?.status);
  r = await call("GET", `/api/employee/documents/${salaryCert}/file`, tok.asha);
  check("…and it can no longer be opened", r.status === 404 || r.status === 403 || r.status === 409, r.status);
  check("…and she was told", !!(await told("asha", /Document withdrawn/i)));

  r = await call("POST", "/api/employee/documents/requests", tok.asha, { type: "experience", reason: "For a bank loan" });
  const expReq = r.json?.data?._id;
  check("Asha asks for an experience letter on her phone", (r.status === 201 || r.status === 200) && !!expReq, [r.status, r.json?.message]);
  r = await call("POST", "/api/employee/documents/requests", tok.asha, { type: "experience", reason: "again" });
  check("…asking twice is refused while the first is open", r.status === 409, [r.status, r.json?.code]);
  r = await call("POST", "/api/employee/documents/requests", tok.asha, { type: "warning", reason: "?" });
  check("…a warning letter is not something an employee can ask for", r.status === 400, [r.status, r.json?.code]);
  r = await call("GET", "/api/hr/documents/requests?status=requested", hr);
  const queued = (r.json?.data || []).find((x) => String(x._id) === expReq);
  check("HR sees the request in the CMS queue", !!queued && (r.json?.counts?.requested ?? 0) >= 1, [r.status, r.json?.counts]);
  r = await issue({ employeeId: asha.id, type: "experience", requestId: expReq, releaseNow: "true" }, "Experience letter");
  check("HR generates it against the request and releases it", r.status === 201 && r.json?.released === true, [r.status, r.json?.message]);
  doc = await myDoc("asha", expReq);
  check("…the request on her phone turns into the letter", doc?.status === "available", doc?.status);
  r = await call("GET", "/api/hr/documents/requests?status=requested", hr);
  check("…and it leaves HR's queue", !(r.json?.data || []).some((x) => String(x._id) === expReq));

  r = await call("POST", "/api/employee/documents/requests", tok.asha, { type: "relieving", reason: "Just in case" });
  const relReq = r.json?.data?._id;
  r = await call("PATCH", `/api/hr/documents/${relReq}/decline`, hr, { reason: "You are still with us — ask when you leave." });
  check("HR declines a relieving-letter request", r.status === 200, [r.status, r.json?.message]);
  doc = await myDoc("asha", relReq);
  check("…her phone shows it declined, with HR's reason", doc?.status === "declined" && /still with us/.test(doc?.declineReason || ""), doc && [doc.status, doc.declineReason]);

  r = await call("POST", "/api/employee/documents/requests", tok.asha, { type: "offer", reason: "Lost my copy" });
  const offerReq = r.json?.data?._id;
  r = await call("PATCH", `/api/employee/documents/${offerReq}/cancel`, tok.asha, { reason: "Found it" });
  check("Asha takes back a request she no longer needs", r.status === 200, [r.status, r.json?.message]);
  r = await call("GET", "/api/hr/documents/requests?status=cancelled", hr);
  check("…HR's CMS shows it as cancelled, not waiting", (r.json?.data || []).some((x) => String(x._id) === offerReq));

  /* ================================================================ */
  heading(4, "Sales tasks — handed out, moved, called off");

  const stages = (await call("GET", "/api/sales/stages", salesDesk)).json?.data || [];
  const stageKey = stages[0]?.key;
  check("the sales stages are there", !!stageKey, stages.length);
  const bootTasks = async (who) => (await call("GET", "/api/field/bootstrap", tok[who])).json?.data?.tasks || [];
  const assign = (who, extra = {}) => call("POST", "/api/sales/tasks", salesDesk, {
    type: "lead_generation", title: extra.title || "Round — Shirur east", stageKey,
    assignments: [{ employeeId: people[who].id, targetCount: 2 }], ...extra,
  });

  r = await assign("sam");
  const task = r.json?.data?.[0]?._id;
  check("the desk gives Sam a round", r.status === 201 && !!task, [r.status, r.json?.message]);
  let mine = (await bootTasks("sam")).find((t) => t.id === task);
  check("…it is on Sam's phone", mine?.status === "assigned", mine?.status);
  check("…not on Tara's", !(await bootTasks("tara")).some((t) => t.id === task));
  check("…and Sam was told", !!(await told("sam", /New assignment/)));
  r = await call("POST", `/api/field/tasks/${task}/accept`, tok.sam);
  mine = (await bootTasks("sam")).find((t) => t.id === task);
  check("Sam opens it, which accepts it", r.status === 200 && mine?.status === "accepted", [r.status, mine?.status]);

  r = await call("POST", `/api/sales/tasks/${task}/reassign`, salesDesk, { employeeId: tara.id, reason: "Sam is on leave" });
  check("the desk moves it to Tara", r.status === 200, [r.status, r.json?.message]);
  check("…it is gone from Sam's phone", !(await bootTasks("sam")).some((t) => t.id === task));
  mine = (await bootTasks("tara")).find((t) => t.id === task);
  check("…and on Tara's, as fresh work", mine?.status === "assigned", mine?.status);
  const toldSam = await told("sam", /Assignment moved/);
  check("…Sam is told it went to Tara, and why", !!toldSam && /Tara/.test(toldSam.body) && /on leave/.test(toldSam.body), toldSam && toldSam.body);
  const toldTara = await told("tara", /New assignment/);
  check("…Tara is told it came from Sam", !!toldTara && /from Sam/.test(toldTara.body), toldTara && toldTara.body);
  r = await call("POST", `/api/field/tasks/${task}/accept`, tok.sam);
  check("…Sam's phone can no longer accept it — it says the task moved", r.status === 409 && r.json?.code === "TASK_MOVED", [r.status, r.json?.code]);
  r = await call("GET", `/api/field/tasks/${task}`, tok.sam);
  check("…or open it", r.status === 404, r.status);
  r = await call("POST", "/api/field/tasks/not-an-id/accept", tok.sam);
  check("…a malformed task id is 'no such record', not a crash", r.status === 404, r.status);

  r = await call("POST", `/api/sales/tasks/${task}/reassign`, salesDesk, { employeeId: tara.id });
  check("moving it to the person who already has it is refused", r.status === 409, [r.status, r.json?.message]);
  r = await call("POST", `/api/sales/tasks/${task}/reassign`, salesDesk, { employeeId: asha.id });
  check("moving it to someone outside sales is refused — their app would never show it", r.status === 409 && r.json?.code === "NOT_FIELD_STAFF", [r.status, r.json?.code, r.json?.message]);
  r = await assign("asha");
  check("…and so is handing them new sales work", r.status === 409 && /not in the sales team/.test(r.json?.message || ""), [r.status, r.json?.message]);

  r = await call("POST", `/api/field/tasks/${task}/accept`, tok.tara);
  r = await call("GET", `/api/sales/tasks/${task}`, salesDesk);
  const onDesk = r.json?.data?.task || r.json?.data;
  check("Tara accepts it, and the desk sees her name and the new status", onDesk?.status === "accepted" && String(onDesk?.assignedTo) === tara.id, onDesk && [onDesk.status, onDesk.assignedToName]);

  r = await call("POST", `/api/sales/tasks/${task}/cancel`, salesDesk, { reason: "Route changed" });
  check("the desk calls it off", r.status === 200, [r.status, r.json?.message]);
  check("…it is gone from Tara's phone", !(await bootTasks("tara")).some((t) => t.id === task));
  check("…and she was told why", !!(await told("tara", /cancelled.*Route changed|Route changed/)));
  r = await call("POST", `/api/sales/tasks/${task}/cancel`, salesDesk, { reason: "again" });
  check("…calling it off twice is refused (no second notification)", r.status === 409, r.status);
  r = await call("POST", `/api/sales/tasks/${task}/reassign`, salesDesk, { employeeId: sam.id });
  check("…and a cancelled task cannot be moved", r.status === 409, r.status);
  r = await call("POST", `/api/field/tasks/${task}/accept`, tok.tara);
  check("…Tara's phone cannot accept it any more", r.status === 409 && r.json?.code === "TASK_CLOSED", [r.status, r.json?.code]);

  const when = new Date(Date.now() + 2 * 86400000).toISOString();
  for (const [priority, title] of [["low", "P-low"], ["urgent", "P-urgent"], ["high", "P-high"]]) {
    await assign("tara", { title, priority, scheduledFor: when });
  }
  const order = (await bootTasks("tara")).filter((t) => /^P-/.test(t.title)).map((t) => t.title);
  check("tasks due together are listed most urgent first (not alphabetically)", order.join(",") === "P-urgent,P-high,P-low", order);

  /* ================================================================ */
  heading(5, "The sign-in email");

  check("creating someone reports that their sign-in email is on its way", asha.created.loginEmail === "sending", asha.created.loginEmail);
  const welcome = await waitFor(async () => mailTo(asha.email, /how to sign in/i)[0] || null);
  check("Asha's welcome email arrived", !!welcome, mail.map((m) => [m.to?.[0]?.email, m.subject]));
  if (welcome) {
    const text = welcome.textContent || "";
    check("…it gives her phone number to sign in with", text.includes(`Phone number:       ${asha.phone}`), text.slice(0, 300));
    check("…and her phone number as the temporary password", text.includes(`Temporary password: ${asha.phone}`));
    check("…says the app will ask her to choose her own", /choose your own password/.test(text));
    check("…links the app HR published", text.includes(APP_URL) && (welcome.htmlContent || "").includes(APP_URL));
    check("…names her manager and ID", /Reporting manager: Mala Cross/.test(text) && /Employee ID CRV1/.test(text), text.slice(-400));
    check("…and no longer points at the old web address", !/hrms\.matrubhoomifarms\.in/.test(text + welcome.htmlContent));
    check("…nothing reads 'undefined' or 'null'", !/undefined|null/.test(text + welcome.htmlContent));
    check("…sent from the configured HR sender, with the configured key", welcome.sender?.email === process.env.HR_SENDER_EMAIL && welcome.apiKey === process.env.BREVO_API_KEY, [welcome.sender, !!welcome.apiKey]);
  }
  const recorded = await waitFor(async () => (await Employee.findById(asha.id).select("welcomeEmailSent emailSentAt").lean())?.welcomeEmailSent === true);
  check("…and her record says it went", !!recorded);
  r = await call("GET", `/api/employees/${asha.id}/details`, hr);
  check("…which her CMS profile shows", r.json?.data?.loginInfo?.emailSent === true, r.json?.data?.loginInfo);

  const before = mailTo(nita.email).length;
  r = await call("POST", `/api/employees/${nita.id}/send-login-details`, hr);
  check("HR emails Nita her sign-in details again", r.status === 200 && r.json?.data?.emailedTo === nita.email, [r.status, r.json?.message]);
  check("…and it arrives", mailTo(nita.email).length === before + 1 && mailTo(nita.email, /sign-in details/i).length >= 1);

  r = await call("PUT", "/api/employee/change-password", tok.nita, { currentPassword: nita.phone, newPassword: "Lotus#2026" });
  check("Nita chooses her own password", r.status === 200, [r.status, r.json?.message]);
  r = await call("POST", `/api/employees/${nita.id}/send-login-details`, hr);
  check("…after which there is nothing to email — HR is pointed at a reset", r.status === 409 && r.json?.code === "PASSWORD_ALREADY_SET", [r.status, r.json?.code]);

  r = await call("POST", `/api/hr/password-management/reset-password/employee/${nita.id}`, hr, {});
  check("HR resets Nita's password", r.status === 200 && r.json?.temporaryPassword === nita.phone, [r.status, r.json?.message]);
  check("…and the CMS is told it was emailed to her", r.json?.emailedTo === nita.email, r.json?.emailedTo);
  const reset = mailTo(nita.email, /password was reset/i)[0];
  check("…the reset email carries the temporary password", !!reset && (reset.textContent || "").includes(`Temporary password: ${nita.phone}`), reset && reset.subject);
  r = await call("POST", "/api/employee/auth/login", null, { phoneNumber: nita.phone, password: nita.phone });
  check("…which signs her in, and she is asked to choose a new one", r.status === 200 && r.json?.data?.mustChangePassword === true, [r.status, r.json?.data?.mustChangePassword]);

  const salesAccess = await AccessDepartment.findOne({ key: "sales" }).select("_id").lean();
  if (salesAccess) {
    await Employee.updateOne({ _id: tara.id }, { $set: { accessDepartmentId: salesAccess._id } });
    r = await call("POST", `/api/employees/${tara.id}/send-login-details`, hr);
    const deskMail = mailTo(tara.email, /sign-in details/i).pop();
    check("someone with desk access is also told how to reach the CMS", r.status === 200 && /\/login/.test(deskMail?.textContent || "") && (deskMail?.textContent || "").includes(tara.email), deskMail && deskMail.textContent);
  }
  r = await call("POST", `/api/employees/${new mongoose.Types.ObjectId()}/send-login-details`, hr);
  check("an unknown employee is a 404", r.status === 404, r.status);
  r = await call("POST", "/api/employees/not-an-id/send-login-details", hr);
  check("…and so is a malformed id", r.status === 404, r.status);
  r = await call("POST", `/api/employees/${asha.id}/send-login-details`, tok.asha);
  check("an employee's own app token cannot send it", r.status === 401 || r.status === 403, r.status);

  /* ================================================================ */
  console.log(`\n${pass} passed, ${fail} failed`);
  catcher.close();
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error("CRASH", e);
  await mongoose.disconnect().catch(() => {});
  process.exit(2);
});
