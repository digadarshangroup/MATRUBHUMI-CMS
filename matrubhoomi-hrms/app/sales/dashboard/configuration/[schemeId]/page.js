"use client";

// app/sales/dashboard/configuration/[schemeId]/page.js
//
// The Scheme Builder: a workflow and the ordered steps a customer climbs.
//
// WHAT THE SCREEN IS TRYING TO MAKE OBVIOUS
// -----------------------------------------
// That a scheme is a LADDER, and that each rung asks its own questions. So the
// steps are drawn as a numbered column with the form named on every rung, and
// nothing else competes with that shape. A reader who has never seen the
// database should be able to say what happens to a customer, in order, from
// this one screen.
//
// WHAT IT REFUSES TO LET SOMEBODY DO BY ACCIDENT
// ----------------------------------------------
// A step's KEY is fixed once it exists — every customer's position, every task
// and every submission stores it, and renaming it would strand all three. The
// name is free. That is the same rule the pipeline screen already follows, and
// the input is shown disabled with the reason beside it rather than hidden, so
// the constraint is visible instead of mysterious.
//
// Archiving a step somebody is standing on, and reordering a ladder that people
// are mid-way up, both ask the server what is in the way BEFORE offering the
// action — see the note on the configuration page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, ChevronDown, ChevronUp, Plus, Archive, FileText,
  AlertTriangle, Flag, Camera, MapPin, ShieldCheck, Pencil,
} from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Field, Input, Select, Textarea, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, Dialog, StageChip, ErrorNote } from "@/components/sales/kit";
import { Explain } from "@/components/sales/Explain";
import { FormBuilderDialog } from "@/components/sales/FormBuilder";

const TONES = [
  { id: "neutral", label: "Neutral" },
  { id: "water", label: "Water (in progress)" },
  { id: "harvest", label: "Harvest (needs attention)" },
  { id: "brand", label: "Green (good)" },
  { id: "brick", label: "Brick (lost)" },
];

