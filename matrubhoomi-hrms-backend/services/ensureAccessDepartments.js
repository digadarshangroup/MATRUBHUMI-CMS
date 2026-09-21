// services/ensureAccessDepartments.js
//
// Make sure access_departments and dept_users exist, on whatever database the
// server happens to be pointed at.
//
// Runs once at boot so switching from a local database to production needs no
// manual migration step. It is the same logic as
// scripts/migrations/001-seed-access-departments.js, reduced to the part that
// is safe to run unattended on every start.
//
// STRICTLY ADDITIVE — THIS IS THE WHOLE POINT
// -------------------------------------------
// It only ever inserts. It never updates a department an administrator has
// edited, never deletes anything, never touches a password, and never
// reactivates something switched off on purpose. If the collections are already
// populated it does nothing at all and returns immediately.
//
// That matters because a live database has its department logins in their own
// collections, and those must keep working exactly as they are. Nothing here
// modifies them: dept_users rows are created ALONGSIDE, reusing the same _id,
// so the legacy login path and the new one address the same identity.

"use strict";

const AccessDepartment = require("../models/Access/AccessDepartment");
const DeptUser = require("../models/Access/DeptUser");

/** key, slug, display name, and the legacy collection it mirrors. */
const DEPARTMENTS = [
  { key: "hr", slug: "hr", name: "Human Resources", sortOrder: 10,
    legacyModel: "HRDepartment", legacyCollection: "hrdepartments",
    legacyUserType: "hr", defaultRole: "hr_manager",
    dashboardPath: "/hr/dashboard",
    description: "Employees, payroll, attendance and leave." },
  { key: "ceo", slug: "ceo", name: "Executive Office", sortOrder: 20,
    legacyModel: "CEODepartment", legacyCollection: "ceodepartments",
    legacyUserType: "ceo", defaultRole: "ceo",
    dashboardPath: "/ceo/dashboard",
    description: "Company-wide reporting and oversight." },
  // Sales keeps the legacy names the older ERP used — `SalesDepartment` /
  // `salesdepartments` / `sales_manager`. Nothing in THIS deployment has that
  // collection, so the seeder finds no rows and falls back to `defaultRole`;
  // the names are carried anyway so a database restored from the older system
  // mirrors its existing sales logins instead of creating a second identity
  // for each of them.
  { key: "sales", slug: "sales", name: "Sales", sortOrder: 30,
    legacyModel: "SalesDepartment", legacyCollection: "salesdepartments",
    legacyUserType: "sales", defaultRole: "sales_manager",
    dashboardPath: "/sales/dashboard",
    description: "Leads, field assignments and customers." },
];

// Platform administration is NOT a department.
//
// It used to be seeded as one, with a dashboardPath of /ceo/dashboard/access —
// the same console the Executive Office tile opens. That gave the product two
// admin identities for one place: an extra row in the department list, an extra
// icon in the rail, and a second thing to keep in step.
//
// Administrator is a property of a PERSON, not a place: the `isAdmin` flag on
// the account, which requirePlatformAdmin re-reads from the database on every
// request. Access Control lives inside the Executive Office, where it always
// did. Rows already created in a live database are left exactly where they are
// — this seeder is additive and never deletes — but nothing new is created and
// the API filters the slug out of the department list.
const PLATFORM_ADMIN_SLUG = "platform-admin";

/** The role literal most rows in a collection carry — never assumed. */
function dominantRole(rows) {
  const counts = new Map();
  for (const r of rows) {
    if (!r.role) continue;
    counts.set(r.role, (counts.get(r.role) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [role, n] of counts) if (n > bestN) { bestN = n; best = role; }
  return best;
}

async function ensureAccessDepartments(connection) {
  try {
    let departmentsCreated = 0;
    let usersCreated = 0;

    for (const dept of DEPARTMENTS) {
      // Read straight off the collection, not through a model: a model would
      // apply schema defaults, and StoreDepartment defaults `role` to
      // "production_manager" while the real rows say "store_manager". Freezing
      // a default instead of the stored value would break authorization for
      // every store user, permanently and silently.
      let rows = [];
      try {
        rows = await connection.collection(dept.legacyCollection).find({}).toArray();
      } catch {
        // Collection absent on this database — nothing to mirror.
      }

      // What the department's users get as their `role` claim.
      //
      // The stored value wins when there is one — an existing database's own
      // rows are the authority on what its users actually carry, and freezing a
      // guess over them would break authorization silently and permanently.
      //
      // `defaultRole` is what an EMPTY database gets, and it is not optional.
      // Thirty-seven guards across this codebase compare `req.user.role`
      // against the literal "hr_manager"; falling back to the slug hands a
      // fresh install's HR users `role: "hr"`, which matches none of them. The
      // symptom is the confusing kind: sign-in works, the dashboard loads,
      // attendance and leave answer — and payroll, payslips and password
      // management all return 403 to somebody who is unmistakably HR.
      const legacyRole = dominantRole(rows) || dept.defaultRole || dept.slug;

      // $setOnInsert only. An administrator's rename, icon or ordering is never
      // overwritten by a restart.
      const result = await AccessDepartment.updateOne(
        { key: dept.key },
        {
          $setOnInsert: {
            slug: dept.slug,
            name: dept.name,
            description: dept.description,
            dashboardPath: dept.dashboardPath,
            showOnOnboarding: true,
            sortOrder: dept.sortOrder,
            isSystem: true,
            isActive: true,
            legacyModel: dept.legacyModel,
            legacyCollection: dept.legacyCollection,
            legacyRole,
            legacyUserType: dept.legacyUserType,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount) departmentsCreated++;

      const saved = await AccessDepartment.findOne({ key: dept.key }).select("_id").lean();
      if (!saved) continue;

      // Mirror each legacy account into dept_users under THE SAME _id, so the
      // 117 ObjectId references elsewhere keep resolving to the same identity.
      for (const row of rows) {
        const email = String(row.email || "").toLowerCase().trim();
        if (!email) continue;

        // Skip if this email is already taken by a different row — the unique
        // index would reject it, and guessing which one wins is a business
        // decision, not a boot task.
        const clash = await DeptUser.findOne({ email }).select("_id").lean();
        if (clash && String(clash._id) !== String(row._id)) continue;

        const bcryptOk = DeptUser.looksLikeBcrypt(row.password);

        const res = await DeptUser.updateOne(
          { _id: row._id },
          {
            $setOnInsert: {
              email,
              name: row.name || email,
              employeeId: row.employeeId || undefined,
              phone: row.phone || undefined,
              isActive: row.isActive !== false,
              departmentId: saved._id,
              legacyModel: dept.legacyModel,
              legacyRole: row.role || legacyRole,
              passwordHash: bcryptOk
                ? row.password
                : await DeptUser.unusablePasswordHash(),
              mustChangePassword: !bcryptOk,
              tokenVersion: 0,
              isAdmin: false,
            },
          },
          { upsert: true },
        );
        if (res.upsertedCount) usersCreated++;
      }
    }

    if (departmentsCreated || usersCreated) {
      console.log(
        `[access] Prepared this database: ${departmentsCreated} department(s) and ` +
          `${usersCreated} login(s) registered. Existing accounts were not modified.`,
      );
    }
  } catch (err) {
    // Never take the server down over this. The legacy login path still works
    // without these collections — that is the whole point of the dual read.
    console.error("[access] Could not prepare access tables:", err.message);
  }
}

module.exports = { ensureAccessDepartments };
