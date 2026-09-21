// routes/notifications.js  →  mounted at /api/cms/notifications
//
// Browser push for CMS users (HR, the executive office, every department
// created from Access Control). Plain VAPID Web Push; no Firebase.
//
// The frontend half of this already existed — matrubhoomi-hrms/lib/
// pushNotifications.js has been calling these three endpoints since it was
// written — but NOTHING SERVED THEM. Every sign-in quietly failed at
// `vapid-public-key` with a 404 and returned { ok: false }, which is why no
// CMS user has ever received a notification.
//
//   GET  /vapid-public-key   the browser needs it to subscribe at all
//   POST /subscribe          { subscription } from PushManager.subscribe()
//   POST /unsubscribe        { endpoint }
//   POST /test               send one to the caller's own browsers

const express = require("express");
const router = express.Router();

const EmployeeAuthMiddleware = require("../Middlewear/EmployeeAuthMiddlewear");
const {
  isConfigured,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  sendToOwners,
} = require("../utils/webPush");

// Deliberately unauthenticated: a VAPID public key is public by definition and
// is useless without the matching private key. Requiring a session here only
// creates a race on first paint, where the page asks before its cookie has
// been read.
router.get("/vapid-public-key", (_req, res) => {
  if (!isConfigured()) {
    return res.json({
      success: false,
      message:
        "Push is not configured on this server (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).",
    });
  }
  res.json({ success: true, publicKey: getPublicKey() });
});

router.post("/subscribe", EmployeeAuthMiddleware, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription?.endpoint) {
      return res
        .status(400)
        .json({ success: false, message: "subscription is required" });
    }

    await saveSubscription({
      ownerType: "cms",
      ownerId: req.user.id,
      subscription,
      userAgent: req.headers["user-agent"] || "",
    });

    res.json({ success: true, message: "Subscribed to notifications" });
  } catch (e) {
    console.error("[NOTIFICATIONS] subscribe failed:", e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post("/unsubscribe", EmployeeAuthMiddleware, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      return res
        .status(400)
        .json({ success: false, message: "endpoint is required" });
    }
    const { removed } = await removeSubscription(endpoint);
    res.json({ success: true, removed });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post("/test", EmployeeAuthMiddleware, async (req, res) => {
  try {
    const r = await sendToOwners({
      ownerType: "cms",
      ownerIds: [req.user.id],
      title: req.body?.title || "🔔 Notifications are on",
      body:
        req.body?.body ||
        "This is a test from the Matrubhoomi HR system. If you can read it, push works.",
      type: "test",
      url: req.body?.url || "/hr/dashboard",
    });

    if (!isConfigured()) {
      return res.json({
        success: false,
        message: "Push is not configured on this server.",
      });
    }
    if (r.recipients === 0) {
      return res.json({
        success: false,
        message:
          "No browser is subscribed for this account. Allow notifications, then sign in again.",
      });
    }
    res.json({
      success: r.sent > 0,
      message: `Test sent to ${r.sent} of ${r.recipients} browser(s)`,
      ...r,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