export default function SchemeBuilderPage() {
  const { schemeId } = useParams();
  const scheme = useAsync(() => salesApi.scheme(schemeId), [schemeId]);
  const templates = useAsync(() => salesApi.templates(), []);

  const [editingScheme, setEditingScheme] = useState(null);
  const [editingStep, setEditingStep] = useState(null);
  const [buildingForm, setBuildingForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const data = scheme.data?.data;
  const steps = data?.steps || [];
  const problems = data?.problems || [];
  const templateList = templates.data?.data || [];

  async function act(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      scheme.reload({ quiet: true });
      templates.reload({ quiet: true });
      setEditingScheme(null);
      setEditingStep(null);
      setConfirm(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Swap two rungs and send the WHOLE ladder back with explicit positions.
   *
   * Sending only the two that moved would leave the server guessing what the
   * rest mean, and a reorder that half-applies is a workflow nobody can read.
   */
  function move(index, delta) {
    const next = [...steps];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    act(() => salesApi.reorderSteps(schemeId, next.map((s, i) => ({ key: s.key, order: (i + 1) * 10 }))));
  }

  async function openArchiveStep(step) {
    setError(null);
    try {
      const refs = await salesApi.stepReferences(step._id);
      setConfirm({ step, refs: refs.data });
    } catch (err) {
      setError(err);
    }
  }

  if (scheme.loading && !data) {
    return (
      <SalesDashboardLayout activeMenu="configuration">
        <PageHead kicker="Configuration" title="Loading…" />
        <Panel><SkeletonRows rows={6} /></Panel>
      </SalesDashboardLayout>
    );
  }

  if (scheme.error) {
    return (
      <SalesDashboardLayout activeMenu="configuration">
        <PageHead kicker="Configuration" title="Scheme" />
        <ErrorNote error={scheme.error} onRetry={() => scheme.reload()} />
      </SalesDashboardLayout>
    );
  }

  return (
    <SalesDashboardLayout activeMenu="configuration">
      <PageHead
        kicker="Configuration"
        title={data?.name || "Scheme"}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <span>{data?.description || "No description."}</span>
            <StageChip tone="neutral" title="The handle every customer, task and submission stores">
              {data?.key}
            </StageChip>
            <StageChip tone="water">version {data?.version}</StageChip>
            {!data?.isActive ? <StageChip tone="harvest">closed to new customers</StageChip> : null}
          </span>
        }
        actions={
          <>
            <Link href="/sales/dashboard/configuration">
              <Button tone="ghost" size="sm"><ArrowLeft size={15} /> All schemes</Button>
            </Link>
            <Button
              tone="secondary"
              size="sm"
              onClick={() =>
                setEditingScheme({
                  name: data.name,
                  description: data.description || "",
                  isActive: data.isActive,
                })
              }
            >
              <Pencil size={14} /> Edit scheme
            </Button>
          </>
        }
      />

      <Explain id="scheme" />

      {error ? <ErrorNote error={error} onRetry={() => setError(null)} /> : null}

      {problems.length > 0 ? (
        <div
          className="mb-5 rounded-lg p-3.5"
          style={{
            background: "color-mix(in srgb, var(--g-brick) 9%, transparent)",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--g-brick) 22%, transparent)",
          }}
        >
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--g-brick)" }}>
            <AlertTriangle size={15} />
            This scheme cannot be used as it stands
          </p>
          <ul className="mt-1.5 ml-6 list-disc space-y-0.5 text-sm text-ink-muted">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      ) : null}

      {/* ── The ladder ──────────────────────────────────────────── */}

      <Panel padded={false} label="Steps">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Steps</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              In order. A customer climbs one rung per approval.
            </p>
          </div>
          <Button tone="primary" size="sm" onClick={() => setEditingStep({ isNew: true, name: "", requiresApproval: true })}>
            <Plus size={15} /> Add step
          </Button>
        </div>

        {steps.length === 0 ? (
          <EmptyState
            title="No steps yet"
            body="A scheme with no steps cannot be entered. Add the first thing that happens to a customer."
            action={
              <Button tone="primary" size="sm" onClick={() => setEditingStep({ isNew: true, name: "", requiresApproval: true })}>
                Add the first step
              </Button>
            }
          />
        ) : (
          <ol className="divide-y divide-[var(--color-hairline)]">
            {steps.map((step, i) => (
              <StepRow
                key={step._id}
                step={step}
                index={i}
                total={steps.length}
                busy={busy}
                onMove={(d) => move(i, d)}
                onEdit={() => setEditingStep({ ...step, isNew: false })}
                onArchive={() => openArchiveStep(step)}
                onForm={() => setBuildingForm({ step, templateId: step.template?.id || null })}
              />
            ))}
          </ol>
        )}
      </Panel>

      {/* ── Dialogs ─────────────────────────────────────────────── */}

      <Dialog
        open={Boolean(editingScheme)}
        onClose={() => setEditingScheme(null)}
        title="Edit scheme"
        sub="The key cannot change — every customer, task and submission stores it."
        footer={
          <>
            <Button tone="ghost" size="sm" onClick={() => setEditingScheme(null)}>Cancel</Button>
            <Button
              tone="primary"
              size="sm"
              disabled={busy || !editingScheme?.name?.trim()}
              onClick={() => act(() => salesApi.updateScheme(schemeId, editingScheme))}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input
              autoFocus
              value={editingScheme?.name || ""}
              onChange={(e) => setEditingScheme({ ...editingScheme, name: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={3}
              value={editingScheme?.description || ""}
              onChange={(e) => setEditingScheme({ ...editingScheme, description: e.target.value })}
            />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={editingScheme?.isActive !== false}
              onChange={(e) => setEditingScheme({ ...editingScheme, isActive: e.target.checked })}
            />
            <span>
              Open to new customers
              <span className="mt-0.5 block text-xs text-ink-faint">
                Turning this off stops NEW customers being registered into it. Everybody already
                inside keeps their steps — stopping them mid-workflow would leave them with no legal
                next move.
              </span>
            </span>
          </label>
        </div>
      </Dialog>

      <StepDialog
        step={editingStep}
        templates={templateList}
        busy={busy}
        onClose={() => setEditingStep(null)}
        onSave={(body) =>
          act(() =>
            editingStep.isNew
              ? salesApi.createStep(schemeId, body)
              : salesApi.updateStep(editingStep._id, body),
          )
        }
      />

      <ArchiveStepDialog
        confirm={confirm}
        busy={busy}
        onClose={() => setConfirm(null)}
        onArchive={(reason) => act(() => salesApi.archiveStep(confirm.step._id, reason))}
      />

      {/* One builder, again. The step it belongs to is attached afterwards. */}
      <FormBuilderDialog
        open={Boolean(buildingForm)}
        templateId={buildingForm?.templateId || null}
        purpose="scheme_step"
        startName={buildingForm ? `${data?.name} — ${buildingForm.step.name}` : ""}
        onClose={() => setBuildingForm(null)}
        onSaved={async (saved) => {
          // A NEW form has to be pointed at the step that asked for it; editing
          // an existing one changes nothing about the attachment.
          if (saved?._id && !buildingForm?.templateId) {
            await salesApi.updateStep(buildingForm.step._id, { templateId: saved._id }).catch(setError);
          }
          scheme.reload({ quiet: true });
          templates.reload({ quiet: true });
        }}
      />
    </SalesDashboardLayout>
  );
}

/* ------------------------------------------------------------------ */

function StepRow({ step, index, total, busy, onMove, onEdit, onArchive, onForm }) {
  return (
    <li className="flex flex-wrap items-start gap-3 p-4">
      <span
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
        style={{
          background: "color-mix(in srgb, var(--g-brand) 12%, transparent)",
          color: "var(--g-brand)",
        }}
      >
        {index + 1}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium tracking-[-0.01em] text-ink">{step.name}</span>
          <StageChip tone={step.tone || "neutral"}>{step.key}</StageChip>
          {step.isTerminal ? (
            <StageChip tone={step.terminalOutcome === "won" ? "brand" : "brick"}>
              <Flag size={11} /> ends the scheme · {step.terminalOutcome}
            </StageChip>
          ) : null}
          {!step.isActive ? <StageChip tone="harvest">inactive</StageChip> : null}
        </div>

        {step.description ? (
          <p className="mt-1 text-sm text-ink-muted">{step.description}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          {/* The form is the point of the step, so it is said first and named. */}
          {step.template ? (
            <button type="button" onClick={onForm} className="inline-flex items-center gap-1.5 text-ink hover:underline">
              <FileText size={13} />
              {step.template.name}
              <span className="text-ink-faint">v{step.template.version}</span>
              <span className="text-ink-faint">· {step.template.fieldCount} question{step.template.fieldCount === 1 ? "" : "s"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onForm}
              className="inline-flex items-center gap-1.5 font-medium"
              style={{ color: "var(--g-brick)" }}
            >
              <AlertTriangle size={13} /> No form — add one
            </button>
          )}

          {step.requiresApproval !== false ? (
            <span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> needs approval</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-ink-faint">applies on submit</span>
          )}
          {step.requiresPhoto ? <span className="inline-flex items-center gap-1"><Camera size={13} /> photo</span> : null}
          {step.requiresLocation ? <span className="inline-flex items-center gap-1"><MapPin size={13} /> location</span> : null}
          {step.requiresOtp ? <span className="inline-flex items-center gap-1">OTP</span> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button tone="ghost" size="sm" onClick={() => onMove(-1)} disabled={busy || index === 0} title="Move up">
          <ChevronUp size={15} />
        </Button>
        <Button tone="ghost" size="sm" onClick={() => onMove(1)} disabled={busy || index === total - 1} title="Move down">
          <ChevronDown size={15} />
        </Button>
        <Button tone="ghost" size="sm" onClick={onEdit} title="Edit step"><Pencil size={14} /></Button>
        <Button tone="ghost" size="sm" onClick={onArchive} title="Archive step"><Archive size={14} /></Button>
      </div>
    </li>
  );
}

function StepDialog({ step, templates, busy, onClose, onSave }) {
  const [draft, setDraft] = useState(null);

  // Seeded from the step the caller opened, in an effect rather than during
  // render — assigning state while rendering re-enters the component and is the
  // kind of thing that works until a step is opened twice in a row.
  useEffect(() => {
    setDraft(step ? { ...step } : null);
  }, [step]);

  const current = draft;
  const set = (patch) => setDraft((d) => ({ ...(d || {}), ...patch }));

  return (
    <Dialog
      open={Boolean(step)}
      onClose={() => { onClose(); }}
      title={step?.isNew ? "Add step" : "Edit step"}
      sub={
        step?.isNew
          ? "It is added to the end of the ladder. Reorder it afterwards."
          : "The key is fixed — customers, tasks and submissions all store it."
      }
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={() => { onClose(); }}>Cancel</Button>
          <Button
            tone="primary"
            size="sm"
            disabled={busy || !current?.name?.trim()}
            onClick={() => {
              onSave({
                name: current.name,
                description: current.description || "",
                tone: current.tone || "neutral",
                templateId: current.templateId || current.template?.id || null,
                requiresApproval: current.requiresApproval !== false,
                requiresPhoto: Boolean(current.requiresPhoto),
                requiresLocation: current.requiresLocation !== false,
                requiresOtp: Boolean(current.requiresOtp),
                isTerminal: Boolean(current.isTerminal),
                terminalOutcome: current.isTerminal ? current.terminalOutcome || "won" : null,
                isActive: current.isActive !== false,
              });
              setDraft(null);
            }}
          >
            {busy ? "Saving…" : step?.isNew ? "Add step" : "Save"}
          </Button>
        </>
      }
    >
      {current ? (
        <div className="space-y-4">
          <Field label="Name" required hint="What the field team sees. Free to change at any time.">
            <Input autoFocus value={current.name || ""} onChange={(e) => set({ name: e.target.value })} />
          </Field>

          {!current.isNew ? (
            <Field
              label="Key"
              hint="Fixed. Every customer's position, every task and every submission stores this."
            >
              <Input value={current.key || ""} disabled />
            </Field>
          ) : null}

          <Field label="Description">
            <Textarea rows={2} value={current.description || ""} onChange={(e) => set({ description: e.target.value })} />
          </Field>

          <Field label="Form" hint="What the employee is asked at this step. Build one from the step row.">
            <Select
              value={current.templateId || current.template?.id || ""}
              onChange={(e) => set({ templateId: e.target.value || null })}
            >
              <option value="">No form yet</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>{t.name} (v{t.version})</option>
              ))}
            </Select>
          </Field>

          <Field label="Colour" hint="A status colour on the board. Never the only signal.">
            <Select value={current.tone || "neutral"} onChange={(e) => set({ tone: e.target.value })}>
              {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>

          <fieldset className="space-y-2.5 rounded-lg p-3" style={{ background: "var(--control)" }}>
            <legend className="px-1 text-xs font-medium tracking-wide text-ink-muted uppercase">
              What this step demands
            </legend>

            <Toggle
              checked={current.requiresApproval !== false}
              onChange={(v) => set({ requiresApproval: v })}
              label="Needs approval"
              hint="On: the customer does not move until somebody accepts the submission. Off: submitting advances them immediately."
            />
            <Toggle checked={Boolean(current.requiresPhoto)} onChange={(v) => set({ requiresPhoto: v })} label="Photograph required" />
            <Toggle checked={current.requiresLocation !== false} onChange={(v) => set({ requiresLocation: v })} label="Location required" />
            <Toggle
              checked={Boolean(current.requiresOtp)}
              onChange={(v) => set({ requiresOtp: v })}
              label="Customer OTP required"
              hint="The one signal an employee cannot manufacture."
            />
          </fieldset>

          <fieldset className="space-y-2.5 rounded-lg p-3" style={{ background: "var(--control)" }}>
            <legend className="px-1 text-xs font-medium tracking-wide text-ink-muted uppercase">Ending</legend>
            <Toggle
              checked={Boolean(current.isTerminal)}
              onChange={(v) => set({ isTerminal: v })}
              label="This step ends the scheme"
              hint="Reaching it completes the customer's journey. There is nothing after it."
            />
            {current.isTerminal ? (
              <Field label="Outcome">
                <Select
                  value={current.terminalOutcome || "won"}
                  onChange={(e) => set({ terminalOutcome: e.target.value })}
                >
                  <option value="won">Won — they become a customer</option>
                  <option value="lost">Lost — not proceeding</option>
                </Select>
              </Field>
            ) : null}
          </fieldset>
        </div>
      ) : null}
    </Dialog>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-ink">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-ink-faint">{hint}</span> : null}
      </span>
    </label>
  );
}

function ArchiveStepDialog({ confirm, busy, onClose, onArchive }) {
  const [reason, setReason] = useState("");
  const refs = confirm?.refs;
  const blocked = refs && !refs.canArchive;

  return (
    <Dialog
      open={Boolean(confirm)}
      onClose={onClose}
      title={confirm ? `Archive “${confirm.step.name}”` : ""}
      sub="The step keeps its row so old submissions stay readable. It is only removed from the ladder."
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            tone="destructive"
            size="sm"
            onClick={() => onArchive(reason)}
            disabled={busy || blocked || !reason.trim()}
          >
            {busy ? "Archiving…" : "Archive"}
          </Button>
        </>
      }
    >
      {blocked ? (
        <p
          className="rounded-lg p-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--g-brick) 10%, transparent)",
            color: "var(--g-brick)",
          }}
        >
          {refs.standingOn} customer{refs.standingOn === 1 ? " is" : "s are"} standing on this step
          and {refs.openTasks} task{refs.openTasks === 1 ? " is" : "s are"} open for it. Move them on
          first — archiving it would strand them with no legal next move.
        </p>
      ) : (
        <div className="space-y-3">
          {refs?.submissions > 0 ? (
            <p className="text-sm text-ink-muted">
              {refs.submissions} submission{refs.submissions === 1 ? "" : "s"} were captured against
              it. They stay readable.
            </p>
          ) : null}
          <Field label="Reason" required hint="Kept on the audit trail.">
            <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
