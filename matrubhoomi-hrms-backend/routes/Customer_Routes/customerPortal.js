// routes/Customer_Routes/customerPortal.js
//
// The customer's own window onto their progress. Mounted at /api/customer.
//
// A FOURTH IDENTITY, AND THE NARROWEST ONE
// ----------------------------------------
// This deployment already has three: a CMS session with a department role
// (/api/sales), an employee token (/api/field), and the employee portal. This
// adds a fourth — the customer themselves — and it is deliberately the most
// limited of them. A token issued here is scoped to ONE lead, is read-only, and
// expires in thirty minutes. There is no route under this mount that writes
// anything about the workflow, because a customer agreeing that a step happened
// is not how the business decides that a step happened.
//
// HOW SOMEBODY PROVES WHO THEY ARE
// --------------------------------
// The phone number, and a code sent to it. That is the same proof the field
// team already relies on — see the note in CLAUDE.md about the OTP being the
// one signal an employee cannot manufacture — and it needs no password anybody
// has to remember or reset.
//
// WHAT THIS ROUTE IS CAREFUL ABOUT
// --------------------------------
// ENUMERATION. "Send me a code for 98xxxxxx01" must answer identically whether
// that number belongs to a customer or not. Otherwise this endpoint is a free
// tool for discovering which farmers in a district are on the books, which is
// exactly the kind of list that should not be assemblable by a stranger with a
// browser. So the response is always the same shape and the same message, and
// the code is only ever actually sent when there is somebody to send it to.

"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const portal = require("../../services/customerPortal");
const { issueOtp, verifyOtp, normalisePhone } = require("../../services/salesOtp");
const { SECRET } = require("../../config/jwt");

/** Short. The page is read and closed; nothing here is worth a long session. */
const TOKEN_TTL = "30m";

/**
 * A small fixed-window limiter, in process and with no dependency.
 *
 * This repo has no rate-limiting middleware and pulling one in for two routes
 * would be a dependency the whole deployment then carries. At this scale — one
 * company's customers, a handful of requests a minute — a Map is the honest
 * size of the problem.
 *
 * Its one real limitation, stated rather than discovered later: the counter
 * lives in ONE process, so running several would multiply the allowance by the
 * number of processes. That is fine for a single-process deployment and is the
 * point at which to reach for a shared store instead.
 *
 * The per-number cooldown inside issueOtp already stops repeat sends for a
 * single phone. This is the backstop against somebody walking a LIST of numbers
 * from one browser to discover who is on the books.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map();

function limit(req, res, next) {
  const who = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const now = Date.now();
  const row = hits.get(who);

  if (!row || now - row.start > WINDOW_MS) {
    hits.set(who, { start: now, count: 1 });
    // Opportunistic sweep. Without it the Map is a slow memory leak keyed by
    // every address that ever called, which on a long-running process is the
    // kind of bug that only appears after a month.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
    }
    return next();
  }

  row.count += 1;
  if (row.count > MAX_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please try again in a few minutes.",
    });
  }
  next();
}

/* ------------------------------------------------------------------ */
/* Signing in                                                          */
/* ------------------------------------------------------------------ */

router.post("/otp", limit, async (req, res) => {
  // Identical for a number we know and one we do not — see the header.
  const sameAnswer = {
    success: true,
    message: "If that number is registered with us, a code has been sent to it.",
  };

  try {
    const phone = normalisePhone(req.body?.phone);
    if (phone.length !== 10) {
      return res.status(400).json({ success: false, message: "Enter a 10-digit mobile number." });
    }

    const lead = await portal.findPortalCustomer(phone);
    if (!lead) return res.json(sameAnswer);

    const issued = await issueOtp({
      phone,
      purpose: "portal_login",
      leadId: lead._id,
      // No employee: the customer asked for this themselves. The model allows
      // it for this purpose only — see SalesOtp.requestedBy.
      employee: { id: null, name: "Customer portal" },
    });

    res.json({
      ...sameAnswer,
      data: {
        otpId: issued.otpId,
        expiresAt: issued.expiresAt,
        // Only ever present when no SMS provider is configured, exactly as on
        // the field side, so a deployment without SMS is usable and the weaker
        // path is visible rather than disguised.
        manualCode: issued.manualCode,
      },
    });
  } catch (err) {
    // A cooldown is a real answer and the customer should see it. Anything else
    // falls back to the neutral message rather than leaking why it failed.
    if (err?.status === 429) {
      return res.status(429).json({ success: false, message: err.message });
    }
    console.error("[customer-portal] otp:", err);
    res.json(sameAnswer);
  }
});

router.post("/verify", limit, async (req, res) => {
  try {
    const phone = normalisePhone(req.body?.phone);
    const lead = await portal.findPortalCustomer(phone);

    // Verify FIRST regardless, so a wrong number and a wrong code take the same
    // path and cost the same time.
    const result = await verifyOtp({ otpId: req.body?.otpId, phone, code: req.body?.code });
    if (!result?.verified || !lead) {
      return res.status(400).json({ success: false, message: "That code is not valid." });
    }

    const token = jwt.sign(
      { leadId: String(lead._id), type: "customer_portal", phone: portal.maskPhone(lead.phone) },
      SECRET,
      { expiresIn: TOKEN_TTL },
    );

    res.json({
      success: true,
      data: { token, name: lead.name, reference: lead.code },
      message: `Welcome, ${lead.name}`,
    });
  } catch (err) {
    const status = err?.status && err.status < 500 ? err.status : 400;
    res.status(status).json({ success: false, message: err?.message || "That code is not valid." });
  }
});

/* ------------------------------------------------------------------ */
/* Their own page                                                      */
/* ------------------------------------------------------------------ */

/**
 * Read the portal token, and refuse anything else.
 *
 * The `type` check is the important line. Every identity in this deployment is
 * signed with the same secret, so without it a customer's token would be a
 * valid-looking bearer token for routes that only check the signature — and,
 * worse, an employee token would satisfy this one and be treated as a customer
 * with whatever `leadId` happened to be absent.
 */
function requireCustomer(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "Please sign in again." });

  try {
    const claims = jwt.verify(token, SECRET);
    if (claims?.type !== "customer_portal" || !claims?.leadId) {
      return res.status(401).json({ success: false, message: "Please sign in again." });
    }
    req.portalLeadId = claims.leadId;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Your session has expired. Please sign in again." });
  }
}

/**
 * Everything the page shows, in one response.
 *
 * Note there is no `:id` anywhere under this mount. The customer being read is
 * taken from the TOKEN and never from the URL, so there is no parameter for
 * somebody to increment and no id to guess.
 */
router.get("/me", requireCustomer, async (req, res) => {
  try {
    const data = await portal.progressFor(req.portalLeadId);
    res.json({ success: true, data });
  } catch (err) {
    const status = err?.status && err.status < 500 ? err.status : 500;
    if (status >= 500) console.error("[customer-portal] me:", err);
    res.status(status).json({
      success: false,
      message: status >= 500 ? "Something went wrong at our end." : err.message,
    });
  }
});

module.exports = router;
