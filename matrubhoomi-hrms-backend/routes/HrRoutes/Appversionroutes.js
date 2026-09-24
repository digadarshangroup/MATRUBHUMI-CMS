"use strict";
const express = require("express");
const router = express.Router();
const multer = require("multer");
const AppVersion = require("../../models/Appversion");
const EmployeeAuthMiddleware = require("../../Middlewear/EmployeeAuthMiddlewear");
const { uploadPublicFile } = require("../../services/mediaUpload.service");
const { absoluteUrl } = require("../../utils/letterDownloadToken");

// A malformed id is "not found", never a 500 carrying a cast error.
router.param("id", (req, res, next, id) => {
  if (!require("mongoose").Types.ObjectId.isValid(id))
    return res.status(404).json({ success: false, message: "Not found" });
  next();
});

/** The rows that belong to one app — see models/Appversion.js. */
function appScope(app) {
  const name = String(app || "").trim();
  return name ? { app: name } : { app: { $in: [null, ""] } };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB max for APK
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.android.package-archive",
      "application/octet-stream",
    ];
    const isApk = file.originalname.endsWith(".apk");
    if (allowed.includes(file.mimetype) || isApk) cb(null, true);
    else cb(new Error("Only .apk files are allowed."));
  },
}).single("apk");

// ── GET /api/hr/app/versions — list all versions (HR only) ──
router.get("/versions", EmployeeAuthMiddleware, async (req, res) => {
  try {
    const filter = req.query.app !== undefined ? appScope(req.query.app) : {};
    const versions = await AppVersion.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: versions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/hr/app/latest — get latest version (public, no auth) ──
router.get("/latest", async (req, res) => {
  try {
    // ?app=employee is the native app asking; no parameter is the old Expo
    // app, which only ever sees its own rows (they have no `app`).
    const scope = appScope(req.query.app);
    const latest = await AppVersion.findOne({ ...scope, isLatest: true }).lean();
    if (!latest) {
      const fallback = await AppVersion.findOne(scope)
        .sort({ createdAt: -1 })
        .lean();
      if (!fallback) return res.json({ success: true, data: null });
      return res.json({ success: true, data: fallback });
    }
    res.json({ success: true, data: latest });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/hr/app/upload — upload APK (HR only) ──
router.post(
  "/upload",
  EmployeeAuthMiddleware,
  (req, res, next) => {
    upload(req, res, (err) => {
      if (err)
        return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No APK file uploaded." });

      const { version, releaseNotes } = req.body;
      const app = String(req.body.app || "").trim();
      const versionCode = Number(req.body.versionCode) || 0;
      if (!version)
        return res
          .status(400)
          .json({ success: false, message: "Version is required." });

      const fileName = `Matrubhoomi_CRM_v${version}_${Date.now()}.apk`;

      // Cloudinary, resource_type "raw" — an APK is not an image and must
      // come back byte-identical or it will not install.
      const stored = await uploadPublicFile(req.file.buffer, {
        fileName,
        mimeType: "application/vnd.android.package-archive",
        folder: "matrubhoomi/app-releases",
        baseUrl: absoluteUrl(req, ""),
      });

      // Unmark previous latest — of THIS app only
      await AppVersion.updateMany(
        { ...appScope(app), isLatest: true },
        { $set: { isLatest: false } },
      );

      // Create new version
      const appVersion = await AppVersion.create({
        version,
        app,
        versionCode,
        fileName,
        fileSize: req.file.size,
        // Column names kept from the Drive era so existing rows still read.
        // They now hold a Cloudinary public_id and CDN URLs.
        driveFileId: stored.fileId,
        driveViewUrl: stored.viewUrl || stored.url,
        driveDownloadUrl: stored.downloadUrl || stored.url,
        releaseNotes: releaseNotes || "",
        isLatest: true,
        uploadedBy: req.user?.id,
        uploadedByName: req.user?.name || "HR",
      });

      console.log(
        `[APP-UPLOAD] v${version} uploaded by ${req.user?.name || "HR"} → ${stored.fileId}`,
      );
      res.json({
        success: true,
        data: appVersion,
        message: `v${version} uploaded successfully`,
      });
    } catch (err) {
      console.error("[APP-UPLOAD]", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ── PATCH /api/hr/app/versions/:id/set-latest ──
router.patch(
  "/versions/:id/set-latest",
  EmployeeAuthMiddleware,
  async (req, res) => {
    try {
      const target = await AppVersion.findById(req.params.id).select("app").lean();
      if (!target)
        return res
          .status(404)
          .json({ success: false, message: "Version not found" });
      await AppVersion.updateMany(
        { ...appScope(target.app), isLatest: true },
        { $set: { isLatest: false } },
      );
      const ver = await AppVersion.findByIdAndUpdate(
        req.params.id,
        { $set: { isLatest: true } },
        { new: true },
      );
      if (!ver)
        return res
          .status(404)
          .json({ success: false, message: "Version not found" });
      res.json({
        success: true,
        data: ver,
        message: `v${ver.version} set as latest`,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ── POST /api/hr/app/versions — publish a release as a LINK ──
// For an APK hosted anywhere the phones can reach (the company site, a shared
// drive). Uploading the file itself is /upload above; this is the same row
// without the bytes, and the one the employee app's update prompt reads.
router.post("/versions", EmployeeAuthMiddleware, async (req, res) => {
  try {
    const version = String(req.body?.version || "").trim();
    const versionCode = Number(req.body?.versionCode) || 0;
    const downloadUrl = String(req.body?.downloadUrl || "").trim();
    const app = String(req.body?.app || "employee").trim();
    if (!version)
      return res.status(400).json({ success: false, message: "Version is required." });
    if (!versionCode || versionCode < 1)
      return res.status(400).json({ success: false, message: "Version code is required — the whole number the phone compares." });
    if (!/^https?:\/\/\S+$/i.test(downloadUrl))
      return res.status(400).json({ success: false, message: "Give a download link starting with http:// or https://." });
    const clash = await AppVersion.findOne({ ...appScope(app), versionCode }).lean();
    if (clash)
      return res.status(409).json({ success: false, message: `Version code ${versionCode} is already published as v${clash.version}.` });

    await AppVersion.updateMany({ ...appScope(app), isLatest: true }, { $set: { isLatest: false } });
    const row = await AppVersion.create({
      version,
      app,
      versionCode,
      fileName: `Matrubhoomi-${version}.apk`,
      driveViewUrl: downloadUrl,
      driveDownloadUrl: downloadUrl,
      releaseNotes: String(req.body?.releaseNotes || "").trim(),
      isLatest: true,
      uploadedByName: req.user?.name || "HR",
    });
    res.status(201).json({ success: true, data: row, message: `v${version} published — phones on older versions will be offered it.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/hr/app/adoption — who has the employee app, on which version ──
// From Employee.appInfo, which the app's own requests keep current
// (Middlewear/AllEmployeeAppMiddleware.js).
router.get("/adoption", EmployeeAuthMiddleware, async (req, res) => {
  try {
    const Employee = require("../../models/Employee");
    const { activeEmployeeFilter } = require("../../utils/employeeActive");
    const people = await Employee.find(activeEmployeeFilter({ employmentType: { $ne: "intern" } }))
      .select("firstName lastName biometricId department designation phone appInfo")
      .sort({ "appInfo.lastSeenAt": -1, firstName: 1 })
      .lean();
    const now = Date.now();
    const DAY = 86400000;
    const rows = people.map((p) => {
      const seen = p.appInfo?.lastSeenAt ? new Date(p.appInfo.lastSeenAt).getTime() : null;
      return {
        id: p._id,
        name: [p.firstName, p.lastName].filter(Boolean).join(" "),
        code: p.biometricId || "",
        department: p.department || "",
        designation: p.designation || "",
        lastSeenAt: p.appInfo?.lastSeenAt || null,
        firstSeenAt: p.appInfo?.firstSeenAt || null,
        version: p.appInfo?.version || "",
        build: p.appInfo?.build || 0,
        device: p.appInfo?.device || "",
        os: p.appInfo?.os || "",
        state: seen == null ? "never" : now - seen <= 7 * DAY ? "active" : "idle",
      };
    });
    const latest = await AppVersion.findOne({ app: "employee", isLatest: true }).lean();
    res.json({
      success: true,
      data: {
        rows,
        summary: {
          total: rows.length,
          active: rows.filter((r) => r.state === "active").length,
          idle: rows.filter((r) => r.state === "idle").length,
          never: rows.filter((r) => r.state === "never").length,
          behind: latest?.versionCode ? rows.filter((r) => r.build && r.build < latest.versionCode).length : 0,
        },
        latest: latest ? { version: latest.version, versionCode: latest.versionCode, publishedAt: latest.createdAt } : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/hr/app/versions/:id ──
router.delete("/versions/:id", EmployeeAuthMiddleware, async (req, res) => {
  try {
    const ver = await AppVersion.findByIdAndDelete(req.params.id);
    if (!ver)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: `v${ver.version} deleted` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/hr/app/download/:id — track download count ──
router.get("/download/:id", async (req, res) => {
  try {
    const ver = await AppVersion.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloadCount: 1 } },
      { new: true },
    );
    if (!ver)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({
      success: true,
      data: { downloadUrl: ver.driveDownloadUrl || ver.driveViewUrl },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
