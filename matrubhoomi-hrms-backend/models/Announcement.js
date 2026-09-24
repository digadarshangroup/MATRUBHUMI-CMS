// models/Announcement.js
//
// A message from HR or the executive office to the workforce — a holiday
// change, a safety notice, "salaries are credited".
//
// It is DELIVERED through the employee inbox (models/EmployeeNotification.js,
// kind "announcement"), one row per recipient, which is what the Android app
// already reads and raises as a phone notification. This row is the sender's
// record: what was said, to whom, by whom — and, by counting the inbox rows
// with a readAt, how many have opened it.

const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true, maxlength: 120 },
    body: { type: String, trim: true, required: true, maxlength: 2000 },

    // "all" — every current employee; "departments" — only those listed.
    audience: { type: String, enum: ["all", "departments"], default: "all" },
    departments: { type: [String], default: [] },

    // Frozen at sending: the people it went to, not who matches today.
    recipients: { type: Number, default: 0 },

    sentBy: { type: String, trim: true, default: "" }, // desk user id
    sentByName: { type: String, trim: true, default: "" },
    sentByRole: { type: String, trim: true, default: "" },

    // Taken back: the inbox rows are removed, this record stays.
    retractedAt: { type: Date, default: null },
    retractedByName: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

announcementSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema, "announcements");
