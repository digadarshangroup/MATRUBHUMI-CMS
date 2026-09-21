// config/jwt.js
//
// One signing secret, one place.
//
// The literal `"matrubhoomi_hrms_secret_key"` appears as a fallback at 31 call
// sites, and a second literal `"matrubhoomi_hrms_secret_key_2024"` at 7 more. A
// fallback secret is not a safety net — it is a published signing key, because
// the source is the same everywhere the code is. Anyone with the repository can
// mint a valid token for any role.
//
// This module refuses to start without a real secret in production, and warns
// loudly in development. Every call site now imports SECRET from here; the
// inline fallbacks were swept out before this repository was published, which
// is the point at which a published signing key stops being theoretical.

"use strict";

const FALLBACK_DEV_SECRET = "dev-only-insecure-secret-change-me";

function resolveSecret() {
  const fromEnv = process.env.JWT_SECRET;

  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not set. Refusing to start in production with a " +
        "known signing key — every token would be forgeable by anyone " +
        "holding a copy of this repository.",
    );
  }

  console.warn(
    "\n[jwt] JWT_SECRET is not set. Falling back to a development-only secret.\n" +
      "[jwt] Tokens signed now are NOT secure and will not verify once the\n" +
      "[jwt] real secret is configured. Set JWT_SECRET in .env.\n",
  );
  return FALLBACK_DEV_SECRET;
}

const SECRET = resolveSecret();

// The historical secret. Kept ONLY so tokens issued before this module existed
// keep verifying through their remaining lifetime; remove once that window has
// passed. Never used for signing.
const LEGACY_SECRETS = [
  "matrubhoomi_hrms_secret_key",
  "matrubhoomi_hrms_secret_key_2024",
].filter((s) => s !== SECRET);

const TOKEN_TTL = "7d";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_NAME = "auth_token";

/**
 * Is the browser sending this cookie back to a DIFFERENT site than the page it
 * is on? True for hrms.matrubhoomifarms.in → an api host that is not under matrubhoomifarms.in.
 *
 * This used to be inferred from NODE_ENV alone, which quietly breaks in the two
 * cases that matter most. A deployment that forgets NODE_ENV=production gets
 * `SameSite=Lax; Secure=false` on an https cross-site response, and every
 * browser drops the cookie on the floor — the session simply never exists, and
 * nothing in the logs says so. Meanwhile a developer running the frontend on a
 * LAN IP or a tunnel is cross-site in development and needs the opposite.
 *
 * So it is now an explicit switch, with the old behaviour as the default:
 *   CROSS_SITE_COOKIES=true   always SameSite=None; Secure  (https required)
 *   CROSS_SITE_COOKIES=false  always SameSite=Lax
 *   unset                     as before — on in production, off otherwise
 */
function crossSite() {
  const flag = String(process.env.CROSS_SITE_COOKIES || "").toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Cookie options, consistent across login, logout and refresh.
 *
 * COOKIE_DOMAIN is worth setting when the backend lives under the same
 * registrable domain as the frontend — `COOKIE_DOMAIN=.matrubhoomifarms.in` with the API on
 * api.matrubhoomifarms.in makes this cookie visible to hrms.matrubhoomifarms.in as a FIRST-party cookie.
 * That is strictly better than the Bearer-header fallback the frontend relies
 * on otherwise: it is not subject to third-party cookie blocking, it stays
 * HttpOnly, and the frontend middleware can read it directly. Leave it unset if
 * the API is on an unrelated domain, where a Domain attribute cannot help.
 */
function cookieOptions() {
  const isCrossSite = crossSite();

  const options = {
    httpOnly: true,
    // SameSite=None is only honoured on a Secure cookie. Setting one without
    // the other produces a cookie every modern browser rejects.
    secure: isCrossSite,
    sameSite: isCrossSite ? "none" : "lax",
    maxAge: TOKEN_TTL_MS,
    // Explicit, so clearCookie() built from these options matches what was set.
    // A cleared cookie with a different path is not the same cookie.
    path: "/",
  };

  const domain = String(process.env.COOKIE_DOMAIN || "").trim();
  if (domain) options.domain = domain;

  return options;
}

/**
 * The bearer of this request's session, wherever it was put.
 *
 * Order matters, and the header comes first on purpose. In production the
 * frontend and this API are different hosts, so the cookie below is a
 * third-party cookie: Safari blocks it outright, Chrome blocks it for anyone
 * who has changed the setting, and it is dropped entirely unless the response
 * carried SameSite=None; Secure. The frontend therefore also sends the token as
 * `Authorization: Bearer`, and that path has to be the one that wins — it is
 * the only one that works on every browser.
 *
 * The raw-header parse at the end covers routes mounted before cookie-parser.
 *
 * @param {import("express").Request} req
 * @param {string} [cookieName] override for modules with their own cookie
 * @returns {string|null}
 */
function readToken(req, cookieName = COOKIE_NAME) {
  if (!req) return null;

  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (/^Bearer\s+/i.test(header)) {
    const bearer = header.replace(/^Bearer\s+/i, "").trim();
    if (bearer) return bearer;
  }

  const fromCookie = req.cookies?.[cookieName];
  if (fromCookie) return fromCookie;

  const raw = req.headers?.cookie || "";
  const match = raw.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  return null;
}

/**
 * Verify against the current secret, then any historical one.
 *
 * Every call site that used to inline the published fallback needs this rather
 * than a bare `jwt.verify`: tokens minted under that fallback are valid for up
 * to seven days, and a sweep that only changed the SIGNING key would sign every
 * user out the moment it deployed. Nothing is ever signed with a legacy secret.
 */
function verifyToken(token, options) {
  const jwt = require("jsonwebtoken");
  try {
    return jwt.verify(token, SECRET, options);
  } catch (err) {
    for (const legacy of LEGACY_SECRETS) {
      try { return jwt.verify(token, legacy, options); } catch { /* next */ }
    }
    throw err;
  }
}

module.exports = {
  SECRET,
  verifyToken,
  LEGACY_SECRETS,
  TOKEN_TTL,
  TOKEN_TTL_MS,
  COOKIE_NAME,
  cookieOptions,
  readToken,
};
