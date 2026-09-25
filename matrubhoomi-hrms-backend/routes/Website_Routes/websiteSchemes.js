// routes/Website_Routes/websiteSchemes.js  →  mounted at /api/website/schemes
//
// The desk's end of the public scheme listings. Everything here is behind the
// sales desk guard; the PUBLIC half lives in routes/Admin/publicSchemes.js and
// shares nothing with this file but the model.
//
// WHY THE SPLIT IS TWO FILES AND NOT ONE ROUTER WITH AN `if`
// ----------------------------------------------------------
// These rows are written by staff and read by anyone on the internet. A single
// router serving both means one forgotten guard publishes the desk's view —
// drafts, the name of whoever edited it, internal notes — to the public feed.
// Two files means the public one can be read end to end in a minute and its
// `.select()` audited on sight, which is the only review that actually gets
// done. It is the same reason publicDepartments.js exists apart from the admin
// department routes.
//
// WHY THE PDF IS NOT UPLOADED HERE
// --------------------------------
// The CMS posts the file to /api/uploads first — the one upload policy for the
// whole system, which knows that a PDF on this Cloudinary account has to be
// stored private and served through /api/files/<token> — and then sends the
// response object here as `guidelineDoc` / `briefDoc`. Re-implementing the
// upload in this file would be the fifth copy of that policy, and the header on
// routes/uploads.js is the story of what the previous four cost.

"use strict";

const express = require("express");
const router = express.Router();

const WebsiteScheme = require("../../models/Website_Models/WebsiteScheme");
const { WEBSITE_CATEGORIES } = require("../../models/Website_Models/WebsiteScheme");
const { deskRead, deskWrite, sendError } = require("../Sales_Routes/_deskAuth");

/**
 * Keep only the document fields we store.
 *
 * The upload response carries a dozen keys (publicId, resourceType, the raw
 * Cloudinary delivery type); persisting the lot would mean the public feed
 * leaks our storage layout the first time somebody adds a field to the select.
 * Taking four named keys makes that impossible rather than unlikely.
 */
function cleanDoc(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = String(raw.url || "").trim();
  if (!url) return null;
  return {
    url,
    fileName: String(raw.fileName || "").trim(),
    mimeType: String(raw.mimeType || "").trim(),
    bytes: Number(raw.bytes) || 0,
  };
}

/**
 * The writable surface, pulled out of the request body by name.
 *
 * `undefined` means "not sent, leave it alone" and is why this cannot be a
 * spread of req.body: a PATCH that omits `deadline` must not clear it, and a
 * PATCH that sends `deadline: null` must.
 */
function writableFields(body = {}) {
  const out = {};
  const str = (k, v) => {
    if (v !== undefined) out[k] = String(v ?? "").trim();
  };

  str("title", body.title);
  str("titleOdia", body.titleOdia);
  str("description", body.description);
  str("applyUrl", body.applyUrl);
  str("applyLabel", body.applyLabel);
  str("department", body.department);
  str("eligibility", body.eligibility);

  if (body.category !== undefined) out.category = String(body.category).trim();
  if (body.guidelineDoc !== undefined) out.guidelineDoc = cleanDoc(body.guidelineDoc);
  if (body.briefDoc !== undefined) out.briefDoc = cleanDoc(body.briefDoc);
  if (body.isPublished !== undefined) out.isPublished = Boolean(body.isPublished);
  if (body.sortOrder !== undefined) out.sortOrder = Number(body.sortOrder) || 0;

  // Explicit null clears; a blank string is treated as a clear too, because
  // that is what an emptied form field actually sends.
  if (body.maxSubsidy !== undefined) {
    out.maxSubsidy =
      body.maxSubsidy === null || body.maxSubsidy === "" ? null : Number(body.maxSubsidy);
  }
  if (body.deadline !== undefined) {
    out.deadline = body.deadline ? new Date(body.deadline) : null;
  }

  return out;
}

/** The desk's view of a row — everything, plus the derived status. */
function forDesk(doc) {
  return {
    ...doc.toObject(),
    status: doc.applicationStatus(),
  };
}

/** GET /api/website/schemes — the desk list. Drafts included. */
router.get("/", deskRead, async (req, res) => {
  try {
    const query = {};
    if (req.query.category) query.category = String(req.query.category);
    // The desk list shows drafts by default; `?publishedOnly=true` is for
    // previewing what the site currently serves.
    if (req.query.publishedOnly === "true") query.isPublished = true;

    const rows = await WebsiteScheme.find(query).sort({
      sortOrder: 1,
      deadline: 1,
      title: 1,
    });

    res.json({
      success: true,
      data: rows.map(forDesk),
      categories: WEBSITE_CATEGORIES,
    });
  } catch (err) {
    sendError(res, err, "website-schemes");
  }
});

/** GET /api/website/schemes/:id */
router.get("/:id", deskRead, async (req, res) => {
  try {
    const row = await WebsiteScheme.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Scheme not found" });
    }
    res.json({ success: true, data: forDesk(row) });
  } catch (err) {
    sendError(res, err, "website-schemes");
  }
});

/** POST /api/website/schemes */
router.post("/", deskWrite, async (req, res) => {
  try {
    const fields = writableFields(req.body);

    if (!fields.title) {
      return res.status(400).json({
        success: false,
        message: "Title is required",
        fields: { title: "Required" },
      });
    }
    if (!fields.description) {
      return res.status(400).json({
        success: false,
        message: "Description is required",
        fields: { description: "Required" },
      });
    }

    const row = await WebsiteScheme.create({
      ...fields,
      createdBy: req.user?.name || req.user?.email || "",
      updatedBy: req.user?.name || req.user?.email || "",
    });

    console.log(`[WEBSITE-SCHEME] created ${row._id} (${row.title}) by ${req.user?.id}`);
    res.status(201).json({ success: true, data: forDesk(row) });
  } catch (err) {
    // Mongoose validation reads better than a 500 — it names the field.
    if (err?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    sendError(res, err, "website-schemes");
  }
});

/** PATCH /api/website/schemes/:id */
router.patch("/:id", deskWrite, async (req, res) => {
  try {
    const row = await WebsiteScheme.findById(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Scheme not found" });
    }

    const fields = writableFields(req.body);
    // A cleared title or description would publish a blank card, so an explicit
    // empty is refused rather than saved.
    if (fields.title === "") {
      return res.status(400).json({ success: false, message: "Title cannot be empty" });
    }
    if (fields.description === "") {
      return res.status(400).json({ success: false, message: "Description cannot be empty" });
    }

    Object.assign(row, fields);
    row.updatedBy = req.user?.name || req.user?.email || "";
    await row.save();

    console.log(`[WEBSITE-SCHEME] updated ${row._id} by ${req.user?.id}`);
    res.json({ success: true, data: forDesk(row) });
  } catch (err) {
    if (err?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    sendError(res, err, "website-schemes");
  }
});

/**
 * DELETE /api/website/schemes/:id
 *
 * A real delete, unlike most rows in this system. Nothing references a brochure
 * entry — no customer stands on it, no submission quotes it — so there is no
 * history to orphan, and a desk that cannot remove a scheme it typed twice ends
 * up with a public page listing it twice.
 */
router.delete("/:id", deskWrite, async (req, res) => {
  try {
    const row = await WebsiteScheme.findByIdAndDelete(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Scheme not found" });
    }
    console.log(`[WEBSITE-SCHEME] deleted ${req.params.id} by ${req.user?.id}`);
    res.json({ success: true, message: "Scheme deleted" });
  } catch (err) {
    sendError(res, err, "website-schemes");
  }
});

module.exports = router;
