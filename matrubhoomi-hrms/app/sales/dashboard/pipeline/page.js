"use client";

// app/sales/dashboard/pipeline/page.js
//
// The ladder a lead climbs, as rows the desk owns.
//
// WHAT CANNOT BE CHANGED HERE, AND WHY
// ------------------------------------
// A stage's KEY is fixed once created. Every lead, task and submission stores it
// as data, so renaming the key would strand all of them on a rung that no longer
// exists. The NAME is free to change and is what everybody sees — so a stage is
// renamed by editing the name, and the key stays as the machine's handle. The
// input is shown, disabled, with the reason next to it rather than hidden.

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Field, Input, Select, Textarea, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, Dialog, StageChip, ErrorNote } from "@/components/sales/kit";

const TONES = [
  { id: "neutral", label: "Neutral" },
  { id: "water", label: "Water (in progress)" },
  { id: "harvest", label: "Harvest (needs attention)" },
  { id: "brand", label: "Green (good)" },
  { id: "brick", label: "Brick (lost)" },
];

function keyFrom(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
}

export default function SalesPipelinePage() {
  const stages = useAsync(() => salesApi.stages(), []);
  const templates = useAsync(() => salesApi.templates(), []);

  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = stages.data?.data || [];
  const templateList = templates.data?.data || [];

  async function act(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      stages.reload({ quiet: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function move(index, delta) {
    const next = [...rows];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    act(() => salesApi.reorderStages(next.map((s) => s._id)));
  }

  async function save() {
    const body = {
      name: editing.name,
      description: editing.description,
      tone: editing.tone,
      templateId: editing.templateId || null,
      requiresOtp: editing.requiresOtp,
      requiresPhoto: editing.requiresPhoto,
      requiresLocation: editing.requiresLocation,
      isTerminal: editing.isTerminal,
      terminalOutcome: editing.terminalOutcome,
    };

    await act(async () => {
      if (editing._id) await salesApi.updateStage(editing._id, body);
      else await salesApi.createStage({ ...body, key: keyFrom(editing.name), order: (rows.length + 1) * 10 });
      setEditing(null);
    });
  }

  return (
    <SalesDashboardLayout activeMenu="pipeline">
      <div className="mx-auto max-w-[1100px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Sales · setup"
          title="Pipeline stages"
          sub="The rungs a lead climbs, and what has to be captured to leave each one."
          actions={
            <Button
              tone="primary"
              size="sm"
              onClick={() =>
                setEditing({
                  name: "", description: "", tone: "neutral", templateId: "",
                  requiresOtp: false, requiresPhoto: false, requiresLocation: true,
                  isTerminal: false, terminalOutcome: "won",
                })
              }
            >
              <Plus size={15} /> Add a stage
            </Button>
          }
        />

        {error && <div className="mb-4"><ErrorNote error={error} /></div>}

        <Panel padded={false} label="Stages">
          {stages.loading ? (
            <div className="p-5"><SkeletonRows rows={6} /></div>
          ) : rows.length === 0 ? (
            <div className="p-5"><EmptyState title="No stages" body="Add the first rung of the ladder." /></div>
          ) : (
            <div className="divide-y divide-[var(--g-line)]">
              {rows.map((s, i) => (
                <div key={s._id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5">
                  <span
                    data-figure
                    className="w-6 shrink-0 text-center text-xs tabular-nums text-[var(--g-ink-faint)]"
                    aria-hidden
                  >
                    {i + 1}
                  </span>

                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StageChip tone={s.tone}>{s.name}</StageChip>
                      {s.isTerminal && (
                        <span className="text-[11px] text-[var(--g-ink-3)]">
                          end of the ladder · {s.terminalOutcome}
                        </span>
                      )}
                      {s.isActive === false && <span className="text-[11px] text-[var(--g-ink-3)]">hidden</span>}
                    </div>
                    <p className="mt-1 text-xs text-[var(--g-ink-3)]">
                      <span className="tabular-nums">{s.key}</span>
                      {s.description ? ` · ${s.description}` : ""}
                    </p>
                  </div>

                  <div className="flex min-w-[150px] flex-wrap gap-1.5 text-[11px] text-[var(--g-ink-3)]">
                    {s.requiresOtp && <StageChip tone="brand">OTP</StageChip>}
                    {s.requiresPhoto && <StageChip tone="water">photo</StageChip>}
                    {s.requiresLocation && <StageChip tone="neutral">location</StageChip>}
                  </div>

                  <div className="w-40 truncate text-xs text-[var(--g-ink-3)]">
                    {templateList.find((t) => t._id === s.templateId)?.name || "no form"}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || busy}
                      aria-label={`Move ${s.name} up`}
                      className="rounded-full p-1.5 text-[var(--g-ink-3)] hover:bg-[var(--g-surface-2)] disabled:opacity-30"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === rows.length - 1 || busy}
                      aria-label={`Move ${s.name} down`}
                      className="rounded-full p-1.5 text-[var(--g-ink-3)] hover:bg-[var(--g-surface-2)] disabled:opacity-30"
                    >
                      <ChevronDown size={15} />
                    </button>
                    <Button size="sm" tone="ghost" onClick={() => setEditing({ ...s, templateId: s.templateId || "" })}>
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Dialog
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          title={editing?._id ? `Edit ${editing.name}` : "Add a stage"}
          sub={editing?._id ? `Stored as ${editing.key}` : "The key is derived from the name and then fixed."}
          footer={
            <>
              <Button tone="ghost" size="sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
              <Button tone="primary" size="sm" onClick={save} disabled={busy || !editing?.name?.trim()}>
                {busy ? "Saving…" : "Save stage"}
              </Button>
            </>
          }
        >
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Name" required>
                  <Input value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} />
                </Field>
                <Field
                  label="Stored as"
                  hint={editing._id ? "Fixed — leads and submissions store this." : "Derived from the name."}
                >
                  <Input value={editing._id ? editing.key : keyFrom(editing.name)} disabled readOnly />
                </Field>
              </div>

              <Field label="What this rung means">
                <Textarea
                  rows={2}
                  value={editing.description || ""}
                  onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Colour" hint="Always shown with the stage's name, never alone.">
                  <Select value={editing.tone} onChange={(e) => setEditing((s) => ({ ...s, tone: e.target.value }))}>
                    {TONES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Form to complete it">
                  <Select
                    value={editing.templateId || ""}
                    onChange={(e) => setEditing((s) => ({ ...s, templateId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {templateList.map((t) => (
                      <option key={t._id} value={t._id}>{t.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="space-y-2 rounded-[10px] bg-[var(--g-surface-2)] px-4 py-3">
                <p className="text-[11px] font-medium tracking-[0.06em] text-[var(--g-ink-3)] uppercase">
                  Required to leave this stage
                </p>
                {[
                  ["requiresLocation", "A location fix"],
                  ["requiresPhoto", "A photograph"],
                  ["requiresOtp", "The customer's phone verified by OTP"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-[var(--g-ink-2)]">
                    <input
                      type="checkbox"
                      className="accent-[var(--g-brand)]"
                      checked={Boolean(editing[key])}
                      onChange={(e) => setEditing((s) => ({ ...s, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
                <p className="pt-1 text-xs text-[var(--g-ink-3)]">
                  Enforced by the server on every submission, not just asked for by the app.
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-[var(--g-ink-2)]">
                  <input
                    type="checkbox"
                    className="accent-[var(--g-brand)]"
                    checked={Boolean(editing.isTerminal)}
                    onChange={(e) => setEditing((s) => ({ ...s, isTerminal: e.target.checked }))}
                  />
                  This is the end of the ladder
                </label>
                {editing.isTerminal && (
                  <Field label="Which ending" hint="A won stage marks the lead a paying customer.">
                    <Select
                      value={editing.terminalOutcome || "won"}
                      onChange={(e) => setEditing((s) => ({ ...s, terminalOutcome: e.target.value }))}
                    >
                      <option value="won">Won — becomes a customer</option>
                      <option value="lost">Lost</option>
                    </Select>
                  </Field>
                )}
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </SalesDashboardLayout>
  );
}
