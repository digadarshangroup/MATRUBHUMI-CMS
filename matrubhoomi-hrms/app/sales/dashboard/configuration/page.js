"use client";

// app/sales/dashboard/configuration/page.js
//
// The two things the desk configures, on one page, in the shape they actually
// relate to each other.
//
// WHY BOTH HALVES ARE HERE AND NOT ON TWO SCREENS
// -----------------------------------------------
// Registration and the schemes are one system: the form at the top is what
// every new customer is asked, and the scheme they are put into is what happens
// to them afterwards. Split across two menu items, the relationship between
// them has to be held in somebody's head — and the first question anybody asks
// ("what happens after we register someone?") has no screen that answers it.
//
// So the page is a hierarchy, deliberately, and it reads top to bottom:
//
//   New customer  →  one form, asked of everybody
//   Schemes       →  Scheme → its steps → each step's form
//
// The steps themselves are edited one scheme at a time, in the builder behind
// each row. Putting every step of every scheme on this page would make the
// shape of the system invisible again for a company with six schemes.

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList, Layers, Plus, Archive, RotateCcw, AlertTriangle } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Field, Input, Textarea, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, Dialog, StageChip, ErrorNote } from "@/components/sales/kit";
import { Explain } from "@/components/sales/Explain";
import { FormBuilderDialog } from "@/components/sales/FormBuilder";

