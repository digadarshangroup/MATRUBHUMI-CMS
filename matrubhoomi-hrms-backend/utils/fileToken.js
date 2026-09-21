// utils/fileToken.js
//
// A tamper-proof, URL-safe descriptor for one stored file, so routes/files.js
// can serve it without a database lookup and without ever exposing a
// Cloudinary URL.
//
// Shape: <base64url(json)>.<base64url(hmac-sha256)>
//
//   p  Cloudinary public_id
//   r  resource_type   ("raw" | "image" | "video")
//   t  delivery type   ("private" | "authenticated" | "upload")
//   m  MIME type, so the browser is told what it is receiving
//   n  the filename a download should be saved as
//
// NOT a JWT, deliberately: no expiry. These tokens are persisted in columns
// like LeaveApplication.documentUrl and stand in for the permanent public URL
// they replaced, so a token that expired would silently break every historical
// attachment. Unguessability is what protects them — the same property the
// public Cloudinary URL relied on, with the HMAC added so a caller cannot edit
// the descriptor and read somebody else's asset.

"use strict";

const crypto = require("crypto");
const { SECRET } = require("../config/jwt");

// Domain-separated from session signing: the same secret is used, so a value
// minted here must never be mistakable for a session token, or vice versa.
const KEY = crypto
  .createHmac("sha256", SECRET)
  .update("matrubhoomi:file-token:v1")
  .digest();

const b64u = (buf) => Buffer.from(buf).toString("base64url");

function sign(body) {
  return crypto.createHmac("sha256", KEY).update(body).digest("base64url");
}

/**
 * @param {{publicId:string, resourceType?:string, deliveryType?:string, mimeType?:string, fileName?:string}} asset
 * @returns {string} the token to put in /api/files/<token>
 */
function mintFileToken({
  publicId,
  resourceType = "raw",
  deliveryType = "private",
  mimeType = "application/octet-stream",
  fileName = "file",
}) {
  if (!publicId) throw new Error("mintFileToken needs a publicId");
  const body = b64u(
    JSON.stringify({
      p: publicId,
      r: resourceType,
      t: deliveryType,
      m: mimeType,
      n: fileName,
    }),
  );
  return `${body}.${sign(body)}`;
}

/** @returns {{p:string,r:string,t:string,m:string,n:string}|null} */
function verifyFileToken(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const want = sign(body);

  // Lengths must match before timingSafeEqual, which throws on a mismatch.
  if (given.length !== want.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))) return null;

  try {
    const claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return claim?.p ? claim : null;
  } catch {
    return null;
  }
}

module.exports = { mintFileToken, verifyFileToken };
