// utils/sendExpoPush.js
//
// Shared push notification helper.
// Sends notifications to BOTH:
//   • Expo native tokens (mobile app) via the Expo Push API
//   • Browser subscriptions (web app) via VAPID Web Push — utils/webPush.js
//
// There is no Firebase here. Web delivery used to go through firebase-admin
// and a single `fcmToken` on Employee; it now goes through the
// PushSubscription collection, so a person's browsers are all reached instead
// of only the last one they signed in on.
//
// Single call from your route handlers — they don't need to know which device
// each employee is on. The helper fans out automatically.
//
// Usage:
//   const { sendExpoPush } = require("../utils/sendExpoPush");
//   await sendExpoPush(employeeIdOrIds, {
//     title: "Leave Approved",
//     body: "Rakesh approved your leave for May 20-22.",
//     data: { screen: "Leave", leaveId: "abc123" },
//   });
//
// The helper never throws — failed pushes are logged but won't break callers.

"use strict";

const { Expo } = require("expo-server-sdk");
const Employee = require("../models/Employee");
const { sendToOwners } = require("./webPush");

const expo = new Expo();

/**
 * Send a push notification to one or more employees.
 * Automatically sends to BOTH mobile (Expo) and every registered browser.
 *
 * @param {string|string[]|ObjectId|ObjectId[]} employeeIdOrIds
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {Object} [opts.data={}]
 * @param {string} [opts.channelId="general"]
 * @param {string} [opts.categoryId]
 * @param {string} [opts.url="/"]  -- click destination on web
 * @param {string} [opts.icon]
 * @param {number} [opts.badge]
 * @returns {Promise<{mobile:{queued,failed}, web:{sent,failed}, cleanedTokens:number}>}
 */
async function sendExpoPush(employeeIdOrIds, opts) {
  const {
    title,
    body,
    data = {},
    channelId = "general",
    categoryId,
    url = "/",
    icon,
    badge,
  } = opts || {};

  const result = {
    mobile: { queued: 0, failed: 0 },
    web: { sent: 0, failed: 0 },
    cleanedTokens: 0,
  };

  if (!title || !body) {
    console.warn("[SEND-PUSH] ❌ Missing title or body");
    return result;
  }

  const ids = Array.isArray(employeeIdOrIds)
    ? employeeIdOrIds
    : [employeeIdOrIds];
  const filteredIds = ids.filter(Boolean);
  if (filteredIds.length === 0) return result;

  try {
    // ── Web push, for every requested employee at once ─────────────────
    //
    // Not per-employee inside the loop below: browser subscriptions live in
    // their own collection, so one indexed query covers the whole batch and
    // utils/webPush.js fans the sends out in parallel. It also means someone
    // who uses ONLY the browser — no mobile app, therefore no Expo token —
    // still gets notified, which the old `find({ pushToken or fcmToken })`
    // gate quietly excluded whenever their fcmToken had been cleared.
    const web = await sendToOwners({
      ownerType: "employee",
      ownerIds: filteredIds,
      title,
      body,
      type: data?.type || channelId || "general",
      url,
      extra: { ...data, ...(icon ? { icon } : {}) },
    });
    result.web.sent = web.sent;
    result.web.failed = web.failed;

    // ── Mobile push (Expo) ─────────────────────────────────────────────
    const employees = await Employee.find({
      _id: { $in: filteredIds },
      $and: [
        { $or: [{ status: "active" }, { isActive: true }] },
        { pushToken: { $exists: true, $nin: [null, ""] } },
      ],
    })
      .select("pushToken firstName lastName")
      .lean();

    if (employees.length === 0) {
      if (web.recipients === 0) {
        console.log(
          `[SEND-PUSH] No active employees with any device for: ${filteredIds.join(", ")}`,
        );
      }
      return result;
    }

    const invalidMobileTokenIds = [];

    for (const emp of employees) {
      const name = `${emp.firstName} ${emp.lastName || ""}`.trim();

      // ── Mobile push (Expo) ─────────────────────────────────────────
      if (emp.pushToken) {
        if (!Expo.isExpoPushToken(emp.pushToken)) {
          console.warn(
            `[SEND-PUSH] ⚠ Invalid Expo token for ${name} — cleaning`,
          );
          invalidMobileTokenIds.push(emp._id);
          result.mobile.failed++;
        } else {
          const message = {
            to: emp.pushToken,
            sound: "default",
            priority: "high",
            title,
            body,
            data: { ...data },
            channelId,
            ...(categoryId ? { categoryId } : {}),
            ...(badge !== undefined ? { badge } : {}),
          };
          try {
            const tickets = await expo.sendPushNotificationsAsync([message]);
            const ticket = tickets[0];
            if (ticket.status === "ok") {
              result.mobile.queued++;
              console.log(`[SEND-PUSH] ✓ Mobile → ${name}: ${title}`);
            } else {
              result.mobile.failed++;
              const errCode = ticket.details?.error;
              console.warn(
                `[SEND-PUSH] ✗ Mobile rejected → ${name}: ${ticket.message || errCode}`,
              );
              if (
                errCode === "DeviceNotRegistered" ||
                errCode === "MismatchSenderId"
              ) {
                invalidMobileTokenIds.push(emp._id);
              }
            }
          } catch (err) {
            result.mobile.failed++;
            console.error(
              `[SEND-PUSH] ✗ Mobile error → ${name}: ${err.message}`,
            );
            if (
              err.message.includes("same project") ||
              err.message.includes("conflicting tokens")
            ) {
              invalidMobileTokenIds.push(emp._id);
            }
          }
        }
      }

    }

    // ── Cleanup bad tokens ──────────────────────────────────────────────
    if (invalidMobileTokenIds.length > 0) {
      const unique = [
        ...new Set(invalidMobileTokenIds.map((id) => id.toString())),
      ];
      await Employee.updateMany(
        { _id: { $in: unique } },
        { $set: { pushToken: null } },
      ).catch((e) =>
        console.warn("[SEND-PUSH] Mobile token cleanup error:", e.message),
      );
      result.cleanedTokens += unique.length;
      console.log(`[SEND-PUSH] Cleaned ${unique.length} bad mobile token(s)`);
    }
  } catch (err) {
    console.error("[SEND-PUSH] ❌ CRITICAL ERROR:", err.message);
    console.error("[SEND-PUSH] Stack:", err.stack);
  }

  return result;
}

/**
 * IST-aware date string. Use this everywhere instead of `new Date().toISOString().split("T")[0]`
 * to avoid the "after midnight UTC" timezone bug.
 */
function dateStrIST(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split("T")[0];
}

function timeStrIST(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function minsSinceMidnightIST(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

module.exports = {
  sendExpoPush,
  dateStrIST,
  timeStrIST,
  minsSinceMidnightIST,
};
