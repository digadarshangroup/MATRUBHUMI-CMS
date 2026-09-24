// models/EmployeeNotification.js
//
// Every notification an employee was sent, kept so the app can SHOW it.
//
// WHY AN INBOX AND NOT ONLY PUSH
// ------------------------------
// Mobile push here is Expo-only (utils/sendExpoPush.js): the server accepts an
// ExponentPushToken and nothing else. The Matrubhoomi employee app is native
// Kotlin with no Firebase project behind it, so it cannot receive one — and
// even where push works, a notification swiped away is gone, which is a poor
// home for "your leave was approved".
//
// So every notification that goes through utils/notifyEmployee.js is ALSO
// written here, one row per recipient. The app reads this collection when it
// opens and on a background check every fifteen minutes, and raises its own
// Android notification for anything new. Push, where it exists, is unchanged.
//
// Rows expire after ninety days. An inbox is "what happened recently", not an
// archive — the leave, the payslip and the document are the records.

const mongoose = require("mongoose");

const TTL_DAYS = Number(process.env.EMPLOYEE_NOTIFICATION_TTL_DAYS || 90);

const employeeNotificationSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },

    title: { type: String, trim: true, required: true },
    body: { type: String, trim: true, default: "" },

    // What it is about — "leave", "regularization", "overtime", "payroll",
    // "document", "sales_task", "sales_review", "attendance". The app routes a
    // tap by this, so it is a small vocabulary rather than free text.
    kind: { type: String, trim: true, default: "general" },
    // The screen the sender had in mind, kept verbatim even when it is not one
    // of the Expo app's route names — the native app has routes of its own.
    screen: { type: String, trim: true, default: "" },
    // The record it points at: a leave application, a task, a document.
    refId: { type: String, trim: true, default: "" },

    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The one query that exists: my latest, newest first.
employeeNotificationSchema.index({ employeeId: 1, createdAt: -1 });
employeeNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 });

module.exports =
  mongoose.models.EmployeeNotification ||
  mongoose.model("EmployeeNotification", employeeNotificationSchema, "employee_notifications");
