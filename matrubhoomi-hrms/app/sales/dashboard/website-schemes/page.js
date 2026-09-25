"use client";

// app/sales/dashboard/website-schemes/page.js
//
// The government schemes the public website advertises.
//
// Nothing here is a code change either: the desk types a scheme, presses
// publish, and it is on matrubhoomifarms.com/<page> on the visitor's next load.
// Before this screen existed the same list was a hard-coded array in the
// marketing site's source, which meant a new scheme needed a developer, a
// commit and a deploy — and a closed one stayed up until somebody noticed.
//
// "Scheme" on THIS screen means a government programme on the public site. The
// schemes under Setup → Configuration are the sales pipelines a customer climbs
// — a different idea that happens to share the word. The two never mix, which
// is why they are separate models, separate routes and separate menu sections.

import { useState } from "react";
import { ExternalLink, FileText, Globe, Pencil, Plus, Trash2 } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import { Panel, PageHead, Button, SkeletonRows, EmptyState } from "@/components/ceo/ui/Primitives";
import { websiteApi } from "@/lib/websiteApi";
import { useAsync, StageChip, ErrorNote, shortDate } from "@/components/sales/kit";
import { WebsiteSchemeDialog, CATEGORY_LABELS } from "@/components/sales/WebsiteSchemeDialog";

// The chip the public card shows, and the tone that matches it. Derived from
// the deadline by the server so the desk sees exactly what a visitor sees.
const STATUS_LABEL = {
  open: "Open",
  closing_soon: "Closing soon",
  closed: "Closed",
};
// Tones are the kit's five (brand/water/harvest/brick/neutral), not invented
// ones — an unknown name silently falls back to neutral, so "closing soon"
// would have lost its warning colour without anything failing.
const STATUS_TONE = {
  open: "brand",
  closing_soon: "harvest",
  closed: "neutral",
};

export default function WebsiteSchemesPage() {
  const schemes = useAsync(() => websiteApi.schemes(), []);
  const [editing, setEditing] = useState(null); // { id } | { id: null } for new
  const [error, setError] = useState(null);

  const rows = schemes.data?.data || [];
  const categories = schemes.data?.categories;

  async function remove(row) {
    // A brochure row has no history to orphan, so this really deletes — but it
    // is still the public page changing, so it asks first.
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await websiteApi.deleteScheme(row._id);
      schemes.reload({ quiet: true });
    } catch (err) {
      setError(err);
    }
  }

  return (
    <SalesDashboardLayout activeMenu="website-schemes">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Public website"
          title="Scheme listings"
          sub="What visitors see on the website's scheme pages. Published changes are live immediately."
          actions={
            <Button tone="primary" size="sm" onClick={() => setEditing({ id: null })}>
              <Plus size={15} /> New scheme
            </Button>
          }
        />

        {error && (
          <div className="mb-4">
            <ErrorNote error={error} />
          </div>
        )}

        <Panel padded={false} label="Listings">
          {schemes.error ? (
            <div className="p-5">
              <ErrorNote error={schemes.error} onRetry={schemes.reload} />
            </div>
          ) : schemes.loading ? (
            <div className="p-5">
              <SkeletonRows rows={4} />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No schemes yet"
                body="Add one and publish it. Until then the website's scheme sections stay empty."
                action={
                  <Button tone="primary" size="sm" onClick={() => setEditing({ id: null })}>
                    <Plus size={15} /> New scheme
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-[var(--g-line)]">
              {rows.map((row) => (
                <div
                  key={row._id}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4"
                  // A draft is dimmed rather than hidden, so the desk can tell
                  // at a glance what the public can actually see.
                  style={{ opacity: row.isPublished ? 1 : 0.55 }}
                >
                  <Globe size={18} className="shrink-0 text-[var(--g-ink-3)]" aria-hidden />

                  <div className="min-w-[240px] flex-1">
                    <p className="text-sm font-medium text-ink">{row.title}</p>
                    {row.titleOdia && (
                      <p className="mt-0.5 text-xs text-ink-muted">{row.titleOdia}</p>
                    )}
                    <p className="mt-1 text-xs text-ink-faint">
                      {CATEGORY_LABELS[row.category] || row.category}
                      {row.deadline ? ` · closes ${shortDate(row.deadline)}` : ""}
                    </p>
                  </div>

                  {/* What is attached. A listing with no guideline is not
                      broken, but it is the most common thing left half-done. */}
                  <div className="flex shrink-0 items-center gap-3 text-xs text-ink-faint">
                    {row.guidelineDoc?.url && (
                      <a
                        href={row.guidelineDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        <FileText size={13} /> Guideline
                      </a>
                    )}
                    {row.briefDoc?.url && (
                      <a
                        href={row.briefDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        <FileText size={13} /> Brief
                      </a>
                    )}
                    {row.applyUrl && (
                      <a
                        href={row.applyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        <ExternalLink size={13} /> Apply
                      </a>
                    )}
                  </div>

                  <div className="shrink-0">
                    <StageChip tone={STATUS_TONE[row.status] || "neutral"}>
                      {STATUS_LABEL[row.status] || row.status}
                    </StageChip>
                  </div>

                  <div className="shrink-0">
                    <StageChip tone={row.isPublished ? "brand" : "neutral"}>
                      {row.isPublished ? "Live" : "Draft"}
                    </StageChip>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={() => setEditing({ id: row._id })}
                      aria-label={`Edit ${row.title}`}
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={() => remove(row)}
                      aria-label={`Delete ${row.title}`}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <WebsiteSchemeDialog
        open={Boolean(editing)}
        schemeId={editing?.id || null}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => schemes.reload({ quiet: true })}
      />
    </SalesDashboardLayout>
  );
}
