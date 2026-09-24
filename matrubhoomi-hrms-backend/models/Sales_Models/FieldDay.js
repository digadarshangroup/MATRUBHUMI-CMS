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
    // TWO KINDS OF ENTRY SHARE THIS LIST, and they answer different questions:
    //
    //   stay   the phone stayed within FIELD_STOP_RADIUS_M for at least
    //          FIELD_STOP_MINUTES — "stayed in Kalmeshwar for 45 minutes".
    //          Found by the ingest from the fixes themselves.
    //   visit  a form was submitted here — "recorded Ramesh Kumar's visit".
    //          Written by noteFieldActivity(), with the farmer as its label.
    //
    // Rows written before `kind` existed have none; a row with a leadId is a
    // visit, anything else a stay (see kindOf() in services/fieldTracking.js).
    kind: { type: String, enum: ["stay", "visit"], default: undefined },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    arrivedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
    minutes: { type: Number, default: 0 },
    label: { type: String, trim: true, default: "" },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesLead", default: null },
    // What the place is called, filled in after the fact by the naming pass —
    // `locality` is the village or town, `place` the short line a person reads.
    place: { type: String, trim: true, default: "" },
    locality: { type: String, trim: true, default: "" },
    district: { type: String, trim: true, default: "" },
    named: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * Where the phone is sitting RIGHT NOW, carried from one batch to the next.
 *
 * WHY THIS HAS TO BE STORED
 * -------------------------
 * The handset posts every two minutes, so no single batch ever holds a
 * forty-minute visit — and a phone standing still sends almost nothing, because
 * the location provider only reports once it has moved. Stops were therefore
 * looked for inside one batch at a time and almost never found. The stay being
 * measured now outlives the batch: each batch extends it or closes it, and a
 * closed one long enough becomes a `stops` row.
 *
 * It is also what the desk reads as "stopped at Kalmeshwar since 10:42".
 */
const staySchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number,
    // The first good fix of the stay. The centroid may not wander further than
    // one and a half radii from it — which is what stops a slow walk down a
    // lane from being counted as one long stop that drifted along with it.
    anchorLat: Number,
    anchorLng: Number,
    sumLat: Number,
    sumLng: Number,
    n: Number,
    since: Date,
    lastAt: Date,
    place: { type: String, default: "" },
    locality: { type: String, default: "" },
    district: { type: String, default: "" },
    named: { type: Boolean, default: false },
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
    // Metres per second off the last believable fix, and its heading — what
    // the desk reads as "moving at 32 km/h".
    lastSpeed: { type: Number, default: null },
    lastBearing: { type: Number, default: null },
    // The last fix that COUNTED as travel. "Moving" versus "stopped" is read
    // from this against the open stay, not from a speed a phone in a pocket
    // reports as zero.
    lastMovingAt: { type: Date, default: null },
    // The name of the last position, and the rounded coordinate it was looked
    // up for, so it is renamed only once the phone has actually moved on.
    lastPlace: { type: String, trim: true, default: "" },
    lastLocality: { type: String, trim: true, default: "" },
    lastDistrict: { type: String, trim: true, default: "" },
    lastPlaceKey: { type: String, trim: true, default: "" },

    stay: { type: staySchema, default: null },

    // Duty, as the employee switched it. `lastPingAt` alone cannot tell "ended
    // the day at six" from "phone died at six"; these can, which is the
    // difference between "off duty" and "not reporting" on the desk.
    dutyOn: { type: Boolean, default: null },
    dutyStartedAt: { type: Date, default: null },
    dutyEndedAt: { type: Date, default: null },
    dutySessions: {
      type: [
        new mongoose.Schema(
          {
            startAt: Date,
            endAt: { type: Date, default: null },
            // The handset's own ids for the two events, which is what makes a
            // retried delivery a no-op instead of a second session.
            startRef: { type: String, default: "" },
            endRef: { type: String, default: "" },
            startLat: Number,
            startLng: Number,
            endLat: Number,
            endLng: Number,
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // The attendance request ending duty filed for this day (field staff
    // rarely pass the fingerprint machine) — see services/fieldAttendance.js.
    attendance: {
      requestId: { type: mongoose.Schema.Types.ObjectId, ref: "RegularizationRequest", default: null },
      status: { type: String, default: "" }, // filed | updated | skipped
      reason: { type: String, default: "" },
      at: { type: Date, default: null },
    },

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
