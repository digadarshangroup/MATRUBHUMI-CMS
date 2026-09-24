// Middlewear/EmployeeAuthMiddlewear.js

const jwt = require("jsonwebtoken");
const { verifyToken } = require("../config/jwt");

// ─── WHICH IDENTITIES THIS GUARD IS FOR ──────────────────────────────────────
//
// This is the CMS desk session, and ONLY that. Three kinds of token are signed
// with the same secret, and a valid signature is not the same question as "may
// this caller be here":
//
//   desk      buildTokenPayload()          { id, role, userType, deptSlug, … }
//   app       Employee_Routes/login.js     { id, phoneNumber, email, type: "employee" }
//   customer  Customer_Routes/…            { leadId, type: "customer_portal" }
//
// Only the first has no `type`. Until this check existed, a field officer who
// signed into the Android app could take their token, point it at
// /api/employees, and list the whole workforce — salary, bank account and
// Aadhaar included — or create an employee record. The mount points are
// separate (/api/employee/*, /api/field/* carry AllEmployeeAppMiddleware) but
// nothing stopped a token crossing between them.
//
// Named rather than inferred: a future token type is refused by default, which
// is the right way round.
const NON_DESK_TOKEN_TYPES = new Set(["employee", "customer_portal"]);

const EmployeeAuthMiddleware = (req, res, next) => {
  try {
    // 1. Try cookie first (CMS / desktop — works as before)
    let token = req.cookies?.auth_token;

    // 2. If no cookie, try Bearer token from Authorization header (iOS Safari fix)
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 3. Last fallback: manually parse cookie header
    if (!token && req.headers.cookie) {
      const match = req.headers.cookie.match(/auth_token=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // config/jwt.js, not an inline fallback: the literal that used to sit here
    // is a signing key anybody holding this repository can read.
    const decoded = verifyToken(token);

    // A real token, for a different door. 403 rather than 401 on purpose: the
    // caller IS authenticated, so telling them to sign in again would send the
    // app round a loop that can never succeed.
    if (NON_DESK_TOKEN_TYPES.has(decoded?.type)) {
      return res.status(403).json({
        success: false,
        code: "WRONG_TOKEN_TYPE",
        message: "This area needs a CMS sign-in.",
      });
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
      employeeId: decoded.employeeId,
      // Carried through for audit logging — the token holds these and dropping
      // them meant every change log recorded an id with no name against it.
      name: decoded.name || "",
      email: decoded.email || "",
      // CARRIED THROUGH, because a guard downstream needs it.
      //
      // The token has always held this; this middleware used to drop it, so
      // every per-department role check saw an administrator as an ordinary
      // user with no role — and refused them from the very screens they
      // administer. Signed into the token by buildTokenPayload, so it cannot be
      // set by the client.
      isAdmin: Boolean(decoded.isAdmin),
      deptSlug: decoded.deptSlug || "",
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

module.exports = EmployeeAuthMiddleware;
