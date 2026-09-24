const jwt = require("jsonwebtoken");
const { isEmployeeActive } = require("../utils/employeeActive");

// ─── Who may use the app, re-checked on every request ────────────────────────
//
// A token is valid for up to thirty days, and two things can change about its
// owner in that time that must take effect at once, not when it expires:
//
//   1. INTERN LOCK-OUT. Interns have no app account. Refusing them at /login is
//      most of it, but somebody moved from staff to intern would otherwise keep
//      their access for a month — exactly the window you would want it gone.
//   2. DEACTIVATION. When HR removes somebody — fired, resigned, absconded —
//      their existing token used to keep opening leave, payslips and the
//      manager approval queues, because this guard only knew about interns.
//      Now a deactivated employee is refused here with EMPLOYEE_INACTIVE, which
//      the app treats as "signed out": it stops the location recording and
//      returns to the sign-in screen, where their login is also refused.
//
// Both answers are cached for five minutes per employee — one indexed lookup
// per person per five minutes — and the HR routes that change either field call
// `invalidateAppAccess()` so the change is immediate, not five minutes late.
const ACCESS_TTL_MS = 5 * 60 * 1000;
const accessCache = new Map(); // employeeId -> { verdict, at }

// Who is using the Android app, and which build. The app sends X-App-Version
// on every request; the web portal sends nothing and is not recorded. One
// write per person per few minutes at most — this runs on every request.
const SEEN_EVERY_MS = 5 * 60 * 1000;
const lastSeenWrite = new Map(); // employeeId -> ms

function recordAppUse(employeeId, req) {
  const version = String(req.headers["x-app-version"] || "").slice(0, 32);
  if (!version) return;
  const key = String(employeeId);
  const now = Date.now();
  if (now - (lastSeenWrite.get(key) || 0) < SEEN_EVERY_MS) return;
  lastSeenWrite.set(key, now);
  const Employee = require("../models/Employee");
  const at = new Date(now);
  // updateOne, never save(): the salary pre-save hook has no business running
  // because somebody opened the app (see CLAUDE.md).
  Employee.updateOne(
    { _id: key },
    {
      $set: {
        "appInfo.lastSeenAt": at,
        "appInfo.version": version,
        "appInfo.build": Number(req.headers["x-app-build"]) || 0,
        "appInfo.device": String(req.headers["x-device"] || "").slice(0, 80),
        "appInfo.os": String(req.headers["x-os"] || "").slice(0, 40),
      },
    },
  )
    .then(() => Employee.updateOne({ _id: key, "appInfo.firstSeenAt": null }, { $set: { "appInfo.firstSeenAt": at } }))
    .catch((err) => console.warn("[APP-SEEN]", err.message));
}

/** Forget a cached decision — call after changing someone's employment type or status. */
function invalidateAppAccess(employeeId) {
  if (employeeId) accessCache.delete(String(employeeId));
}

/**
 * "ok" | "intern" | "inactive" | "unknown"
 *
 * `unknown` (no such record) is let through: the routes behind this already
 * answer a missing employee with a clearer message than this guard could.
 */
async function appVerdict(employeeId) {
  const key = String(employeeId);
  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.verdict;

  const Employee = require("../models/Employee");
  try {
    const emp = await Employee.findById(key).select("employmentType isActive status").lean();
    let verdict = "ok";
    if (!emp) verdict = "unknown";
    else if (!isEmployeeActive(emp)) verdict = "inactive";
    else if (emp.employmentType === "intern") verdict = "intern";
    accessCache.set(key, { verdict, at: Date.now() });
    return verdict;
  } catch (err) {
    // Mongo is unreachable. Signing the entire workforce out of the app over
    // an infrastructure blip is the worse failure — and the lock is enforced
    // at /login too, so nobody NEW gets in while this is down. Not cached, so
    // the next request tries again.
    console.warn("[APP-ACCESS] employee check failed:", err.message);
    return "ok";
  }
}

const AllEmployeeAppMiddleware = async (req, res, next) => {
  let decoded;
  try {
    // 1. Try cookie first (Android / Windows / desktop — works as before)
    let token = req.cookies?.employee_token;

    // 2. If no cookie, try Bearer token from Authorization header (iOS Safari fix)
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 3. Last fallback: manually parse cookie header (some iOS edge cases)
    if (!token && req.headers.cookie) {
      const match = req.headers.cookie.match(/employee_token=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing",
      });
    }

    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, token invalid",
    });
  }

  // ONLY an employee app token. Customer-portal tokens are signed with the same
  // secret and carry no `id` — let through, `req.user.id` was undefined, and a
  // query like `{ employeeId: req.user.id }` quietly matched every row. Desk
  // tokens name a department account, not an Employee, and have no business
  // here either. The previous fix did the same for the desk guard.
  if (decoded?.type !== "employee" || !decoded?.id) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, token invalid",
    });
  }

  // Outside the try above on purpose: a failure in here is not a bad token,
  // and reporting it as one sends the app to the login screen to retry
  // something that was never wrong.
  const verdict = await appVerdict(decoded.id);
  if (verdict === "ok") recordAppUse(decoded.id, req);
  if (verdict === "inactive") {
    return res.status(403).json({
      success: false,
      code: "EMPLOYEE_INACTIVE",
      message: "This account is no longer active. Contact HR if that is a mistake.",
    });
  }
  if (verdict === "intern") {
    return res.status(403).json({
      success: false,
      code: "INTERN_NO_APP_ACCESS",
      message: "The Matrubhoomi app is for employees. Interns do not have access.",
    });
  }

  req.user = {
    id: decoded.id,
    email: decoded.email,
    type: decoded.type,
  };

  next();
};

module.exports = AllEmployeeAppMiddleware;
module.exports.invalidateAppAccess = invalidateAppAccess;
