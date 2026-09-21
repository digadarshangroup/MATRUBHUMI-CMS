"use client";

// app/sales/dashboard/customers/[id]/page.js
//
// One customer, and the whole of their relationship with the company.
//
// WHAT THE DESK ACTUALLY ASKS ON THIS SCREEN
// ------------------------------------------
// "Where are they, how did they get there, and what is waiting" — in that
// order. So the page is: identity and position at the top, the ladder with a
// tick per accepted step, then the record of everything that happened to them,
// newest first. Nothing on it is reconstructed from current state; the ladder's
// ticks come from accepted submissions and the history comes from SalesEvent
// rows, which is the only version of "history" that is still true after an
// override or a scheme change.
//
// THE TWO DANGEROUS BUTTONS
// -------------------------
// Change scheme and Change step are here because this is where somebody sees
// the mistake. Both are approver-only on the server, both demand a reason, and
// both go through the audited action rather than an edit — the dialogs say so,
// and neither one pretends to have succeeded before the server answers.

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Check, Circle, AlertTriangle, Phone, MapPin, ArrowRightLeft, Move,
  ClipboardList, FileText,
} from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Field, Select, Textarea, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, Dialog, StageChip, StatusChip, ErrorNote, dateTime, shortDate } from "@/components/sales/kit";
import { Explain } from "@/components/sales/Explain";

const EVENT_LABEL = {
  customer_created: "Registered",
  customer_approved: "Registration approved",
  customer_rejected: "Registration rejected",
  scheme_assigned: "Scheme assigned",
  scheme_changed: "Moved to another scheme",
  step_advanced: "Moved up a step",
  step_overridden: "Step changed by hand",
  customer_completed: "Scheme completed",
  task_assigned: "Follow-up assigned",
  task_reassigned: "Follow-up reassigned",
  task_cancelled: "Task cancelled",
  task_reopened: "Sent back for rework",
  submission_made: "Visit submitted",
  submission_approved: "Visit approved",
  submission_rejected: "Visit rejected",
  submission_conflicted: "Late visit flagged",
};

const EVENT_TONE = {
  submission_approved: "brand", customer_approved: "brand", customer_completed: "brand", step_advanced: "brand",
  submission_rejected: "brick", customer_rejected: "brick", task_cancelled: "brick", submission_conflicted: "brick",
  scheme_changed: "harvest", step_overridden: "harvest", task_reopened: "harvest",
};

