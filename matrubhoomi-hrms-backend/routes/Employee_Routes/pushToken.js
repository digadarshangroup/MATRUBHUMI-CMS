// routes/Employee_Routes/pushToken.js  →  mounted at /api/employee
//
// Device registration for the employee self-service portal and the mobile app.
//
// Two transports, two shapes:
//
//   • MOBILE — an Expo push token (`ExponentPushToken[...]`), one per install,
//     stored on Employee.pushToken. Unchanged.
//
//   • WEB — a standard Web Push subscription object from
//     PushManager.subscribe(), stored as its own PushSubscription row so a
//     person can have several browsers at once. This replaces the old single
//     `fcmToken` string and the Firebase Cloud Messaging transport behind it.
//
// Routes:
//   POST   /push-token              { pushToken } | { token, platform:"mobile" }
//   DELETE /push-token[?platform=]  clear the Expo token on logout
//   POST   /push-subscription       { subscription }   web, on sign-in
//   DELETE /push-subscription       { endpoint }       web, on sign-out
//   GET    /push-token/debug        what this user has registered
//   POST   /test-web-push           send one to the caller's own browsers

const express = require("express");
const router = express.Router();
const Employee = require("../../models/Employee");
const PushSubscription = require("../../models/PushSubscription");
const AllEmployeeAppMiddleware = require("../../Middlewear/AllEmployeeAppMiddleware");
const EmployeeAuthMiddleware = require("../../Middlewear/EmployeeAuthMiddlewear");
const {
  isConfigured,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  sendToOwners,
} = require("../../utils/webPush");

