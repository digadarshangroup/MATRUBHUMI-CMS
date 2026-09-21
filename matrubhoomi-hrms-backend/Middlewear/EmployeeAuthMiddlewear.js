// Middlewear/EmployeeAuthMiddlewear.js

const jwt = require("jsonwebtoken");
const { verifyToken } = require("../config/jwt");

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
