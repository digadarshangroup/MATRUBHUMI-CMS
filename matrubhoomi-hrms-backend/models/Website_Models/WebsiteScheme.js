// models/Website_Models/WebsiteScheme.js
//
// A government scheme as it appears on the PUBLIC marketing site.
//
// IT IS NOT A SalesScheme, AND THE NAME IS DELIBERATE
// ---------------------------------------------------
// `models/Sales_Models/SalesScheme.js` already owns the word "scheme" inside
// this codebase, and it means something completely different: a named workflow
// a customer is put through, whose `key` equals the `pipelineKey` every sales
// document carries. That one is internal machinery — steps, stages, approvals.
//
// THIS one is a brochure entry. It is what a visitor to matrubhoomifarms.com
// reads on /fisheries: a title, what the scheme is, two PDFs to download, and a
// button that takes them to the government portal to apply. It has no steps, no
// customers standing on it, and no bearing on the sales pipeline.
//
// Naming it `WebsiteScheme` rather than overloading `SalesScheme` keeps those
// two ideas apart. Merging them would have been the cheaper commit and the
// expensive year: every query for "the customer's scheme" would then have to
// remember to exclude the brochure rows, and the one that forgot would be the
// one that assigned a lead to "Pradhan Mantri Matsya Sampada Yojana" as if it
// were a pipeline.
//
// WHY THE PDF IS STORED AS AN OBJECT AND NOT A URL STRING
// -------------------------------------------------------
// On this Cloudinary account a PDF cannot be delivered publicly at all — the
// CDN answers 401 — so `services/mediaUpload.service.js` stores non-images as
// `type: "private"` and hands back a `/api/files/<token>` URL instead (the long
// header on `routes/files.js` explains the whole probe). That token URL is the
// only readable address the file has, and it is unauthenticated by design, so
// the public site can link straight to it.
//
// The file name and size travel with it because the public page shows them next
// to the download link, and asking the browser for a HEAD request on every card
// to discover "2.4 MB" would be absurd.
//
// WHY `isPublished` AND NOT A DELETE
// ----------------------------------
// A scheme closes, and the page should stop offering it — but the row is what
// the desk edits next season when the same scheme reopens with new dates.
// Unpublishing hides it from the public feed and keeps it on the desk's list.

const mongoose = require("mongoose");

/**
 * Which public page a scheme belongs to.
 *
 * These are the marketing site's own section slugs, not sales categories. The
 * list is open on purpose — adding a page there should not need a migration
 * here — but it is validated so a typo ("fishries") cannot silently produce a
 * scheme that no page ever queries.
 */
const WEBSITE_CATEGORIES = [
  "fisheries",
  "horticulture",
  "trading",
  "ca-banking-loans",
  "farming-construction",
  "real-estate",
  "software-development",
  "entrepreneur-manufacturing",
  "product-retail",
];

/**
 * A stored document. Shape mirrors exactly what POST /api/uploads answers, so
 * the CMS can hand the upload response straight through without reshaping it.
 */
const documentSchema = new mongoose.Schema(
  {
    // For a PDF this is the /api/files/<token> proxy URL, never a CDN one.
    url: { type: String, required: true, trim: true },
    fileName: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    bytes: { type: Number, default: 0 },
  },
  { _id: false },
);

const websiteSchemeSchema = new mongoose.Schema(
  {
    // ——— The five fields the desk was asked for ———————————————————————

    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 200,
    },

    // Odia rendering of the title. The public cards already show one under the
    // English line, and a government scheme that is advertised in Odisha
    // without its Odia name reads as a form rather than an invitation.
    titleOdia: { type: String, trim: true, default: "", maxlength: 200 },

    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: 4000,
    },

    guidelineDoc: { type: documentSchema, default: null },
    briefDoc: { type: documentSchema, default: null },

    // Where the Apply button goes. Usually a government portal
    // (sugam.odisha.gov.in, pmmsy.dof.gov.in); left empty the public page hides
    // the button rather than rendering one that goes nowhere.
    applyUrl: { type: String, trim: true, default: "" },
    applyLabel: { type: String, trim: true, default: "Apply now", maxlength: 40 },

    // ——— How the public page files it ————————————————————————————————

    // Stable handle used in the public URL. Derived from the title on first
    // save and then frozen: a slug that follows later title edits breaks every
    // link anybody shared.
    slug: { type: String, trim: true, lowercase: true, index: true },

    category: {
      type: String,
      enum: {
        values: WEBSITE_CATEGORIES,
        message: "{VALUE} is not a page on the website",
      },
      default: "fisheries",
      index: true,
    },

    // ——— Optional detail the existing cards already render ———————————

    // The issuing body, e.g. "Dept. of Fisheries & ARD, Govt. of Odisha".
    department: { type: String, trim: true, default: "", maxlength: 200 },

    // Maximum assistance in rupees. Null means "not published as a figure",
    // which is different from zero — several schemes are subsidy-percentage
    // based and quoting ₹0 on the card would be a lie.
    maxSubsidy: { type: Number, default: null, min: 0 },

    // Last date to apply. Drives the Open / Closing soon / Closed chip, so the
    // desk never has to remember to flip a status by hand.
    deadline: { type: Date, default: null },

    eligibility: { type: String, trim: true, default: "", maxlength: 2000 },

    // ——— Publication ——————————————————————————————————————————————

    isPublished: { type: Boolean, default: false, index: true },

    // Ascending. Ties break on deadline then title, so an unordered list is
    // still deterministic rather than "whatever Mongo felt like".
    sortOrder: { type: Number, default: 0 },

    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);

// The public feed's only query: published rows for one page, in display order.
websiteSchemeSchema.index({ category: 1, isPublished: 1, sortOrder: 1 });

/**
 * Slug from title — lowercase, alphanumerics and single hyphens.
 *
 * Non-ASCII is stripped rather than transliterated, so a title written only in
 * Odia yields an empty slug; the caller falls back to the row id in that case
 * instead of producing "-" for every such scheme.
 */
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

websiteSchemeSchema.pre("save", function assignSlug(next) {
  if (!this.slug) {
    this.slug = slugify(this.title) || String(this._id);
  }
  next();
});

/**
 * Open / closing soon / closed, computed from the deadline.
 *
 * Derived rather than stored because a stored status is wrong the morning after
 * nobody logged in to change it — and a public page advertising a closed scheme
 * as open sends someone to a portal that will refuse them.
 */
websiteSchemeSchema.methods.applicationStatus = function applicationStatus(now = new Date()) {
  if (!this.deadline) return "open";
  const msLeft = this.deadline.getTime() - now.getTime();
  if (msLeft < 0) return "closed";
  if (msLeft <= 14 * 24 * 60 * 60 * 1000) return "closing_soon";
  return "open";
};

module.exports = mongoose.model("WebsiteScheme", websiteSchemeSchema);
module.exports.WEBSITE_CATEGORIES = WEBSITE_CATEGORIES;
