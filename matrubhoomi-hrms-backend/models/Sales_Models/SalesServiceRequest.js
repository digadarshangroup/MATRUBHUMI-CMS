// models/Sales_Models/SalesServiceRequest.js
//
// A paying customer needs something. Maintenance, a replacement, a complaint,
// a scheme they were promised.
//
// WHY IT IS NOT JUST A TASK
// -------------------------
// A task is one person's day. A service request outlives the task: the first
// visit finds a part missing, a second visit fits it, and both belong to the
// same complaint the customer will refer to by one number when they call
// again. So the request is the thread and tasks hang off it — closing the last
// task does not close the request; somebody decides that.
//
// It only ever points at a lead that has already converted (`isCustomer`).
// Raising one against an unconverted lead is refused at the route, because a
// maintenance visit to somebody who never bought anything is a sign the desk
// picked the wrong row.

const mongoose = require("mongoose");

const salesServiceRequestSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, index: true },

    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesLead", required: true, index: true },
    customerName: { type: String, trim: true, default: "" },
    customerPhone: { type: String, trim: true, default: "" },
    village: { type: String, trim: true, default: "" },

    type: {
      type: String,
      enum: ["maintenance", "complaint", "installation", "inspection", "collection", "other"],
      default: "maintenance",
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },

    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },

    status: {
      type: String,
      enum: ["open", "assigned", "in_progress", "resolved", "closed", "cancelled"],
      default: "open",
      index: true,
    },

    // Every task raised against this thread, oldest first. The thread's own
    // status is set by a person, not by the last task closing — see the header.
    taskIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },

    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "DeptUser" },
    raisedByName: { type: String, trim: true, default: "" },
    // How the customer got in touch. A complaint that arrived through a field
    // visit is a different signal from one that arrived by phone.
    channel: { type: String, enum: ["call", "field_visit", "whatsapp", "walk_in", "other"], default: "call" },

    dueAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, trim: true, default: "" },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

salesServiceRequestSchema.index({ status: 1, priority: 1, createdAt: -1 });

module.exports =
  mongoose.models.SalesServiceRequest ||
  mongoose.model("SalesServiceRequest", salesServiceRequestSchema, "sales_service_requests");
