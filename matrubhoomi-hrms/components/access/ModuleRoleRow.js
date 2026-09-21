// components/access/ModuleRoleRow.js
//
// The module-role controls for ONE person, driven entirely by the registry in
// moduleRoles.js. A person holding Accounting gets an Accounting dropdown; a
// person holding a future module with its own vocabulary gets that one, in the
// same row, with no change to this file or to the People list.
//
// Roles are read per person rather than handed down from the list, because the
// list is a list of PEOPLE and a module's membership table is its own. Reading
// it here keeps the People query from having to know what modules exist.

"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, KeyRound } from "lucide-react";
import { Select } from "@/components/ceo/ui/Primitives";

/**
 * @param person   { email, name, isExternal }
 * @param modules  registry entries this person holds
 * @param seed     { [moduleKey]: role } already known from the list, if any —
 *                 skips a round trip for people the module already returned
 */
export default function ModuleRoleRow({ person, modules, seed = {}, onNotice, onError }) {
  if (!modules.length) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5 pl-1">
      {modules.map((m) => (
        <ModuleRoleControl
          key={m.key}
          module={m}
          person={person}
          seedRole={seed[m.key]}
          onNotice={onNotice}
          onError={onError}
        />
      ))}
    </div>
  );
}

function ModuleRoleControl({ module: mod, person, seedRole, onNotice, onError }) {
  // undefined = not known yet, "" = holds the module but has no role.
  const [role, setRole] = useState(seedRole);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (seedRole !== undefined) return;
    try {
      const data = await mod.listMembers();
      const hit = (data.users || []).find(
        (u) => String(u.email).toLowerCase() === String(person.email).toLowerCase(),
      );
      setRole(hit && hit.isActive ? hit.role : "");
    } catch {
      setRole("");   // an unreadable role is shown as none, not as an error
    }
  }, [mod, person.email, seedRole]);

  useEffect(() => { load(); }, [load]);

  const change = async (next) => {
    setSaving(true);
    try {
      // No password is asked for here.
      //
      // An employee already has one, on their HR record, and that is the
      // credential the sign-in path checks. A second one set here would be two
      // passwords for one person that drift apart — and the one they were
      // handed would be the one that did not work. The server enforces the same
      // rule: it only demands a password when the email is not an employee.
      const res = await mod.setRole({
        email: person.email,
        name: person.name,
        role: next || null,
      });
      setRole(res.role || "");
      onNotice?.(res.message);
    } catch (err) {
      onError?.(err.message);
      setRole(undefined);
      await load();   // put the control back to what the server actually holds
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    const next = window.prompt(
      `New ${mod.label} password for ${person.name || person.email} ` +
      `(at least 8 characters).\nTheir open sessions end immediately.`,
    );
    if (!next) return;
    try {
      const res = await mod.setPassword(person.email, next);
      onNotice?.(res.message);
    } catch (err) {
      onError?.(err.message);
    }
  };

  if (role === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Loader2 className="h-3 w-3 animate-spin" />
        {mod.label} role…
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] tracking-[0.09em] text-ink-faint uppercase">
        {mod.label}
      </span>

      <Select
        value={role || ""}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        title={`Their role inside ${mod.label}`}
        className={`w-auto max-w-[190px] py-1 pl-2 text-[11px] ${
          role ? "" : "text-[var(--state-rework-ink)]"
        }`}
      >
        {/* Not offered for someone who exists ONLY as a module member: for
            them "no role" is an account that can sign in and do nothing, which
            is the state that left revoked rows sitting in the list forever.
            Removing them is the Delete button, which removes the account. */}
        {!person.isExternal && (
          <option value="">— No {mod.label.toLowerCase()} access —</option>
        )}
        {mod.roles.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </Select>

      {!role && (
        <span title={mod.unsetWarning} className="inline-flex items-center">
          <AlertCircle className="h-3 w-3 text-[var(--state-rework-ink)]" />
        </span>
      )}

      {/* Employees are omitted deliberately — their password lives on the HR
          record, and a second one set here would never be the one that signs
          them in. */}
      {role && person.isExternal && mod.setPassword && (
        <button
          type="button"
          onClick={resetPassword}
          title={`Set a new ${mod.label} password`}
          className="rounded-full bg-[var(--control)] p-1.5 text-ink-muted transition-colors hover:bg-[var(--control-hover)] hover:text-ink"
        >
          <KeyRound className="h-3 w-3" />
        </button>
      )}

      {role && !person.isExternal && (
        <span className="text-[10px] text-ink-faint">
          signs in with their own password
        </span>
      )}
    </span>
  );
}
