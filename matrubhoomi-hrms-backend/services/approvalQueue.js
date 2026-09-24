// services/approvalQueue.js
//
// How many requests are waiting on one manager — for the badge on the app's
// menu, not for the queues themselves.
//
// The queues stay where they are (leaveRoutes, regularization, Overtimeroutes)
// and these counts mirror their filters EXACTLY: a badge saying "3" above a
// screen that lists two is worse than no badge. If a queue's filter changes,
// change it here in the same commit.

"use strict";

const { LeaveApplication, RegularizationRequest } = require("../models/HR_Models/LeaveManagement");
const OvertimeReport = require("../models/HR_Models/OvertimeReport");
const Employee = require("../models/Employee");
const { activeEmployeeFilter } = require("../utils/employeeActive");

/** Mirrors isMyTurnForWithdraw() in routes/Employee_Routes/leaveRoutes.js. */
function isMyTurnForWithdraw(leave, myId) {
  const mine = (leave.managersNotified || []).find((m) => String(m.managerId || "") === String(myId));
  if (!mine) return false;
  if (mine.type === "secondary") return true;
  const hasRealSecondary = (leave.managersNotified || []).some((m) => m.type === "secondary" && m.managerId);
  return mine.type === "primary" && !hasRealSecondary;
}

/** The chain-step filter every leave-style queue uses: primary acts on pending, secondary on manager_approved. */
function myTurnFilter(managerId) {
  return {
    $or: [
      { managersNotified: { $elemMatch: { managerId, type: "primary" } }, status: "pending" },
      { managersNotified: { $elemMatch: { managerId, type: "secondary" } }, status: "manager_approved" },
    ],
  };
}

async function pendingApprovalCounts(managerId) {
  const id = String(managerId);
  const [leave, withdrawRows, regularization, overtime] = await Promise.all([
    LeaveApplication.countDocuments(myTurnFilter(id)),
    LeaveApplication.find({ status: "withdraw_pending", "managersNotified.managerId": id })
      .select("managersNotified")
      .lean(),
    RegularizationRequest.countDocuments(myTurnFilter(id)),
    OvertimeReport.countDocuments({ "managersNotified.managerId": id, status: "pending" }),
  ]);
  const withdrawals = withdrawRows.filter((l) => isMyTurnForWithdraw(l, id)).length;
  return {
    leave,
    withdrawals,
    regularization,
    overtime,
    total: leave + withdrawals + regularization + overtime,
  };
}

/** How many active people report to this employee. >0 is what makes somebody a manager. */
async function directReportCount(managerId) {
  return Employee.countDocuments(activeEmployeeFilter({ "primaryManager.managerId": managerId }));
}

module.exports = { pendingApprovalCounts, directReportCount, isMyTurnForWithdraw };
