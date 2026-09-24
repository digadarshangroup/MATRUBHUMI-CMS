// models/Sales_Models/FieldLocationPing.js
//
// One GPS fix from one handset. The raw material of "where has the team been".
//
// THIS COLLECTION IS THE BIGGEST ONE IN THE DATABASE, BY A LONG WAY
// -----------------------------------------------------------------
// Twenty field staff at a fix every fifteen seconds is roughly 2.3 million rows
// a month. Three consequences shape everything below:
//
//   1. It has a TTL. Pings older than FIELD_PING_TTL_DAYS (90 by default) are
//      dropped by Mongo itself. The DAY ROLLUP in FieldDay is what survives —
//      distance, hours and the simplified path are computed on ingest and kept
//      forever, so deleting the raw fixes never loses the answer anybody
//      actually asks.
//   2. Nothing computes over it on read. `distanceFromPrev` is written at
//      INGEST, because summing a day's travel by scanning fixes at page-load
//      time is a query that gets slower every week the company operates.
//   3. It is written in BATCHES. The app holds fixes and posts twenty at a
//      time, so a walk down a lane is one request rather than twenty.
//
// WHAT IS DELIBERATELY NOT HERE
// -----------------------------
// No reverse-geocoded address. Turning every fix into a street name is one
// third-party call per fix; the desk gets an address for the handful of points
// that matter (a form submission, a day's start and end) and coordinates for
// the rest.

const mongoose = require("mongoose");

const TTL_DAYS = Number(process.env.FIELD_PING_TTL_DAYS || 90);

const fieldLocationPingSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    employeeCode: { type: String, trim: true, default: "" },

    // The local calendar day (YYYY-MM-DD, IST). Stored rather than derived so
    // "show me Tuesday" is an index hit and not a range scan across a timezone
    // conversion.
    day: { type: String, trim: true, required: true },

    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number, default: null },
    altitude: { type: Number, default: null },
    // Metres per second, straight off the fix. The app also derives its own
    // moving/idle judgement, which is kept separately below — a stationary
    // phone reports small non-zero speeds all day.
    speed: { type: Number, default: null },
    bearing: { type: Number, default: null },

    // When the FIX was taken, not when it arrived. A batch posted after an hour
    // of no signal carries an hour of correctly-timed history.
    recordedAt: { type: Date, required: true },

    battery: { type: Number, default: null },
    isCharging: { type: Boolean, default: false },
    // Android's own flag. Kept and surfaced, never used to silently discard —
    // see the note on SalesFormSubmission.location.isMock.
    isMock: { type: Boolean, default: false },
    isMoving: { type: Boolean, default: false },

    provider: { type: String, trim: true, default: "" },
    activity: {
      type: String,
      enum: ["still", "walking", "running", "in_vehicle", "on_bicycle", "unknown"],
      default: "unknown",
    },

    // Why this fix exists. `form` and `task` fixes are the ones the desk sees
    // as pins; `service` fixes are the trail between them.
    // `heartbeat` is the fix the app asks for when the phone has NOT moved:
    // the provider reports only after movement, so without it a stationary
    // phone sends nothing and a long visit is invisible.
    source: {
      type: String,
      enum: ["service", "manual", "form", "task", "punch", "boot", "heartbeat"],
      default: "service",
    },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesTask", default: null },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesLead", default: null },

    // Metres from the previous accepted fix for this employee. Written once, at
    // ingest — see point 2 in the header.
    distanceFromPrev: { type: Number, default: 0 },

    batchId: { type: String, trim: true, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The two queries that exist: one employee's day (the path), and everybody's
// latest fix (the live board).
fieldLocationPingSchema.index({ employeeId: 1, recordedAt: -1 });
fieldLocationPingSchema.index({ day: 1, employeeId: 1, recordedAt: 1 });
fieldLocationPingSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 });

module.exports =
  mongoose.models.FieldLocationPing ||
  mongoose.model("FieldLocationPing", fieldLocationPingSchema, "field_location_pings");
