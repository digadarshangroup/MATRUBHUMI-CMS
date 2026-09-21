"use client";

// app/sales/dashboard/tasks/page.js
//
// The morning board: who was given what, and how far they have got.
//
// TWO VIEWS OF THE SAME DAY, AND BOTH ARE NEEDED
// ----------------------------------------------
// "By person" answers the question a manager actually asks at 4pm — did Ramesh
// do his four. "Every task" answers the one they ask when something specific has
// gone wrong. The per-person view is aggregated in the database (see
// /api/sales/tasks/summary) rather than by grouping the task list in the
// browser, because the second approach works fine at twenty tasks and stops
// working at two thousand.

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Input, Segmented, Skeleton, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, StatusChip, ErrorNote, dateTime, ago, todayKey } from "@/components/sales/kit";
import { Explain } from "@/components/sales/Explain";
import { AssignDialog } from "@/components/sales/AssignDialog";

function Progress({ done, total }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--g-surface-2)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: pct >= 100 ? "var(--g-brand)" : "var(--g-water)" }}
        />
      </div>
      <span data-figure className="text-xs tabular-nums text-[var(--g-ink-2)]">
        {done}/{total}
      </span>
    </div>
  );
}

function TasksScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const day = params.get("day") || todayKey();
  const [view, setView] = useState("people");
  const [assigning, setAssigning] = useState(params.get("assign") === "1");

  const summary = useAsync(() => salesApi.taskSummary(day), [day]);
  const tasks = useAsync(
    () => salesApi.tasks({ day, status: params.get("status") || undefined, limit: 200 }),
    [day, params.get("status")],
  );

  const people = summary.data?.data || [];
  const rows = tasks.data?.data || [];

  const totals = useMemo(
    () =>
      people.reduce(
        (acc, p) => ({
          assigned: acc.assigned + (p.assigned || 0),
          done: acc.done + (p.done || 0),
          pending: acc.pending + (p.pending || 0),
        }),
        { assigned: 0, done: 0, pending: 0 },
      ),
    [people],
  );

  function setDay(value) {
    const next = new URLSearchParams(params.toString());
    next.set("day", value);
    next.delete("assign");
    router.replace(`/sales/dashboard/tasks?${next.toString()}`, { scroll: false });
  }

  function reloadBoth() {
    summary.reload({ quiet: true });
    tasks.reload({ quiet: true });
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
      <PageHead
        kicker="Sales"
        title="Assignments"
        sub={
          people.length
            ? `${totals.done} of ${totals.assigned} done · ${people.length} ${people.length === 1 ? "person" : "people"} out`
            : "Nothing has been handed out for this day yet."
        }
        actions={
          <>
            <Input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              aria-label="Day"
              className="w-auto py-1.5 text-sm"
            />
            <Button size="sm" onClick={reloadBoth} aria-label="Refresh">
              <RefreshCw size={15} />
            </Button>
            <Button tone="primary" size="sm" onClick={() => setAssigning(true)}>
              <Plus size={15} /> Assign work
            </Button>
          </>
        }
      >
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          size="sm"
          options={[
            { id: "people", label: "By person", count: people.length },
            { id: "tasks", label: "Every task", count: rows.length },
          ]}
        />
      </PageHead>

      <Explain id="tasks" />

      {view === "people" ? (
        <Panel padded={false} label="By person">
          {summary.error ? (
            <div className="p-5"><ErrorNote error={summary.error} onRetry={summary.reload} /></div>
          ) : summary.loading ? (
            <div className="p-5"><SkeletonRows rows={5} /></div>
          ) : people.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nobody is out on this day"
                body="Assign a round and it appears here as it is worked."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--g-line)] text-left">
                    {["Employee", "Tasks", "Progress", "Finished", "Last activity"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11px] font-medium tracking-[0.06em] text-[var(--g-ink-3)] uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p._id} className="border-b border-[var(--g-line)] last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--g-ink)]">{p.employeeName || "—"}</p>
                        {p.employeeCode && <p className="mt-0.5 text-xs text-[var(--g-ink-3)] tabular-nums">{p.employeeCode}</p>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">{p.tasks}</td>
                      <td className="px-4 py-3"><Progress done={p.done} total={p.assigned} /></td>
                      <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">
                        {p.completed} of {p.tasks}
                      </td>
                      <td className="px-4 py-3 text-[var(--g-ink-3)]">{p.lastActivityAt ? ago(p.lastActivityAt) : "nothing yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel padded={false} label="Every task">
          {tasks.error ? (
            <div className="p-5"><ErrorNote error={tasks.error} onRetry={tasks.reload} /></div>
          ) : tasks.loading ? (
            <div className="p-5"><SkeletonRows rows={6} /></div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No tasks on this day" body="Pick another date, or assign a round." />
            </div>
          ) : (
            <div className="divide-y divide-[var(--g-line)]">
              {rows.map((task) => (
                <div key={task._id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
                  <div className="min-w-[220px] flex-1">
                    <p className="text-sm font-medium text-[var(--g-ink)]">{task.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--g-ink-3)]">
                      <span className="tabular-nums">{task.code}</span> · {task.assignedToName}
                      {task.templateName ? ` · ${task.templateName}` : ""}
                    </p>
                  </div>

                  <Progress
                    done={task.doneCount || 0}
                    total={task.type === "lead_generation" ? Math.max(task.targetCount || 0, task.targets?.length || 0) : task.targets?.length || 0}
                  />

                  <StatusChip status={task.status} />

                  <div className="w-32 text-right text-xs text-[var(--g-ink-3)]">
                    {task.lastActivityAt ? ago(task.lastActivityAt) : dateTime(task.scheduledFor)}
                  </div>

                  {["assigned", "accepted", "in_progress"].includes(task.status) && (
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={async () => {
                        // No confirm dialog: cancelling is reversible in the
                        // sense that matters — the work can be re-assigned in
                        // one action, and the record of the cancellation stays.
                        await salesApi.cancelTask(task._id, "Cancelled from the board");
                        reloadBoth();
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <AssignDialog
        open={assigning}
        onClose={() => setAssigning(false)}
        onAssigned={reloadBoth}
      />
    </div>
  );
}

export default function SalesTasksPage() {
  return (
    <SalesDashboardLayout activeMenu="tasks">
      <Suspense fallback={<div className="p-8"><Skeleton className="h-8 w-48" /></div>}>
        <TasksScreen />
      </Suspense>
    </SalesDashboardLayout>
  );
}