export default function CustomerWorkflowPage() {
  const { id } = useParams();
  const workflow = useAsync(() => salesApi.customerWorkflow(id), [id]);
  const history = useAsync(() => salesApi.customerHistory(id, { limit: 200 }), [id]);
  const schemes = useAsync(() => salesApi.schemes(), []);

  const [dialog, setDialog] = useState(null); // "scheme" | "step"
  const [error, setError] = useState(null);

  const w = workflow.data?.data;
  const lead = w?.lead;
  const h = history.data?.data;

  function reload() {
    workflow.reload({ quiet: true });
    history.reload({ quiet: true });
  }

  if (workflow.loading && !w) {
    return (
      <SalesDashboardLayout activeMenu="customers">
        <PageHead kicker="Customer" title="Loading…" />
        <Panel><SkeletonRows rows={6} /></Panel>
      </SalesDashboardLayout>
    );
  }
  if (workflow.error) {
    return (
      <SalesDashboardLayout activeMenu="customers">
        <PageHead kicker="Customer" title="Customer" />
        <ErrorNote error={workflow.error} onRetry={() => workflow.reload()} />
      </SalesDashboardLayout>
    );
  }

  const done = (w.steps || []).filter((s) => s.state === "done").length;

  return (
    <SalesDashboardLayout activeMenu="customers">
      <PageHead
        kicker="Customer"
        title={lead?.name || "Customer"}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-ink-faint">{lead?.code}</span>
            {lead?.phone ? <span className="inline-flex items-center gap-1"><Phone size={13} /> {lead.phone}</span> : null}
            {lead?.address?.village ? <span className="inline-flex items-center gap-1"><MapPin size={13} /> {lead.address.village}</span> : null}
            <StatusChip status={lead?.status} />
          </span>
        }
        actions={
          <>
            <Link href="/sales/dashboard/customers">
              <Button tone="ghost" size="sm"><ArrowLeft size={15} /> Customers</Button>
            </Link>
            <Button tone="secondary" size="sm" onClick={() => setDialog("scheme")}>
              <ArrowRightLeft size={14} /> Change scheme
            </Button>
            <Button tone="secondary" size="sm" onClick={() => setDialog("step")} disabled={!w.scheme}>
              <Move size={14} /> Change step
            </Button>
          </>
        }
      />

      <Explain id="workflow" />

      {error ? <ErrorNote error={error} onRetry={() => setError(null)} /> : null}

      {/* ── Where they stand ────────────────────────────────────── */}

      <Panel label="Progress" className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">Scheme</p>
            <p className="mt-0.5 text-[17px] font-medium text-ink">{w.scheme?.name || "Not in a scheme"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">Current step</p>
            <p className="mt-0.5 text-[17px] font-medium text-ink">{w.step?.name || lead?.stageKey || "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium tracking-[0.09em] text-ink-muted uppercase">Done</p>
            <p className="mt-0.5 text-[17px] font-medium text-ink">{done} of {(w.steps || []).length}</p>
          </div>
        </div>

        {!w.eligible && w.reason ? (
          <p
            className="mt-4 flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{ background: "color-mix(in srgb, var(--g-harvest) 12%, transparent)", color: "var(--g-harvest)" }}
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>Cannot be followed up right now: {w.reason}</span>
          </p>
        ) : null}

        {(w.steps || []).length > 0 ? (
          <ol className="mt-5 flex flex-wrap gap-x-2 gap-y-3">
            {w.steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{
                    background: s.state === "done" ? "var(--g-brand)" : s.state === "current" ? "var(--surface-raised)" : "var(--control)",
                    boxShadow: s.state === "current" ? "inset 0 0 0 2px var(--g-brand)" : "inset 0 0 0 1px var(--color-hairline)",
                    color: s.state === "done" ? "var(--g-brand-ink)" : "var(--color-ink-faint)",
                  }}
                >
                  {s.state === "done" ? <Check size={14} strokeWidth={3} /> : s.state === "current" ? <span className="h-2 w-2 rounded-full" style={{ background: "var(--g-brand)" }} /> : <Circle size={6} fill="currentColor" />}
                </span>
                <span className={`text-sm ${s.state === "upcoming" ? "text-ink-muted" : "text-ink"}`}>
                  {s.name}
                  <span className="ml-1 text-xs text-ink-faint">
                    {s.state === "done" ? "done" : s.state === "current" ? "current" : ""}
                  </span>
                </span>
                {i < w.steps.length - 1 ? <span className="mx-1 h-px w-5" style={{ background: "var(--color-hairline)" }} /> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ── Visits, per step ────────────────────────────────── */}

        <Panel padded={false} label="Visits">
          <div className="border-b border-hairline p-4">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Visits</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Every form ever filled for this customer, with the version it was answered against.
            </p>
          </div>
          {history.loading && !h ? (
            <div className="p-4"><SkeletonRows rows={4} /></div>
          ) : (h?.submissions || []).length === 0 ? (
            <EmptyState compact title="No visits yet" body="Submissions from the field appear here." />
          ) : (
            <ul className="divide-y divide-[var(--color-hairline)]">
              {h.submissions.map((s) => (
                <li key={s._id} className="flex flex-wrap items-start gap-3 p-4">
                  <FileText size={16} className="mt-0.5 shrink-0 text-ink-faint" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{s.templateName}</span>
                      <span className="text-xs text-ink-faint">v{s.templateVersion}</span>
                      <StageChip tone="neutral">{s.stageKey}</StageChip>
                      <StatusChip status={s.approval?.status === "auto" ? "done" : s.approval?.status || "pending"}>
                        {s.approval?.status === "auto" ? "applied" : s.approval?.status || "pending"}
                      </StatusChip>
                      {s.conflict?.detected ? <StageChip tone="brick"><AlertTriangle size={11} /> arrived late</StageChip> : null}
                      {(s.photos || []).length ? <span className="text-xs text-ink-faint">{s.photos.length} photo{s.photos.length === 1 ? "" : "s"}</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {dateTime(s.capturedAt)} · {s.submittedByName}
                      {s.approval?.decidedByName ? ` · ${s.approval.status} by ${s.approval.decidedByName} ${shortDate(s.approval.decidedAt)}` : ""}
                    </p>
                    {s.approval?.status === "rejected" && s.approval?.note ? (
                      <p className="mt-1.5 rounded-md p-2 text-xs" style={{ background: "color-mix(in srgb, var(--g-brick) 9%, transparent)", color: "var(--g-brick)" }}>
                        {s.approval.note}
                      </p>
                    ) : null}
                  </div>
                  {s.approval?.status === "pending" ? (
                    <Link href="/sales/dashboard/approvals" className="text-xs text-ink-muted hover:underline">Open queue</Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── History and tasks ───────────────────────────────── */}

        <div className="space-y-6">
          <Panel padded={false} label="Tasks">
            <div className="border-b border-hairline p-4">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Tasks</h2>
            </div>
            {(h?.tasks || []).length === 0 ? (
              <EmptyState compact title="No tasks" body="Nothing has been assigned for this customer." />
            ) : (
              <ul className="divide-y divide-[var(--color-hairline)]">
                {h.tasks.map((t) => (
                  <li key={t._id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                    <ClipboardList size={14} className="text-ink-faint" />
                    <span className="font-medium text-ink">{t.code}</span>
                    <span className="text-ink-muted">{t.stageName || t.stageKey}</span>
                    <span className="text-ink-faint">· {t.assignedToName}</span>
                    <span className="ml-auto"><StatusChip status={t.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel padded={false} label="History">
            <div className="border-b border-hairline p-4">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">History</h2>
              <p className="mt-0.5 text-sm text-ink-muted">Every recorded action, newest first. Never trimmed.</p>
            </div>
            {(h?.events || []).length === 0 ? (
              <EmptyState compact title="Nothing recorded" />
            ) : (
              <ol className="divide-y divide-[var(--color-hairline)]">
                {h.events.map((e) => (
                  <li key={e._id} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StageChip tone={EVENT_TONE[e.kind] || "neutral"}>{EVENT_LABEL[e.kind] || e.kind.replace(/_/g, " ")}</StageChip>
                      <span className="text-xs text-ink-faint">{dateTime(e.at)}</span>
                      {e.actorName ? <span className="text-xs text-ink-faint">· {e.actorName}</span> : null}
                    </div>
                    {e.message ? <p className="mt-1 text-sm text-ink">{e.message}</p> : null}
                    {e.reason ? <p className="mt-0.5 text-xs text-ink-muted">Reason: {e.reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <CorrectionDialog
        kind={dialog}
        lead={lead}
        schemes={(schemes.data?.data || []).filter((s) => s.isActive && !s.isArchived && s.key !== lead?.pipelineKey)}
        steps={(w.steps || []).filter((s) => s.key !== lead?.stageKey)}
        onClose={() => setDialog(null)}
        onDone={() => { setDialog(null); reload(); }}
        onError={setError}
      />
    </SalesDashboardLayout>
  );
}

/* ------------------------------------------------------------------ */

/** Change scheme / change step. Approver-only, reason required, audited. */
function CorrectionDialog({ kind, lead, schemes, steps, onClose, onDone, onError }) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const isScheme = kind === "scheme";

  async function go() {
    setBusy(true);
    try {
      if (isScheme) await salesApi.changeCustomerScheme(lead._id, target, reason);
      else await salesApi.overrideCustomerStep(lead._id, target, reason);
      setTarget(""); setReason("");
      onDone();
    } catch (err) {
      onError?.(err);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={Boolean(kind)}
      onClose={onClose}
      title={isScheme ? "Move to another scheme" : "Change current step"}
      sub={
        isScheme
          ? "Their history under the current scheme is kept and closed. Open tasks for it are cancelled. They start the new scheme at its first step."
          : "Moves them by hand. No submission is rewritten; the change and your reason go on the record."
      }
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button tone="destructive" size="sm" onClick={go} disabled={busy || !target || !reason.trim()}>
            {busy ? "Applying…" : isScheme ? "Move scheme" : "Change step"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={isScheme ? "New scheme" : "New step"} required>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {(isScheme ? schemes : steps).map((o) => (
              <option key={o.key} value={o.key}>{o.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" required hint="Kept on the customer's record. The server refuses without one.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
