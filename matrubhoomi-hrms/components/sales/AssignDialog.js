// components/sales/AssignDialog.js
//
// Handing out a day's work. ONE dialog, and the first thing it asks is which of
// the two kinds of work this is — because everything after that differs.
//
//   NEW CUSTOMER   a count per person. Nobody is chosen, because the customers
//                  do not exist yet; the employee creates them as they go.
//   FOLLOW-UP      a named customer. Choosing them determines the scheme, the
//                  step and the exact form version — the desk is SHOWN those,
//                  never asked for them.
//
// THE ARITHMETIC HAPPENS IN FRONT OF THE MANAGER
// ----------------------------------------------
// "Ten customers across four people" is 2.5 each, and every rounding rule
// anybody could pick is one somebody has to explain to whoever got three. So
// the split button fills the boxes and the manager sees — and can change — the
// actual numbers before anything is sent. The API is never asked to guess: it
// takes a count per person (see services/salesTasks.js).
//
// TARGETED WORK IS ASSIGNED CUSTOMER BY CUSTOMER
// ----------------------------------------------
// For a follow-up round the manager picks the customers and then says who takes
// each one. Round-robin would be faster to build and wrong in the field: these
// are villages, and who goes where depends on who lives near which road.
//
// THE CUSTOMER SEARCH IS ON THE SERVER
// ------------------------------------
// It used to load the leads and filter them in the browser. That works for the
// first year and then stops working on the day it matters, on a laptop in a
// district office with four thousand customers on the books. Every keystroke
// here asks the server, which also decides ELIGIBILITY — so somebody whose
// registration is still pending, or who has already finished their scheme, is
// shown greyed with the reason rather than offered and then refused.
"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Users, AlertTriangle, ArrowRight, UserPlus, ClipboardList } from "lucide-react";
import { Button, Field, Input, Select, Textarea, Skeleton } from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { Dialog, ErrorNote, StageChip, useAsync, todayKey } from "@/components/sales/kit";

/**
 * The two that matter, and the ones that came before them.
 *
 * `lead_generation` is the stored key for New Customer and stays that way: it
 * is on every task ever written, and renaming a stored value to improve a label
 * is how migrations get invented for no reason. The LABEL is what people read.
 */
const PRIMARY = [
  {
    id: "lead_generation",
    label: "New customer",
    icon: UserPlus,
    hint: "A target per person. They register the customers as they find them.",
  },
  {
    id: "follow_up",
    label: "Follow-up",
    icon: ClipboardList,
    hint: "Named customers. The scheme, step and form come from the customer.",
  },
];

const SECONDARY = [
  { id: "collection", label: "Collect a payment" },
  { id: "custom", label: "Something else" },
];

