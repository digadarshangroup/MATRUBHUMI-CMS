// components/sales/LeadDialogs.js
//
// The two dialogs the leads screen opens: adding one by hand, and everything
// known about one that exists.
//
// THE DETAIL DIALOG IS A READING SURFACE FIRST
// --------------------------------------------
// What the desk needs from a lead is almost always "what happened, and what did
// the employee actually see". So the timeline and the submitted forms —
// including the photographs, at a size somebody can judge — come before the
// controls. The controls are three: hand it to somebody, move it, add a note.
// Anything more belongs in the field app, where the person is standing in front
// of the farmer.
"use client";

import { useState } from "react";
import { Camera, MapPin, Phone, ShieldCheck } from "lucide-react";
import { Button, Field, Input, Select, Textarea, Skeleton } from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import {
  Dialog, Row, StageChip, StatusChip, ErrorNote, useAsync,
  dateTime, shortDate, rupees,
} from "@/components/sales/kit";

/* ------------------------------------------------------------------ */
/* Add a lead                                                          */
/* ------------------------------------------------------------------ */

export function NewLeadDialog({ open, onClose, onCreated, stages = [], team = [] }) {
  const [form, setForm] = useState({
    name: "", phone: "", category: "farmer", source: "call_in",
    village: "", district: "", assignedTo: "", estimatedValue: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const assignee = team.find((t) => t.id === form.assignedTo);
      const res = await salesApi.createLead({
        name: form.name,
        phone: form.phone,
        category: form.category,
        source: form.source,
        address: { village: form.village, district: form.district },
        assignedTo: form.assignedTo || undefined,
        assignedToName: assignee?.name,
        assignedToCode: assignee?.code,
        estimatedValue: Number(form.estimatedValue) || 0,
        notes: form.notes,
      });
      onCreated?.(res.data);
      setForm({ name: "", phone: "", category: "farmer", source: "call_in", village: "", district: "", assignedTo: "", estimatedValue: "", notes: "" });
      onClose?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a lead"
      sub={stages[0] ? `Starts at ${stages[0].name}` : undefined}
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button tone="primary" size="sm" onClick={submit} disabled={busy || !form.name || !form.phone}>
            {busy ? "Saving…" : "Add lead"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {/* A duplicate phone number comes back as a 409 naming the existing
            lead — the server owns that check, because two people can be adding
            the same farmer at the same moment. */}
        <ErrorNote error={error} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={set("name")} placeholder="Full name" autoFocus />
          </Field>
          <Field label="Phone" required hint="Ten digits. Everything keys off this.">
            <Input value={form.phone} onChange={set("phone")} inputMode="numeric" placeholder="98765 43210" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={set("category")}>
              <option value="farmer">Farmer</option>
              <option value="dealer">Dealer</option>
              <option value="distributor">Distributor</option>
              <option value="institution">Institution</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="How they came in">
            <Select value={form.source} onChange={set("source")}>
              <option value="call_in">Called in</option>
              <option value="referral">Referral</option>
              <option value="camp">Camp</option>
              <option value="dealer">Through a dealer</option>
              <option value="field_visit">Field visit</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Village">
            <Input value={form.village} onChange={set("village")} />
          </Field>
          <Field label="District">
            <Input value={form.district} onChange={set("district")} />
          </Field>
          <Field label="Assign to" hint="Optional — can be assigned with the day's work instead.">
            <Select value={form.assignedTo} onChange={set("assignedTo")}>
              <option value="">Nobody yet</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated value">
            <Input value={form.estimatedValue} onChange={set("estimatedValue")} inputMode="numeric" placeholder="0" />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea rows={3} value={form.notes} onChange={set("notes")} placeholder="Anything the field team should know before they go." />
        </Field>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* One submitted form, rendered                                        */
/* ------------------------------------------------------------------ */

function Submission({ s }) {
  const answers = Object.entries(s.values || {}).filter(([, v]) => v !== null && v !== "" && v !== undefined);

  return (
    <div className="rounded-[12px] border border-[var(--g-line)] bg-[var(--g-surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--g-ink)]">{s.templateName}</p>
          <p className="mt-0.5 text-xs text-[var(--g-ink-3)]">
            {s.submittedByName} · {dateTime(s.capturedAt)}
            {s.wasQueued && " · sent later"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {s.otp?.verified && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--g-brand)]" title="The customer answered an OTP on their own phone">
              <ShieldCheck size={13} /> verified
            </span>
          )}
          {s.location?.lat != null && (
            <a
              href={`https://www.google.com/maps?q=${s.location.lat},${s.location.lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[var(--g-water)] hover:underline underline-offset-2"
              title={`Captured at ${s.location.lat.toFixed(5)}, ${s.location.lng.toFixed(5)}`}
            >
              <MapPin size={13} /> on the map
            </a>
          )}
          {/* A fix Android flagged as coming from a mock provider. Surfaced,
              never silently dropped — see the model's own note. */}
          {s.location?.isMock && (
            <span className="rounded-full bg-[var(--g-danger-wash)] px-2 py-0.5 text-[11px] text-[var(--g-danger)]">
              mock location
            </span>
          )}
        </div>
      </div>

      {answers.length > 0 && (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-[var(--g-line)] pt-3 sm:grid-cols-2">
          {answers.map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-[var(--g-ink-3)]">{s.labels?.[key] || key}</dt>
              <dd className="text-right text-sm text-[var(--g-ink)]">
                {Array.isArray(value) ? value.join(", ") : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {s.photos?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--g-line)] pt-3">
          {s.photos.map((p) => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.fieldKey || "Field photograph"}
                loading="lazy"
                className="h-24 w-24 rounded-[8px] border border-[var(--g-line)] object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {s.note && <p className="mt-3 text-sm text-[var(--g-ink-2)]">{s.note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Everything about one lead                                           */
/* ------------------------------------------------------------------ */

export function LeadDetailDialog({ leadId, open, onClose, onChanged, team = [] }) {
  const { data, error, loading, reload } = useAsync(
    () => (leadId ? salesApi.lead(leadId) : Promise.resolve(null)),
    [leadId],
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [note, setNote] = useState("");

  const lead = data?.data?.lead;
  const stages = data?.data?.stages || [];
  const submissions = data?.data?.submissions || [];
  const stage = stages.find((s) => s.key === lead?.stageKey);

  async function act(fn) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload({ quiet: true });
      onChanged?.();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={lead ? lead.name : "Lead"}
      sub={lead ? `${lead.code} · ${lead.phone}` : undefined}
      footer={
        lead && (
          <>
            <a
              href={`tel:${lead.phone}`}
              className="mr-auto inline-flex items-center gap-1.5 text-sm text-[var(--g-brand)] hover:underline underline-offset-2"
            >
              <Phone size={15} /> Call {lead.phone}
            </a>
            <Button tone="ghost" size="sm" onClick={onClose}>Close</Button>
          </>
        )
      }
    >
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      <ErrorNote error={error} onRetry={reload} />

      {lead && (
        <div className="space-y-5">
          {actionError && <ErrorNote error={actionError} />}

          <div className="flex flex-wrap items-center gap-2">
            {stage && <StageChip tone={stage.tone}>{stage.name}</StageChip>}
            <StatusChip status={lead.status} />
            {lead.isCustomer && <StageChip tone="brand">Customer</StageChip>}
            {lead.phoneVerified && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--g-brand)]">
                <ShieldCheck size={13} /> phone verified
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div className="divide-y divide-[var(--g-line)]">
              <Row label="Owner">{lead.assignedToName || "Unassigned"}</Row>
              <Row label="Village">{lead.address?.village || "—"}</Row>
              <Row label="District">{lead.address?.district || "—"}</Row>
              <Row label="Category">{lead.category}</Row>
            </div>
            <div className="divide-y divide-[var(--g-line)]">
              <Row label="Visits">{lead.visitCount || 0}</Row>
              <Row label="Last contacted">{shortDate(lead.lastContactedAt)}</Row>
              <Row label="Next follow-up">{shortDate(lead.nextFollowUpAt)}</Row>
              <Row label={lead.dealValue ? "Deal value" : "Estimated value"}>
                {rupees(lead.dealValue || lead.estimatedValue)}
              </Row>
            </div>
          </div>

          {/* ── The three controls ──────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 rounded-[12px] bg-[var(--g-surface-2)] p-4 sm:grid-cols-2">
            <Field label="Hand it to">
              <Select
                value={lead.assignedTo || ""}
                disabled={busy}
                onChange={(e) => e.target.value && act(() => salesApi.assignLead(lead._id, e.target.value))}
              >
                <option value="">Unassigned</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Move to" hint="Recorded as a desk move, not a field visit.">
              <Select
                value={lead.stageKey}
                disabled={busy}
                onChange={(e) => e.target.value !== lead.stageKey && act(() => salesApi.moveLead(lead._id, e.target.value))}
              >
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Add a note">
                <div className="flex gap-2">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What was said, what was agreed."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && note.trim()) {
                        e.preventDefault();
                        act(async () => { await salesApi.noteLead(lead._id, { message: note }); setNote(""); });
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={busy || !note.trim()}
                    onClick={() => act(async () => { await salesApi.noteLead(lead._id, { message: note }); setNote(""); })}
                  >
                    Save
                  </Button>
                </div>
              </Field>
            </div>
          </div>

          {/* ── What the field actually captured ────────────────────── */}
          {submissions.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[var(--g-ink)]">
                <Camera size={14} /> Forms submitted ({submissions.length})
              </h3>
              <div className="space-y-3">
                {submissions.map((s) => (
                  <Submission key={s._id} s={s} />
                ))}
              </div>
            </section>
          )}

          {/* ── History ─────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-[13px] font-medium text-[var(--g-ink)]">History</h3>
            <ol className="space-y-0">
              {(lead.timeline || []).map((t, i) => (
                <li key={i} className="flex gap-3 py-2">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: i === 0 ? "var(--g-brand)" : "var(--g-line-strong)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--g-ink)]">{t.message}</p>
                    <p className="mt-0.5 text-xs text-[var(--g-ink-3)]">
                      {t.byName || "System"} · {dateTime(t.at)}
                    </p>
                  </div>
                </li>
              ))}
              {!lead.timeline?.length && (
                <li className="py-2 text-sm text-[var(--g-ink-3)]">Nothing has happened yet.</li>
              )}
            </ol>
          </section>
        </div>
      )}
    </Dialog>
  );
}
