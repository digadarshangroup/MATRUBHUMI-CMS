// services/departmentRoles.js
//
// One vocabulary of roles for every department, behind one API.
//
// One store, one answer: every grant is a DepartmentRole row. Callers ask for
// "the role this person holds in this department" and get one answer, whoever
// is asking and whichever department it is.

"use strict";

const DepartmentRole = require("../models/Access/DepartmentRole");
const { ROLES, ROLE_KEYS, roleAtLeast } = DepartmentRole;

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/**
 * The role this email holds in this department, or null.
 *
 * Never throws for an unknown department: a department with no roles assigned
 * yet is the normal state for one that has just been created, and a guard that
 * explodes on it would take that dashboard down.
 */
async function getRole(departmentSlug, email) {
  const slug = String(departmentSlug || "").toLowerCase().trim();
  const mail = String(email || "").toLowerCase().trim();
  if (!slug || !mail) return null;

  const row = await DepartmentRole.findOne({ departmentSlug: slug, email: mail }).lean();
  return row && row.isActive ? row.role : null;
}

/** Everyone holding a role in this department. */
async function listRoles(departmentSlug) {
  const slug = String(departmentSlug || "").toLowerCase().trim();

  const rows = await DepartmentRole.find({ departmentSlug: slug })
    .select("name email role isActive updatedAt")
    .sort({ role: 1, name: 1 })
    .lean();
  return rows.map((r) => ({
    email: r.email, name: r.name, role: r.role, isActive: r.isActive !== false, updatedAt: r.updatedAt,
  }));
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Grant or change a role. `role: null` revokes.
 *
 * @param actor  the administrator doing it, recorded on the row so the change
 *               log and the row itself agree about who is responsible
 */
async function setRole({ departmentSlug, email, name, role, password, actor }) {
  const slug = String(departmentSlug || "").toLowerCase().trim();
  const mail = String(email || "").toLowerCase().trim();
  if (!slug) throw new Error("A department is required");
  if (!mail) throw new Error("An email address is required");
  if (role !== null && !ROLE_KEYS.includes(role)) {
    throw new Error(`Role must be one of: ${ROLE_KEYS.join(", ")}`);
  }

  if (role === null) {
    const res = await DepartmentRole.findOneAndUpdate(
      { departmentSlug: slug, email: mail },
      { $set: { isActive: false } },
      { new: true },
    );
    return { role: null, revoked: Boolean(res) };
  }

  // Exactly one owner per department. Demote the incumbent rather than letting
  // a second one exist quietly.
  if (role === "owner") {
    await DepartmentRole.updateMany(
      { departmentSlug: slug, role: "owner", email: { $ne: mail } },
      { $set: { role: "approver" } },
    );
  }

  const before = await DepartmentRole.findOne({ departmentSlug: slug, email: mail }).lean();

  const row = await DepartmentRole.findOneAndUpdate(
    { departmentSlug: slug, email: mail },
    {
      $set: {
        role,
        isActive: true,
        ...(name ? { name } : {}),
        grantedBy: actor?._id,
        grantedByEmail: actor?.email || "",
      },
      $setOnInsert: { departmentSlug: slug, email: mail },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return { role: row.role, created: !before, previous: before?.role || null };
}

/* ------------------------------------------------------------------ */
/* Guarding                                                            */
/* ------------------------------------------------------------------ */

/**
 * Express guard: this route needs at least `required` in `departmentSlug`.
 *
 * ADMINISTRATORS PASS UNCONDITIONALLY, and departments with no roles yet FAIL
 * OPEN. Both are deliberate; see the notes at each.
 *
 * A department that has never had roles assigned would lock every one of its
 * users out the moment this shipped, before any administrator had a chance to
 * assign anybody. So a department with no role rows at all behaves as though
 * the gate were absent, and starts enforcing the moment the first role is
 * granted. That is deliberate, not an oversight — remove this once every
 * department has been populated.
 */
/**
 * Is this request an administrator of the whole system?
 *
 * `isAdmin` is the authoritative answer — a boolean signed into the token by
 * buildTokenPayload, so a client cannot claim it.
 *
 * The role literals are a FALLBACK for accounts that predate that flag. Tokens
 * issued down the legacy login path carry `role: "ceo"` with no `isAdmin`, and
 * those are exactly the accounts most likely to hit this lockout. The same two
 * literals already gate the executive API in routes/CEO_Routes/hr.js, so this
 * grants nothing that was not already granted there.
 *
 * Deliberately NOT included: "hr_manager", which that file also accepts. Being
 * able to read the HR overview is not a reason to own the sales pipeline.
 */
const SYSTEM_ADMIN_ROLES = ["admin", "ceo", "super_admin"];

function isAdministrator(req) {
  if (req.user?.isAdmin || req.dept?.isAdmin) return true;
  const role = String(req.user?.role || req.dept?.role || "").toLowerCase().trim();
  return SYSTEM_ADMIN_ROLES.includes(role);
}

function requireDepartmentRole(departmentSlug, required = "editor") {
  return async (req, res, next) => {
    try {
      const email = req.user?.email || req.dept?.email;
      if (!email) {
        return res.status(401).json({ success: false, message: "Not authenticated" });
      }

      const slug = String(departmentSlug || "").toLowerCase();

      // AN ADMINISTRATOR HOLDS OWNER EVERYWHERE, WITHOUT A ROW.
      //
      // Without this the gate closes on the one person who can open it. The
      // fail-open below only covers a department with NO roles at all, so the
      // moment an administrator granted the first role — to somebody else, or
      // by running the demo seeder — they locked themselves out of the
      // department they administer, with no way back except editing the
      // database by hand. That is exactly what happened.
      //
      // This is not new power. An administrator can already reach Access
      // Control and grant themselves any role in any department; all this does
      // is stop them having to, and stop the lockout being possible at all.
      // `isAdmin` is signed into the token, so it cannot be claimed by a client.
      if (isAdministrator(req)) {
        req.departmentRole = "owner";
        return next();
      }

      const assigned = await listRoles(slug);
      if (assigned.length === 0) return next();   // not yet configured — see above

      const role = await getRole(slug, email);
      if (!role) {
        return res.status(403).json({
          success: false,
          code: "NO_DEPARTMENT_ROLE",
          message: "You have not been given a role in this department yet.",
        });
      }
      if (!roleAtLeast(role, required)) {
        return res.status(403).json({
          success: false,
          code: "INSUFFICIENT_DEPARTMENT_ROLE",
          role,
          requires: required,
          message: `This action needs ${required} access. You are ${role}.`,
        });
      }

      req.departmentRole = role;
      next();
    } catch (err) {
      console.error("[department-roles] guard failed:", err.message);
      res.status(500).json({ success: false, message: "Could not check your access." });
    }
  };
}

module.exports = {
  ROLES,
  ROLE_KEYS,
  roleAtLeast,
  getRole,
  listRoles,
  setRole,
  requireDepartmentRole,
};