export function AssignDialog({ open, onClose, onAssigned, presetLeadIds = [] }) {
  const team = useAsync(() => (open ? salesApi.team() : Promise.resolve(null)), [open]);
  const templates = useAsync(() => (open ? salesApi.templates() : Promise.resolve(null)), [open]);
  const teamList = team.data?.data || [];
  const templateList = templates.data?.data || [];

  const [type, setType] = useState("lead_generation");
  const [form, setForm] = useState({
    title: "",
    instructions: "",
    templateId: "",
    scheduledFor: todayKey(),
    dueAt: "",
    priority: "normal",
    requireOtp: false,
    requirePhoto: false,
  });

  const [picked, setPicked] = useState({});   // employeeId -> true
  const [counts, setCounts] = useState({});   // employeeId -> quota
  const [chosen, setChosen] = useState({});   // leadId -> { lead, employeeId }
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isNewCustomer = type === "lead_generation";
  const isFollowUp = type === "follow_up";
  const targeted = !isNewCustomer;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAllowDuplicate(false);
  }, [open]);

  // Customers chosen from the leads screen ("follow these six up") arrive
  // already selected, so the manager only has to say who takes them.
  useEffect(() => {
    if (!open || !presetLeadIds.length) return;
    setType("follow_up");
    Promise.all(presetLeadIds.map((id) => salesApi.customerWorkflow(id).catch(() => null)))
      .then((rows) => {
        const next = {};
        for (const r of rows) {
          const d = r?.data;
          if (d?.lead) next[d.lead._id] = { lead: d.lead, ctx: d, employeeId: "" };
        }
        setChosen(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetLeadIds.join(",")]);

  const chosenPeople = Object.keys(picked).filter((id) => picked[id]);
  const totalQuota = chosenPeople.reduce((sum, id) => sum + (Number(counts[id]) || 0), 0);
  const chosenLeads = Object.values(chosen);
  const assignedCount = chosenLeads.filter((c) => c.employeeId).length;

  function splitEvenly(total) {
    if (!chosenPeople.length || !total) return;
    const base = Math.floor(total / chosenPeople.length);
    const extra = total % chosenPeople.length;
    // The remainder goes to the first names in the list, and the manager can
    // see exactly who got the extra one before sending it.
    setCounts(Object.fromEntries(chosenPeople.map((id, i) => [id, base + (i < extra ? 1 : 0)])));
  }

  function reset() {
    setPicked({});
    setCounts({});
    setChosen({});
    setForm((f) => ({ ...f, title: "", instructions: "", dueAt: "" }));
    setError(null);
    setAllowDuplicate(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const assignments = targeted
        ? chosenPeople
            .map((employeeId) => ({
              employeeId,
              leadIds: chosenLeads.filter((c) => c.employeeId === employeeId).map((c) => c.lead._id),
            }))
            .filter((a) => a.leadIds.length)
        : chosenPeople.map((employeeId) => ({ employeeId, targetCount: Number(counts[employeeId]) || 0 }));

      await salesApi.assign({
        type,
        title: form.title.trim() || defaultTitle(type),
        instructions: form.instructions,
        // A follow-up resolves its own template from the customer's step; only
        // the other shapes take one from here.
        templateId: isFollowUp ? undefined : form.templateId || undefined,
        scheduledFor: form.scheduledFor,
        dueAt: form.dueAt || undefined,
        priority: form.priority,
        requireOtp: form.requireOtp,
        requirePhoto: form.requirePhoto,
        allowDuplicate: allowDuplicate || undefined,
        assignments,
      });

      reset();
      onAssigned?.();
      onClose?.();
    } catch (err) {
      setError(err);
      // The server offers an override when a duplicate follow-up is the only
      // objection. Surfacing the offer is the whole reason it is sent.
      if (err?.payload?.canOverride || err?.canOverride) setAllowDuplicate(false);
    } finally {
      setBusy(false);
    }
  }

  const canSend = targeted ? assignedCount > 0 : chosenPeople.length > 0 && totalQuota > 0;
  const offersOverride = Boolean(error?.canOverride || error?.payload?.canOverride);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Assign work"
      sub={
        isNewCustomer
          ? "A target per person. Nobody is chosen — the customers do not exist yet."
          : "Pick the customers. Their scheme and step decide the rest."
      }
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          {offersOverride ? (
            <Button
              tone="destructive"
              size="sm"
              disabled={busy}
              onClick={() => { setAllowDuplicate(true); setError(null); setTimeout(submit, 0); }}
            >
              Assign anyway
            </Button>
          ) : null}
          <Button tone="primary" size="sm" onClick={submit} disabled={busy || !canSend}>
            {busy ? "Assigning…" : targeted ? `Assign ${assignedCount || ""}`.trim() : `Assign ${totalQuota || ""}`.trim()}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <ErrorNote error={error} onRetry={() => setError(null)} /> : null}

        {/* ── 1. What kind of work ────────────────────────────── */}

        <div>
          <p className="mb-2 text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">Task type</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRIMARY.map((t) => {
              const Icon = t.icon;
              const active = type === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setType(t.id); setChosen({}); }}
                  aria-pressed={active}
                  className="flex items-start gap-3 rounded-xl p-3 text-left transition-colors"
                  style={{
                    background: active ? "color-mix(in srgb, var(--g-brand) 10%, transparent)" : "var(--control)",
                    boxShadow: active
                      ? "inset 0 0 0 1.5px color-mix(in srgb, var(--g-brand) 45%, transparent)"
                      : "inset 0 0 0 1px var(--color-hairline)",
                  }}
                >
                  <Icon size={18} style={{ color: active ? "var(--g-brand)" : "var(--color-ink-faint)" }} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{t.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{t.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-ink-faint">Other kinds of work</summary>
            <div className="mt-2">
              <Select value={SECONDARY.some((s) => s.id === type) ? type : ""} onChange={(e) => e.target.value && setType(e.target.value)}>
                <option value="">Choose…</option>
                {SECONDARY.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </div>
          </details>
        </div>

        {/* ── 2. Who it is for ────────────────────────────────── */}

        {targeted ? (
          <CustomerPicker
            chosen={chosen}
            setChosen={setChosen}
            people={teamList}
            followUp={isFollowUp}
          />
        ) : null}

        {/* ── 3. Who does it ──────────────────────────────────── */}

        <div>
          <p className="mb-2 text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">
            <Users size={13} className="mr-1 inline" /> Team
          </p>
          {team.loading ? (
            <Skeleton className="h-24" />
          ) : teamList.length === 0 ? (
            <p className="text-sm text-ink-faint">Nobody is in the sales team yet.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-auto rounded-lg p-1" style={{ background: "var(--control)" }}>
              {teamList.map((p) => (
                <li key={p._id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                  <label className="flex min-w-0 flex-1 items-center gap-2.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={Boolean(picked[p._id])}
                      onChange={(e) => setPicked({ ...picked, [p._id]: e.target.checked })}
                    />
                    <span className="truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-ink-faint">{p.code}</span>
                  </label>
                  {!targeted && picked[p._id] ? (
                    <Input
                      type="number"
                      min={1}
                      className="w-20 shrink-0"
                      value={counts[p._id] ?? ""}
                      onChange={(e) => setCounts({ ...counts, [p._id]: e.target.value })}
                      aria-label={`Target for ${p.name}`}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {!targeted && chosenPeople.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-muted">Split</span>
              {[5, 10, 20].map((n) => (
                <Button key={n} tone="secondary" size="sm" onClick={() => splitEvenly(n)}>{n}</Button>
              ))}
              <span className="ml-auto text-ink">
                <b>{totalQuota}</b> across {chosenPeople.length}
              </span>
            </div>
          ) : null}

          {targeted && chosenLeads.length > 0 && chosenPeople.length > 0 ? (
            <p className="mt-2 text-sm text-ink-muted">
              Now say who takes each customer above. {assignedCount} of {chosenLeads.length} assigned.
            </p>
          ) : null}
        </div>

        {/* ── 4. When and what to say ─────────────────────────── */}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" hint="What the employee sees at the top of the task.">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={defaultTitle(type)}
            />
          </Field>
          <Field label="Scheduled for">
            <Input type="date" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} />
          </Field>
          <Field label="Due">
            <Input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
        </div>

        {/* A follow-up's form comes from the customer's step and must not be
            chosen here — that is the whole point of resolving it. */}
        {!isFollowUp ? (
          <Field
            label="Form"
            hint={isNewCustomer ? "Leave empty to use the registration form." : "The form the employee fills."}
          >
            <Select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
              <option value="">Default for this work</option>
              {templateList.map((t) => (
                <option key={t._id} value={t._id}>{t.name} (v{t.version})</option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Instructions" hint="Optional. Shown on the handset.">
          <Textarea rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </Field>

        <div className="flex flex-wrap gap-5 text-sm text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.requirePhoto} onChange={(e) => setForm({ ...form, requirePhoto: e.target.checked })} />
            Photograph required
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.requireOtp} onChange={(e) => setForm({ ...form, requireOtp: e.target.checked })} />
            Customer OTP required
          </label>
          <span className="text-xs text-ink-faint">
            A task may tighten what its step already asks for, never loosen it.
          </span>
        </div>
      </div>
    </Dialog>
  );
}

function defaultTitle(type) {
  if (type === "lead_generation") return "New customers";
  if (type === "follow_up") return "Follow-up visits";
  if (type === "collection") return "Collection round";
  return "Field work";
}

/* ------------------------------------------------------------------ */

/**
 * Search customers on the SERVER, and show what following one up would mean.
 *
 * The resolved scheme, step and form version are displayed, never chosen. If a
 * customer cannot be followed up the row says why and cannot be picked — the
 * server refuses it anyway, and being told before clicking is better than after.
 */
function CustomerPicker({ chosen, setChosen, people, followUp }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  const results = useAsync(
    () => (debounced.trim().length >= 2 ? salesApi.customerSearch({ q: debounced, limit: 20 }) : Promise.resolve(null)),
    [debounced],
  );

  const rows = results.data?.data?.rows || [];
  const picked = Object.values(chosen);

  function add(row) {
    if (!row.eligible && followUp) return;
    setChosen({ ...chosen, [row._id]: { lead: row, ctx: row, employeeId: "" } });
    setQ("");
  }

  function remove(id) {
    const next = { ...chosen };
    delete next[id];
    setChosen(next);
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">Customers</p>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
        <Input
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone, village or reference…"
        />
      </div>

      {debounced.trim().length >= 2 ? (
        <div className="mt-2 max-h-56 overflow-auto rounded-lg" style={{ background: "var(--control)" }}>
          {results.loading ? (
            <p className="p-3 text-sm text-ink-faint">Searching…</p>
          ) : rows.length === 0 ? (
            <p className="p-3 text-sm text-ink-faint">Nobody matches “{debounced}”.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-hairline)]">
              {rows.map((row) => {
                const blocked = followUp && !row.eligible;
                const already = Boolean(chosen[row._id]);
                return (
                  <li key={row._id}>
                    <button
                      type="button"
                      disabled={blocked || already}
                      onClick={() => add(row)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 enabled:hover:bg-[var(--control-hover)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{row.name}</span>
                          <span className="text-xs text-ink-faint">{row.code}</span>
                          {/* Enough to tell two Anils apart. */}
                          <span className="text-xs text-ink-faint">{row.phone}</span>
                          {row.address?.village ? (
                            <span className="text-xs text-ink-faint">{row.address.village}</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {blocked ? (
                            <span className="inline-flex items-center gap-1" style={{ color: "var(--g-brick)" }}>
                              <AlertTriangle size={11} /> {row.reason}
                            </span>
                          ) : row.schemeName ? (
                            <>
                              {row.schemeName} · {row.stepName}
                              {row.templateName ? ` · ${row.templateName} v${row.templateVersion}` : ""}
                            </>
                          ) : (
                            "No scheme"
                          )}
                        </span>
                      </span>
                      {already ? <span className="text-xs text-ink-faint">added</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {picked.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {picked.map(({ lead, ctx, employeeId }) => (
            <li
              key={lead._id}
              className="flex flex-wrap items-center gap-3 rounded-lg p-2.5"
              style={{ background: "var(--control)" }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{lead.name}</span>
                {/* RESOLVED, not chosen. */}
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  {ctx?.schemeName || ctx?.scheme?.name ? (
                    <StageChip tone="neutral">{ctx.schemeName || ctx.scheme?.name}</StageChip>
                  ) : null}
                  <ArrowRight size={11} />
                  {ctx?.stepName || ctx?.step?.name ? (
                    <StageChip tone="water">{ctx.stepName || ctx.step?.name}</StageChip>
                  ) : null}
                  {ctx?.templateName || ctx?.template?.name ? (
                    <span className="text-ink-faint">
                      {ctx.templateName || ctx.template?.name} v{ctx.templateVersion || ctx.template?.version}
                    </span>
                  ) : null}
                </span>
              </span>

              <Select
                className="w-44 shrink-0"
                value={employeeId}
                onChange={(e) =>
                  setChosen({ ...chosen, [lead._id]: { lead, ctx, employeeId: e.target.value } })
                }
                aria-label={`Who visits ${lead.name}`}
              >
                <option value="">Who visits?</option>
                {people.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </Select>

              <Button tone="ghost" size="sm" onClick={() => remove(lead._id)}>Remove</Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default AssignDialog;
