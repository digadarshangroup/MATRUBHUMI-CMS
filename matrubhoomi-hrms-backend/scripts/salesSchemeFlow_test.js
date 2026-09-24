"use strict";
// scripts/salesSchemeFlow_test.js
//
// The scheme workflow, end to end, against a REAL server and a SCRATCH database.
//
// WHAT THIS COVERS THAT salesFlow_test.js DOES NOT
// ------------------------------------------------
// The older suite proves a visit can be recorded and cannot be lost. This one
// proves the thing that visit now feeds into: a customer belongs to a scheme,
// moves through its steps one at a time, and moves ONLY when somebody with the
// authority to say so has agreed. Almost every expectation here is about
// something NOT happening — a customer not advancing on submission, not
// advancing twice on a double-click, not advancing on a submission that arrived
// late, not losing their history when configuration changes underneath them.
//
// RUN IT AGAINST A SCRATCH DATABASE. NOT PRODUCTION, AND NOT YOUR DEV DATABASE.
//
//   # terminal 1
//   MONGODB_URI=mongodb://127.0.0.1:27017/sales_scratch PORT=5099 \
//     JWT_SECRET=smoke_secret_key SALARY_ENCRYPTION_KEY=<64 hex chars> node server.js
//
//   # terminal 2
//   MONGODB_URI=<the same> SALARY_ENCRYPTION_KEY=<the same> node scripts/salesSchemeFlow_test.js
//
// Exits non-zero on the first failed expectation.

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:5099";
const SECRET = process.env.JWT_SECRET || "smoke_secret_key";

let pass = 0;
let fail = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    pass++;
    console.log("  PASS", label);
  } else {
    fail++;
    failures.push(label);
    console.log("  FAIL", label, detail !== undefined ? "-> " + JSON.stringify(detail) : "");
  }
}

