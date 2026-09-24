"use strict";
/**
 * One answer to "how many leave days does this person have", for the employee
 * app (routes/Employee_Routes/leaveRoutes.js) and the CMS
 * (routes/HrRoutes/Leave_section.js) alike.
 *
 * Before this, the app worked its numbers out from the leave policy while the
 * CMS read whatever the stored row last said, so the two could disagree. Worse,
 * HR's approve / add-leave capped the deduction at the STORED entitlement: for
 * someone whose row had never been granted PL, an approved PL leave deducted
 * nothing at all, and the app went on showing the full 18 days.
 *
 * The rules, in one place:
 *  • CL and SL are the policy's (LeaveConfig) — the app has always put the
 *    policy back on read, so a per-person figure never survived anyway.
 *  • PL is earned after config.daysRequiredForPL calendar days of service,
 *    Sundays included. Once earned, the year's row records it.
 *  • available          = entitlement − consumed (approved days). Payroll and
 *                         the paid/unpaid split read this, so it never counts
 *                         requests that are merely waiting.
 *  • reserved           = days of requests still waiting (never stored —
 *                         see utils/leaveReserve.js).
 *  • effectiveAvailable = available − reserved. What the app shows as "left",
 *                         and what the CMS now shows beside it.
 */
const Employee = require("../models/Employee");
const {
  LeaveConfig,
  LeaveBalance,
  LeaveApplication,
} = require("../models/HR_Models/LeaveManagement");
const { computeReserved, RESERVING_STATUSES } = require("./leaveReserve");

const TYPES = ["CL", "SL", "PL"];
const num = (v) => Number(v) || 0;
const zero = () => ({ CL: 0, SL: 0, PL: 0 });

/** Calendar days since joining, both ends counted, Sundays included. */
function daysSinceJoining(joiningDate, now = new Date()) {
  if (!joiningDate) return 0;
  const j = new Date(joiningDate);
  if (Number.isNaN(j.getTime())) return 0;
  const start = Date.UTC(j.getFullYear(), j.getMonth(), j.getDate());
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return end < start ? 0 : Math.round((end - start) / 86400000) + 1;
}

/** PL is earned — recorded on the row, or by length of service. */
function plEarned(bal, joiningDate, config) {
  return (
    !!bal?.plEligible ||
    daysSinceJoining(joiningDate) >= num(config.daysRequiredForPL || 240)
  );
}

/** What the policy entitles someone to for a year. */
function entitlementOf(config, plEligible) {
  return {
    CL: num(config.clPerYear),
    SL: num(config.slPerYear),
    PL: plEligible ? num(config.plPerYear) : 0,
  };
}

/** The $set a stored row needs to match the policy, or null when it does. */
function driftOf(bal, joiningDate, config, now = new Date()) {
  const earned = plEarned(bal, joiningDate, config);
  const ent = entitlementOf(config, earned);
  const set = {};
  if (num(bal.entitlement?.CL) !== ent.CL) set["entitlement.CL"] = ent.CL;
  if (num(bal.entitlement?.SL) !== ent.SL) set["entitlement.SL"] = ent.SL;
  // Not earned: PL is left alone, exactly as the app always did.
  if (earned && num(bal.entitlement?.PL) !== ent.PL) set["entitlement.PL"] = ent.PL;
  if (earned && !bal.plEligible) {
    set.plEligible = true;
    set.plGrantedDate = now;
  }
  return Object.keys(set).length ? set : null;
}

function freshRow(employee, year, config, now = new Date()) {
  const earned = plEarned(null, employee?.dateOfJoining, config);
  return {
    employeeId: employee._id,
    biometricId: employee?.biometricId || "",
    year,
    entitlement: entitlementOf(config, earned),
    consumed: zero(),
    plEligible: earned,
    ...(earned ? { plGrantedDate: now } : {}),
  };
}

/**
 * The year's row — created when missing, brought in line with the policy when
 * it has drifted, untouched otherwise. Returns the Mongoose document, so the
 * callers that go on to change `consumed` can save it.
 */
