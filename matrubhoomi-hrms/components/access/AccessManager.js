// components/access/AccessManager.js
//
// Department and login administration, as an embeddable panel.
//
// The same component backs both /admin (the standalone console) and
// /ceo/dashboard/access (inside the CEO's own sidebar). One implementation, so
// the two cannot drift into disagreeing about what an admin is allowed to do —
// which is the failure mode that produced twelve hardcoded department logins in
// the first place.
//
// It talks to /api/admin/*, every route of which re-reads `isAdmin` from the
// database. So rendering this panel somewhere it should not be does not grant
// anything: the API refuses regardless of which page asked.
//
// Surface only: this file was restyled onto the frost system (Panel/Chip/Button
// /Field/Input from the CEO primitives, state-palette washes, hairline rules).
// No permission check, endpoint, prop or handler was altered.

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Loader2, AlertCircle, Lock, Search, KeyRound, ShieldCheck, ShieldOff,
  UserCheck, UserX, CheckCircle2, Users, Eye, EyeOff, Save, X, Trash2,
} from "lucide-react";
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listUsers, createUser, updateUser, resetPassword,
} from "@/lib/accessApi";
import PeoplePanel from "@/components/access/PeoplePanel";
import DepartmentIcon from "@/components/onboarding/DepartmentIcon";
import {
  Panel, Chip, Button, Tabs, Field, Input, Select, EmptyState,
} from "@/components/ceo/ui/Primitives";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Banner({ kind, children, onDismiss }) {
  if (!children) return null;
  const styles = {
    error:
      "bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] text-[var(--state-overdue-ink)]",
    ok: "bg-[color-mix(in_srgb,var(--state-positive)_16%,transparent)] text-[var(--state-positive-ink)]",
  };
  const Icon = kind === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role="alert"
      className={`mb-4 flex items-start gap-2 rounded-inset px-3.5 py-2.5 text-xs ${styles[kind]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span className="flex-1 break-words">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Shown once, never retrievable. */
function TempPasswordCard({ value, onDone }) {
  if (!value) return null;
  return (
    <div className="mb-4 rounded-card bg-[color-mix(in_srgb,var(--state-extension)_18%,transparent)] px-4 py-3.5">
      <p className="text-xs font-medium text-[var(--state-extension-ink)]">
        Temporary password for {value.email}
      </p>
      <p
        data-figure
        className="mt-1 font-mono text-lg tracking-wide break-all text-[var(--state-extension-ink)]"
      >
        {value.password}
      </p>
      <p className="mt-1 text-[11px] text-[var(--state-extension-ink)] opacity-80">
        This is not stored anywhere and cannot be shown again. Give it to them directly.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="mt-2 text-[11px] text-[var(--state-extension-ink)] underline"
      >
        Done
      </button>
    </div>
  );
}

/* ================================================================== */
/* DEPARTMENTS                                                        */
/* ================================================================== */

function DepartmentPanel({ departments, reload, setError, setNotice, onViewMembers }) {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * @param confirmDuplicate  Re-submitting after the admin confirmed a
   *   POSSIBLE_DUPLICATE warning — see accessAdmin.js. Skips the confirm
   *   dialog so this can call itself once without looping.
   */
  const submitCreate = async (name, confirmDuplicate = false) => {
    setBusy(true);
    try {
      await createDepartment({ name, ...(confirmDuplicate ? { confirmDuplicate: true } : {}) });
      setNewName("");
      setCreating(false);
      setNotice(`"${name}" created. Add an icon and members next.`);
      await reload();
    } catch (err) {
      // Not a hard refusal — a name that's suspiciously close to one that
      // already exists (a typo of "Merchandiser" as "Merchantiser" is the real
      // incident this guards against; see accessAdmin.js for the full story).
      // Ask once rather than making the admin retype the name after reading
      // the error; confirming re-submits with confirmDuplicate set.
      if (err.code === "POSSIBLE_DUPLICATE") {
        if (window.confirm(`${err.message}\n\nCreate "${name}" as a separate department anyway?`)) {
          await submitCreate(name, true);
        }
        return;
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const create = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    void submitCreate(name);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await updateDepartment(editing._id, {
        name: editing.name,
        description: editing.description,
        iconUrl: editing.iconUrl,
        accentColor: editing.accentColor,
        dashboardPath: editing.dashboardPath,
        showOnOnboarding: editing.showOnOnboarding,
        sortOrder: editing.sortOrder,
        isActive: editing.isActive,
        // Only a custom department's slug can move — see accessAdmin.js's
        // EDITABLE_IF_NOT_SYSTEM. Sent only when the field is actually
        // editable here, so this never tries to change it on a built-in one.
        ...(editing.locked ? {} : { slug: editing.slug }),
      });
      setNotice(res.message || "Saved");
      setEditing(null);
      await reload();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const remove = async (dept) => {
    if (!window.confirm(
      `Deactivate "${dept.name}"? Its members are signed out immediately. ` +
      `Historical records referencing them are left untouched.`,
    )) return;
    try {
      const res = await deleteDepartment(dept._id);
      setNotice(res.message);
      await reload();
    } catch (err) { setError(err.message); }
  };

  if (editing) {
    const set = (k, v) => setEditing((d) => ({ ...d, [k]: v }));
    return (
      <form onSubmit={save}>
        <Panel label={editing.name} className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
              {editing.name}
            </h3>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close"
              className="shrink-0 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Display name">
              <Input value={editing.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Description">
              <Input value={editing.description || ""} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <div className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink">Icon</span>
              <div className="flex items-center gap-3">
                {/* Live preview of what the onboarding page will actually draw,
                    including the built-in fallback — so a URL that does not load
                    is obvious here rather than on the front door. */}
                <DepartmentIcon dept={editing} size={40} />
                <Input value={editing.iconUrl || ""} onChange={(e) => set("iconUrl", e.target.value)}
                  placeholder="https://… (optional)"
                  className="flex-1" />
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                Optional. Left empty — or if the address does not load — a built-in
                icon is used, chosen from the slug.
              </p>
            </div>
            <Field label="Tile colour">
              <input type="color" value={editing.accentColor || "#4F46E5"}
                onChange={(e) => set("accentColor", e.target.value)}
                className="h-[42px] w-full rounded-inset bg-[var(--surface-raised)] px-1 shadow-[inset_0_0_0_1px_var(--color-hairline)]" />
            </Field>
            <Field label="Dashboard path">
              <Input value={editing.dashboardPath || ""} onChange={(e) => set("dashboardPath", e.target.value)}
                className="font-mono" />
            </Field>
            {/* Only a custom department's slug can move — a built-in one shows it
                read-only below instead (see the locked panel). This is the field
                every route guard and role check actually compares against, so
                exposing it matters: a department created with a near-duplicate
                name and the wrong slug (this is what happened to Rakesh Biswal's
                Merchandiser access — a look-alike department that was never
                actually /merchandiser/dashboard) can be corrected right here
                instead of needing a brand-new department. */}
            {!editing.locked && (
              <Field label="Slug">
                <Input
                  value={editing.slug || ""}
                  onChange={(e) =>
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))
                  }
                  placeholder="lowercase-with-hyphens"
                  className="font-mono"
                />
              </Field>
            )}
            {!editing.locked && (
              <p className="sm:col-span-2 -mt-1.5 text-[11px] text-ink-faint">
                What every route and role check actually compares against — the
                display name above is cosmetic. Changing this moves which
                dashboard path and role grants this department controls; the
                server refuses a value already taken by another department.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={editing.showOnOnboarding !== false}
                onChange={(e) => set("showOnOnboarding", e.target.checked)}
                className="rounded-inset border-hairline accent-[var(--color-ink)]" />
              Show on onboarding
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={editing.isActive !== false}
                onChange={(e) => set("isActive", e.target.checked)}
                className="rounded-inset border-hairline accent-[var(--color-ink)]" />
              Active
            </label>
          </div>

          {editing.locked && (
            <div className="rounded-inset bg-[var(--surface-sunken)] px-3.5 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
                <Lock className="h-3 w-3" /> Fixed for built-in departments
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-ink-faint">
                <span>slug</span><span data-figure>{editing.slug}</span>
                <span>role</span><span data-figure>{editing.legacyRole}</span>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                Authorization across the app compares against these exact values.
                Changing one would revoke access with nothing reported.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button type="submit" tone="primary" size="sm" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
            {!editing.locked && (
              <Button type="button" tone="destructive" size="sm" onClick={() => remove(editing)}>
                Deactivate department
              </Button>
            )}
          </div>
        </Panel>
      </form>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          <span data-figure>{departments.length}</span> department{departments.length === 1 ? "" : "s"}. Creating one needs no code change.
        </p>
        <Button tone="primary" size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> New department
        </Button>
      </div>

      {creating && (
        <form onSubmit={create} className="mb-3">
          <Panel label="New department" className="flex flex-wrap items-end gap-3">
            <Field label="Department name" className="min-w-[200px] flex-1">
              <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Maintenance" />
            </Field>
            <Button type="submit" tone="primary" size="sm" disabled={busy || !newName.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
            </Button>
            <Button type="button" tone="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </Panel>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => (
          <div
            key={d._id}
            className="relative rounded-card frost-panel transition-[background-color] duration-[180ms] ease-[var(--ease-deck)] hover:bg-[var(--control)]"
          >
            {/* Who's in this department — every card gets this, including
                locked/built-in ones (Sales, HR, …), since viewing membership
                never needs the protections editing/deleting does. Opens the
                People & Roles tab pre-filtered to just this department's
                members, where the existing grant/revoke and per-module role
                controls already live — one screen, not a second copy of them
                built into this card. */}
            <button
              type="button"
              title={`See who's in ${d.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onViewMembers(d);
              }}
              className={`absolute top-2 z-10 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink ${d.locked ? "right-2" : "right-9"}`}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>

            {/* Deactivate, right on the card — this used to be reachable only
                after opening Edit, which read as "there is no way to remove
                a department" to anyone who didn't think to click through.
                Absent for a built-in department: those can't be removed at
                all (see the locked panel in the edit form), so a control
                that would only ever refuse is worse than no control. */}
            {!d.locked && (
              <button
                type="button"
                title={`Deactivate ${d.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(d);
                }}
                className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_20%,transparent)] hover:text-[var(--state-overdue-ink)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing({ ...d })}
              className="w-full px-4 py-4 text-left"
            >
              <div className="flex items-start gap-3">
                {/* The same rules the onboarding page uses — uploaded icon if it
                    loads, built-in icon by slug otherwise. So what an admin sees
                    here is what everyone sees on the front door, including the
                    fallback when a URL is wrong. */}
                <DepartmentIcon dept={d} size={44} flat />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 pr-14">
                    <span className="truncate font-medium text-ink">{d.name}</span>
                    {d.locked && <Lock className="h-3 w-3 flex-shrink-0 text-ink-faint" />}
                  </div>
                  <p data-figure className="truncate font-mono text-[11px] text-ink-faint">/{d.slug}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /><span data-figure>{d.activeUserCount}</span>
                    </span>
                    {!d.showOnOnboarding && (
                      <span className="inline-flex items-center gap-1 text-ink-faint">
                        <EyeOff className="h-3 w-3" />hidden
                      </span>
                    )}
                    {!d.isActive && <Chip tone="overdue">inactive</Chip>}
                  </div>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/* USERS                                                              */
/* ================================================================== */

function UserPanel({ departments, setError, setNotice, setTempPassword }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", departmentId: "", employeeId: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listUsers({
        search, departmentId, includeInactive: includeInactive ? "true" : "",
      });
      setUsers(data.users || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [search, departmentId, includeInactive, setError]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createUser(draft);
      if (res.temporaryPassword) setTempPassword({ email: draft.email, password: res.temporaryPassword });
      setDraft({ name: "", email: "", departmentId: "", employeeId: "" });
      setAdding(false);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const patch = async (user, body, label) => {
    try {
      await updateUser(user._id, body);
      setNotice(`${user.email}: ${label}`);
      await load();
    } catch (err) { setError(err.message); }
  };

  const reset = async (user) => {
    if (!window.confirm(`Reset the password for ${user.email}? They will be signed out.`)) return;
    try {
      const res = await resetPassword(user._id);
      setTempPassword({ email: user.email, password: res.temporaryPassword });
      await load();
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          Changing a department, deactivating an account or resetting a password signs that person out immediately.
        </p>
        <Button tone="primary" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> Add user
        </Button>
      </div>

      {adding && (
        <form onSubmit={add} className="mb-3">
          <Panel label="Add user" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <Input required autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input required type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
            <Field label="Department">
              <Select required value={draft.departmentId} onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })}>
                <option value="">Choose…</option>
                {departments.filter((d) => d.isActive).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Employee ID (optional)">
              <Input value={draft.employeeId} onChange={(e) => setDraft({ ...draft, employeeId: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button type="submit" tone="primary" size="sm" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
              </Button>
              <Button type="button" tone="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <span className="text-[11px] text-ink-faint">A temporary password is generated and shown once.</span>
            </div>
          </Panel>
        </form>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[180px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or ID…"
            className="pl-9" />
        </div>
        <div className="min-w-[160px]">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded-inset border-hairline accent-[var(--color-ink)]" />
          Include inactive
        </label>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-ink-faint" /></div>
      ) : (
        <Panel padded={false} label="Department logins">
          {users.length === 0 ? (
            <EmptyState compact title="No accounts match." />
          ) : (
            <div className="divide-y divide-hairline">
              {users.map((u) => (
                <div key={u._id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--row-hover)]">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 truncate text-sm text-ink">
                      {u.name}
                      {u.isAdmin && <Chip tone="positive">ADMIN</Chip>}
                      {!u.isActive && <Chip tone="overdue">INACTIVE</Chip>}
                      {u.mustChangePassword && <Chip tone="rework">MUST RESET</Chip>}
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {u.email}{u.departmentId?.name && ` · ${u.departmentId.name}`}
                    </p>
                  </div>

                  <div className="w-[150px] shrink-0">
                    <Select value={u.departmentId?._id || ""} title="Move to another department"
                      onChange={(e) => patch(u, { departmentId: e.target.value }, "department changed")}>
                      {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                    </Select>
                  </div>

                  <button type="button" onClick={() => reset(u)} title="Reset password"
                    className="rounded-full bg-[var(--control)] p-1.5 text-ink-muted transition-colors hover:bg-[var(--control-hover)] hover:text-ink">
                    <KeyRound className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => patch(u, { isAdmin: !u.isAdmin }, u.isAdmin ? "admin revoked" : "admin granted")}
                    title={u.isAdmin ? "Revoke administrator" : "Make administrator"}
                    className="rounded-full bg-[var(--control)] p-1.5 text-ink-muted transition-colors hover:bg-[var(--control-hover)] hover:text-ink">
                    {u.isAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => patch(u, { isActive: !u.isActive }, u.isActive ? "deactivated" : "activated")}
                    title={u.isActive ? "Deactivate" : "Activate"}
                    className="rounded-full bg-[var(--control)] p-1.5 text-ink-muted transition-colors hover:bg-[var(--control-hover)] hover:text-ink">
                    {u.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

/* ================================================================== */
/* EMPLOYEES — who can sign in, and where                             */
/* ================================================================== */

/* ================================================================== */

/**
 * @param showDepartmentLogins  The shared per-department accounts (hr@, sales@…).
 *   Off in the CEO console: those are the legacy shared passwords this whole
 *   change exists to move away from, and surfacing them next to per-person
 *   access invites someone to keep using them.
 */
export default function AccessManager({ showDepartmentLogins = false }) {
  const [tab, setTab] = useState("departments");
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tempPassword, setTempPassword] = useState(null);
  const [denied, setDenied] = useState(false);
  // Set by a department card's eye button — switches to People & Roles
  // pre-filtered to just that department's members. Cleared whenever the
  // admin leaves the People tab by any route (clicking Departments, or the
  // "Show everyone" control inside PeoplePanel itself), so it never silently
  // reappears if they come back to People later for an unrelated reason.
  const [viewingDept, setViewingDept] = useState(null);

  const reload = useCallback(async () => {
    setError("");
    try {
      const data = await listDepartments();
      setDepartments(data.departments || []);
    } catch (err) {
      // A 403 here means the signed-in user is not an administrator. Say so
      // plainly rather than rendering empty panels that fail on every click.
      if (err.isAuthError) setDenied(true);
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (loading) {
    return <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-ink-faint" /></div>;
  }

  if (denied) {
    return (
      <Panel label="Administrator access required" className="mx-auto max-w-md text-center">
        <Lock className="mx-auto h-7 w-7 text-[var(--state-extension-ink)]" />
        <h2 className="mt-3 text-[17px] font-medium tracking-[-0.02em] text-ink">
          Administrator access required
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          This account can sign in, but has not been granted access administration.
          An existing administrator can grant it, or it can be granted from the
          server with:
        </p>
        <code className="mt-3 block rounded-inset bg-[var(--surface-sunken)] p-2 text-[11px] break-all text-ink-muted">
          node scripts/createPlatformAdmin.js --email your@email
        </code>
      </Panel>
    );
  }

  return (
    <div>
      <div className="mb-4 border-b border-hairline pb-3">
        <Tabs
          label="Access administration"
          value={tab}
          onChange={(next) => { setTab(next); if (next !== "people") setViewingDept(null); }}
          options={[
            { id: "departments", label: "Departments" },
            { id: "people", label: "People & Roles" },
            ...(showDepartmentLogins
              ? [{ id: "users", label: "Department Logins" }]
              : []),
          ]}
        />
      </div>

      <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>
      <Banner kind="ok" onDismiss={() => setNotice("")}>{notice}</Banner>
      <TempPasswordCard value={tempPassword} onDone={() => setTempPassword(null)} />

      {tab === "departments" && (
        <DepartmentPanel
          departments={departments}
          reload={reload}
          setError={setError}
          setNotice={setNotice}
          onViewMembers={(d) => { setViewingDept(d); setTab("people"); }}
        />
      )}
      {tab === "people" && (
        <PeoplePanel
          departments={departments}
          setError={setError}
          setNotice={setNotice}
          setTempPassword={setTempPassword}
          deptFilter={viewingDept}
          onClearDeptFilter={() => setViewingDept(null)}
        />
      )}
      {tab === "users" && (
        <UserPanel departments={departments} setError={setError} setNotice={setNotice} setTempPassword={setTempPassword} />
      )}
    </div>
  );
}
