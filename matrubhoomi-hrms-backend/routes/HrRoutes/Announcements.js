"use strict";
// routes/HrRoutes/Announcements.js
//
// HR (and the executive office) telling the workforce something.
//
//   GET    /                the last fifty, with how many have read each
//   POST   /                { title, body, audience: "all" | "departments", departments: [] }
//   DELETE /:id             take it back — it leaves every inbox, the record stays
//
// Mounted twice, at /api/hr/announcements and /api/ceo/announcements: the same
// desk sign-in, and either office may send. Delivery is the employee inbox
// (kind "announcement"), which the Android app polls and raises as a phone
// notification — so an announcement reaches exactly the people the app would
// show it to, and nobody who has left.

const express = require("express");
const mongoose = require("mongoose");
const { readToken, verifyToken } = require("../../config/jwt");
const Announcement = require("../../models/Announcement");
const EmployeeNotification = require("../../models/EmployeeNotification");
const Employee = require("../../models/Employee");
const { activeEmployeeFilter } = require("../../utils/employeeActive");

const router = express.Router();

const SENDERS = new Set(["hr_manager", "ceo", "admin"]);

function deskAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) return res.status(401).json({ success: false, message: "Authentication required" });
    const decoded = verifyToken(token);
    if (decoded?.type === "employee" || decoded?.type === "customer_portal")
      return res.status(403).json({ success: false, code: "WRONG_TOKEN_TYPE", message: "This area needs a CMS sign-in." });
    if (!SENDERS.has(decoded?.role))
      return res.status(403).json({ success: false, message: "Only HR or the executive office can send announcements." });
    req.desk = { id: String(decoded.id || ""), name: decoded.name || decoded.email || "HR", role: decoded.role };
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

router.use(deskAuth);

router.param("id", (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(404).json({ success: false, message: "Not found" });
  next();
});

/** Who an announcement goes to: current employees, minus interns (no app). */
function audienceFilter(audience, departments) {
  const extra = { employmentType: { $ne: "intern" } };
  if (audience === "departments") extra.department = { $in: departments };
  return activeEmployeeFilter(extra);
}

router.get("/", async (_req, res) => {
  try {
    const rows = await Announcement.find().sort({ createdAt: -1 }).limit(50).lean();
    const ids = rows.map((r) => String(r._id));
    const reads = ids.length
      ? await EmployeeNotification.aggregate([
          { $match: { kind: "announcement", refId: { $in: ids } } },
          { $group: { _id: "$refId", total: { $sum: 1 }, read: { $sum: { $cond: [{ $ne: ["$readAt", null] }, 1, 0] } } } },
        ])
      : [];
    const byId = new Map(reads.map((r) => [r._id, r]));
    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        delivered: byId.get(String(r._id))?.total || 0,
        read: byId.get(String(r._id))?.read || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** How many people a draft would reach — so the form can say so before sending. */
router.get("/reach", async (req, res) => {
  try {
    const audience = req.query.audience === "departments" ? "departments" : "all";
    const departments = String(req.query.departments || "").split(",").map((d) => d.trim()).filter(Boolean);
    if (audience === "departments" && departments.length === 0) return res.json({ success: true, data: { recipients: 0 } });
    const recipients = await Employee.countDocuments(audienceFilter(audience, departments));
    res.json({ success: true, data: { recipients } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const audience = req.body?.audience === "departments" ? "departments" : "all";
    const departments = Array.isArray(req.body?.departments)
      ? [...new Set(req.body.departments.map((d) => String(d).trim()).filter(Boolean))]
      : [];

    if (!title) return res.status(400).json({ success: false, message: "Give the announcement a title." });
    if (title.length > 120) return res.status(400).json({ success: false, message: "Keep the title under 120 characters." });
    if (!body) return res.status(400).json({ success: false, message: "Write the message." });
    if (body.length > 2000) return res.status(400).json({ success: false, message: "Keep the message under 2000 characters." });
    if (audience === "departments" && departments.length === 0)
      return res.status(400).json({ success: false, message: "Pick at least one department." });

    const people = await Employee.find(audienceFilter(audience, departments)).select("_id").lean();
    if (people.length === 0)
      return res.status(400).json({ success: false, code: "NO_RECIPIENTS", message: "Nobody currently works in the departments you picked." });

    const doc = await Announcement.create({
      title,
      body,
      audience,
      departments: audience === "departments" ? departments : [],
      recipients: people.length,
      sentBy: req.desk.id,
      sentByName: req.desk.name,
      sentByRole: req.desk.role,
    });

    // One inbox row each. insertMany in slices keeps a large workforce from
    // becoming one enormous write.
    const rows = people.map((p) => ({
      employeeId: p._id,
      title,
      body,
      kind: "announcement",
      screen: "notifications",
      refId: String(doc._id),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await EmployeeNotification.insertMany(rows.slice(i, i + 500), { ordered: false });
    }

    res.status(201).json({
      success: true,
      data: doc,
      message: `Sent to ${people.length} ${people.length === 1 ? "person" : "people"}.`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const doc = await Announcement.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    if (doc.retractedAt) return res.json({ success: true, data: doc, message: "Already taken back." });
    const { deletedCount } = await EmployeeNotification.deleteMany({ kind: "announcement", refId: String(doc._id) });
    doc.retractedAt = new Date();
    doc.retractedByName = req.desk.name;
    await doc.save();
    res.json({ success: true, data: doc, message: `Taken back from ${deletedCount} inbox${deletedCount === 1 ? "" : "es"}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
