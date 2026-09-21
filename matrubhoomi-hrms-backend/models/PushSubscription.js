// models/PushSubscription.js
//
// One browser's Web Push subscription, for either kind of user.
//
// WHY A SEPARATE COLLECTION, rather than a field on Employee / HRDepartment:
//
//   • A person has MANY browsers (office desktop, laptop, phone PWA). The old
//     design stored a single `fcmToken` string on Employee, so signing in on a
//     second machine silently stopped notifications on the first.
//   • Two unrelated user models need this — Employee (self-service portal and
//     the app) and HRDepartment / CEODepartment (the CMS). Bolting the same
//     array onto both is how the codebase ended up with a `fcmTokens` field
//     that was READ in routes but never DECLARED in the schema, so every write
//     was dropped by mongoose and HR push simply never worked.
//   • A dead endpoint must be deletable from the send path without loading,
//     mutating and re-saving a user document mid-broadcast.
//
// `endpoint` is the browser's own push-service URL and is globally unique, so
// it is the natural primary key: re-subscribing the same browser updates the
// row in place instead of accumulating duplicates.

const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema(
  {
    // "employee" → models/Employee, "cms" → HRDepartment / CEODepartment.
    // The send path never mixes them: a leave-approved push goes to the
    // employee's browsers, an attendance-alert push to HR's.
    ownerType: {
      type: String,
      enum: ["employee", "cms"],
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    endpoint: { type: String, required: true, unique: true },

    // The browser's public key and auth secret, straight out of
    // PushSubscription.toJSON(). web-push needs both to encrypt the payload;
    // a row missing either is unusable and is treated as stale.
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },

    userAgent: { type: String, default: "" },

    // Refreshed every time the browser re-subscribes on sign-in. A row that
    // has not been seen in months belongs to a machine nobody uses.
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ ownerType: 1, ownerId: 1 });

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
