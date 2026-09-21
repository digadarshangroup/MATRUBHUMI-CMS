"use strict";
// scripts/salesFlow_test.js
//
// The whole sales round, end to end, against a REAL server and a SCRATCH
// database — desk assigns, phone records, desk reads it back.
//
// WHY THIS EXISTS RATHER THAN UNIT TESTS
// --------------------------------------
// Almost everything that can go wrong in this module is an interaction:
// a submission touches five documents, an OTP is spendable exactly once, a
// distance is the product of three filters applied in order, and the app and
// the desk hold two different identities against the same data. None of those
// is visible from inside one function.
//
// It has already earned its keep twice: it caught a shadowed variable in
// /bootstrap that made the app unusable, and a live board that took an
// impossible GPS fix as an employee's position.
//
// RUN IT AGAINST A SCRATCH DATABASE. NOT PRODUCTION, AND NOT YOUR DEV DATABASE.
// It creates an employee, leads, tasks and location fixes and does not clean up
// after itself — the point is to be able to look at what it made.
//
//   # terminal 1
//   MONGODB_URI=mongodb://127.0.0.1:27017/sales_scratch PORT=5099 //     JWT_SECRET=smoke_secret_key SALARY_ENCRYPTION_KEY=<any 32+ hex chars> //     node server.js
//
//   # terminal 2
//   SALARY_ENCRYPTION_KEY=<the same> node scripts/salesFlow_test.js
//
// Exits non-zero on the first failed expectation, so it is usable in CI the day
// there is one.

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:5099";
const SECRET = process.env.JWT_SECRET || "smoke_secret_key";
let pass = 0, fail = 0;

function check(label, ok, detail) {
  if (ok) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label, detail !== undefined ? "->" + JSON.stringify(detail) : ""); }
}

function skip(label, why) { console.log("  SKIP", label, "->" + why); }

/**
 * How far back this run may place a fix and still be inside the local day.
 *
 * Distance is bucketed per day and each bucket anchors its own first point, so
 * a window straddling local midnight loses the step across it — and section 8
 * then fails for a reason that has nothing to do with the code it is testing.
 * Returns a scale factor onto the intended ten-minute window, or 0 when the run
 * is so close to midnight that no usable window exists.
 */
/**
 * `wantMs` before now, pulled forward if that would land on yesterday.
 *
 * The rollups are keyed by LOCAL day, so a test that simulates "captured three
 * hours ago" credits yesterday when it runs after midnight — correctly, which
 * is why the fix belongs here and not in the service.
 */
function backWithinToday(nowMs, wantMs) {
  const tz = process.env.FIELD_TIMEZONE || "Asia/Kolkata";
  const local = new Date(new Date(nowMs).toLocaleString("en-US", { timeZone: tz }));
  const sinceMidnight =
    local.getHours() * 3600000 + local.getMinutes() * 60000 + local.getSeconds() * 1000;
  return Math.max(0, Math.min(wantMs, sinceMidnight - 30000));
}

