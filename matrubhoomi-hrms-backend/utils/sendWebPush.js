/**
 * utils/sendWebPush.js
 *
 * Employee-facing browser notifications. A thin, stable façade over
 * utils/webPush.js — callers name an employee, not an endpoint.
 *
 * Previously this spoke to FCM through firebase-admin and a single `fcmToken`
 * string on Employee. That is gone: the transport is now plain VAPID Web Push
 * and the endpoints live in the PushSubscription collection, so a person's
 * second browser no longer evicts their first.
 *
 * The exported names and signatures are unchanged, so every existing call site
 * keeps working.
 *
 * Nothing here throws. A failed push must never take down the leave approval
 * that triggered it.
 */

"use strict";

const { sendToOwners } = require("./webPush");

// Where a notification of each type should land when the user taps it. Every
// branch must name a route that EXISTS — a click onto a 404 reads as a broken
// app, which is worse than a notification that does not route.
const URL_MAP = {
  salary_credited: "/salary",
  payslip_generated: "/salary",
  payroll: "/salary",
  leave_applied: "/leave",
  leave_approved: "/leave",
  leave_rejected: "/leave",
  leave_withdrawn: "/leave",
  leave_cancelled: "/leave",
  overtime_required: "/overtime",
  overtime_approved: "/overtime",
  overtime_rejected: "/overtime",
  test: "/dashboard",
};

function getUrl(type) {
  return URL_MAP[type] || "/dashboard";
}

/** Send to one employee's browsers. */
async function sendWebPush({ employeeId, title, body, type, url, extra }) {
  if (!employeeId) return { sent: 0 };
  try {
    const r = await sendToOwners({
      ownerType: "employee",
      ownerIds: [employeeId],
      title,
      body,
      type,
      url: url || getUrl(type),
      extra,
    });
    return { sent: r.sent };
  } catch (e) {
    console.error("[WEB-PUSH] sendWebPush error:", e.message);
    return { sent: 0 };
  }
}

/** Send to many employees' browsers in one pass. */
async function sendWebPushToMany({ employeeIds, title, body, type, url, extra }) {
  if (!employeeIds?.length) return { sent: 0, failed: 0 };
  try {
    const r = await sendToOwners({
      ownerType: "employee",
      ownerIds: employeeIds,
      title,
      body,
      type,
      url: url || getUrl(type),
      extra,
    });
    return { sent: r.sent, failed: r.failed };
  } catch (e) {
    console.error("[WEB-PUSH] sendWebPushToMany error:", e.message);
    return { sent: 0, failed: 0 };
  }
}

module.exports = { sendWebPush, sendWebPushToMany, getUrl };
