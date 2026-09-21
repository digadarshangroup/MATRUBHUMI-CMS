// components/access/PeoplePanel.js
//
// ONE list of everybody who can sign in.
//
// It used to be two: "Employee Access" for people on the payroll and a separate
// tab for accounting's external users. That does not scale — the next module
// with its own roles adds a third tab, and by then the person you are looking
// for is spread across all of them and you have to know which one to open
// before you can search.
//
// So there is one list, and the differences are expressed inside a row instead
// of by which tab you are on:
//
//   · employees come from the HR records and carry a department grant
//   · people with no HR record come from whichever module accepts them
//     (see moduleRoles.js) and are badged EXTERNAL
//   · a module with its own role vocabulary contributes a control to the rows
//     of the people who hold it, rather than a tab of its own
//
// Adding the next such module is one entry in moduleRoles.js. Nothing here
// changes, and no tab appears.

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Loader2,
  Search,
  KeyRound,
  Ban,
  UserPlus,
  X,
  Plus,
  Trash2,
  Mail,
  ExternalLink,
  Info,
  Star,
  History,
  ChevronDown,
} from "lucide-react";
import {
  listEmployees,
  assignEmployee,
  setEmployeePassword,
  setEmployeeEmail,
  setEmployeeExtraDepartments,
  getChangeLog,
} from "@/lib/accessApi";
import ModuleRoleRow from "@/components/access/ModuleRoleRow";
import {
  MODULE_ROLES,
  modulesFor,
  departmentSlugsOf,
  externalCapableModules,
} from "@/components/access/moduleRoles";
import {
  Panel,
  Chip,
  Button,
  Segmented,
  Field,
  Input,
  Select,
  EmptyState,
} from "@/components/ceo/ui/Primitives";

/* ------------------------------------------------------------------ */

/**
 * External members, keyed by email, gathered from every module that accepts
 * people with no HR record.
 *
 * Employees are dropped here on purpose — the same person is already in the
 * employee list, and their role is read from the module by the row control. The
 * seed carries it along so that read costs nothing.
 */
async function loadExternals() {
  const byEmail = new Map();

  await Promise.all(
    externalCapableModules().map(async (mod) => {
      let users = [];
      try {
        users = (await mod.listMembers()).users || [];
      } catch {
        return; // a module that cannot be read must not blank the whole list
      }

      for (const u of users) {
        const email = String(u.email).toLowerCase();
        const seed = { [mod.key]: u.isActive ? u.role : "" };

        if (u.isEmployee) {
          // Not a row of its own — just the role, so the employee's row does
          // not have to fetch it.
          const known = byEmail.get(email);
          byEmail.set(email, {
            ...(known || { employeeOnly: true, email }),
            seed: { ...(known?.seed || {}), ...seed },
            employeeOnly: true,
          });
          continue;
        }

        const known = byEmail.get(email);
        byEmail.set(email, {
          _id: u._id,
          email,
          name: u.name || email,
          isExternal: true,
          employeeOnly: false,
          isActive: u.isActive !== false,
          modules: [...new Set([...(known?.modules || []), mod.deptSlug])],
          seed: { ...(known?.seed || {}), ...seed },
        });
      }
    }),
  );

  return byEmail;
}

/* ------------------------------------------------------------------ */

/** Every entity a person's access can be recorded against — see accessAdmin.js's
 * recordChange() calls for the primary/extra department grants, and its existing
 * department-role route for module roles (Store, Sales, Merchandiser, HR,
 * Production). All three key their entries on the person's email, so one row's
 * worth of history is three parallel requests merged into one timeline rather
 * than a single query — the change log has no one "person" table to query against. */
const HISTORY_ENTITIES = ["employee-department", "employee-department-extra", "department-role"];

