"use client";

// app/sales/dashboard/forms/page.js
//
// The forms the field app renders.
//
// Nothing here is a code change: the desk composes a form, the Android app draws
// whatever it is handed, and a new question is live on the next sync. That is
// the whole reason the field list is data — see SalesFormTemplate's header.

import { useState } from "react";
import { Copy, FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import { Panel, PageHead, Button, SkeletonRows, EmptyState } from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, StageChip, ErrorNote, shortDate } from "@/components/sales/kit";
import { FormBuilderDialog } from "@/components/sales/FormBuilder";

export default function SalesFormsPage() {
  const templates = useAsync(() => salesApi.templates({ includeInactive: "true" }), []);
  const stages = useAsync(() => salesApi.stages(), []);

  const [editing, setEditing] = useState(null); // { id } | { id: null } for new
  const [error, setError] = useState(null);

  const rows = templates.data?.data || [];
  const stageList = stages.data?.data || [];
  const stageByKey = new Map(stageList.map((s) => [s.key, s]));

  async function act(fn) {
    setError(null);
    try {
      await fn();
      templates.reload({ quiet: true });
    } catch (err) {
      setError(err);
    }
  }

  return (
    <SalesDashboardLayout activeMenu="forms">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Sales · setup"
          title="Form templates"
          sub="What the field team is asked at each stage. Changes reach the app on its next sync."
          actions={
            <Button tone="primary" size="sm" onClick={() => setEditing({ id: null })}>
              <Plus size={15} /> New form
            </Button>
          }
        />

        {error && <div className="mb-4"><ErrorNote error={error} /></div>}

        <Panel padded={false} label="Templates">
          {templates.error ? (
            <div className="p-5"><ErrorNote error={templates.error} onRetry={templates.reload} /></div>
          ) : templates.loading ? (
            <div className="p-5"><SkeletonRows rows={5} /></div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No forms yet"
                body="Build one and attach it to a stage. Until a stage has a form, nothing can be recorded against it from the field."
              />
            </div>
          ) : (
            <div className="divide-y divide-[var(--g-line)]">
              {rows.map((t) => {
                const stage = stageByKey.get(t.stageKey);
                return (
                  <div
                    key={t._id}
                    className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4"
                    style={{ opacity: t.isActive === false ? 0.55 : 1 }}
                  >
                    <FileSpreadsheet size={18} className="shrink-0 text-[var(--g-ink-3)]" aria-hidden />

                    <div className="min-w-[220px] flex-1">
                      <p className="text-sm font-medium text-[var(--g-ink)]">
                        {t.name}
                        {t.isActive === false && (
                          <span className="ml-2 text-[11px] text-[var(--g-ink-3)]">retired</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--g-ink-3)]">
                        {t.fields?.length || 0} questions · version {t.version} · updated {shortDate(t.updatedAt)}
                      </p>
                    </div>

                    <div className="flex min-w-[140px] flex-wrap items-center gap-1.5">
                      {stage ? (
                        <StageChip tone={stage.tone}>{stage.name}</StageChip>
                      ) : (
                        <span className="text-xs text-[var(--g-ink-3)]">no stage</span>
                      )}
                      {t.requiresOtp && <StageChip tone="brand">OTP</StageChip>}
                      {t.requiresPhoto && <StageChip tone="water">photo</StageChip>}
                    </div>

                    <div className="w-28 text-right text-xs tabular-nums text-[var(--g-ink-3)]">
                      {t.submissionCount || 0} filled
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" tone="ghost" onClick={() => setEditing({ id: t._id })}>
                        <Pencil size={14} /> Edit
                      </Button>
                      <Button size="sm" tone="ghost" onClick={() => act(() => salesApi.duplicateTemplate(t._id))} aria-label={`Duplicate ${t.name}`}>
                        <Copy size={14} />
                      </Button>
                      {t.isActive !== false && (
                        <Button
                          size="sm"
                          tone="ghost"
                          aria-label={`Retire ${t.name}`}
                          onClick={() => act(() => salesApi.deleteTemplate(t._id))}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <p className="mt-3 text-xs text-[var(--g-ink-3)]">
          A retired form is never deleted — submissions point at it, and a form that vanishes takes the
          meaning of its own answers with it.
        </p>

        <FormBuilderDialog
          open={Boolean(editing)}
          templateId={editing?.id || null}
          stages={stageList}
          onClose={() => setEditing(null)}
          onSaved={() => templates.reload({ quiet: true })}
        />
      </div>
    </SalesDashboardLayout>
  );
}
