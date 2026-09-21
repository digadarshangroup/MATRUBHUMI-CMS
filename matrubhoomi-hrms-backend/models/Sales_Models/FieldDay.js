// models/Sales_Models/FieldDay.js
//
// One employee, one day, rolled up as it happens.
//
// WHY A ROLLUP AND NOT A QUERY
// ----------------------------
// "How far did Ramesh travel on Tuesday" is the question this system exists to
// answer, and it is asked about a month of days for a team at a time. Answered
// by scanning FieldLocationPing it costs tens of thousands of documents per
// screen and gets worse every week. Answered here it is one document per person
// per day, written incrementally by the same ingest that stores the fixes.
//
// It also OUTLIVES the raw fixes. Pings expire after ninety days; these rows do
// not, so last year's travel is still answerable after the trail behind it has
// been swept away.
//
// THE PATH IS SIMPLIFIED, NOT SAMPLED
// -----------------------------------
// `path` holds a Douglas–Peucker reduction of the day's fixes — the corners
// kept, the straight runs dropped. Sampling every Nth fix would round corners
// off a route and quietly shorten it; simplification keeps the shape and the
// distance while fitting a day into a few hundred points a browser can draw.

const mongoose = require("mongoose");

const stopSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    // A stop is somewhere the phone stayed put for longer than
    // FIELD_STOP_MINUTES. It is what turns a line on a map into "four visits
    // and a long lunch".
    arrivedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
    minutes: { type: Number, default: 0 },
    label: { type: String, trim: true, default: "" },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesLead", default: null },
  },
  { _id: false },
);

const fieldDaySchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    employeeName: { type: String, trim: true, default: "" },
    employeeCode: { type: String, trim: true, default: "" },
    day: { type: String, trim: true, required: true }, // YYYY-MM-DD, IST

    firstPingAt: { type: Date, default: null },
    lastPingAt: { type: Date, default: null },

    distanceMeters: { type: Number, default: 0 },
    pingCount: { type: Number, default: 0 },
    movingSeconds: { type: Number, default: 0 },
    idleSeconds: { type: Number, default: 0 },

    // Where they were last seen. Denormalised so the live board is one query
    // over this collection rather than a per-employee lookup into the fixes.
    lastLat: { type: Number, default: null },
    lastLng: { type: Number, default: null },
    lastAccuracy: { type: Number, default: null },
    lastBattery: { type: Number, default: null },
    lastActivity: { type: String, trim: true, default: "" },

    path: {
      type: [
        new mongoose.Schema(
          { lat: Number, lng: Number, t: Date },
          { _id: false },
        ),
      ],
      default: [],
    },

    stops: { type: [stopSchema], default: [] },

    // What was achieved out there, counted alongside the travel. The pair is
    // the point: 60km and no submissions is a different day from 6km and nine.
    submissionCount: { type: Number, default: 0 },
    leadsCreated: { type: Number, default: 0 },
    tasksCompleted: { type: Number, default: 0 },

    // Honest gaps. The service records when it was stopped, denied permission,
    // or the handset powered off, so a missing hour reads as a known reason
    // rather than as an accusation.
    gaps: {
      type: [
        new mongoose.Schema(
          {
            from: Date,
            to: Date,
            minutes: Number,
            reason: {
              type: String,
              enum: ["no_signal", "permission_revoked", "service_stopped", "power_off", "unknown"],
              default: "unknown",
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

fieldDaySchema.index({ employeeId: 1, day: 1 }, { unique: true });
fieldDaySchema.index({ day: 1, distanceMeters: -1 });

module.exports =
  mongoose.models.FieldDay ||
  mongoose.model("FieldDay", fieldDaySchema, "field_days");
