"use client";

// app/sales/dashboard/page.js
//
// Where the book stands this morning.
//
// Every figure on this screen is a COUNT WITH A ROUTE. The backend returns the
// filter that produced each one and this page turns that into the link, so the
// number and the list it opens can never disagree about what "overdue" meant.
// That is the same discipline the executive dashboard follows, for the same
// reason: a figure nobody can act on is decoration.

import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import { Panel, PanelHead, PageHead, Skeleton, SkeletonRows, Button } from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, Figure, StageChip, ErrorNote, rupees, todayKey } from "@/components/sales/kit";

function query(params = {}) {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : "";
}

/** The ladder, drawn as proportion rather than as a list of numbers. */
function PipelineBars({ stages }) {
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <div className="space-y-2.5">
      {stages.map((stage) => (
        <Link
          key={stage.key}
          href={`/sales/dashboard/leads${query(stage.filter)}`}
          className="group block rounded-[10px] px-2 py-1.5 transition-colors hover:bg-[var(--g-surface-2)]"
        >
          <div className="flex items-baseline justify-between gap-3">
            <StageChip tone={stage.tone}>{stage.name}</StageChip>
            <span className="flex items-baseline gap-2 text-sm">
              <span data-figure className="tabular-nums text-[var(--g-ink)]">{stage.count}</span>
              {stage.value > 0 && (
                <span className="text-xs text-[var(--g-ink-3)] tabular-nums">{rupees(stage.value)}</span>
              )}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--g-surface-2)]">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.round((stage.count / max) * 100)}%`,
                background: `var(--g-${stage.tone === "neutral" ? "line-strong" : stage.tone})`,
              }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function SalesOverviewPage() {
  const today = todayKey();
  const { data, error, loading, reload } = useAsync(() => salesApi.overview(), []);
  const d = data?.data;

  const pipelineTotal = useMemo(
    () => (d?.pipeline || []).reduce((sum, s) => sum + s.count, 0),
    [d],
  );

  return (
    <SalesDashboardLayout activeMenu="dashboard">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Sales"
          title="Overview"
          sub="Where the book stands, and who is out today."
          actions={
            <>
              <Link href="/sales/dashboard/tasks?assign=1">
                <Button tone="primary" size="sm">
                  <Plus size={15} /> Assign work
                </Button>
              </Link>
              <Link href="/sales/dashboard/leads?new=1">
                <Button size="sm">Add a lead</Button>
              </Link>
            </>
          }
        />

        {error && (
          <div className="mb-4">
            <ErrorNote error={error} onRetry={reload} />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 deck:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Panel key={i} label="Loading">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-4 h-8 w-24" />
                <SkeletonRows rows={3} />
              </Panel>
            ))}
          </div>
        ) : d ? (
          <div className="space-y-4">
            {/* The four counts the desk opens the day on. */}
            <Panel padded={false} label="Today at a glance">
              <div className="grid grid-cols-2 divide-x divide-y divide-[var(--g-line)] sm:grid-cols-4 sm:divide-y-0">
                <Figure
                  label="New leads today"
                  value={d.leads.today}
                  href={`/sales/dashboard/leads${query(d.leads.filters.today)}`}
                />
                <Figure
                  label="Out in the field"
                  value={d.field.outToday}
                  unit={d.field.distanceKm > 0 ? `${d.field.distanceKm} km covered` : undefined}
                  href="/sales/dashboard/team"
                />
                <Figure
                  label="Visits recorded"
                  value={d.field.submissions}
                  href={`/sales/dashboard/tasks${query({ day: today })}`}
                />
                <Figure
                  label="Follow-ups overdue"
                  value={d.leads.overdueFollowUps}
                  tone={d.leads.overdueFollowUps > 0 ? "brick" : undefined}
                  href={`/sales/dashboard/leads${query(d.leads.filters.overdue)}`}
                />
              </div>
            </Panel>

            <div className="grid grid-cols-1 gap-4 deck:grid-cols-3">
              <Panel className="deck:col-span-2" label="Pipeline">
                <PanelHead
                  title="Pipeline"
                  sub={`${pipelineTotal} live ${pipelineTotal === 1 ? "lead" : "leads"} across the ladder`}
                  aside={
                    <Link
                      href="/sales/dashboard/leads"
                      className="inline-flex items-center gap-1 hover:text-[var(--g-ink)]"
                    >
                      All leads <ArrowUpRight size={13} />
                    </Link>
                  }
                />
                {d.pipeline.length ? (
                  <PipelineBars stages={d.pipeline} />
                ) : (
                  <p className="py-6 text-center text-sm text-[var(--g-ink-3)]">
                    No stages are configured yet.{" "}
                    <Link href="/sales/dashboard/pipeline" className="underline underline-offset-2">
                      Set up the pipeline
                    </Link>
                    .
                  </p>
                )}
              </Panel>

              <div className="space-y-4">
                <Panel label="Today's assignments">
                  <PanelHead
                    title="Today's assignments"
                    sub={
                      d.tasksToday.people === 0
                        ? "Nobody has been given work today"
                        : `${d.tasksToday.people} ${d.tasksToday.people === 1 ? "person" : "people"} out`
                    }
                  />
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-[var(--g-ink-2)]">Progress</span>
                        <span data-figure className="tabular-nums text-[var(--g-ink)]">
                          {d.tasksToday.done} / {d.tasksToday.assigned || 0}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--g-surface-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--g-brand)] transition-[width] duration-300"
                          style={{
                            width: `${
                              d.tasksToday.assigned
                                ? Math.min(100, Math.round((d.tasksToday.done / d.tasksToday.assigned) * 100))
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-[var(--g-ink-3)]">Still open</p>
                        <p data-figure className="mt-0.5 tabular-nums text-[var(--g-ink)]">{d.tasksToday.open}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--g-ink-3)]">Finished</p>
                        <p data-figure className="mt-0.5 tabular-nums text-[var(--g-ink)]">{d.tasksToday.completed}</p>
                      </div>
                    </div>

                    <Link
                      href={`/sales/dashboard/tasks${query(d.tasksToday.filter)}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--g-brand)] hover:underline underline-offset-2"
                    >
                      Open the board <ArrowUpRight size={13} />
                    </Link>
                  </div>
                </Panel>

                <Panel label="Customers and service">
                  <PanelHead title="After the sale" />
                  <div className="grid grid-cols-2 divide-x divide-[var(--g-line)]">
                    <Link href="/sales/dashboard/customers" className="block py-1 pr-4 transition-opacity hover:opacity-80">
                      <p className="text-xs text-[var(--g-ink-3)]">Paying customers</p>
                      <p data-figure className="mt-1 text-[22px] leading-none tabular-nums text-[var(--g-ink)]">
                        {d.leads.customers}
                      </p>
                    </Link>
                    <Link href="/sales/dashboard/service" className="block py-1 pl-4 transition-opacity hover:opacity-80">
                      <p className="text-xs text-[var(--g-ink-3)]">Open requests</p>
                      <p
                        data-figure
                        className="mt-1 text-[22px] leading-none tabular-nums"
                        style={{ color: d.service.open > 0 ? "var(--g-harvest)" : "var(--g-ink)" }}
                      >
                        {d.service.open}
                      </p>
                    </Link>
                  </div>

                  {d.leads.conversionPct !== null && (
                    <p className="mt-3 border-t border-[var(--g-line)] pt-3 text-xs text-[var(--g-ink-3)]">
                      <span data-figure className="tabular-nums text-[var(--g-ink)]">{d.leads.conversionPct}%</span>{" "}
                      of this month&rsquo;s {d.leads.month} new leads have converted so far.
                    </p>
                  )}
                </Panel>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SalesDashboardLayout>
  );
}
