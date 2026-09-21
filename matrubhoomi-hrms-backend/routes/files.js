// routes/files.js  →  mounted at /api/files
//
// The delivery route for every stored document that is NOT an image.
//
// WHY THIS EXISTS. Two facts about this Cloudinary account decide the design,
// and both were found by probing it rather than assumed:
//
//   1. PUBLIC delivery of PDFs and ZIPs is refused — `raw/upload/…/x.pdf`
//      answers 401 "deny or ACL failure". Storing a public secure_url for a
//      medical certificate therefore produces a link that never opens.
//   2. Some extensions cannot be UPLOADED at all: ".apk" and ".bin" are
//      rejected with "resources with extension apk are not allowed", which
//      killed the employee-app release upload outright.
//
// Both disappear if non-image files are stored with `type: "private"` and no
// extension in the public_id, and served from here instead of from the CDN.
// Nothing about the Cloudinary account has to change.
//
// It also fixes something the Google Drive code got wrong: that path called
// `permissions.create({ role: "reader", type: "anyone" })` on every upload, so
// every leave attachment — medical certificates included — was world-readable
// to anyone holding the link. A private asset plus a signed URL minted per
// request means the readable URL never leaves this process.
//
// The token in the path is an HMAC over the asset descriptor, signed with the
// same secret as sessions. It is unguessable and tamper-proof, and carries no
// expiry: it is the persisted stand-in for the permanent public URL it
// replaced, stored in columns like LeaveApplication.documentUrl. Revoking one
// means deleting the asset, which is what "delete the attachment" should mean.

const express = require("express");
const router = express.Router();

const { verifyFileToken } = require("../utils/fileToken");
const { getPrivateFileStream } = require("../services/mediaUpload.service");

router.get("/:token", async (req, res) => {
  const claim = verifyFileToken(req.params.token);
  if (!claim) {
    return res.status(404).json({ success: false, message: "File not available" });
  }

  try {
    const { stream, mimeType } = await getPrivateFileStream(claim.p, {
      resourceType: claim.r || "raw",
      type: claim.t || "private",
    });

    // The descriptor's own mimeType wins. Cloudinary serves an extension-less
    // raw asset as application/octet-stream, which makes a browser download a
    // PDF instead of opening it.
    res.setHeader("Content-Type", claim.m || mimeType || "application/octet-stream");

    // `inline` for anything a browser can render — HR is looking at the
    // certificate, not filing it. An APK has nowhere to render, so it is only
    // ever an attachment.
    const name = claim.n || "file";
    const inline =
      /^(image\/|application\/pdf$|text\/)/.test(claim.m || "") ? "inline" : "attachment";
    // Both forms, per RFC 6266. A percent-encoded string inside the plain
    // `filename="…"` is NOT decoded by browsers — "Resume - A Kumar.pdf" would
    // save as "Resume%20-%20A%20Kumar.pdf". The ASCII form is therefore
    // sanitised rather than escaped, and `filename*` carries the real name for
    // every browser made this decade.
    const ascii = name.replace(/["\\]/g, "").replace(/[^ -~]/g, "_");
    res.setHeader(
      "Content-Disposition",
      `${inline}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );

    // The URL is unguessable and the bytes never change, so letting a browser
    // keep them is safe and saves a Cloudinary round-trip per view.
    res.setHeader("Cache-Control", "private, max-age=3600");

    stream.on("error", (e) => {
      console.error("[FILES] stream error:", e?.message);
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });

    return stream.pipe(res);
  } catch (err) {
    // 404 for a deleted asset, 502 for anything else — but never the
    // Cloudinary error text, which contains a signed URL.
    const code = err?.statusCode === 404 ? 404 : 502;
    console.error("[FILES] GET /:token:", err?.message);
    if (!res.headersSent) {
      return res
        .status(code)
        .json({ success: false, message: "File not available" });
    }
    return res.destroy();
  }
});

module.exports = router;
