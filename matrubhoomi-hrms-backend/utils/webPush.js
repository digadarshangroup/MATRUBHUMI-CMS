// utils/webPush.js
//
// The ONE web-push transport. Standard VAPID through the `web-push` package —
// no Firebase, no FCM, no Google project, no service-account JSON.
//
// Everything above this file (utils/sendWebPush.js, utils/sendExpoPush.js, the
// notification routes) goes through `sendToOwners`. Nothing else should import
// `web-push` directly.
//
// Payload shape is fixed by public/sw.js on the frontend, which reads
// `event.data.json()` and expects { title, body, type, url, ...extra }. Keep
// the two in step: a field added here and not read there is invisible.
//
// Env:
//   VAPID_PUBLIC_KEY   also served to the browser at /api/cms/notifications/vapid-public-key
//   VAPID_PRIVATE_KEY  server only
//   VAPID_EMAIL        contact address the push service can complain to
//
// UNCONFIGURED IS A SUPPORTED STATE. With no keys every send is a logged
// no-op, exactly as the Firebase path used to degrade, so a deployment without
// push still runs.

"use strict";

const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const CONTACT = process.env.VAPID_EMAIL || "";

let ready = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    // web-push insists on a mailto: or https: subject and throws on anything
    // else, which would take the whole module down at require time.
    const subject = CONTACT
      ? CONTACT.startsWith("http") || CONTACT.startsWith("mailto:")
        ? CONTACT
        : `mailto:${CONTACT}`
      : "mailto:it@matrubhoomifarms.in";
    webpush.setVapidDetails(subject, PUBLIC_KEY, PRIVATE_KEY);
    ready = true;
  } catch (e) {
    console.error("[WEB-PUSH] VAPID keys rejected — push disabled:", e.message);
  }
} else {
  console.warn(
    "[WEB-PUSH] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — browser push disabled.",
  );
}

function isConfigured() {
  return ready;
}

function getPublicKey() {
  return ready ? PUBLIC_KEY : null;
}

/**
 * Register (or refresh) one browser's subscription.
 * Keyed on `endpoint`, so re-subscribing the same browser updates in place.
 */
async function saveSubscription({
  ownerType,
  ownerId,
  subscription,
  userAgent = "",
}) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("subscription must carry endpoint and keys.p256dh/auth");
  }

  // An endpoint can legitimately move between owners: a shared machine where
  // one person signs out and another signs in keeps the same browser
  // subscription. Overwriting ownerId is what stops the second person
  // receiving the first person's notifications.
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      $set: {
        ownerType,
        ownerId,
        endpoint,
        keys: { p256dh, auth },
        userAgent: String(userAgent || "").slice(0, 300),
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return { ok: true };
}

async function removeSubscription(endpoint) {
  if (!endpoint) return { removed: 0 };
  const r = await PushSubscription.deleteOne({ endpoint });
  return { removed: r.deletedCount || 0 };
}

async function removeAllForOwner(ownerType, ownerId) {
  const r = await PushSubscription.deleteMany({ ownerType, ownerId });
  return { removed: r.deletedCount || 0 };
}

/**
 * Build the JSON the service worker will receive.
 * All values are plain — unlike FCM, Web Push has no "data must be strings"
 * rule, so nothing is stringified on the way out.
 */
function buildPayload({ title, body, type = "general", url = "/", extra = {} }) {
  return JSON.stringify({
    title,
    body,
    type,
    url,
    timestamp: Date.now(),
    ...extra,
  });
}

// 404 and 410 are the push service saying this endpoint is gone for good.
// Anything else (429, 5xx, a network blip) is transient and the row stays.
function isGone(statusCode) {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Send to every registered browser of the given owners.
 *
 * @returns {Promise<{sent:number, failed:number, pruned:number, recipients:number}>}
 */
async function sendToOwners({ ownerType, ownerIds, title, body, type, url, extra }) {
  const result = { sent: 0, failed: 0, pruned: 0, recipients: 0 };

  if (!ready) {
    console.warn(`[WEB-PUSH] skipped "${title}" — VAPID not configured`);
    return result;
  }
  if (!title || !body) {
    console.warn("[WEB-PUSH] skipped — missing title or body");
    return result;
  }

  const ids = (Array.isArray(ownerIds) ? ownerIds : [ownerIds]).filter(Boolean);
  if (!ids.length) return result;

  let subs;
  try {
    subs = await PushSubscription.find({
      ownerType,
      ownerId: { $in: ids },
    }).lean();
  } catch (e) {
    console.error("[WEB-PUSH] subscription lookup failed:", e.message);
    return result;
  }

  result.recipients = subs.length;
  if (!subs.length) return result;

  const payload = buildPayload({ title, body, type, url, extra });
  const dead = [];

  // Sent in parallel: a broadcast to a whole department was previously a
  // serial loop, and one slow push service held up everybody behind it.
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
          payload,
          { TTL: 60 * 60, urgency: "high" },
        );
        result.sent++;
      } catch (err) {
        result.failed++;
        if (isGone(err?.statusCode)) {
          dead.push(s.endpoint);
        } else {
          console.warn(
            `[WEB-PUSH] ✗ ${err?.statusCode || "?"} ${String(err?.body || err?.message || "").slice(0, 120)}`,
          );
        }
      }
    }),
  );

  if (dead.length) {
    await PushSubscription.deleteMany({ endpoint: { $in: dead } }).catch(() => {});
    result.pruned = dead.length;
  }

  console.log(
    `[WEB-PUSH] "${title}" (${type || "general"}) — ${result.sent}/${subs.length} sent` +
      (result.pruned ? `, ${result.pruned} dead endpoint(s) pruned` : ""),
  );

  return result;
}

module.exports = {
  isConfigured,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  removeAllForOwner,
  sendToOwners,
};
