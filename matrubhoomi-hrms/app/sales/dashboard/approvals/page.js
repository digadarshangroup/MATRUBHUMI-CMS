"use client";

// app/sales/dashboard/approvals/page.js
//
// Where the organisation answers the field team's claim that a step is done.
//
// THE ONE THING THIS SCREEN MUST NOT DO
// -------------------------------------
// Fake it. Approving moves a real customer up a real workflow, and a UI that
// ticks the row optimistically and reconciles later will, on the day the
// network is bad, show an approver a queue they believe they cleared. So every
// decision here waits for the server, the row stays until the server confirms
// it, and a failure is shown rather than swallowed.
//
// Two approvers clicking the same row at the same moment is not an error and is
// not treated as one: the server tells the loser it was already decided, and
// the screen says so plainly and moves on.
//
// WHY THE WHOLE CONTEXT IS ON ONE SCREEN
// --------------------------------------
// The question an approver is actually answering is rarely "are these answers
// well-formed". It is "is this consistent with what we already knew about this
// person" — so the customer's previous submissions, their position in the
// scheme, and where accepting this would put them are all here. Making somebody
// navigate away to check the land size they gave in March is how that check
// stops being made.

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, MapPin, Camera,
  User, ClipboardList, ArrowRight, ExternalLink,
} from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Field, Input, Textarea, Select, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, Dialog, StageChip, StatusChip, ErrorNote, dateTime, ago } from "@/components/sales/kit";
import { Explain } from "@/components/sales/Explain";

export default function SalesApprovalsPage() {
  const [kind, setKind] = useState("");
  const [conflictsOnly, setConflictsOnly] = useState(false);

  const queue = useAsync(
    () => salesApi.approvals({ kind: kind || undefined, conflicts: conflictsOnly ? "true" : undefined, limit: 50 }),
    [kind, conflictsOnly],
    // Somebody else may clear a row while this is open. Quiet, so the list does
    // not blank to a skeleton every half minute.
    { interval: 30000 },
  );

  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);

  const rows = queue.data?.data?.rows || [];
  const total = queue.data?.data?.total || 0;

  return (
    <SalesDashboardLayout activeMenu="approvals">
      <PageHead
        kicker="Sales"
        title="Approvals"
        sub="An employee submitting is a claim. Nothing moves until somebody here accepts it."
        actions={
          <>
            <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">
              <option value="">Everything</option>
              <option value="new_customer">New customers</option>
              <option value="follow_up">Follow-ups</option>
            </Select>
            <Button
              tone={conflictsOnly ? "primary" : "secondary"}
              size="sm"
              onClick={() => setConflictsOnly((v) => !v)}
              title="Submissions that arrived after the customer had already moved on"
            >
              <AlertTriangle size={14} /> Conflicts
            </Button>
          </>
        }
      />

      <Explain id="approvals" />

      {error ? <ErrorNote error={error} onRetry={() => setError(null)} /> : null}

      <Panel padded={false} label="Waiting for a decision">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <p className="text-sm text-ink-muted">
            {queue.loading && !rows.length
              ? "Loading…"
              : total === 0
                ? "Nothing waiting."
                : `${total} waiting · oldest first`}
          </p>
          {queue.data ? (
            <span className="text-xs text-ink-faint">updated {ago(Date.now())}</span>
          ) : null}
        </div>

        {queue.loading && !rows.length ? (
          <div className="p-4"><SkeletonRows rows={5} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing is waiting"
            body="When the field team submits a form that needs approval, it appears here — oldest first, because the person who has been waiting longest is the one to deal with next."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-hairline)]">
            {rows.map((row) => (
              <QueueRow key={row._id} row={row} onOpen={() => setOpen(row._id)} />
            ))}
          </ul>
        )}
      </Panel>

      <DecisionDialog
        submissionId={open}
        onClose={() => setOpen(null)}
        onDecided={() => {
          setOpen(null);
          queue.reload({ quiet: true });
        }}
        onError={setError}
      />
    </SalesDashboardLayout>
  );
}

/* ------------------------------------------------------------------ */

