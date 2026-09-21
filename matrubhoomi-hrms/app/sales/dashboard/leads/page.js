"use client";

// app/sales/dashboard/leads/page.js
//
// Every farmer and dealer in the book, filtered the way the desk thinks.
//
// THE FILTERS LIVE IN THE URL
// ---------------------------
// Not in component state. Every figure on the overview links here with a query
// string, the browser's back button works, and a desk can send a colleague "the
// overdue ones" as a link rather than a description. The cost is that changing a
// filter is a router.replace rather than a setState, which is a real cost on a
// slow connection — and still cheaper than four screens each with their own
// private idea of what "overdue" means.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Input, Select, Segmented, Skeleton, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, StageChip, StatusChip, ErrorNote, shortDate, rupees } from "@/components/sales/kit";
import { NewLeadDialog, LeadDetailDialog } from "@/components/sales/LeadDialogs";
import LeadBoard from "@/components/sales/LeadBoard";

function LeadsScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const filters = useMemo(
    () => ({
      q: params.get("q") || "",
      stage: params.get("stage") || "",
      status: params.get("status") || "",
      assignedTo: params.get("assignedTo") || "",
      overdue: params.get("overdue") || "",
      customers: params.get("customers") || "",
      from: params.get("from") || "",
      to: params.get("to") || "",
    }),
    [params],
  );

  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(params.get("new") === "1");
  // Board or list. Remembered per browser: a manager who thinks in columns
  // thinks in columns every morning, and being handed the list again each time
  // is a small daily irritation.
  const [view, setView] = useState("board");
  const [moveError, setMoveError] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mb_leads_view");
      if (saved === "list" || saved === "board") setView(saved);
    } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("mb_leads_view", view); } catch { /* private mode */ }
  }, [view]);

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("new");
      router.replace(`/sales/dashboard/leads?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const leads = useAsync(() => salesApi.leads({ ...filters, limit: 100 }), [params.toString()]);
  const stages = useAsync(() => salesApi.stages(), []);
  const team = useAsync(() => salesApi.team(), []);

  const rows = leads.data?.data || [];
  const stageList = stages.data?.data || [];
  const teamList = team.data?.data || [];
  const stageByKey = useMemo(
    () => new Map(stageList.map((s) => [s.key, s])),
    [stageList],
  );

  const activeFilters = Object.entries(filters).filter(([, v]) => v);

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
      <PageHead
        kicker="Sales"
        title="Leads"
        sub={
          leads.data
            ? `${leads.data.total} ${leads.data.total === 1 ? "lead" : "leads"}${activeFilters.length ? " matching" : " in the book"}`
            : "Loading…"
        }
        actions={
          <>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              size="sm"
              options={[
                { id: "board", label: "Board" },
                { id: "list", label: "List" },
              ]}
            />
            <Button tone="primary" size="sm" onClick={() => setAdding(true)}>
              <Plus size={15} /> Add a lead
            </Button>
          </>
        }
      />

      {/* ── Filters ──────────────────────────────────────────────── */}
      <Panel className="mb-4" label="Filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 deck:grid-cols-5">
          <div className="relative deck:col-span-2">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--g-ink-3)]"
              aria-hidden
            />
            <Input
              defaultValue={filters.q}
              placeholder="Name, phone or lead number"
              className="pl-9"
              aria-label="Search leads"
              onKeyDown={(e) => { if (e.key === "Enter") setFilter("q", e.currentTarget.value.trim()); }}
              onBlur={(e) => { if (e.target.value.trim() !== filters.q) setFilter("q", e.target.value.trim()); }}
            />
          </div>

          <Select value={filters.stage} onChange={(e) => setFilter("stage", e.target.value)} aria-label="Stage">
            <option value="">Every stage</option>
            {stageList.map((s) => (
              <option key={s.key} value={s.key}>{s.name}</option>
            ))}
          </Select>

          <Select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="on_hold">On hold</option>
          </Select>

          <Select value={filters.assignedTo} onChange={(e) => setFilter("assignedTo", e.target.value)} aria-label="Owner">
            <option value="">Anybody</option>
            {teamList.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--g-line)] pt-3">
            {activeFilters.map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key, "")}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--g-surface-2)] px-2.5 py-1 text-[11px] text-[var(--g-ink-2)] transition-colors hover:bg-[var(--g-line)]"
              >
                {key === "overdue" ? "follow-up overdue" : key === "customers" ? "customers only" : `${key}: ${value}`}
                <X size={12} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => router.replace("/sales/dashboard/leads", { scroll: false })}
              className="text-[11px] text-[var(--g-ink-3)] underline underline-offset-2 hover:text-[var(--g-ink)]"
            >
              Clear all
            </button>
          </div>
        )}
      </Panel>

      {moveError && (
        <div className="mb-4">
          <ErrorNote error={{ message: moveError }} />
        </div>
      )}

      {/* ── The board ────────────────────────────────────────────── */}
      {view === "board" && !leads.loading && !leads.error && (
        <LeadBoard
          leads={rows}
          stages={stageList}
          onOpenLead={setOpenId}
          onMoved={() => leads.reload({ quiet: true })}
          onError={setMoveError}
        />
      )}

      {view === "board" && leads.loading && (
        <Panel><SkeletonRows rows={6} /></Panel>
      )}

      {/* ── The list ─────────────────────────────────────────────── */}
      {view === "list" && (
      <Panel padded={false} label="Leads">
        {leads.error ? (
          <div className="p-5">
            <ErrorNote error={leads.error} onRetry={leads.reload} />
          </div>
        ) : leads.loading ? (
          <div className="p-5">
            <Skeleton className="h-4 w-40" />
            <SkeletonRows rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={activeFilters.length ? "Nothing matches those filters" : "No leads yet"}
              body={
                activeFilters.length
                  ? "Try widening the search, or clear the filters."
                  : "Add one by hand, or assign a lead-generation round and let the field team bring them in."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--g-line)] text-left">
                  {["Lead", "Stage", "Owner", "Village", "Value", "Follow-up", "Last touched"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-[11px] font-medium tracking-[0.06em] text-[var(--g-ink-3)] uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((lead) => {
                  const stage = stageByKey.get(lead.stageKey);
                  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
                  return (
                    <tr
                      key={lead._id}
                      onClick={() => setOpenId(lead._id)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") setOpenId(lead._id); }}
                      className="cursor-pointer border-b border-[var(--g-line)] transition-colors last:border-0 hover:bg-[var(--g-surface-2)] focus-visible:bg-[var(--g-surface-2)] focus-visible:outline-none"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--g-ink)]">{lead.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--g-ink-3)] tabular-nums">
                          {lead.code} · {lead.phone}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StageChip tone={stage?.tone}>{stage?.name || lead.stageKey}</StageChip>
                          {lead.isCustomer && <StatusChip status="won">customer</StatusChip>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--g-ink-2)]">{lead.assignedToName || "—"}</td>
                      <td className="px-4 py-3 text-[var(--g-ink-2)]">{lead.address?.village || "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">
                        {lead.dealValue || lead.estimatedValue ? rupees(lead.dealValue || lead.estimatedValue) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span style={{ color: overdue ? "var(--g-danger)" : "var(--g-ink-2)" }}>
                          {shortDate(lead.nextFollowUpAt)}
                          {overdue && " · overdue"}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--g-ink-3)]">{shortDate(lead.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      )}

      <NewLeadDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => leads.reload({ quiet: true })}
        stages={stageList}
        team={teamList}
      />

      <LeadDetailDialog
        open={Boolean(openId)}
        leadId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => leads.reload({ quiet: true })}
        team={teamList}
      />
    </div>
  );
}

export default function SalesLeadsPage() {
  return (
    <SalesDashboardLayout activeMenu="leads">
      {/* useSearchParams needs a Suspense boundary to prerender at build time;
          without it `next build` fails on this route rather than at runtime. */}
      <Suspense fallback={<div className="p-8"><Skeleton className="h-8 w-48" /></div>}>
        <LeadsScreen />
      </Suspense>
    </SalesDashboardLayout>
  );
}
