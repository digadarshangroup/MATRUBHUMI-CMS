// models/Sales_Models/GeoPlace.js
//
// What a coordinate is called, remembered so it is asked once.
//
// WHY A CACHE COLLECTION AND NOT AN IN-PROCESS MAP
// ------------------------------------------------
// Every naming provider worth using is rate-limited — OpenStreetMap's Nominatim
// asks for no more than one request a second and will block a caller that
// ignores it. A desk with four people open on the team screen, each refreshing,
// would breach that inside a minute.
//
// A process-local Map would help until the server restarts, which in
// development is every file save. This survives restarts and is shared by every
// worker, so a road the company drives down every week is looked up exactly
// once, ever.
//
// THE KEY IS A ROUNDED COORDINATE, DELIBERATELY
// ---------------------------------------------
// Rounded to three decimal places — about 110 m. Two fixes that far apart are
// on the same stretch of the same road, so they should share an answer; asking
// separately would be one lookup per GPS fix, which is the cost this exists to
// avoid. Finer than that and the cache stops hitting; coarser and a name starts
// belonging to the wrong junction.

const mongoose = require("mongoose");

const geoPlaceSchema = new mongoose.Schema(
  {
    // "21.145,79.088" — the rounded pair, and the only thing ever looked up.
    key: { type: String, required: true, unique: true, index: true },

    lat: { type: Number, required: true },
    lng: { type: Number, required: true },

    // The short line a human reads: usually the road, or the locality when the
    // road is unnamed. This is what the itinerary prints.
    name: { type: String, trim: true, default: "" },

    // The parts, kept separately so a future screen can print a different
    // combination without going back to the provider.
    road: { type: String, trim: true, default: "" },
    locality: { type: String, trim: true, default: "" },
    district: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    postcode: { type: String, trim: true, default: "" },

    // The provider's own full string, kept verbatim. When a name looks wrong,
    // this is what shows whether we mis-assembled it or were told it.
    display: { type: String, trim: true, default: "" },

    source: { type: String, trim: true, default: "nominatim" },

    // A NEGATIVE ANSWER IS CACHED TOO. A coordinate in the middle of a field
    // genuinely has no road, and re-asking every time the screen opens is how a
    // rate limit gets breached by a place that will never have a name.
    found: { type: Boolean, default: true },

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "geo_places" },
);

// Roads get renamed and localities get redrawn, but not often. Six months is
// long enough that the cache is doing its job and short enough that a name is
// not indefinitely wrong.
geoPlaceSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = mongoose.models.GeoPlace || mongoose.model("GeoPlace", geoPlaceSchema);