function relativeWhen(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Who granted this person which department/role, and when — collapsed by
 * default, next to Set password, for the same reason that one is: a rare
 * action beside a frequent one, on a screen shared by whoever is logged into
 * Access Control.
 *
 * NOTE: department-role entries are only fetched for someone WHOSE EMAIL a
 * module role could exist under (accounting, HR, Store, Sales, Merchandiser,
 * Production) — but there is no cheap way to know in advance whether a role
 * was ever actually set, so all three entity types are always queried and
 * simply produce an empty list when nothing was ever recorded there. History
 * predates this feature for everyone — an account whose only changes happened
 * before change-log recording existed on this route will show nothing older
 * than 12 Aug 2026, not "no history."
 */
function PersonHistory({ email, onError }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [entries, setEntries] = useState([]);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (loaded) return; // fetched once per mount; the row's own actions already show their own toast
    setLoading(true);
    try {
      const results = await Promise.all(
        HISTORY_ENTITIES.map((entity) =>
          getChangeLog({ entity, entityId: email, limit: 30 }).catch(() => ({ entries: [] })),
        ),
      );
      const merged = results
        .flatMap((r) => r.entries || [])
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setEntries(merged);
      setLoaded(true);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 pl-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--control)] px-2.5 py-1 text-[10.5px] text-ink-muted transition-colors hover:bg-[var(--control-hover)] hover:text-ink"
      >
        <History className="h-2.5 w-2.5" strokeWidth={2.4} />
        History
        <ChevronDown className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 w-full max-w-[420px] rounded-inset bg-[var(--surface-sunken)] px-3.5 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-[11px] text-ink-faint">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-[11px] text-ink-faint">
              No recorded changes — nothing since history started being kept (12 Aug 2026), or
              this account has never had its access changed.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {entries.map((e, i) => (
                <li key={i} className="border-l-2 border-hairline pl-2.5 text-[11px]">
                  <p className="text-ink">{e.summary || `${e.action} on ${e.entity}`}</p>
                  <p className="mt-0.5 text-ink-faint">
                    {e.actorName || e.actorEmail || "Someone"} · {relativeWhen(e.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function PeoplePanel({
  departments,
  setError,
  setNotice,
  setTempPassword,
  // Set from a department card's eye button (AccessManager) — scopes this
  // list to just that department's members. Filtered client-side: the
  // employee list this panel already fetches (up to 2000, unfiltered by
  // department) is small enough that a second server round trip would only
  // add latency, and external members have no AccessDepartment _id of their
  // own to filter a query by in the first place (see externalRows below).
  deptFilter = null,
  onClearDeptFilter,
}) {
  const [employees, setEmployees] = useState([]);
  const [externals, setExternals] = useState(new Map());
  // `loading` — the full-panel spinner, for the very first load only (nothing
  // to show yet, so replacing the panel with a spinner is the right call).
  // `refreshing` — every load after that (a search keystroke, a filter
  // click). It shows next to the search box instead, so the list a person is
  // reading doesn't vanish and reappear on every character they type.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [assigned, setAssigned] = useState("all");
  // The HR org-chart department — the way an admin actually thinks about who
  // they are looking for. It replaced an operator/executive split that was
  // derived from the attendance engine's rules: on this data that resolver
  // called almost everybody an operator, so the default view was empty and real
  // employees looked like they were missing.
  const [hrDepartment, setHrDepartment] = useState("all");
  const [hrDepartments, setHrDepartments] = useState([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [noEmailCount, setNoEmailCount] = useState(0);
  const [adding, setAdding] = useState(false);

  // Inline "set email" — which employee row's form is open, and its draft.
  const [emailFor, setEmailFor] = useState(null);
  const [emailDraft, setEmailDraft] = useState("");

  // Inline "set password" — which row, generate-vs-manual, and the manual draft.
  const [pwFor, setPwFor] = useState(null);
  const [pwMode, setPwMode] = useState("generate");
  const [pwDraft, setPwDraft] = useState("");

  // Bumped on every call, so a response can tell whether it is still the
  // latest thing anyone asked for. Typing "rake" fires four requests in
  // quick succession; nothing stops the server from answering "r" AFTER it
  // answers "rake" (a slower query, a queued connection, ordinary network
  // jitter) — without this, that stale "r" response would land last and
  // silently replace the correct, more specific result. This is what "the
  // search doesn't respond properly" actually was: not that it failed, but
  // that an old answer sometimes overwrote a newer one.
  const searchSeq = useRef(0);

  // Split from loadExternals() on purpose. This is the server-filtered call —
  // it changes with search/assigned/hrDepartment, so it is the one that
  // should re-run on every keystroke and filter toggle.
  const loadEmployees = useCallback(async () => {
    const seq = ++searchSeq.current;
    const first = seq === 1;
    if (first) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await listEmployees({ search, assigned, hrDepartment });
      // A newer search has already started; this answer is stale, drop it.
      if (seq !== searchSeq.current) return;
      setEmployees(data.employees || []);
      setUnassignedCount(data.unassigned || 0);
      setNoEmailCount(data.withoutEmail || 0);
      setHrDepartments(data.hrDepartments || []);
    } catch (err) {
      if (seq === searchSeq.current) setError(err.message);
    } finally {
      if (seq === searchSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [search, assigned, hrDepartment, setError]);

  // loadExternals() has nothing to do with search/assigned/hrDepartment — it
  // walks every module's own member table, unfiltered. Tying it to the same
  // effect as loadEmployees() meant every keystroke and every filter click
  // re-fetched every module's full membership table in parallel with the
  // (correctly filtered) employees call, which is what made this screen lag.
  // It only needs to run once, plus after an action that could change module
  // membership (see refreshExternals below).
  const refreshExternals = useCallback(async () => {
    try {
      setExternals(await loadExternals());
    } catch (err) {
      setError(err.message);
    }
  }, [setError]);

  useEffect(() => {
    const t = setTimeout(loadEmployees, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadEmployees, search]);

  useEffect(() => {
    refreshExternals();
    // Intentionally once on mount — see the comment on refreshExternals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Refresh both lists — for after an action that could touch either. */
  const load = useCallback(
    () => Promise.all([loadEmployees(), refreshExternals()]),
    [loadEmployees, refreshExternals],
  );

  /* -- rows ------------------------------------------------------- */
  //
  // Employees first, then external people. External rows are filtered in the
  // browser rather than on the server: they come from module membership tables
  // that have no notion of employee type or department assignment, so the
  // server-side filters above simply do not apply to them.
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();

    const employeeRows = employees
      .map((e) => ({
        kind: "employee",
        key: e._id,
        person: { email: e.email, name: e.name, isExternal: false },
        employee: e,
        seed: externals.get(String(e.email).toLowerCase())?.seed || {},
        modules: modulesFor(departmentSlugsOf(e)),
      }))
      // Scoped to one department (eye button on its card) — holds it as
      // either the primary or an additional grant.
      .filter(
        (r) =>
          !deptFilter ||
          String(r.employee.accessDepartment?._id) === String(deptFilter._id) ||
          (r.employee.additionalDepartments || []).some(
            (d) => String(d._id) === String(deptFilter._id),
          ),
      );

    const externalRows = [...externals.values()]
      .filter((x) => !x.employeeOnly)
      .filter(
        (x) =>
          !term ||
          x.email.includes(term) ||
          String(x.name).toLowerCase().includes(term),
      )
      // "Not assigned" is asking which employees have no department; an
      // external person has exactly one by construction, so the filter would
      // only ever produce a confusing empty state.
      .filter(() => assigned !== "no")
      // Narrowing to one HR department is a question about the org chart, and
      // these people are not on it. Listing them under every department would
      // make the filter look broken.
      .filter(() => hrDepartment === "all")
      // An external person is scoped by module, not by AccessDepartment _id
      // (they have no employee record to carry one) — compare on the
      // department's slug instead, which IS what module membership keys on.
      .filter((x) => !deptFilter || x.modules.includes(deptFilter.slug))
      .map((x) => ({
        kind: "external",
        key: x._id || x.email,
        person: { email: x.email, name: x.name, isExternal: true },
        external: x,
        seed: x.seed,
        modules: MODULE_ROLES.filter((m) => x.modules.includes(m.deptSlug)),
      }));

    return [...employeeRows, ...externalRows];
  }, [employees, externals, search, assigned, hrDepartment, deptFilter]);

  /* -- actions ---------------------------------------------------- */

  /** Grant or revoke one extra department, leaving the primary alone. */
  const toggleExtra = async (employee, deptId, add) => {
    const current = (employee.additionalDepartments || []).map((d) =>
      String(d._id),
    );
    const next = add
      ? [...current, String(deptId)]
      : current.filter((id) => id !== String(deptId));
    try {
      const res = await setEmployeeExtraDepartments(employee._id, next);
      setNotice(res.message);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * The department grant, unified into one badge row: a plain click
   * grants/revokes, the star on a held badge promotes it to primary.
   *
   * This used to be two controls on the row — a dropdown that set the primary
   * department, and a separate strip of pills underneath for "also" — for the
   * same underlying question, "does this person hold X department," answered
   * two different ways depending on which one happened to be primary. That
   * split is exactly how RAKESH BISWAL ended up unable to open
   * /merchandiser/dashboard despite an admin believing they had granted it:
   * the primary dropdown and the "also" pills disagreed about which
   * department was actually in play, and nothing on the row made that
   * disagreement visible. One row, one action per department, removes the
   * seam the mistake lived in.
   */
  /**
   * Which badge is mid-request, as `"<employeeId>:<deptId>"` — one flight at a
   * time is all any of these actions ever need, but they all share this one
   * flag rather than each getting their own boolean, so clicking a SECOND
   * badge while a FIRST one is still in flight reads as "wait for that one",
   * not as two silently-racing writes. This is the feedback that was missing
   * entirely before: grant/revoke/promote gave no visible sign anything was
   * happening between the click and the list refreshing, which is what read
   * as lag even on a fast connection.
   */
  const [busyBadge, setBusyBadge] = useState(null);
  const badgeKey = (employeeId, deptId) => `${employeeId}:${deptId}`;

  const grantDepartment = async (employee, deptId) => {
    setBusyBadge(badgeKey(employee._id, deptId));
    try {
      if (!employee.accessDepartment) {
        // Nothing primary yet — granting the first department makes it one.
        const res = await assignEmployee(employee._id, deptId);
        setNotice(res.message);
      } else {
        const current = (employee.additionalDepartments || []).map((d) => String(d._id));
        const res = await setEmployeeExtraDepartments(employee._id, [...current, String(deptId)]);
        setNotice(res.message);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyBadge(null);
    }
  };

  const revokeDepartment = async (employee, deptId) => {
    setBusyBadge(badgeKey(employee._id, deptId));
    const isPrimary = String(employee.accessDepartment?._id) === String(deptId);
    try {
      if (isPrimary) {
        // Revoking the primary must never silently strand them somewhere
        // they can't sign in while a grant they still hold sits unused in
        // "also" — the first remaining one, if any, takes over as primary.
        const remaining = (employee.additionalDepartments || []).map((d) => String(d._id));
        const [nextPrimary, ...rest] = remaining;
        await assignEmployee(employee._id, nextPrimary || null);
        await setEmployeeExtraDepartments(employee._id, rest);
        setNotice(nextPrimary ? "Primary department updated." : "Access removed.");
      } else {
        const current = (employee.additionalDepartments || []).map((d) => String(d._id));
        const res = await setEmployeeExtraDepartments(
          employee._id,
          current.filter((id) => id !== String(deptId)),
        );
        setNotice(res.message);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyBadge(null);
    }
  };

  const promoteToPrimary = async (employee, deptId) => {
    setBusyBadge(badgeKey(employee._id, deptId));
    const oldPrimaryId = employee.accessDepartment?._id
      ? String(employee.accessDepartment._id)
      : null;
    const current = (employee.additionalDepartments || []).map((d) => String(d._id));
    const nextExtra = current.filter((id) => id !== String(deptId));
    if (oldPrimaryId && !nextExtra.includes(oldPrimaryId)) nextExtra.push(oldPrimaryId);
    try {
      await assignEmployee(employee._id, deptId);
      await setEmployeeExtraDepartments(employee._id, nextExtra);
      setNotice("Primary department updated.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyBadge(null);
    }
  };

  /** Save an email for an employee who has none, so they stop being a dead end. */
  const saveEmail = async (employee) => {
    const email = emailDraft.trim();
    if (!email) return;
    try {
      const res = await setEmployeeEmail(employee._id, email);
      setNotice(res.message);
      setEmailFor(null);
      setEmailDraft("");
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Give an employee a password somebody actually knows — generated, or typed
   * in directly when the person needs to be told a specific password (e.g.
   * over the phone, or matching one they already use elsewhere).
   *
   * Accounts created by the bulk import carry a bcrypt hash of a random string
   * generated at import time, so neither the employee nor HR knows what it is —
   * and the sign-in page can only say "invalid email or password". This is the
   * way out of that without opening the database.
   */
  const confirmSetPassword = async (employee) => {
    const manual = pwMode === "manual";
    if (manual && pwDraft.trim().length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      const password = manual ? pwDraft.trim() : undefined;
      const res = await setEmployeePassword(employee._id, password);
      setTempPassword({
        email: employee.email,
        password: password || res.temporaryPassword,
      });
      setPwFor(null);
      setPwDraft("");
      await loadEmployees();
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Delete somebody who exists only as a module member.
   *
   * Not a deactivation. For these people the module row IS the account — there
   * is no employee record underneath it — so deactivating leaves an entry that
   * can never do anything again and clutters this list forever. The server
   * refuses this for anyone who does have an employee record.
   */
  const removeExternal = async (row) => {
    const mod = row.modules[0];
    if (!mod?.deleteMember) return;
    if (
      !window.confirm(
        `Delete ${row.person.name} (${row.person.email})?

` +
          `This removes the account entirely — they are signed out immediately ` +
          `and can no longer sign in anywhere. It cannot be undone.`,
      )
    )
      return;
    try {
      const res = await mod.deleteMember(row.person.email);
      setNotice(res.message);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  /* -- render ----------------------------------------------------- */

  const externalCount = rows.filter((r) => r.kind === "external").length;

  return (
    <div>
      {deptFilter && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-inset bg-[var(--control)] px-3.5 py-2.5">
          <p className="text-xs text-ink">
            Showing members of <strong>{deptFilter.name}</strong> only.
          </p>
          <Button tone="secondary" size="sm" onClick={onClearDeptFilter}>
            Show everyone
          </Button>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-xs text-ink-muted">
          Everybody who can sign in. Employees use their own work email and
          password and reach the department granted here — the server refuses
          anything else, so this is the real control, not a display setting.
          Modules with their own roles show them inline on the person&apos;s
          row.
        </p>
        {externalCapableModules().length > 0 && (
          <Button tone="primary" size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> Add External Employee
          </Button>
        )}
      </div>

      {adding && (
        <ExternalPersonForm
          onClose={() => setAdding(false)}
          onDone={async (message) => {
            setNotice(message);
            setAdding(false);
            await load();
          }}
          onError={setError}
        />
      )}

      {unassignedCount > 0 && assigned === "all" && (
        <button
          type="button"
          onClick={() => setAssigned("no")}
          className="mb-3 flex w-full items-center gap-2 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_18%,transparent)] p-3 text-left text-xs text-[var(--state-rework-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-rework)_28%,transparent)]"
        >
          <Ban className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong data-figure>{unassignedCount}</strong> employee
            {unassignedCount === 1 ? " has" : "s have"} no department and cannot
            sign in anywhere. Click to review.
          </span>
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[180px] max-w-xs flex-1">
          {/* Swaps to a spinner while a search is actually in flight — the
              visible sign a keystroke did something, which is what was
              missing before: the search box looked identical whether it was
              querying the server or just sitting there. */}
          {refreshing ? (
            <Loader2 className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 animate-spin text-ink-faint" />
          ) : (
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          )}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, ID or department…"
            className="pl-9"
          />
        </div>
        {/* The HR org-chart department, straight from the employee records —
            not a second list this screen has to keep in step. */}
        <Select
          value={hrDepartment}
          onChange={(e) => setHrDepartment(e.target.value)}
          title="Filter by the department on their HR record"
          className="w-auto max-w-[220px]"
        >
          <option value="all">All HR departments</option>
          {hrDepartments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>

        <Segmented
          label="Department assignment"
          size="sm"
          value={assigned}
          onChange={setAssigned}
          options={[
            { id: "all", label: "All" },
            { id: "yes", label: "Assigned" },
            { id: "no", label: "Not assigned" },
          ]}
        />

        {noEmailCount > 0 && (
          <span className="text-[11px] text-ink-faint">
            <span data-figure>{noEmailCount}</span> with no email on file
          </span>
        )}
        {externalCount > 0 && (
          <span className="text-[11px] text-ink-faint">
            including <span data-figure>{externalCount}</span> without an HR
            record
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-ink-faint" />
        </div>
      ) : (
        <Panel padded={false} label="People and roles">
          {rows.length === 0 ? (
            <EmptyState
              compact
              title={deptFilter ? `Nobody has ${deptFilter.name} yet.` : "Nobody matches."}
              body={deptFilter ? 'Click "Show everyone" above to find someone and grant it.' : undefined}
            />
          ) : (
            <div className="divide-y divide-hairline">
            {rows.map((row) => (
              <div
                key={row.key}
                className="p-3 transition-colors hover:bg-[var(--row-hover)]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 truncate text-sm text-ink">
                      {row.person.name}
                      {row.kind === "external" && (
                        <Chip tone="neutral">NO HR RECORD</Chip>
                      )}
                      {row.kind === "employee" && !row.employee.hasEmail && (
                        <Chip
                          tone="neutral"
                          title="Their HR record has no email address, so there is no credential to sign in with. Add one in HR first."
                        >
                          NO EMAIL
                        </Chip>
                      )}
                      {row.kind === "employee" &&
                        row.employee.hasEmail &&
                        !row.employee.canSignIn && (
                          <Chip tone="rework">CANNOT SIGN IN</Chip>
                        )}
                      {row.kind === "employee" && !row.employee.isActive && (
                        <Chip tone="overdue">INACTIVE</Chip>
                      )}
                      {row.kind === "external" && !row.external.isActive && (
                        <Chip tone="overdue">REVOKED</Chip>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {row.person.email || (
                        <span className="italic">no email on file</span>
                      )}
                      {row.kind === "employee" && row.employee.hrDepartment && (
                        <span>
                          {" "}
                          · HR record: {row.employee.hrDepartment}
                        </span>
                      )}
                      {row.kind === "external" && (
                        <span>
                          {" "}
                          ·{" "}
                          {row.modules.map((m) => m.label).join(", ") ||
                            "no module"}{" "}
                          only
                        </span>
                      )}
                    </p>
                  </div>

                  {row.kind === "employee" ? (
                    <>
                      {/* No email is no longer a dead end — it is the one
                          thing to fix before anything else on this row can
                          work, so it replaces the (otherwise disabled)
                          password control rather than sitting beside it. */}
                      {!row.employee.hasEmail ? (
                        emailFor === row.employee._id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveEmail(row.employee);
                            }}
                            className="flex items-center gap-1.5"
                          >
                            <Input
                              autoFocus
                              type="email"
                              required
                              value={emailDraft}
                              onChange={(e) => setEmailDraft(e.target.value)}
                              placeholder="name@company.com"
                              className="w-[190px] text-[11px]"
                            />
                            <Button type="submit" tone="primary" size="sm" className="text-[11px]">
                              Save
                            </Button>
                            <Button
                              type="button"
                              tone="secondary"
                              size="sm"
                              className="text-[11px]"
                              onClick={() => { setEmailFor(null); setEmailDraft(""); }}
                            >
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          <Button
                            tone="secondary"
                            size="sm"
                            onClick={() => { setEmailFor(row.employee._id); setEmailDraft(""); }}
                            title="Add an email so this person has a sign-in credential — sign-in looks people up by email."
                            className="text-[11px]"
                          >
                            <Mail className="h-3 w-3" />
                            Set email
                          </Button>
                        )
                      ) : pwFor === row.employee._id ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); confirmSetPassword(row.employee); }}
                          className="flex items-center gap-1.5"
                        >
                          <Select
                            value={pwMode}
                            onChange={(e) => setPwMode(e.target.value)}
                            className="w-auto py-1.5 pl-2 text-[11px]"
                          >
                            <option value="generate">Generate</option>
                            <option value="manual">Enter manually</option>
                          </Select>
                          {pwMode === "manual" && (
                            <Input
                              autoFocus
                              type="text"
                              required
                              minLength={8}
                              value={pwDraft}
                              onChange={(e) => setPwDraft(e.target.value)}
                              placeholder="At least 8 characters"
                              className="w-[160px] font-mono text-[11px]"
                            />
                          )}
                          <Button type="submit" tone="primary" size="sm" className="text-[11px]">
                            Set
                          </Button>
                          <Button
                            type="button"
                            tone="secondary"
                            size="sm"
                            className="text-[11px]"
                            onClick={() => { setPwFor(null); setPwDraft(""); }}
                          >
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <Button
                          tone="secondary"
                          size="sm"
                          onClick={() => { setPwFor(row.employee._id); setPwMode("generate"); setPwDraft(""); }}
                          title="Set a new sign-in password"
                          className="text-[11px]"
                        >
                          <KeyRound className="h-3 w-3" />
                          Set password
                        </Button>
                      )}

                    </>
                  ) : (
                    <Button
                      tone="destructive"
                      size="sm"
                      onClick={() => removeExternal(row)}
                      title="Delete this account entirely"
                      className="text-[11px]"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                  )}
                </div>

                {/* Module roles — Accounting today, whatever moduleRoles.js lists
                  tomorrow. Rendered only for the modules this person actually
                  holds, because the role is meaningless otherwise. */}
                <ModuleRoleRow
                  person={row.person}
                  modules={row.modules}
                  seed={row.seed}
                  onNotice={setNotice}
                  onError={setError}
                />

                {/* Department access, ONE control: click a department to grant
                  or revoke it; the star on a held one makes it primary — the
                  department this person actually lands on when they sign in.
                  Someone can hold more than one grant (a project manager who
                  also needs Store), which is why this isn't a single-choice
                  dropdown; but exactly one of the held ones has to be the
                  primary, which is why plain multi-select badges alone
                  weren't enough either. */}
                {row.kind === "employee" && (
                  <div className="mt-2 flex flex-wrap items-start gap-2 pl-1">
                    <span className="mt-1.5 text-[10px] tracking-[0.09em] text-ink-faint uppercase">
                      Departments
                    </span>
                    {!row.employee.accessDepartment && (
                      <span className="mt-1 text-[10.5px] text-[var(--state-rework-ink)]">
                        No department yet — click one below.
                      </span>
                    )}
                    {departments
                      .filter((d) => d.isActive)
                      .map((d) => {
                        const isPrimary =
                          String(row.employee.accessDepartment?._id) === String(d._id);
                        const isExtra = (
                          row.employee.additionalDepartments || []
                        ).some((x) => String(x._id) === String(d._id));
                        const held = isPrimary || isExtra;
                        // Every badge on THIS row is disabled while any one of
                        // them is mid-request — they all write the same two
                        // fields on the same employee, and letting a second
                        // click fire before the first round trip lands is
                        // exactly the kind of race that produced Rakesh
                        // Biswal's mismatched grant in the first place.
                        const rowBusy = busyBadge?.startsWith(`${row.employee._id}:`) ?? false;
                        const isBusy = busyBadge === badgeKey(row.employee._id, d._id);
                        const disabled = !row.employee.hasEmail || rowBusy;
                        return (
                          <span
                            key={d._id}
                            className={`inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 text-[10.5px] transition-colors ${
                              isPrimary
                                ? "bg-ink text-[var(--body-bg)]"
                                : isExtra
                                  ? "bg-[color-mix(in_srgb,var(--color-ink)_16%,var(--control))] text-ink"
                                  : "bg-[var(--control)] text-ink-muted"
                            } ${disabled && !isBusy ? "opacity-50" : ""}`}
                          >
                            <button
                              type="button"
                              aria-pressed={held}
                              aria-busy={isBusy}
                              disabled={disabled}
                              title={
                                !row.employee.hasEmail
                                  ? "Add an email to their HR record first."
                                  : isPrimary
                                    ? "Primary — click to remove this grant"
                                    : isExtra
                                      ? "Also granted — click to remove"
                                      : "Not granted — click to give access"
                              }
                              onClick={() =>
                                held
                                  ? revokeDepartment(row.employee, d._id)
                                  : grantDepartment(row.employee, d._id)
                              }
                              className="inline-flex items-center gap-1 disabled:cursor-not-allowed"
                            >
                              {isBusy && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                              {d.name}
                            </button>
                            {held && !isPrimary && !disabled && (
                              <button
                                type="button"
                                title="Make this the primary department"
                                onClick={() => promoteToPrimary(row.employee, d._id)}
                                className="rounded-full p-0.5 text-ink-faint hover:text-ink"
                              >
                                <Star className="h-2.5 w-2.5" />
                              </button>
                            )}
                            {isPrimary && (
                              <Star
                                aria-label="Primary department"
                                className="h-2.5 w-2.5 fill-current"
                              />
                            )}
                          </span>
                        );
                      })}
                  </div>
                )}


                {/* Who granted this person which department or role, and
                    when — see accessAdmin.js's recordChange() calls. Shown
                    for anyone with an email, employee or external, since a
                    module role (Sales, Store, Merchandiser…) can be granted
                    to either kind of person. */}
                {row.person.email && <PersonHistory email={row.person.email} onError={setError} />}
              </div>
            ))}
            </div>
          )}
        </Panel>
      )}

      {MODULE_ROLES.map(
        (m) =>
          m.note && (
            <p key={m.key} className="mt-3 text-[11px] text-ink-faint">
              <span className="tracking-[0.09em] uppercase">
                {m.label}
              </span>{" "}
              — {m.note}
            </p>
          ),
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Somebody with no HR record — an external bookkeeper, an auditor.
 *
 * They need their own password precisely because there is no employee document
 * to hold one. The module list comes from the registry, so this form does not
 * mention Accounting anywhere and will offer the next module the day it declares
 * `supportsExternal`.
 */
function ExternalPersonForm({ onClose, onDone, onError }) {
  const mods = externalCapableModules();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    moduleKey: mods[0]?.key || "",
    name: "",
    email: "",
    role: mods[0]?.roles[0]?.value || "",
    password: "",
  });

  const mod = mods.find((m) => m.key === form.moduleKey) || mods[0];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await mod.setRole({
        email: form.email,
        name: form.name,
        role: form.role,
        password: form.password,
      });
      onDone(res.message);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-3">
      <Panel
        label="Add external employee"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <div className="flex items-start justify-between gap-3 sm:col-span-2">
          <p className="text-xs text-ink-muted">
            For people who are not on the payroll. Employees should be granted
            access on their own row instead — they already have a password.
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mods.length > 1 && (
          <Field label="Module" className="sm:col-span-2">
            <Select
              value={form.moduleKey}
              onChange={(e) => {
                const next = mods.find((m) => m.key === e.target.value);
                setForm({
                  ...form,
                  moduleKey: e.target.value,
                  role: next.roles[0].value,
                });
              }}
            >
              {mods.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Full name">
          <Input
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <Field label="Email">
          <Input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label={`${mod?.label} role`}>
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            {(mod?.roles || []).map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Password">
          <Input
            required
            type="text"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 8 characters"
            className="font-mono"
          />
        </Field>

        <div className="sm:col-span-2">
          <Button type="submit" tone="primary" size="sm" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Create sign-in
          </Button>
        </div>
      </Panel>
    </form>
  );
}