function todayWindow(nowMs, wantMs) {
  const tz = process.env.FIELD_TIMEZONE || "Asia/Kolkata";
  const local = new Date(new Date(nowMs).toLocaleString("en-US", { timeZone: tz }));
  const sinceMidnight =
    local.getHours() * 3600000 + local.getMinutes() * 60000 + local.getSeconds() * 1000;
  // 30s of margin so the oldest fix cannot land on yesterday by rounding.
  const usable = Math.min(wantMs, sinceMidnight - 30000);
  // Under two minutes the 1.1km step would imply more than the 150km/h ceiling
  // and be thrown out as a teleport, which is a false failure either way.
  return usable < 120000 ? 0 : usable / wantMs;
}

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sales_scratch");
  const Employee = require("../models/Employee");

  // A field employee to act as.
  await Employee.deleteMany({ email: "ramesh.smoke@example.com" });
  const emp = await Employee.create({
    firstName: "Ramesh", lastName: "Patil",
    email: "ramesh.smoke@example.com", phone: "9000000001",
    biometricId: "EMP-SMOKE-1", department: "Sales",
    designation: "Field Sales Executive", gender: "Male", isActive: true, status: "active",
  });
  console.log("Employee:", emp._id.toString());

  const deskToken = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString(), role: "sales_manager", email: "desk@example.com", name: "Sales Desk" },
    SECRET, { expiresIn: "1h" },
  );
  const fieldToken = jwt.sign({ id: emp._id.toString(), email: emp.email, type: "employee" }, SECRET, { expiresIn: "1h" });

  console.log("\n1. Desk reads the pipeline");
  const stages = await call("GET", "/api/sales/stages", deskToken);
  check("8 stages seeded", stages.json?.data?.length === 8, stages.json?.data?.length);
  const firstStage = stages.json.data[0];
  check("first rung is 'contacted'", firstStage.key === "contacted", firstStage?.key);

  const templates = await call("GET", "/api/sales/templates", deskToken);
  check("2 templates seeded", templates.json?.data?.length === 2, templates.json?.data?.length);
  check("first contact form attached to its stage", Boolean(firstStage.templateId), firstStage.templateId);

  console.log("\n2. Desk sees the team");
  const team = await call("GET", "/api/sales/team", deskToken);
  check("Ramesh is listed under Sales", team.json?.data?.some((t) => t.code === "EMP-SMOKE-1"), team.json?.data);

  console.log("\n3. Desk assigns 2 leads to Ramesh");
  const assigned = await call("POST", "/api/sales/tasks", deskToken, {
    type: "lead_generation",
    title: "Monday round — Shirur",
    instructions: "Cover the east side of the village.",
    stageKey: "contacted",
    assignments: [{ employeeId: emp._id.toString(), targetCount: 2 }],
  });
  check("task created", assigned.status === 201, assigned.json);
  const task = assigned.json?.data?.[0];
  check("task has a quotable code", /^TSK-\d{6}$/.test(task?.code || ""), task?.code);
  check("target count carried", task?.targetCount === 2, task?.targetCount);

  console.log("\n4. App bootstraps");
  const boot = await call("GET", "/api/field/bootstrap", fieldToken);
  check("bootstrap ok", boot.status === 200, boot.json);
  check("the task is on the phone", boot.json?.data?.tasks?.length === 1, boot.json?.data?.tasks?.length);
  check("its form came with it", boot.json?.data?.templates?.length >= 1, boot.json?.data?.templates?.length);
  check("tracking cadence supplied", boot.json?.data?.tracking?.intervalSeconds > 0, boot.json?.data?.tracking);
  const template = boot.json.data.templates.find((t) => t.stageKey === "contacted");
  check("template renders 8 fields", template?.fields?.length === 8, template?.fields?.length);

  console.log("\n5. Employee records a visit against a NEW farmer (offline shape)");
  const submission = await call("POST", "/api/field/submissions", fieldToken, {
    clientRef: "smoke-ref-1",
    taskId: task.id || task._id,
    templateId: template.id,
    newLead: { name: "Sunil Jadhav", phone: "9812345678", category: "farmer", address: { village: "Shirur" } },
    values: { met_in_person: true, crop: "paddy", land_size: 4.5, irrigation: "yes", irrigation_type: "borewell", interest: 4, remarks: "Wants a demo" },
    location: { lat: 18.8237, lng: 74.3735, accuracy: 12, capturedAt: new Date().toISOString() },
    outcome: "progressed",
    wasQueued: true,
    // Three hours ago, but never off the end of the local day — the rollup it
    // is later asserted against is keyed by that day.
    capturedAt: new Date(Date.now() - backWithinToday(Date.now(), 3 * 3600 * 1000)).toISOString(),
  });
  check("submission accepted", submission.status === 201, submission.json);
  check("lead created with a code", /^LEAD-\d{6}$/.test(submission.json?.data?.leadCode || ""), submission.json?.data);
  // Submitting is a CLAIM, not a completion. Steps ask for approval by default
  // now, so the customer stays exactly where they were until somebody agrees —
  // this assertion used to read "advanced past contacted" and its inversion is
  // the whole point of the approval work.
  check("customer does NOT advance on submission alone", submission.json?.data?.stageKey === "contacted", submission.json?.data?.stageKey);
  check("it is reported as waiting for approval", submission.json?.data?.approvalStatus === "pending", submission.json?.data?.approvalStatus);
  check("the task counts it as pending, not done", submission.json?.data?.taskDone === 0 && submission.json?.data?.taskPending === 1, {
    done: submission.json?.data?.taskDone, pending: submission.json?.data?.taskPending,
  });
  const leadId = submission.json.data.leadId;

  console.log("\n6. The same record arriving twice (the offline queue retrying)");
  const dup = await call("POST", "/api/field/submissions", fieldToken, {
    clientRef: "smoke-ref-1", taskId: task.id, templateId: template.id,
    newLead: { name: "Sunil Jadhav", phone: "9812345678" },
    values: { crop: "paddy", land_size: 4.5, interest: 4 },
    location: { lat: 18.8237, lng: 74.3735 },
  });
  check("stored once, reported as duplicate", dup.json?.duplicate === true, dup.json);

  console.log("\n7. A required OTP is enforced by the server, not just the app");
  const noOtp = await call("POST", "/api/field/submissions", fieldToken, {
    clientRef: "smoke-ref-2", leadId, templateId: template.id, stageKey: "interested",
    values: {}, location: { lat: 18.82, lng: 74.37 }, outcome: "progressed",
  });
  check("refused with 428 until verified", noOtp.status === 428, { status: noOtp.status, msg: noOtp.json?.message });

  const otp = await call("POST", "/api/field/otp/send", fieldToken, { phone: "9812345678", leadId });
  check("OTP issued", otp.status === 200, otp.json);
  check("no SMS provider, so the code comes back to be read out", Boolean(otp.json?.data?.manualCode), otp.json?.data?.status);

  const wrong = await call("POST", "/api/field/otp/verify", fieldToken, { otpId: otp.json.data.otpId, phone: "9812345678", code: "0000" });
  const wrongIsRejected = wrong.status === 400 || (wrong.status === 200 && wrong.json?.success === false);
  check("a wrong code is refused", wrongIsRejected, { status: wrong.status, msg: wrong.json?.message });

  const right = await call("POST", "/api/field/otp/verify", fieldToken, {
    otpId: otp.json.data.otpId, phone: "9812345678", code: otp.json.data.manualCode, leadId,
  });
  check("the right code verifies", right.json?.data?.verified === true, right.json);

  console.log("\n8. Location: a batch with one good step, one jitter, one teleport");
  const now = Date.now();
  // Squeezed into whatever is left of the local day — see todayWindow().
  // 0 means the run began in the first minutes of a local day: the fixes then
  // go on YESTERDAY, which is still a coherent test of the filters — only the
  // rollup assertions that compare against today have to stand down.
  const insideToday = todayWindow(now, 600000);
  const w = insideToday || 1;
  const ago = (ms) => new Date(now - Math.round(ms * w)).toISOString();
  const pings = await call("POST", "/api/field/location/batch", fieldToken, {
    batchId: "smoke-batch-1",
    pings: [
      { lat: 18.8200, lng: 74.3700, accuracy: 10, recordedAt: ago(600000), isMoving: true },
      // ~1.1km north, half the window later — a real step
      { lat: 18.8300, lng: 74.3700, accuracy: 10, recordedAt: ago(300000), isMoving: true },
      // 3m of wander — under the jitter floor, must contribute nothing
      { lat: 18.83003, lng: 74.3700, accuracy: 25, recordedAt: ago(240000), isMoving: false },
      // 200km in a fifth of the window — impossible, must contribute nothing
      { lat: 20.6300, lng: 74.3700, accuracy: 15, recordedAt: ago(180000), isMoving: true },
    ],
  });
  check("all four fixes stored", pings.json?.data?.accepted === 4, pings.json?.data);
  const km = (pings.json?.data?.distanceAdded || 0) / 1000;
  check("only the real step counted (~1.1km)", km > 1.0 && km < 1.3, km + " km");

  console.log("\n9. The desk sees it all");
  const pingDay = pings.json?.data?.day;
  const live = await call("GET", `/api/sales/team/live?day=${pingDay}`, deskToken);
  check("live board shows Ramesh", live.json?.data?.some((r) => r.code === "EMP-SMOKE-1"), live.json?.data);
  const row = live.json.data.find((r) => r.code === "EMP-SMOKE-1");
  check("with his distance", row?.distanceKm > 1.0, row?.distanceKm);
  check("last position is the believable fix, not the teleport", row?.lat > 18.82 && row?.lat < 18.84, row?.lat);
  if (insideToday) check("and his recorded visit", row?.submissions === 1, row?.submissions);
  else skip("and his recorded visit", "run straddles local midnight");

  const day = await call("GET", `/api/sales/team/${emp._id}/day?day=${pingDay}`, deskToken);
  check("his route was simplified into a path", (day.json?.data?.path?.length || 0) >= 2, day.json?.data?.path?.length);

  const overview = await call("GET", "/api/sales/overview", deskToken);
  check("overview counts the new lead", overview.json?.data?.leads?.today >= 1, overview.json?.data?.leads);
  check("overview carries the filter for its own figure", Boolean(overview.json?.data?.leads?.filters?.today), overview.json?.data?.leads?.filters);

  const leads = await call("GET", "/api/sales/leads?q=9812", deskToken);
  check("a partial phone number finds the lead", leads.json?.data?.length === 1, leads.json?.data?.length);

  const detail = await call("GET", `/api/sales/leads/${leadId}`, deskToken);
  check("the submitted answers are readable", detail.json?.data?.submissions?.[0]?.values?.crop === "paddy", detail.json?.data?.submissions?.[0]?.values);
  check("the labels travelled with them", detail.json?.data?.submissions?.[0]?.labels?.crop === "Main crop", detail.json?.data?.submissions?.[0]?.labels);
  check("the timeline records the visit", detail.json?.data?.lead?.timeline?.length >= 2, detail.json?.data?.lead?.timeline?.length);
  check("the phone is marked verified", detail.json?.data?.lead?.phoneVerified === true, detail.json?.data?.lead?.phoneVerified);

  console.log("\n10. A duplicate farmer is refused by phone number");
  const dupLead = await call("POST", "/api/sales/leads", deskToken, { name: "Sunil J", phone: "98 1234 5678" });
  check("409 naming the existing lead", dupLead.status === 409, { status: dupLead.status, msg: dupLead.json?.message });

  console.log("\n11. A service request needs a real customer");
  const badService = await call("POST", "/api/sales/service-requests", deskToken, { leadId, title: "Pump repair" });
  check("refused — not a customer yet", badService.status === 409, { status: badService.status, msg: badService.json?.message });

  console.log(`\n${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error("SMOKE CRASHED:", err); process.exit(1); });
