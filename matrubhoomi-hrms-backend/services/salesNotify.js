// services/salesNotify.js
//
// Telling the field employee about the desk's decisions — in their inbox.
//
// The desk already emitted socket events for these (`sales:task_assigned`, …),
// but the employee app holds no socket: a phone in a field has no connection to
// keep open, so an assignment handed out at ten was found whenever the employee
// next pulled down to refresh. These write to the employee's inbox
// (models/EmployeeNotification.js), which the app checks when it opens and in
// the background, and turns into an Android notification.
//
// Written straight to the inbox rather than through notifyEmployee(): the Expo
// app those push payloads are shaped for has no sales screens, and its screen
// registry would reject every one of these with a warning.
//
// Never throws — a notification must never fail the decision it reports.

"use strict";

const { recordInbox } = require("../utils/notifyEmployee");

function notifyTasksAssigned(tasks = []) {
  for (const task of tasks) {
    if (!task?.assignedTo) continue;
    const what = task.type === "follow_up" ? "Follow-up" : task.type === "lead_generation" ? "New customers" : "Assignment";
    const count = task.type === "lead_generation" && task.targetCount ? ` — target ${task.targetCount}` : "";
    recordInbox([String(task.assignedTo)], {
      title: `New assignment: ${task.title || task.code || what}`,
      body: `${what}${count}. Open Work in the app to start.`,
      kind: "sales_task",
      screen: "Work",
      id: String(task._id),
    });
  }
}

function notifyTaskCancelled(task) {
  if (!task?.assignedTo) return;
  recordInbox([String(task.assignedTo)], {
    title: `Assignment cancelled: ${task.title || task.code || ""}`.trim(),
    body: task.cancelledReason ? `Reason: ${task.cancelledReason}` : "The sales desk cancelled this assignment.",
    kind: "sales_task",
    screen: "Work",
    id: String(task._id),
  });
}

/**
 * A task handed from one person to another. Both hear about it: the new holder
 * so they know to go, the old one so they do not — before this, the task just
 * vanished from one phone and appeared on the other without a word to either.
 */
function notifyTaskReassigned(task, { fromId, fromName = "", reason = "" } = {}) {
  if (!task) return;
  const name = task.title || task.code || "Assignment";
  if (task.assignedTo) {
    recordInbox([String(task.assignedTo)], {
      title: `New assignment: ${name}`,
      body: `Handed to you${fromName ? ` from ${fromName}` : ""}${reason ? ` — ${reason}` : ""}. Open Work in the app to start.`,
      kind: "sales_task",
      screen: "Work",
      id: String(task._id),
    });
  }
  if (fromId && String(fromId) !== String(task.assignedTo)) {
    recordInbox([String(fromId)], {
      title: `Assignment moved: ${name}`,
      body: `The sales desk gave this to ${task.assignedToName || "someone else"}${reason ? ` — ${reason}` : ""}. You no longer need to do it.`,
      kind: "sales_task",
      screen: "Work",
      id: String(task._id),
    });
  }
}

/**
 * @param result  what salesProgression.approveSubmission / rejectSubmission returned
 */
function notifyVisitDecision(result, decision, note = "") {
  const sub = result?.submission;
  if (!sub?.submittedBy) return;
  const who = result?.lead?.name || "the customer";
  recordInbox([String(sub.submittedBy)], {
    title: decision === "approved" ? `Visit approved — ${who}` : `Visit sent back — ${who}`,
    body:
      decision === "approved"
        ? result.completed
          ? `${who} has completed their scheme.`
          : `The desk approved your visit.`
        : note
          ? `Redo needed: ${note}`
          : "The desk sent this visit back. Open it to see what to fix.",
    kind: "sales_review",
    screen: "Work",
    id: String(sub.taskId || sub._id),
  });
}

module.exports = { notifyTasksAssigned, notifyTaskCancelled, notifyTaskReassigned, notifyVisitDecision };