export default function SalesConfigurationPage() {
  const schemes = useAsync(() => salesApi.schemes({ archived: "true" }), []);
  const newCustomer = useAsync(() => salesApi.newCustomerForm(), []);

  const [creating, setCreating] = useState(null);
  const [editingForm, setEditingForm] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = schemes.data?.data || [];
  const live = rows.filter((s) => !s.isArchived);
  const archived = rows.filter((s) => s.isArchived);
  const form = newCustomer.data?.data || null;

  async function act(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      schemes.reload({ quiet: true });
      newCustomer.reload({ quiet: true });
      setCreating(null);
      setConfirm(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ask what is in the way BEFORE offering the action, so the dialog can say
   * "12 customers are in this scheme" rather than letting the server refuse
   * after somebody has already decided to click.
   */
  async function openArchive(scheme) {
    setError(null);
    try {
      const refs = await salesApi.schemeReferences(scheme._id);
      setConfirm({ scheme, refs: refs.data });
    } catch (err) {
      setError(err);
    }
  }

  return (
    <SalesDashboardLayout activeMenu="configuration">
      <PageHead
        kicker="Sales"
        title="Configuration"
        sub="What the field team is asked, and what happens to a customer afterwards."
      />

      <Explain id="configuration" />

      {error ? <ErrorNote error={error} onRetry={() => setError(null)} /> : null}

      {/* ── A. New customer ─────────────────────────────────────── */}

      <Panel padded={false} label="New customer" className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline p-4">
          <div className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "color-mix(in srgb, var(--g-water) 12%, transparent)", color: "var(--g-water)" }}
            >
              <ClipboardList size={17} />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">New customer</h2>
              <p className="mt-0.5 max-w-xl text-sm text-ink-muted">
                One form, asked of everybody the field team registers — whichever scheme they turn
                out to belong to. The scheme itself is chosen by the employee during registration,
                so it is not a question you configure here.
              </p>
            </div>
          </div>
          <Button tone="primary" size="sm" onClick={() => setEditingForm(true)} disabled={newCustomer.loading}>
            {form ? "Edit form" : "Create form"}
          </Button>
        </div>

        <div className="p-4">
          {newCustomer.loading ? (
            <SkeletonRows rows={2} />
          ) : form ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="font-medium text-ink">{form.name}</span>
              <StageChip tone="water">version {form.version}</StageChip>
              <span className="text-ink-muted">
                {(form.fields || []).length} question{(form.fields || []).length === 1 ? "" : "s"}
              </span>
              {form.submissionCount > 0 ? (
                <span className="text-ink-muted">
                  {form.submissionCount} registration{form.submissionCount === 1 ? "" : "s"} recorded
                </span>
              ) : null}
            </div>
          ) : (
            <EmptyState
              compact
              title="No registration form yet"
              body="The field team cannot register anybody until there is one."
              action={
                <Button tone="primary" size="sm" onClick={() => setEditingForm(true)}>
                  Create form
                </Button>
              }
            />
          )}
        </div>
      </Panel>

      {/* ── B. Schemes ──────────────────────────────────────────── */}

      <Panel padded={false} label="Schemes">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline p-4">
          <div className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "color-mix(in srgb, var(--g-brand) 12%, transparent)", color: "var(--g-brand)" }}
            >
              <Layers size={17} />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Schemes</h2>
              <p className="mt-0.5 max-w-xl text-sm text-ink-muted">
                A scheme is a workflow a customer is put through. Each has its own ordered steps,
                and each step has its own form. Open one to build it.
              </p>
            </div>
          </div>
          <Button tone="primary" size="sm" onClick={() => setCreating({ name: "", description: "" })}>
            <Plus size={15} /> New scheme
          </Button>
        </div>

        {schemes.loading ? (
          <div className="p-4">
            <SkeletonRows rows={4} />
          </div>
        ) : live.length === 0 ? (
          <EmptyState
            title="No schemes yet"
            body="Create one, then add the steps a customer moves through."
            action={
              <Button tone="primary" size="sm" onClick={() => setCreating({ name: "", description: "" })}>
                New scheme
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--color-hairline)]">
            {live.map((s) => (
              <SchemeRow key={s._id} scheme={s} onArchive={() => openArchive(s)} />
            ))}
          </ul>
        )}

        {archived.length > 0 ? (
          <div className="border-t border-hairline p-4">
            <p className="mb-2 text-[11px] font-medium tracking-[0.09em] text-ink-muted uppercase">
              Archived
            </p>
            <ul className="space-y-2">
              {archived.map((s) => (
                <li key={s._id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-muted">
                    {s.name}
                    {s.customers > 0 ? ` · ${s.customers} customer${s.customers === 1 ? "" : "s"} on record` : ""}
                  </span>
                  <Button tone="ghost" size="sm" onClick={() => act(() => salesApi.restoreScheme(s._id))} disabled={busy}>
                    <RotateCcw size={14} /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      {/* ── Dialogs ─────────────────────────────────────────────── */}

      <Dialog
        open={Boolean(creating)}
        onClose={() => setCreating(null)}
        title="New scheme"
        sub="You can rename it later. Its key is fixed once customers are in it."
        footer={
          <>
            <Button tone="ghost" size="sm" onClick={() => setCreating(null)}>Cancel</Button>
            <Button
              tone="primary"
              size="sm"
              onClick={() => act(() => salesApi.createScheme(creating))}
              disabled={busy || !creating?.name?.trim()}
            >
              {busy ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input
              autoFocus
              value={creating?.name || ""}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })}
              placeholder="e.g. Kharif advance"
            />
          </Field>
          <Field label="Description" hint="What this workflow is for. Shown to the field team.">
            <Textarea
              rows={3}
              value={creating?.description || ""}
              onChange={(e) => setCreating({ ...creating, description: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>

      <ArchiveDialog
        confirm={confirm}
        busy={busy}
        onClose={() => setConfirm(null)}
        onArchive={(reason) => act(() => salesApi.archiveScheme(confirm.scheme._id, reason))}
        onDelete={() => act(() => salesApi.deleteScheme(confirm.scheme._id))}
      />

      {/* The SAME builder every other form on this system uses. There is one
          form engine; `purpose` decides only where the template hangs. */}
      <FormBuilderDialog
        open={editingForm}
        templateId={form?._id || null}
        purpose="new_customer"
        startName="New customer registration"
        onClose={() => setEditingForm(false)}
        onSaved={() => newCustomer.reload({ quiet: true })}
      />
    </SalesDashboardLayout>
  );
}

/* ------------------------------------------------------------------ */

function SchemeRow({ scheme, onArchive }) {
  const href = `/sales/dashboard/configuration/${scheme._id}`;

  return (
    <li className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-[var(--control)]">
      <Link href={href} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium tracking-[-0.01em] text-ink">{scheme.name}</span>
          {!scheme.isActive ? <StageChip tone="harvest">closed to new customers</StageChip> : null}
          {scheme.isLegacy ? (
            <StageChip tone="neutral" title="The pipeline this system started with">original</StageChip>
          ) : null}
          {scheme.stepCount === 0 ? (
            <StageChip tone="brick">
              <AlertTriangle size={11} /> no steps yet
            </StageChip>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {scheme.stepCount} step{scheme.stepCount === 1 ? "" : "s"}
          {" · "}
          {scheme.liveCustomers} in progress
          {scheme.customers !== scheme.liveCustomers ? ` of ${scheme.customers} total` : ""}
          {scheme.openTasks > 0 ? ` · ${scheme.openTasks} open task${scheme.openTasks === 1 ? "" : "s"}` : ""}
        </p>
      </Link>

      <Button tone="ghost" size="sm" onClick={onArchive} title={`Archive ${scheme.name}`}>
        <Archive size={14} />
      </Button>
      <Link href={href} aria-label={`Open ${scheme.name}`} className="text-ink-faint">
        <ChevronRight size={18} />
      </Link>
    </li>
  );
}

/**
 * Archive, or delete when nothing has ever referenced it.
 *
 * The distinction is the whole dialog. A scheme with history keeps its row
 * forever so old submissions stay readable; one created by mistake and never
 * used is just clutter and can go.
 */
function ArchiveDialog({ confirm, busy, onClose, onArchive, onDelete }) {
  const [reason, setReason] = useState("");
  const refs = confirm?.refs;
  const blocked = refs && !refs.canArchive;

  return (
    <Dialog
      open={Boolean(confirm)}
      onClose={onClose}
      title={confirm ? `Archive “${confirm.scheme.name}”` : ""}
      sub={
        refs?.canDelete
          ? "Nothing has ever used this scheme, so it can be removed outright."
          : "Archiving hides it from the desk. Everybody already in it keeps their history."
      }
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose}>Cancel</Button>
          {refs?.canDelete ? (
            <Button tone="destructive" size="sm" onClick={onDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          ) : (
            <Button
              tone="destructive"
              size="sm"
              onClick={() => onArchive(reason)}
              disabled={busy || blocked || !reason.trim()}
            >
              {busy ? "Archiving…" : "Archive"}
            </Button>
          )}
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
          {refs.liveLeads} customer{refs.liveLeads === 1 ? "" : "s"} still moving through this scheme
          and {refs.openTasks} task{refs.openTasks === 1 ? " is" : "s are"} still open. Finish or move
          them first.
        </p>
      ) : refs?.canDelete ? (
        <p className="text-sm text-ink-muted">
          No customers, tasks or submissions reference it.
        </p>
      ) : (
        <Field label="Reason" required hint="Kept on the audit trail.">
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being archived?"
          />
        </Field>
      )}
    </Dialog>
  );
}
