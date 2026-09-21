// routes/uploads.js  →  mounted at /api/uploads
//
// The single upload entry point for the CMS frontend: profile photos, employee
// documents, vendor papers, candidate résumés, ID cards.
//
// WHY THE BROWSER NO LONGER TALKS TO CLOUDINARY DIRECTLY.
//
// Four separate helpers in the frontend each POSTed to
// api.cloudinary.com with an UNSIGNED preset, and they disagreed with each
// other about the endpoint — one of them omitted the resource_type segment
// entirely, so `/v1_1/<cloud>/upload` sent candidate résumés down the IMAGE
// path. On this account a PDF stored that way cannot be delivered at all
// (public PDF delivery answers 401), so every uploaded résumé produced a link
// that opened to an error.
//
// More fundamentally: an unsigned preset is a write credential shipped to the
// browser. Anyone can read it out of the bundle and upload anything to this
// cloud, under any folder, for as long as the preset exists.
//
// So the policy lives here instead, in one place, and it is the SAME policy
// the server's own uploads use — services/mediaUpload.service.js decides
// public-CDN-for-images and private-plus-proxy for everything else. The
// frontend keeps its helper function names and its return shape; only the
// destination changed.
//
//   POST /api/uploads      multipart: file, [folder]  → { success, url, ... }

const express = require("express");
const multer = require("multer");
const router = express.Router();

const EmployeeAuthMiddleware = require("../Middlewear/EmployeeAuthMiddlewear");
const { uploadPublicFile } = require("../services/mediaUpload.service");
const { absoluteUrl } = require("../utils/letterDownloadToken");

const MAX_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

// Folders are a caller-supplied string, so they are constrained here rather
// than trusted: a "../" or a leading slash in a public_id produces an asset
// nobody can find again.
function safeFolder(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/-+/g, "-")
    // Collapse the empty segments a stripped "../../" leaves behind, so a
    // hostile folder lands somewhere tidy rather than at "matrubhoomi/-/-/x".
    .replace(/\/{2,}/g, "/")
    .split("/")
    .map((seg) => seg.replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("/")
    .slice(0, 120)
    .replace(/\/+$/, "");
  return cleaned ? `matrubhoomi/${cleaned}` : "matrubhoomi/uploads";
}

/**
 * multer's `originalname`, as UTF-8.
 *
 * busboy decodes a multipart filename as LATIN-1 unless the client used the
 * RFC 5987 form, which browsers do not. So "Résumé.pdf" arrives as "RÃ©sumÃ©"
 * and is then stored — and later downloaded — under that name. Re-reading the
 * bytes as UTF-8 undoes it; for a pure-ASCII name the round trip changes
 * nothing.
 */
function decodeOriginalName(name) {
  const raw = String(name || "upload");
  try {
    const utf8 = Buffer.from(raw, "latin1").toString("utf8");
    // A name that was ALREADY valid UTF-8 re-decodes to U+FFFD. Keep the
    // original in that case rather than replacing its characters with "�".
    return utf8.includes("�") ? raw : utf8;
  } catch {
    return raw;
  }
}

router.post(
  "/",
  EmployeeAuthMiddleware,
  (req, res, next) =>
    upload.single("file")(req, res, (err) => {
      if (err) {
        // multer's own message for an oversized file is "File too large",
        // which does not say what the limit is.
        const tooBig = err.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
          success: false,
          message: tooBig
            ? `File is too large. The maximum is ${MAX_BYTES / (1024 * 1024)}MB.`
            : err.message,
        });
      }
      next();
    }),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file provided" });
      }

      const stored = await uploadPublicFile(req.file.buffer, {
        fileName: decodeOriginalName(req.file.originalname),
        mimeType: req.file.mimetype || "application/octet-stream",
        folder: safeFolder(req.body?.folder),
        baseUrl: absoluteUrl(req, ""),
      });

      console.log(
        `[UPLOAD] ${req.user?.id} → ${stored.publicId} (${stored.deliveryType}, ${stored.bytes} bytes)`,
      );

      res.json({
        success: true,
        url: stored.url,
        publicId: stored.publicId,
        fileId: stored.fileId,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        format: stored.resourceType,
        resourceType: stored.resourceType,
        deliveryType: stored.deliveryType,
        bytes: stored.bytes,
        size: stored.bytes,
        downloadUrl: stored.downloadUrl,
      });
    } catch (err) {
      console.error("[UPLOAD] failed:", err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

module.exports = router;