function heading(n, text) {
  console.log(`\nCASE ${n}: ${text}`);
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

/** A form field, in the shape the builder produces. */
const field = (key, label, type, extra = {}) => ({ key, label, type, order: 10, ...extra });

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/sales_scratch");
  // The idempotency cases below depend on unique indexes a freshly booted
  // server may still be building — see the helper's header.
  await require("./_waitForIndexes")(mongoose);
  const Employee = require("../models/Employee");
  const DepartmentRole = require("../models/Access/DepartmentRole");

  // Two field employees — one to register customers, one to follow them up, so
  // reassignment and ownership are testable rather than hypothetical.
  await Employee.deleteMany({ email: { $in: ["ramesh.scheme@example.com", "sunita.scheme@example.com"] } });
  const ramesh = await Employee.create({
    firstName: "Ramesh", lastName: "Patil", email: "ramesh.scheme@example.com", phone: "9000000011",
    biometricId: "EMP-SCH-1", department: "Sales", designation: "Field Sales Executive",
    gender: "Male", isActive: true, status: "active",
  });
  const sunita = await Employee.create({
    firstName: "Sunita", lastName: "Deshmukh", email: "sunita.scheme@example.com", phone: "9000000012",
    biometricId: "EMP-SCH-2", department: "Sales", designation: "Field Sales Executive",
    gender: "Female", isActive: true, status: "active",
  });

  // The department has no roles assigned, so requireDepartmentRole fails open
  // and this one token is every level at once. CASE 30 turns that off and
  // proves the guard bites, which is why it runs last.
  const desk = jwt.sign(
    { id: new mongoose.Types.ObjectId().toString(), role: "sales_manager", email: "desk@example.com", name: "Sales Desk" },
    SECRET, { expiresIn: "1h" },
  );
  const asRamesh = jwt.sign({ id: ramesh._id.toString(), email: ramesh.email, type: "employee" }, SECRET, { expiresIn: "1h" });
  const asSunita = jwt.sign({ id: sunita._id.toString(), email: sunita.email, type: "employee" }, SECRET, { expiresIn: "1h" });

  /* ================================================================ */
  heading(1, "Configure the New Customer form");

  const ncForm = await call("POST", "/api/sales/config/new-customer", desk, {
    name: "New customer registration",
    description: "What the field team captures on the doorstep.",
    requiresLocation: true,
    fields: [
      field("full_name", "Full name", "text", { required: true, order: 10 }),
      field("village", "Village", "text", { required: true, order: 20 }),
      field("land_area", "Land area", "area", { unit: "acre", required: true, min: 0, order: 30 }),
      field("remarks", "Remarks", "textarea", { maxLength: 400, order: 40 }),
    ],
  });
  check("registration form created", ncForm.status === 201, ncForm.json?.message);
  const ncTemplateId = ncForm.json?.data?._id;

  const ncRead = await call("GET", "/api/sales/config/new-customer", desk);
  check("it is the one the desk reads back", ncRead.json?.data?._id === ncTemplateId, ncRead.json?.data?.name);
  check("it carries its four questions", ncRead.json?.data?.fields?.length === 4, ncRead.json?.data?.fields?.length);

  /* ================================================================ */
  heading(2, "Build Scheme A with three dynamically configured steps");

  const schemeA = await call("POST", "/api/sales/schemes", desk, {
    name: "Scheme A", description: "Three steps, each with its own form.",
  });
  check("Scheme A created", schemeA.status === 201, schemeA.json?.message);
  const aId = schemeA.json?.data?._id;
  const aKey = schemeA.json?.data?.key;

  const aStepIds = [];
  const aTemplateIds = [];
  for (const [i, name] of ["Initial visit", "Requirement collection", "Proposal"].entries()) {
    const tpl = await call("POST", "/api/sales/templates", desk, {
      name: `A${i + 1} — ${name}`,
      fields: [field(`a${i + 1}_note`, `${name} note`, "text", { required: true, order: 10 })],
      requiresLocation: false,
    });
    aTemplateIds.push(tpl.json?.data?._id);
    const step = await call("POST", `/api/sales/schemes/${aId}/steps`, desk, {
      name, templateId: tpl.json?.data?._id, requiresLocation: false,
    });
    aStepIds.push(step.json?.data?._id);
  }
  const aDetail = await call("GET", `/api/sales/schemes/${aId}`, desk);
  check("Scheme A has three steps in order", aDetail.json?.data?.steps?.length === 3, aDetail.json?.data?.steps?.map((s) => s.key));
  check("each step carries its own form", aDetail.json?.data?.steps?.every((s) => s.template?.id), aDetail.json?.data?.steps?.map((s) => s.template?.name));
  check("the scheme validates clean", (aDetail.json?.data?.problems || []).length === 0, aDetail.json?.data?.problems);

  /* ================================================================ */
  heading(3, "Build Scheme B with completely different steps");

  const schemeB = await call("POST", "/api/sales/schemes", desk, { name: "Scheme B" });
  const bId = schemeB.json?.data?._id;
  const bKey = schemeB.json?.data?.key;
  for (const [i, name] of ["Survey", "Deposit"].entries()) {
    const tpl = await call("POST", "/api/sales/templates", desk, {
      name: `B${i + 1} — ${name}`,
      fields: [field(`b${i + 1}_value`, `${name} value`, "number", { required: true, order: 10 })],
      requiresLocation: false,
    });
    await call("POST", `/api/sales/schemes/${bId}/steps`, desk, {
      name, templateId: tpl.json?.data?._id, requiresLocation: false,
      isTerminal: i === 1, terminalOutcome: i === 1 ? "won" : null,
    });
  }
  const bDetail = await call("GET", `/api/sales/schemes/${bId}`, desk);
  check("Scheme B has its own two steps", bDetail.json?.data?.steps?.length === 2, bDetail.json?.data?.steps?.map((s) => s.key));
  check("the two schemes share no step keys",
    !aDetail.json.data.steps.some((a) => bDetail.json.data.steps.some((b) => b.key === a.key)),
    { a: aDetail.json.data.steps.map((s) => s.key), b: bDetail.json.data.steps.map((s) => s.key) });

  /* ================================================================ */
  heading(4, "Assign a New Customer task with a target of 3");

  const ncTask = await call("POST", "/api/sales/tasks", desk, {
    title: "New customers — today",
    type: "lead_generation",
    templateId: ncTemplateId,
    assignments: [{ employeeId: ramesh._id.toString(), targetCount: 3 }],
  });
  check("task created", ncTask.status === 201, ncTask.json?.message);
  const ncTaskId = ncTask.json?.data?.[0]?._id;
  check("its target is 3", ncTask.json?.data?.[0]?.targetCount === 3, ncTask.json?.data?.[0]?.targetCount);
  check("no customer had to be chosen for it", (ncTask.json?.data?.[0]?.targets || []).length === 0, ncTask.json?.data?.[0]?.targets?.length);

  /* ================================================================ */
  heading(5, "Ramesh registers Customer A and chooses Scheme A");

  const boot = await call("GET", "/api/field/bootstrap", asRamesh);
  check("the phone is offered the schemes to choose from", (boot.json?.data?.schemes || []).length >= 2, (boot.json?.data?.schemes || []).map((s) => s.name));
  check("and the registration form came with the bootstrap",
    boot.json?.data?.templates?.some((t) => String(t.id) === String(ncTemplateId)), boot.json?.data?.newCustomerTemplateId);

  const regA = await call("POST", "/api/field/submissions", asRamesh, {
    clientRef: "sch-reg-a",
    taskId: ncTaskId,
    templateId: ncTemplateId,
    newLead: { name: "Anil Kumar", phone: "9811100011", schemeKey: aKey, address: { village: "Shirur" } },
    values: { full_name: "Anil Kumar", village: "Shirur", land_area: 3.5, remarks: "Interested" },
    location: { lat: 18.82, lng: 74.37, accuracy: 10 },
    outcome: "progressed",
  });
  check("registration accepted", regA.status === 201, regA.json?.message || regA.json);
  const leadA = regA.json?.data?.leadId;
  check("it is reported as waiting for approval", regA.json?.data?.approvalStatus === "pending", regA.json?.data?.approvalStatus);

  /* ================================================================ */
  heading(6, "Ramesh registers Customer B into the OTHER scheme");

  const regB = await call("POST", "/api/field/submissions", asRamesh, {
    clientRef: "sch-reg-b",
    taskId: ncTaskId,
    templateId: ncTemplateId,
    newLead: { name: "Bhima Rao", phone: "9811100022", schemeKey: bKey, address: { village: "Kurkumbh" } },
    values: { full_name: "Bhima Rao", village: "Kurkumbh", land_area: 2, remarks: "" },
    location: { lat: 18.83, lng: 74.38, accuracy: 10 },
    outcome: "progressed",
  });
  check("second registration accepted", regB.status === 201, regB.json?.message || regB.json);
  const leadB = regB.json?.data?.leadId;

  const bLead = await call("GET", `/api/sales/leads/${leadB}`, desk);
  check("Customer B is in Scheme B, not Scheme A", bLead.json?.data?.lead?.pipelineKey === bKey, bLead.json?.data?.lead?.pipelineKey);

  /* ================================================================ */
  heading(7, "Neither customer counts until somebody approves them");

  const aLead = await call("GET", `/api/sales/leads/${leadA}`, desk);
  check("Customer A is pending, not open", aLead.json?.data?.lead?.status === "pending_approval", aLead.json?.data?.lead?.status);

  const taskNow = await call("GET", `/api/sales/tasks/${ncTaskId}`, desk);
  check("the task counts 0 approved", taskNow.json?.data?.task?.doneCount === 0, taskNow.json?.data?.task?.doneCount);
  check("and 2 waiting", taskNow.json?.data?.task?.pendingCount === 2, taskNow.json?.data?.task?.pendingCount);

  const queue = await call("GET", "/api/sales/approvals?kind=new_customer", desk);
  check("both are in the approval queue", queue.json?.data?.total >= 2, queue.json?.data?.total);

  /* ================================================================ */
  heading(8, "Approve Customer A");

  const subA = regA.json.data.submissionId;
  const approveA = await call("POST", `/api/sales/approvals/${subA}/approve`, desk, { note: "Verified" });
  check("approval accepted", approveA.status === 200 && !approveA.json?.data?.alreadyDecided, approveA.json?.message);

  /* ================================================================ */
  heading(9, "Customer A now sits at Scheme A's FIRST step, not past it");

  const aAfter = await call("GET", `/api/sales/leads/${leadA}`, desk);
  const aFirstStep = aDetail.json.data.steps[0].key;
  check("they are active", aAfter.json?.data?.lead?.status === "open", aAfter.json?.data?.lead?.status);
  check("in Scheme A", aAfter.json?.data?.lead?.pipelineKey === aKey, aAfter.json?.data?.lead?.pipelineKey);
  check(`standing on its first step (${aFirstStep})`, aAfter.json?.data?.lead?.stageKey === aFirstStep, aAfter.json?.data?.lead?.stageKey);

  const taskAfterA = await call("GET", `/api/sales/tasks/${ncTaskId}`, desk);
  check("the target now counts 1 approved", taskAfterA.json?.data?.task?.doneCount === 1, taskAfterA.json?.data?.task?.doneCount);

  /* ================================================================ */
  heading(10, "Reject Customer B");

  const subB = regB.json.data.submissionId;
  const noReason = await call("POST", `/api/sales/approvals/${subB}/reject`, desk, {});
  check("a rejection with no reason is refused", noReason.status === 400, noReason.status);

  const rejectB = await call("POST", `/api/sales/approvals/${subB}/reject`, desk, { reason: "Phone number belongs to somebody else" });
  check("rejection accepted with a reason", rejectB.status === 200, rejectB.json?.message);

  const bAfter = await call("GET", `/api/sales/leads/${leadB}`, desk);
  check("Customer B is marked rejected", bAfter.json?.data?.lead?.status === "rejected", bAfter.json?.data?.lead?.status);
  check("but the record still exists", Boolean(bAfter.json?.data?.lead?._id), bAfter.status);
  const bSubs = await call("GET", `/api/sales/customers/${leadB}/history`, desk);
  check("and the rejected submission is preserved with its reason",
    bSubs.json?.data?.submissions?.some((s) => s.approval?.status === "rejected" && s.approval?.note),
    bSubs.json?.data?.submissions?.map((s) => s.approval?.status));

  /* ================================================================ */
  heading(11, "A rejected registration is not a follow-up customer");

  const bWorkflow = await call("GET", `/api/sales/customers/${leadB}/workflow`, desk);
  check("they are not eligible for follow-up", bWorkflow.json?.data?.eligible === false, bWorkflow.json?.data?.eligible);
  check("and the desk is told why", /reject/i.test(bWorkflow.json?.data?.reason || ""), bWorkflow.json?.data?.reason);

  const bTask = await call("POST", "/api/sales/tasks", desk, {
    title: "Should not be possible", type: "follow_up",
    assignments: [{ employeeId: sunita._id.toString(), leadIds: [leadB] }],
  });
  check("assigning one is refused by the server", bTask.status === 409, bTask.status);

  /* ================================================================ */
  heading(12, "Create a follow-up for Customer A — the backend resolves everything");

  const aWorkflow = await call("GET", `/api/sales/customers/${leadA}/workflow`, desk);
  check("scheme resolved from the customer", aWorkflow.json?.data?.scheme?.key === aKey, aWorkflow.json?.data?.scheme?.key);
  check("step resolved from their position", aWorkflow.json?.data?.step?.key === aFirstStep, aWorkflow.json?.data?.step?.key);
  check("form resolved from the step", aWorkflow.json?.data?.template?.id === String(aTemplateIds[0]), aWorkflow.json?.data?.template);
  check("they are eligible", aWorkflow.json?.data?.eligible === true, aWorkflow.json?.data?.reason);

  const fu1 = await call("POST", "/api/sales/tasks", desk, {
    title: "Follow-up — Anil", type: "follow_up",
    assignments: [{ employeeId: sunita._id.toString(), leadIds: [leadA] }],
  });
  check("follow-up task created", fu1.status === 201, fu1.json?.message);
  const fu1Task = fu1.json?.data?.[0];
  check("it snapshotted the scheme and its version", fu1Task?.schemeVersion > 0 && fu1Task?.pipelineKey === aKey, { v: fu1Task?.schemeVersion, k: fu1Task?.pipelineKey });
  check("it snapshotted the step", fu1Task?.stageKey === aFirstStep, fu1Task?.stageKey);
  check("it snapshotted the exact form version", String(fu1Task?.templateId) === String(aTemplateIds[0]) && fu1Task?.templateVersion === 1, { t: fu1Task?.templateId, v: fu1Task?.templateVersion });

  /* ================================================================ */
  heading(13, "Sunita opens it after bootstrap — the form is already on the phone");

  const sBoot = await call("GET", "/api/field/bootstrap", asSunita);
  const sTask = (sBoot.json?.data?.tasks || []).find((t) => String(t.id) === String(fu1Task._id));
  check("the task is on her phone", Boolean(sTask), (sBoot.json?.data?.tasks || []).map((t) => t.code));
  check("it names the customer, scheme and step without asking the server again",
    sTask?.targets?.[0]?.name === "Anil Kumar" && sTask?.schemeName === "Scheme A" && sTask?.stageName,
    { c: sTask?.targets?.[0]?.name, s: sTask?.schemeName, st: sTask?.stageName });
  const sTemplate = (sBoot.json?.data?.templates || []).find((t) => String(t.id) === String(fu1Task.templateId));
  check("and the step's form came down with it — nothing to fetch in the field",
    Boolean(sTemplate) && sTemplate.fields.length >= 1, sTemplate?.name);

  /* ================================================================ */
  heading(14, "She submits it — the customer does NOT advance");

  const fs1 = await call("POST", "/api/field/submissions", asSunita, {
    clientRef: "sch-fu-1",
    taskId: String(fu1Task._id),
    templateId: String(fu1Task.templateId),
    leadId: leadA,
    values: { a1_note: "Met at the farm" },
    location: { lat: 18.82, lng: 74.37, accuracy: 9 },
    outcome: "progressed",
  });
  check("submission accepted", fs1.status === 201, fs1.json?.message || fs1.json);
  check("reported as pending approval", fs1.json?.data?.approvalStatus === "pending", fs1.json?.data?.approvalStatus);

  const aStill = await call("GET", `/api/sales/leads/${leadA}`, desk);
  check("the customer is still on step 1", aStill.json?.data?.lead?.stageKey === aFirstStep, aStill.json?.data?.lead?.stageKey);

  /* ================================================================ */
  heading(15, "Approve it — the customer advances exactly ONE step");

  const sub1 = fs1.json.data.submissionId;
  const ap1 = await call("POST", `/api/sales/approvals/${sub1}/approve`, desk, {});
  check("approved", ap1.status === 200, ap1.json?.message);

  const aSecond = aDetail.json.data.steps[1].key;
  const aNow = await call("GET", `/api/sales/leads/${leadA}`, desk);
  check(`now on step 2 (${aSecond})`, aNow.json?.data?.lead?.stageKey === aSecond, aNow.json?.data?.lead?.stageKey);

  /* ================================================================ */
  heading(16, "Approving the same submission again must not advance them twice");

  const ap1again = await call("POST", `/api/sales/approvals/${sub1}/approve`, desk, {});
  check("the second call is answered, not an error", ap1again.status === 200, ap1again.status);
  check("and says it was already decided", ap1again.json?.data?.alreadyDecided === true, ap1again.json?.message);

  const aUnmoved = await call("GET", `/api/sales/leads/${leadA}`, desk);
  check("the customer did not move a second time", aUnmoved.json?.data?.lead?.stageKey === aSecond, aUnmoved.json?.data?.lead?.stageKey);

  // The same thing again, but genuinely concurrent.
  const fu2 = await call("POST", "/api/sales/tasks", desk, {
    title: "Follow-up 2 — Anil", type: "follow_up",
    assignments: [{ employeeId: sunita._id.toString(), leadIds: [leadA] }],
  });
  const fu2Task = fu2.json.data[0];
  const fs2 = await call("POST", "/api/field/submissions", asSunita, {
    clientRef: "sch-fu-2", taskId: String(fu2Task._id), templateId: String(fu2Task.templateId),
    leadId: leadA, values: { a2_note: "Requirements taken" },
    location: { lat: 18.82, lng: 74.37, accuracy: 9 }, outcome: "progressed",
  });
  const sub2 = fs2.json.data.submissionId;
  const [r1, r2] = await Promise.all([
    call("POST", `/api/sales/approvals/${sub2}/approve`, desk, {}),
    call("POST", `/api/sales/approvals/${sub2}/approve`, desk, {}),
  ]);
  const decidedTwice = [r1, r2].filter((r) => r.json?.data?.alreadyDecided).length;
  check("two simultaneous approvals — exactly one of them did the work", decidedTwice === 1, { a: r1.json?.data?.alreadyDecided, b: r2.json?.data?.alreadyDecided });

  const aThird = aDetail.json.data.steps[2].key;
  const aAfterRace = await call("GET", `/api/sales/leads/${leadA}`, desk);
  check(`and the customer advanced exactly one step (${aThird})`, aAfterRace.json?.data?.lead?.stageKey === aThird, aAfterRace.json?.data?.lead?.stageKey);

  /* ================================================================ */
  heading(17, "Reject a follow-up — the customer stays where they are");

  const fu3 = await call("POST", "/api/sales/tasks", desk, {
    title: "Follow-up 3 — Anil", type: "follow_up",
    assignments: [{ employeeId: sunita._id.toString(), leadIds: [leadA] }],
  });
  const fu3Task = fu3.json.data[0];
  const fs3 = await call("POST", "/api/field/submissions", asSunita, {
    clientRef: "sch-fu-3", taskId: String(fu3Task._id), templateId: String(fu3Task.templateId),
    leadId: leadA, values: { a3_note: "x" },
    location: { lat: 18.82, lng: 74.37, accuracy: 9 }, outcome: "progressed",
  });
  const sub3 = fs3.json.data.submissionId;
  const rej3 = await call("POST", `/api/sales/approvals/${sub3}/reject`, desk, { reason: "Proposal amount missing" });
  check("rejected", rej3.status === 200, rej3.json?.message);

  const aStay = await call("GET", `/api/sales/leads/${leadA}`, desk);
  check("the customer has not moved", aStay.json?.data?.lead?.stageKey === aThird, aStay.json?.data?.lead?.stageKey);

  const fu3After = await call("GET", `/api/sales/tasks/${fu3Task._id}`, desk);
  check("the task reopened for rework", fu3After.json?.data?.task?.status === "rework", fu3After.json?.data?.task?.status);
  check("carrying the reason down to the employee",
    /amount missing/i.test(fu3After.json?.data?.task?.targets?.[0]?.rejectionNote || ""),
    fu3After.json?.data?.task?.targets?.[0]?.rejectionNote);

  /* ================================================================ */
  heading(18, "Resubmit after the rejection, then approve");

  const fs3b = await call("POST", "/api/field/submissions", asSunita, {
    clientRef: "sch-fu-3b", taskId: String(fu3Task._id), templateId: String(fu3Task.templateId),
    leadId: leadA, values: { a3_note: "Proposal at 4.2 lakh" },
    location: { lat: 18.82, lng: 74.37, accuracy: 9 }, outcome: "progressed",
  });
  check("the redo is accepted", fs3b.status === 201, fs3b.json?.message || fs3b.json);
  const ap3b = await call("POST", `/api/sales/approvals/${fs3b.json.data.submissionId}/approve`, desk, {});
  check("and approved", ap3b.status === 200, ap3b.json?.message);

  const hist = await call("GET", `/api/sales/customers/${leadA}/history`, desk);
  const kinds = (hist.json?.data?.events || []).map((e) => e.kind);
  check("the rejection is still in the history beside the approval",
    kinds.includes("submission_rejected") && kinds.includes("submission_approved"), kinds.slice(0, 12));
  check("both submissions survive — the rejected one was never deleted",
    (hist.json?.data?.submissions || []).filter((s) => s.stageKey === aThird).length === 2,
    (hist.json?.data?.submissions || []).filter((s) => s.stageKey === aThird).map((s) => s.approval?.status));

  /* ================================================================ */
  heading(19, "Change a step's form — the old submission still renders as it was");

  const oldSub = (hist.json.data.submissions || []).find((s) => s.stageKey === aFirstStep);
  const tplBefore = { name: oldSub?.templateName, version: oldSub?.templateVersion };

  const edit = await call("PUT", `/api/sales/templates/${aTemplateIds[0]}`, desk, {
    name: "A1 — Initial visit (revised)",
    fields: [
      field("a1_note", "Initial visit note IN FULL", "text", { required: true, order: 10 }),
      field("a1_extra", "Anything else", "text", { order: 20 }),
    ],
  });
  check("the form was edited", edit.status === 200, edit.json?.message);
  const tplNow = await call("GET", `/api/sales/templates/${aTemplateIds[0]}`, desk);
  check("and its version was bumped rather than overwritten", tplNow.json?.data?.version > 1, tplNow.json?.data?.version);

  const histAfter = await call("GET", `/api/sales/customers/${leadA}/history`, desk);
  const sameSub = (histAfter.json.data.submissions || []).find((s) => String(s.stageKey) === String(aFirstStep));
  check("the old submission still names the version it was answered against",
    sameSub?.templateVersion === tplBefore.version, { was: tplBefore.version, now: sameSub?.templateVersion });

  const oldFull = await call("GET", `/api/sales/approvals/${sub1}`, desk);
  check("and still renders with its ORIGINAL labels, not the new ones",
    oldFull.json?.data?.submission?.labels?.a1_note === "Initial visit note",
    oldFull.json?.data?.submission?.labels);

  /* ================================================================ */
  heading(20, "Reorder the steps while a customer is standing on one");

  const beforeOrder = await call("GET", `/api/sales/schemes/${aId}`, desk);
  const standing = (await call("GET", `/api/sales/leads/${leadA}`, desk)).json?.data?.lead?.stageKey;
  const reorder = await call("POST", `/api/sales/schemes/${aId}/steps/reorder`, desk, {
    order: [
      { key: beforeOrder.json.data.steps[1].key, order: 10 },
      { key: beforeOrder.json.data.steps[0].key, order: 20 },
      { key: beforeOrder.json.data.steps[2].key, order: 30 },
    ],
  });
  check("the ladder was rearranged", reorder.status === 200, reorder.json?.message);

  const afterReorder = await call("GET", `/api/sales/leads/${leadA}`, desk);
  check("the customer is still on the same step they were on", afterReorder.json?.data?.lead?.stageKey === standing, afterReorder.json?.data?.lead?.stageKey);
  const histStill = await call("GET", `/api/sales/customers/${leadA}/history`, desk);
  check("and their completed history is unchanged",
    (histStill.json?.data?.submissions || []).length === (histAfter.json?.data?.submissions || []).length,
    { before: (histAfter.json?.data?.submissions || []).length, after: (histStill.json?.data?.submissions || []).length });

  /* ================================================================ */
  heading(21, "Destructive removal of configuration in use is refused");

  const delScheme = await call("DELETE", `/api/sales/schemes/${aId}`, desk);
  check("deleting a scheme with customers is refused", delScheme.status === 409, delScheme.status);
  check("and the refusal says to archive instead", delScheme.json?.archiveInstead === true, delScheme.json?.message);

  const archScheme = await call("POST", `/api/sales/schemes/${aId}/archive`, desk, { reason: "test" });
  check("archiving it while somebody is mid-scheme is also refused", archScheme.status === 409, archScheme.json?.message);

  const occupied = (await call("GET", `/api/sales/schemes/${aId}`, desk)).json.data.steps.find((s) => s.key === standing);
  const archStep = await call("POST", `/api/sales/steps/${occupied._id}/archive`, desk, { reason: "test" });
  check("archiving the step they are standing on is refused", archStep.status === 409, archStep.json?.message);

  /* ================================================================ */
  heading(22, "The same submission arriving ten times stores once");

  const before22 = (await call("GET", `/api/sales/customers/${leadA}/history`, desk)).json.data.submissions.length;
  const retries = await Promise.all(
    Array.from({ length: 10 }, () =>
      call("POST", "/api/field/submissions", asSunita, {
        clientRef: "sch-retry-1",
        taskId: String(fu3Task._id), templateId: String(fu3Task.templateId), leadId: leadA,
        values: { a3_note: "retry" }, location: { lat: 18.82, lng: 74.37, accuracy: 9 }, outcome: "progressed",
      }),
    ),
  );
  const after22 = (await call("GET", `/api/sales/customers/${leadA}/history`, desk)).json.data.submissions.length;
  check("all ten calls answered without error", retries.every((r) => r.status === 200 || r.status === 201), retries.map((r) => r.status));
  check("exactly one submission was stored", after22 - before22 === 1, { before: before22, after: after22 });

  /* ================================================================ */
  heading(23, "A second customer on the same phone number is refused");

  const dup = await call("POST", "/api/field/submissions", asRamesh, {
    clientRef: "sch-dup-1", taskId: ncTaskId, templateId: ncTemplateId,
    newLead: { name: "Anil Kumar again", phone: "9811100011", schemeKey: aKey },
    values: { full_name: "Anil Kumar again", village: "Shirur", land_area: 1 },
    location: { lat: 18.82, lng: 74.37, accuracy: 10 }, outcome: "progressed",
  });
  check("refused with a conflict", dup.status === 409, dup.status);
  check("naming the customer who already holds it", /anil/i.test(dup.json?.message || ""), dup.json?.message);

  /* ================================================================ */
  heading(24, "A second open follow-up for the same customer and step");

  const clash = await call("POST", "/api/sales/tasks", desk, {
    title: "Clashing follow-up", type: "follow_up",
    assignments: [{ employeeId: ramesh._id.toString(), leadIds: [leadA] }],
  });
  check("refused while somebody already has one", clash.status === 409, clash.status);
  check("and the desk is told it can override deliberately", clash.json?.canOverride === true, clash.json);

  const forced = await call("POST", "/api/sales/tasks", desk, {
    title: "Deliberate second visit", type: "follow_up", allowDuplicate: true,
    assignments: [{ employeeId: ramesh._id.toString(), leadIds: [leadA] }],
  });
  check("an explicit override is allowed", forced.status === 201, forced.json?.message);

  /* ================================================================ */
  heading(25, "A stale submission for a step the customer has already left");

  // Sunita's phone still holds the step-1 task from CASE 12; the customer has
  // since moved to step 3. This is the offline case the outbox produces.
  const stale = await call("POST", "/api/field/submissions", asSunita, {
    clientRef: "sch-stale-1",
    taskId: String(fu1Task._id), templateId: String(fu1Task.templateId), leadId: leadA,
    values: { a1_note: "Captured days ago, arriving now" },
    location: { lat: 18.82, lng: 74.37, accuracy: 9 },
    wasQueued: true, outcome: "progressed",
  });
  check("it is accepted, not thrown away", stale.status === 201, stale.json?.message || stale.json);
  check("and flagged as a conflict", stale.json?.data?.conflicted === true, stale.json?.data);

  const staleSub = await call("GET", `/api/sales/approvals/${stale.json.data.submissionId}`, desk);
  check("stored against the step it was actually captured for",
    staleSub.json?.data?.submission?.stageKey === aFirstStep, staleSub.json?.data?.submission?.stageKey);
  check("recording where the customer had moved to",
    staleSub.json?.data?.submission?.conflict?.actualStageKey === standing, staleSub.json?.data?.submission?.conflict);

  const beforeStaleApprove = (await call("GET", `/api/sales/leads/${leadA}`, desk)).json.data.lead.stageKey;
  await call("POST", `/api/sales/approvals/${stale.json.data.submissionId}/approve`, desk, { note: "Valid record" });
  const afterStaleApprove = (await call("GET", `/api/sales/leads/${leadA}`, desk)).json.data.lead.stageKey;
  check("approving it records it WITHOUT moving the customer backwards or forwards",
    beforeStaleApprove === afterStaleApprove, { before: beforeStaleApprove, after: afterStaleApprove });

  /* ================================================================ */
  heading(26, "Move a customer to another scheme, through the audited action");

  const noWhy = await call("POST", `/api/sales/customers/${leadA}/scheme`, desk, { schemeKey: bKey });
  check("a move with no reason is refused", noWhy.status === 400, noWhy.status);

  const moved = await call("POST", `/api/sales/customers/${leadA}/scheme`, desk, {
    schemeKey: bKey, reason: "Enrolled in the wrong scheme at registration",
  });
  check("the move is accepted with a reason", moved.status === 200, moved.json?.message);

  const movedLead = await call("GET", `/api/sales/leads/${leadA}`, desk);
  check("they are now in Scheme B", movedLead.json?.data?.lead?.pipelineKey === bKey, movedLead.json?.data?.lead?.pipelineKey);
  check("on Scheme B's first step", movedLead.json?.data?.lead?.stageKey === bDetail.json.data.steps[0].key, movedLead.json?.data?.lead?.stageKey);
  check("their Scheme A history is closed but kept",
    (movedLead.json?.data?.lead?.schemeHistory || []).some((h) => h.schemeKey === aKey && h.to),
    movedLead.json?.data?.lead?.schemeHistory?.map((h) => ({ k: h.schemeKey, to: Boolean(h.to) })));

  const histMoved = await call("GET", `/api/sales/customers/${leadA}/history`, desk);
  check("every Scheme A submission is still readable",
    (histMoved.json?.data?.submissions || []).some((s) => s.stageKey === aFirstStep),
    (histMoved.json?.data?.submissions || []).map((s) => s.stageKey));
  check("and the change itself is on the audit trail",
    (histMoved.json?.data?.events || []).some((e) => e.kind === "scheme_changed" && e.reason),
    (histMoved.json?.data?.events || []).filter((e) => e.kind === "scheme_changed").map((e) => e.reason));

  /* ================================================================ */
  heading(27, "New Customer target counters separate claimed from accepted");

  const t27 = (await call("GET", `/api/sales/tasks/${ncTaskId}`, desk)).json.data.task;
  check("target stays at 3 however many attempts were made", t27.targetCount === 3, t27.targetCount);
  check("approved counts 1 (Customer A)", t27.doneCount === 1, t27.doneCount);
  check("rejected is not counted as progress", t27.doneCount < 2, { done: t27.doneCount, rejected: t27.rejectedCount });
  check("the task is not complete on 1 of 3", t27.status !== "completed", t27.status);

  /* ================================================================ */
  heading(28, "Reassigning a task does not change what the task is for");

  // A task of its own. The duplicate from CASE 24 belonged to Scheme A and was
  // correctly cancelled when CASE 26 moved the customer out of it — which is
  // the right behaviour, so this makes its own subject rather than weakening it.
  const t28 = await call("POST", "/api/sales/tasks", desk, {
    title: "Reassignment subject", type: "follow_up",
    assignments: [{ employeeId: ramesh._id.toString(), leadIds: [leadA] }],
  });
  check("a task to reassign was created", t28.status === 201, t28.json?.message);
  const before28 = (await call("GET", `/api/sales/tasks/${t28.json.data[0]._id}`, desk)).json.data.task;
  const re = await call("POST", `/api/sales/tasks/${before28._id}/reassign`, desk, {
    employeeId: sunita._id.toString(), reason: "Ramesh is on leave",
  });
  check("reassigned", re.status === 200, re.json?.message);
  const after28 = (await call("GET", `/api/sales/tasks/${before28._id}`, desk)).json.data.task;
  check("it is now Sunita's", after28.assignedToName.includes("Sunita"), after28.assignedToName);
  check("the customer is unchanged", String(after28.targets[0].leadId) === String(before28.targets[0].leadId), after28.targets[0].leadId);
  check("the scheme and step are unchanged", after28.stageKey === before28.stageKey && after28.pipelineKey === before28.pipelineKey, { s: after28.stageKey, p: after28.pipelineKey });
  check("the form version is unchanged", after28.templateVersion === before28.templateVersion, after28.templateVersion);

  /* ================================================================ */
  heading(29, "Approving a terminal step completes the scheme safely");

  const bFirst = bDetail.json.data.steps[0].key;
  // The task CASE 28 just handed to Sunita is already for this customer on this
  // step — asking for a second one is correctly refused by the duplicate guard,
  // so this finishes the one that exists rather than working around it.
  const fuB1Task = after28;
  check("the task in hand is for Scheme B's first step", fuB1Task.stageKey === bFirst, fuB1Task.stageKey);
  const fsB1 = await call("POST", "/api/field/submissions", asSunita, {
    clientRef: "sch-b1", taskId: String(fuB1Task._id), templateId: String(fuB1Task.templateId),
    leadId: leadA, values: { b1_value: 12 }, location: { lat: 18.83, lng: 74.38, accuracy: 9 }, outcome: "progressed",
  });
  await call("POST", `/api/sales/approvals/${fsB1.json.data.submissionId}/approve`, desk, {});
  const onTerminal = (await call("GET", `/api/sales/leads/${leadA}`, desk)).json.data.lead;
  check("advanced onto the terminal step", onTerminal.stageKey === bDetail.json.data.steps[1].key, onTerminal.stageKey);
  check("and reaching a 'won' step marks them a customer", onTerminal.status === "won" && onTerminal.isCustomer === true, { s: onTerminal.status, c: onTerminal.isCustomer });

  const afterDone = await call("GET", `/api/sales/customers/${leadA}/workflow`, desk);
  check("a finished customer is no longer offered for follow-up", afterDone.json?.data?.eligible === false, afterDone.json?.data?.reason);

  /* ================================================================ */
  heading(30, "Permissions are enforced by the server, not the screen");

  // Until now the sales department had no roles, so the guard deliberately fails
  // open. Granting the first one turns enforcement on for everybody.
  await DepartmentRole.deleteMany({ departmentSlug: "sales" });
  await DepartmentRole.create({ departmentSlug: "sales", email: "viewer@example.com", name: "Via Viewer", role: "viewer", isActive: true });
  await DepartmentRole.create({ departmentSlug: "sales", email: "editor@example.com", name: "Ed Editor", role: "editor", isActive: true });
  await DepartmentRole.create({ departmentSlug: "sales", email: "approver@example.com", name: "Ava Approver", role: "approver", isActive: true });

  const tok = (email, name) => jwt.sign({ id: new mongoose.Types.ObjectId().toString(), email, name, role: "sales" }, SECRET, { expiresIn: "1h" });
  const viewer = tok("viewer@example.com", "Via Viewer");
  const editor = tok("editor@example.com", "Ed Editor");
  const approver = tok("approver@example.com", "Ava Approver");

  check("a viewer may read the schemes", (await call("GET", "/api/sales/schemes", viewer)).status === 200);
  check("a viewer may NOT create one", (await call("POST", "/api/sales/schemes", viewer, { name: "Nope" })).status === 403);
  check("an editor may create one", (await call("POST", "/api/sales/schemes", editor, { name: "Editor scheme" })).status === 201);

  const pend = await call("GET", "/api/sales/approvals", approver);
  const anyPending = pend.json?.data?.rows?.[0];
  if (anyPending) {
    check("an editor may NOT approve", (await call("POST", `/api/sales/approvals/${anyPending._id}/approve`, editor, {})).status === 403);
    check("an approver may", (await call("POST", `/api/sales/approvals/${anyPending._id}/approve`, approver, {})).status === 200);
  } else {
    check("an editor may NOT approve", (await call("POST", `/api/sales/approvals/${new mongoose.Types.ObjectId()}/approve`, editor, {})).status === 403);
    check("an approver reaches the route (404 on a made-up id, not 403)",
      (await call("POST", `/api/sales/approvals/${new mongoose.Types.ObjectId()}/approve`, approver, {})).status === 404);
  }

  check("an editor may NOT change a customer's scheme",
    (await call("POST", `/api/sales/customers/${leadA}/scheme`, editor, { schemeKey: aKey, reason: "x" })).status === 403);
  check("an editor may NOT override a step",
    (await call("POST", `/api/sales/customers/${leadA}/step`, editor, { stageKey: bFirst, reason: "x" })).status === 403);
  check("an editor may NOT reorder a ladder",
    (await call("POST", `/api/sales/schemes/${aId}/steps/reorder`, editor, { order: [] })).status === 403);

  // Put it back, so a rerun starts from the same fail-open state this began in.
  await DepartmentRole.deleteMany({ departmentSlug: "sales" });

  /* ================================================================ */
  heading(31, "The customer signs in to their own page with a code");

  // No token. The portal is the one identity in this system that is not a
  // member of staff, so it gets its own call helper.
  const anon = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const withToken = async (method, path, token, body) => call(method, path, token, body);

  const ask = await anon("POST", "/api/customer/otp", { phone: "9811100011" });
  check("a code can be requested", ask.status === 200, ask.json?.message);
  check("and with no SMS provider it is handed back to be read out", Boolean(ask.json?.data?.manualCode), ask.json?.data);

  const badCode = await anon("POST", "/api/customer/verify", {
    phone: "9811100011", otpId: ask.json.data.otpId, code: "0000",
  });
  check("a wrong code is refused", badCode.status === 400, badCode.status);

  const ask2 = await anon("POST", "/api/customer/otp", { phone: "9811100011" });
  const signIn = await anon("POST", "/api/customer/verify", {
    phone: "9811100011",
    otpId: ask2.json?.data?.otpId || ask.json.data.otpId,
    code: ask2.json?.data?.manualCode || ask.json.data.manualCode,
  });
  check("the right code signs them in", signIn.status === 200 && Boolean(signIn.json?.data?.token), signIn.json?.message);
  const portalToken = signIn.json?.data?.token;

  /* ================================================================ */
  heading(32, "They see which steps are done and which are not");

  const mine = await withToken("GET", "/api/customer/me", portalToken);
  check("their own page loads", mine.status === 200, mine.json?.message);
  const view = mine.json?.data;
  check("it names them", view?.customer?.name === "Anil Kumar", view?.customer?.name);
  check("it names their scheme", Boolean(view?.scheme?.name), view?.scheme);
  check("every step has a state", (view?.steps || []).every((st) => ["done", "current", "upcoming"].includes(st.state)),
    (view?.steps || []).map((st) => st.state));
  check("at least one step is marked done", (view?.steps || []).some((st) => st.state === "done"),
    (view?.steps || []).map((st) => st.name + ":" + st.state));
  check("progress is a whole percentage", Number.isInteger(view?.progress?.percent), view?.progress);
  check("a completed scheme says so in one line", /complete/i.test(view?.progress?.headline || ""), view?.progress?.headline);
  check("a finished step carries the date it was accepted",
    (view?.steps || []).filter((st) => st.state === "done").every((st) => Boolean(st.completedAt)),
    (view?.steps || []).filter((st) => st.state === "done").map((st) => st.completedAt));

  /* ================================================================ */
  heading(33, "The page leaks nothing it should not");

  const raw = JSON.stringify(view);
  check("no rejection reason reaches the customer", !/amount missing|belongs to somebody else/i.test(raw), raw.slice(0, 200));
  check("no approver note reaches them", !/Verified|Valid record/.test(raw));
  check("no other customer appears", !/Bhima/i.test(raw));
  check("their phone number is masked", /x{4,}/.test(view?.customer?.phone || ""), view?.customer?.phone);
  check("no internal database ids are exposed", !/_id|leadId|schemeId|templateId/.test(raw));

  /* ================================================================ */
  heading(34, "The sign-in page cannot be used to discover who is a customer");

  const unknown = await anon("POST", "/api/customer/otp", { phone: "9999999999" });
  check("an unknown number is answered exactly like a known one",
    unknown.status === ask.status && unknown.json?.message === ask.json?.message,
    { unknown: unknown.json?.message, known: ask.json?.message });
  check("and no code is issued for it", !unknown.json?.data, unknown.json?.data);

  const short = await anon("POST", "/api/customer/otp", { phone: "12345" });
  check("a malformed number is rejected outright", short.status === 400, short.status);

  /* ================================================================ */
  heading(35, "Only an approved customer has a portal, and only to their own record");

  const rejectedLogin = await anon("POST", "/api/customer/otp", { phone: "9811100022" });
  check("a rejected registration gets the same neutral answer", rejectedLogin.status === 200, rejectedLogin.status);
  check("but no code is actually issued to them", !rejectedLogin.json?.data, rejectedLogin.json?.data);

  const noToken = await anon("GET", "/api/customer/me");
  check("the page cannot be read without signing in", noToken.status === 401, noToken.status);

  // A staff token is signed with the same secret. Without the type check on the
  // portal middleware it would be accepted here.
  const staffOnPortal = await withToken("GET", "/api/customer/me", desk);
  check("a desk token is NOT a customer token", staffOnPortal.status === 401, staffOnPortal.status);
  const fieldOnPortal = await withToken("GET", "/api/customer/me", asSunita);
  check("an employee token is NOT a customer token", fieldOnPortal.status === 401, fieldOnPortal.status);

  // And the reverse: a customer token must not open staff doors.
  const portalOnDesk = await withToken("GET", "/api/sales/leads", portalToken);
  check("a customer token cannot read the desk's customer list", portalOnDesk.status >= 400, portalOnDesk.status);
  const portalOnField = await withToken("GET", "/api/field/bootstrap", portalToken);
  check("a customer token cannot bootstrap the field app", portalOnField.status >= 400, portalOnField.status);

  /* ================================================================ */
  console.log("\n" + "=".repeat(60));
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\nFailed:");
    for (const f of failures) console.log("  -", f);
  }
  console.log("=".repeat(60) + "\n");

  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error("\nSUITE CRASHED:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