function QueueRow({ row, onOpen }) {
  const lead = row.lead;
  const isNew = row.kind === "new_customer";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--control)]"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, var(${isNew ? "--g-water" : "--g-brand"}) 12%, transparent)`,
            color: `var(${isNew ? "--g-water" : "--g-brand"})`,
          }}
        >
          {isNew ? <User size={17} /> : <ClipboardList size={17} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium tracking-[-0.01em] text-ink">
              {lead?.name || "Unknown customer"}
            </span>
            <StageChip tone={isNew ? "water" : "neutral"}>
              {isNew ? "new customer" : "follow-up"}
            </StageChip>
            {row.conflict?.detected ? (
              <StageChip tone="brick">
                <AlertTriangle size={11} /> arrived late
              </StageChip>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {row.templateName} <span className="text-ink-faint">v{row.templateVersion}</span>
            {row.stageKey ? ` · ${row.stageKey}` : ""}
            {lead?.address?.village ? ` · ${lead.address.village}` : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm text-ink">{row.submittedByName}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-faint">
            <Clock size={12} /> {ago(row.capturedAt)}
          </p>
        </div>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One submission, everything about it, and the two decisions.
 *
 * A rejection demands a reason and the button stays disabled without one — the
 * server refuses it anyway, and a disabled button explains that better than a
 * round trip and an error does.
 */
function DecisionDialog({ submissionId, onClose, onDecided, onError }) {
  const detail = useAsync(
    () => (submissionId ? salesApi.approval(submissionId) : Promise.resolve(null)),
    [submissionId],
  );

  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);

  const d = detail.data?.data;
  const submission = d?.submission;
  const lead = d?.lead;
  const values = submission?.values || {};
  const labels = submission?.labels || {};

  async function decide(kind) {
    setBusy(true);
    setSaid(null);
    try {
      const res = kind === "approve"
        ? await salesApi.approve(submissionId, note)
        : await salesApi.reject(submissionId, reason);

      // The server is authoritative, including when it tells us somebody else
      // got there first. That is information, not an error.
      if (res.data?.alreadyDecided) {
        setSaid(res.message || "This was already decided.");
        setTimeout(onDecided, 1200);
        return;
      }
      setNote("");
      setReason("");
      setMode(null);
      onDecided();
    } catch (err) {
      onError?.(err);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const where = d?.steps?.find((s) => s.key === submission?.stageKey);
  const nextStep = where ? d.steps.find((s) => s.order > where.order && !s.isTerminal) : null;

  return (
    <Dialog
      open={Boolean(submissionId)}
      onClose={onClose}
      wide
      title={lead ? lead.name : "Submission"}
      sub={
        submission
          ? `${submission.templateName} v${submission.templateVersion} · submitted by ${submission.submittedByName} · ${dateTime(submission.capturedAt)}`
          : ""
      }
      footer={
        said ? (
          <p className="text-sm text-ink-muted">{said}</p>
        ) : mode === "reject" ? (
          <>
            <Button tone="ghost" size="sm" onClick={() => setMode(null)} disabled={busy}>Back</Button>
            <Button tone="destructive" size="sm" onClick={() => decide("reject")} disabled={busy || !reason.trim()}>
              {busy ? "Rejecting…" : "Reject and send back"}
            </Button>
          </>
        ) : (
          <>
            <Button tone="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Button>
            <Button tone="destructive" size="sm" onClick={() => setMode("reject")} disabled={busy}>
              <XCircle size={15} /> Reject
            </Button>
            <Button tone="primary" size="sm" onClick={() => decide("approve")} disabled={busy}>
              <CheckCircle2 size={15} /> {busy ? "Approving…" : "Approve"}
            </Button>
          </>
        )
      }
    >
      {detail.loading || !submission ? (
        <SkeletonRows rows={6} />
      ) : mode === "reject" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            The customer stays exactly where they are. This record is kept, the task reopens for{" "}
            {submission.submittedByName}, and your reason is carried down to their handset.
          </p>
          <Field label="Reason" required hint="They have to know what to fix.">
            <Textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Where this sits ─────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StageChip tone={submission.kind === "new_customer" ? "water" : "brand"}>
              {submission.kind === "new_customer" ? "new customer" : "follow-up"}
            </StageChip>
            {d.scheme ? <StageChip tone="neutral">{d.scheme.name}</StageChip> : null}
            {where ? <StageChip tone={where.isTerminal ? "brand" : "water"}>{where.name}</StageChip> : null}
            {lead?.code ? <span className="text-ink-faint">{lead.code}</span> : null}
          </div>

          {submission.conflict?.detected ? (
            <div
              className="rounded-lg p-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--g-brick) 9%, transparent)",
                color: "var(--g-brick)",
              }}
            >
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle size={15} /> This arrived after the customer had moved on
              </p>
              <p className="mt-1 text-ink-muted">
                Captured for <b>{submission.conflict.expectedStageKey}</b>, but they were already on{" "}
                <b>{submission.conflict.actualStageKey}</b> by the time it reached us. Approving it
                keeps the record without moving them — it will not credit the step they are on now.
              </p>
            </div>
          ) : submission.kind === "new_customer" ? (
            <p className="text-sm text-ink-muted">
              Approving makes this a real customer in <b>{d.scheme?.name}</b>, standing on its first
              step and available for follow-up. Rejecting keeps the record and the phone number, so
              nobody registers them twice by accident.
            </p>
          ) : nextStep ? (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
              Approving moves them <b className="text-ink">{where?.name}</b>
              <ArrowRight size={14} />
              <b className="text-ink">{nextStep.name}</b>
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Approving completes their scheme.</p>
          )}

          {/* ── The answers ─────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">
              Answers
              <span className="ml-2 normal-case tracking-normal text-ink-faint">
                as asked by version {submission.templateVersion}
              </span>
            </h3>
            <dl className="divide-y divide-[var(--color-hairline)] rounded-lg" style={{ background: "var(--control)" }}>
              {Object.keys(labels).length === 0 ? (
                <p className="p-3 text-sm text-ink-faint">No answers recorded.</p>
              ) : (
                Object.entries(labels).map(([key, label]) => (
                  <div key={key} className="flex flex-wrap gap-x-4 gap-y-1 p-2.5">
                    {/* The FROZEN label, not today's — see SalesFormSubmission. */}
                    <dt className="w-52 shrink-0 text-sm text-ink-muted">{label}</dt>
                    <dd className="min-w-0 flex-1 text-sm text-ink">{renderValue(values[key])}</dd>
                  </div>
                ))
              )}
            </dl>
          </section>

          {/* ── What could not be typed in ──────────────────────── */}
          <section className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
            {submission.location?.lat ? (
              <a
                className="inline-flex items-center gap-1.5 hover:underline"
                href={`https://www.openstreetmap.org/?mlat=${submission.location.lat}&mlon=${submission.location.lng}#map=17/${submission.location.lat}/${submission.location.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={14} />
                {submission.location.lat.toFixed(5)}, {submission.location.lng.toFixed(5)}
                <ExternalLink size={12} />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-ink-faint"><MapPin size={14} /> no fix</span>
            )}
            {submission.location?.isMock ? (
              <StageChip tone="brick">reported as a mock location</StageChip>
            ) : null}
            {submission.otp?.verified ? (
              <StageChip tone="brand">phone verified by OTP</StageChip>
            ) : null}
            {submission.wasQueued ? (
              <StageChip tone="harvest">arrived from the offline queue</StageChip>
            ) : null}
          </section>

          {(submission.photos || []).length > 0 ? (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">
                <Camera size={13} /> Photographs
              </h3>
              <div className="flex flex-wrap gap-2">
                {submission.photos.map((p) => (
                  <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt="Field photograph"
                      className="h-28 w-28 rounded-lg object-cover"
                      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                    />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── What we already knew ────────────────────────────── */}
          {(d.history || []).length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">
                Earlier from this customer
              </h3>
              <ul className="space-y-1.5 text-sm">
                {d.history.slice(0, 6).map((h) => (
                  <li key={h._id} className="flex flex-wrap items-center gap-2 text-ink-muted">
                    <StatusChip status={h.approval?.status === "auto" ? "done" : h.approval?.status} />
                    <span className="text-ink">{h.templateName}</span>
                    <span className="text-ink-faint">v{h.templateVersion}</span>
                    <span className="text-ink-faint">· {dateTime(h.capturedAt)}</span>
                    <span className="text-ink-faint">· {h.submittedByName}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Field label="Note" hint="Optional. Kept on the record, never shown to the customer.">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth recording" />
          </Field>

          {lead?._id ? (
            <Link
              href={`/sales/dashboard/customers/${lead._id}`}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:underline"
            >
              Open {lead.name}&rsquo;s full record <ExternalLink size={13} />
            </Link>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

/** Answers arrive as whatever their field type stored. */
function renderValue(v) {
  if (v === null || v === undefined || v === "") return <span className="text-ink-faint">—</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    if (Number.isFinite(v.lat)) return `${v.lat}, ${v.lng}`;
    return JSON.stringify(v);
  }
  return String(v);
}
