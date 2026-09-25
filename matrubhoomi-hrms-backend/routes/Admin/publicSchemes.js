// routes/Admin/publicSchemes.js
//
// The second unauthenticated route in this system. Mounted at /api/public.
//
// It backs the scheme cards on matrubhoomifarms.com — /fisheries and the other
// service pages — so it is reachable by anyone on the internet, and it is
// written the same way publicDepartments.js is: an explicit `.select()` of the
// fields a brochure card needs, and nothing else.
//
// WHAT IS DELIBERATELY NOT RETURNED
// ---------------------------------
// `createdBy` / `updatedBy` name the staff member who typed the row. They are
// on the model because the desk list shows "last edited by", and they must
// never reach the public feed: a marketing page must not double as a staff
// directory. `isPublished` is not returned either — an unpublished row is
// simply absent, so there is no draft for a curious reader to notice.
//
// WHY THE STATUS IS COMPUTED HERE
// -------------------------------
// The Open / Closing soon / Closed chip is derived from the deadline rather
// than stored (see the model's `applicationStatus`). Computing it server-side
// rather than in the browser means every visitor sees the same answer at the
// same moment — a client-side clock that is three days fast would otherwise
// show "Closed" on a scheme that is still taking applications.

"use strict";

const express = require("express");
const router = express.Router();

const WebsiteScheme = require("../../models/Website_Models/WebsiteScheme");

/**
 * GET /api/public/schemes
 *
 * Query: ?category=fisheries  (omit for every published scheme)
 */
router.get("/schemes", async (req, res) => {
  try {
    const query = { isPublished: true };
    if (req.query.category) {
      query.category = String(req.query.category).trim().toLowerCase();
    }

    const rows = await WebsiteScheme.find(query)
      .select(
        "slug title titleOdia description category department maxSubsidy deadline " +
          "eligibility applyUrl applyLabel guidelineDoc briefDoc sortOrder updatedAt",
      )
      .sort({ sortOrder: 1, deadline: 1, title: 1 });

    // Short cache. The list changes only when the desk edits it, and the page
    // is hit by every visitor — but a minute is short enough that publishing a
    // scheme feels immediate to the person who just pressed the button.
    res.setHeader("Cache-Control", "public, max-age=60");

    res.json({
      success: true,
      schemes: rows.map((row) => ({
        id: String(row._id),
        slug: row.slug,
        title: row.title,
        titleOdia: row.titleOdia || "",
        description: row.description,
        category: row.category,
        department: row.department || "",
        maxSubsidy: row.maxSubsidy,
        deadline: row.deadline,
        eligibility: row.eligibility || "",
        // Computed server-side so every visitor agrees on it.
        status: row.applicationStatus(),
        applyUrl: row.applyUrl || "",
        applyLabel: row.applyLabel || "Apply now",
        // Only what a download link needs: where, what it is called, how big.
        guideline: row.guidelineDoc
          ? {
              url: row.guidelineDoc.url,
              fileName: row.guidelineDoc.fileName,
              bytes: row.guidelineDoc.bytes,
            }
          : null,
        brief: row.briefDoc
          ? {
              url: row.briefDoc.url,
              fileName: row.briefDoc.fileName,
              bytes: row.briefDoc.bytes,
            }
          : null,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (err) {
    console.error("[public-schemes]", err);
    res.status(500).json({ success: false, message: "Could not load schemes" });
  }
});

module.exports = router;
