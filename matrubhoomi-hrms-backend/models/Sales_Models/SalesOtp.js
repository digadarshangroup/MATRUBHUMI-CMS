// models/Sales_Models/SalesOtp.js
//
// The farmer's consent, in the one form that cannot be manufactured by the
// person collecting it.
//
// An employee can type any name, any village and any land size into a form. The
// one thing they cannot do from a tea shop is make a code arrive on the
// farmer's handset and read it back. So every stage the desk marks
// `requiresOtp` is gated on a row here having been verified — and the
// submission stores the row's id, so the proof travels with the record.
//
// THE CODE IS HASHED
// ------------------
// A four-digit code in plaintext in a collection somebody can read is not a
// second factor, it is a lookup. Stored as a SHA-256 of code + phone + secret,
// compared by re-hashing what was typed. The same reason password hashes exist,
// at a much smaller scale.

const mongoose = require("mongoose");

const salesOtpSchema = new mongoose.Schema(
  {
    // Ten digits, normalised the same way SalesLead.phone is. A code issued to
    // "+91 98765 43210" must verify against "9876543210" typed back.
    phone: { type: String, required: true, trim: true, index: true },

    codeHash: { type: String, required: true },

    purpose: {
      type: String,
      // portal_login is the one purpose the CUSTOMER asks for themselves, from
      // the portal where they check their own progress. Every other purpose is
      // an employee asking a farmer to read a code back.
      enum: ["lead_verify", "stage_verify", "agreement", "collection", "portal_login"],
      default: "lead_verify",
    },

    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesLead", default: null },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesTask", default: null },
    stageKey: { type: String, lowercase: true, trim: true, default: "" },

    // The employee who asked for it. For every field purpose an OTP is
    // requested by somebody standing in front of somebody else, and that
    // pairing is the audit trail — so it stays required for all of them.
    //
    // The exception is portal_login, where the customer is asking on their own
    // behalf and there is no employee in the room. Forcing a fake one there
    // would put an employee's name against an action they did not take, which
    // is worse than an empty column.
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: function requiredUnlessPortal() {
        return this.purpose !== "portal_login";
      },
      default: null,
      index: true,
    },
    requestedByName: { type: String, trim: true, default: "" },

    channel: { type: String, enum: ["sms", "whatsapp", "call", "manual"], default: "sms" },
    // What actually happened when we tried to send it. `manual` means no SMS
    // provider is configured and the code was shown to the employee to read
    // out — honest, and visibly different from a delivered message.
    delivery: {
      status: { type: String, enum: ["sent", "failed", "manual", "queued"], default: "queued" },
      provider: { type: String, trim: true, default: "" },
      providerRef: { type: String, trim: true, default: "" },
      error: { type: String, trim: true, default: "" },
    },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },

    verifiedAt: { type: Date, default: null },
    // Consumed the moment it is spent on a submission, so one verification
    // cannot carry two records.
    consumedAt: { type: Date, default: null },
    consumedBySubmission: { type: mongoose.Schema.Types.ObjectId, ref: "SalesFormSubmission", default: null },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mongo removes the row itself once it expires. A verified-but-unspent code
// still disappears, which is correct: an OTP that outlives its visit is a
// liability, not a convenience.
salesOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
salesOtpSchema.index({ phone: 1, createdAt: -1 });

module.exports =
  mongoose.models.SalesOtp ||
  mongoose.model("SalesOtp", salesOtpSchema, "sales_otps");