// ═══════════════════════════════════════════════════════════════════════════
// GET /push-public-key — the app's browser half needs this to subscribe
// ═══════════════════════════════════════════════════════════════════════════
router.get("/push-public-key", (_req, res) => {
  if (!isConfigured()) {
    return res.json({ success: false, message: "Push is not configured." });
  }
  res.json({ success: true, publicKey: getPublicKey() });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /push-token — register the MOBILE (Expo) token
//
// A web caller that still posts { fcmToken } gets a clear 400 rather than a
// silent success: there is no FCM any more, and an app version that keeps
// sending one should be told, not humoured.
// ═══════════════════════════════════════════════════════════════════════════
router.post("/push-token", AllEmployeeAppMiddleware, async (req, res) => {
  try {
    const { pushToken, fcmToken, token, platform } = req.body;

    if (fcmToken && !pushToken && !token) {
      return res.status(400).json({
        success: false,
        message:
          "FCM tokens are no longer accepted. Web clients must POST /push-subscription with a Web Push subscription.",
      });
    }

    const tokenValue = pushToken || token;
    if (!tokenValue) {
      console.warn(`[PUSH-TOKEN] ❌ Empty token from employee ${req.user.id}`);
      return res.status(400).json({
        success: false,
        message: "Token required (pushToken or token field)",
      });
    }

    if (platform === "web") {
      return res.status(400).json({
        success: false,
        message:
          "Web clients must POST /push-subscription with a Web Push subscription, not a token.",
      });
    }

    const { Expo } = require("expo-server-sdk");
    if (!Expo.isExpoPushToken(tokenValue)) {
      console.warn(
        `[PUSH-TOKEN] ❌ Invalid Expo token format from ${req.user.id}: ${tokenValue.substring(0, 40)}`,
      );
      return res.status(400).json({
        success: false,
        message: "Invalid Expo push token format",
      });
    }

    const result = await Employee.findByIdAndUpdate(
      req.user.id,
      { $set: { pushToken: tokenValue } },
      { new: true, runValidators: false },
    ).select("firstName pushToken");

    if (!result) {
      console.error(`[PUSH-TOKEN] ❌ Employee ${req.user.id} not found`);
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    console.log(
      `[PUSH-TOKEN] ✅ mobile (Expo) token saved for ${result.firstName} (${req.user.id}): ${tokenValue.substring(0, 35)}...`,
    );

    res.json({
      success: true,
      message: "mobile (Expo) token registered",
      platform: "mobile",
    });
  } catch (err) {
    console.error("[PUSH-TOKEN] ❌ Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /push-token — drop the Expo token on logout
// ═══════════════════════════════════════════════════════════════════════════
router.delete("/push-token", AllEmployeeAppMiddleware, async (req, res) => {
  try {
    await Employee.findByIdAndUpdate(
      req.user.id,
      { $set: { pushToken: null } },
      { runValidators: false },
    );
    console.log(`[PUSH-TOKEN] Cleared Expo token for employee ${req.user.id}`);
    res.json({ success: true, message: "Push token removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /push-subscription — register a BROWSER (Web Push)
// ═══════════════════════════════════════════════════════════════════════════
router.post("/push-subscription", AllEmployeeAppMiddleware, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription?.endpoint) {
      return res
        .status(400)
        .json({ success: false, message: "subscription is required" });
    }

    await saveSubscription({
      ownerType: "employee",
      ownerId: req.user.id,
      subscription,
      userAgent: req.headers["user-agent"] || "",
    });

    res.json({ success: true, message: "Browser subscribed" });
  } catch (err) {
    console.error("[PUSH-SUB] ❌", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /push-subscription — drop one browser on sign-out
// ═══════════════════════════════════════════════════════════════════════════
router.delete(
  "/push-subscription",
  AllEmployeeAppMiddleware,
  async (req, res) => {
    try {
      const endpoint = req.body?.endpoint || req.query?.endpoint;
      if (!endpoint) {
        return res
          .status(400)
          .json({ success: false, message: "endpoint is required" });
      }
      const { removed } = await removeSubscription(endpoint);
      res.json({ success: true, removed });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// GET /push-token/debug — what this user has registered, plus fleet totals
// ═══════════════════════════════════════════════════════════════════════════
router.get("/push-token/debug", AllEmployeeAppMiddleware, async (req, res) => {
  try {
    const emp = await Employee.findById(req.user.id)
      .select("firstName lastName pushToken status isActive")
      .lean();
    if (!emp)
      return res.json({ success: false, message: "Employee not found" });

    const { Expo } = require("expo-server-sdk");
    const isValidExpoToken = emp.pushToken
      ? Expo.isExpoPushToken(emp.pushToken)
      : false;

    const [mySubs, totalMobile, totalWebSubs] = await Promise.all([
      PushSubscription.find({ ownerType: "employee", ownerId: req.user.id })
        .select("endpoint userAgent lastSeenAt")
        .lean(),
      Employee.countDocuments({
        pushToken: { $exists: true, $nin: [null, ""] },
        $or: [{ status: "active" }, { isActive: true }],
      }),
      PushSubscription.countDocuments({ ownerType: "employee" }),
    ]);

    res.json({
      success: true,
      data: {
        name: `${emp.firstName} ${emp.lastName || ""}`.trim(),
        pushConfigured: isConfigured(),
        mobile: {
          hasToken: !!emp.pushToken && emp.pushToken !== "",
          tokenPreview: emp.pushToken
            ? emp.pushToken.substring(0, 40) + "..."
            : null,
          isValidExpoToken,
        },
        web: {
          browsers: mySubs.length,
          subscriptions: mySubs.map((s) => ({
            host: (() => {
              try {
                return new URL(s.endpoint).host;
              } catch {
                return "unknown";
              }
            })(),
            userAgent: s.userAgent,
            lastSeenAt: s.lastSeenAt,
          })),
        },
        status: emp.status,
        isActive: emp.isActive,
        totalEmployeesWithMobileTokens: totalMobile,
        totalEmployeeBrowserSubscriptions: totalWebSubs,
      },
    });
  } catch (err) {
    console.error("[PUSH-TOKEN-DEBUG]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /test-web-push — send one to the caller's own browsers
// ═══════════════════════════════════════════════════════════════════════════
router.post("/test-web-push", EmployeeAuthMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { title, body, url } = req.body || {};

    if (!isConfigured()) {
      return res.status(500).json({
        success: false,
        message:
          "Push is not configured on this server. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
      });
    }

    const emp = await Employee.findById(userId)
      .select("firstName lastName")
      .lean();
    if (!emp)
      return res.status(404).json({ success: false, message: "User not found" });

    const r = await sendToOwners({
      ownerType: "employee",
      ownerIds: [userId],
      title: title || "🔔 Test Push",
      body: body || `Hello ${emp.firstName}, this is a test push.`,
      type: "test",
      url: url || "/dashboard",
    });

    if (r.recipients === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No browser subscribed. Sign in on web and allow notifications first.",
      });
    }

    res.json({
      success: r.sent > 0,
      message: `Push sent to ${r.sent} of ${r.recipients} browser(s) for ${emp.firstName} ${emp.lastName || ""}`.trim(),
      ...r,
    });
  } catch (e) {
    console.error("[TEST-PUSH] Route error:", e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