async function syncBalance(employeeId, year, { employee, config } = {}) {
  config = config || (await LeaveConfig.getConfig());
  if (!employee || employee.dateOfJoining === undefined) {
    employee = await Employee.findById(employeeId)
      .select("biometricId dateOfJoining")
      .lean();
  }
  // Named fields, never a spread: spreading a Mongoose document copies its
  // internals, not its fields, and quietly loses the joining date.
  const who = {
    _id: employeeId,
    biometricId: employee?.biometricId || "",
    dateOfJoining: employee?.dateOfJoining ?? null,
  };

  let bal = await LeaveBalance.findOne({ employeeId, year });
  if (!bal) {
    try {
      return await LeaveBalance.create(freshRow(who, year, config));
    } catch (e) {
      if (e?.code !== 11000) throw e;
      // Another request created it a moment ago — use theirs.
      bal = await LeaveBalance.findOne({ employeeId, year });
    }
  }
  const set = driftOf(bal, who.dateOfJoining, config);
  if (set) {
    bal.set(set);
    await bal.save();
  }
  return bal;
}

/** The figures every screen shows, from a (synced) row. */
function viewOf(bal, config, reserved = zero()) {
  const entitlement = entitlementOf(config, !!bal?.plEligible);
  const consumed = zero();
  const available = zero();
  const effectiveAvailable = zero();
  const held = zero();
  for (const t of TYPES) {
    consumed[t] = num(bal?.consumed?.[t]);
    available[t] = Math.max(0, entitlement[t] - consumed[t]);
    held[t] = num(reserved?.[t]);
    effectiveAvailable[t] = Math.max(0, available[t] - held[t]);
  }
  return {
    plEligible: !!bal?.plEligible,
    entitlement,
    consumed,
    available,
    reserved: held,
    effectiveAvailable,
  };
}

/** One person's year, synced, with what is on hold. */
async function balanceFor(employeeId, year, { employee, config } = {}) {
  config = config || (await LeaveConfig.getConfig());
  const bal = await syncBalance(employeeId, year, { employee, config });
  const reserved = await computeReserved(employeeId, year);
  return { bal, config, ...viewOf(bal, config, reserved) };
}

/** What is on hold for many people at once — one query, for the CMS list. */
async function reservedFor(employeeIds, year) {
  const out = new Map();
  if (!employeeIds.length) return out;
  const rows = await LeaveApplication.aggregate([
    {
      $match: {
        employeeId: { $in: employeeIds },
        status: { $in: RESERVING_STATUSES },
        leaveType: { $in: TYPES },
        fromDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
      },
    },
    {
      $group: {
        _id: { e: "$employeeId", t: "$leaveType" },
        days: { $sum: { $ifNull: ["$paidDays", "$totalDays"] } },
      },
    },
  ]);
  for (const r of rows) {
    const key = String(r._id.e);
    if (!out.has(key)) out.set(key, zero());
    out.get(key)[r._id.t] = Math.max(0, num(r.days));
  }
  return out;
}

/**
 * Every listed person's row for the year, created or corrected in one bulk
 * write. Returns Map(employeeId → plain row). Used by the CMS list so HR sees
 * the same numbers the employees' phones do — and so payroll, which reads the
 * stored rows, does too.
 */
async function syncMany(employees, year, config) {
  const ids = employees.map((e) => e._id);
  const rows = await LeaveBalance.find({ employeeId: { $in: ids }, year }).lean();
  const byEmp = new Map(rows.map((b) => [String(b.employeeId), b]));
  const now = new Date();
  const ops = [];
  for (const e of employees) {
    const key = String(e._id);
    const b = byEmp.get(key);
    if (!b) {
      const row = freshRow(e, year, config, now);
      ops.push({ insertOne: { document: row } });
      byEmp.set(key, row);
      continue;
    }
    const set = driftOf(b, e.dateOfJoining, config, now);
    if (!set) continue;
    ops.push({ updateOne: { filter: { _id: b._id }, update: { $set: set } } });
    for (const [path, value] of Object.entries(set)) {
      if (path.startsWith("entitlement.")) {
        b.entitlement = { ...(b.entitlement || {}), [path.slice(12)]: value };
      } else b[path] = value;
    }
  }
  if (ops.length) {
    try {
      await LeaveBalance.bulkWrite(ops, { ordered: false });
    } catch (e) {
      // A row someone else created in the meantime is fine; anything else is not.
      const errs = e?.writeErrors || e?.result?.getWriteErrors?.() || [];
      if (!errs.length || errs.some((w) => (w.code ?? w.err?.code) !== 11000)) throw e;
    }
  }
  return byEmp;
}

module.exports = {
  TYPES,
  daysSinceJoining,
  plEarned,
  entitlementOf,
  syncBalance,
  viewOf,
  balanceFor,
  reservedFor,
  syncMany,
};
