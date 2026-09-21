"use client";

// app/sales/dashboard/service/page.js
//
// After the sale: what customers have asked for, and who was sent.
//
// A REQUEST IS A THREAD, A VISIT IS A TASK
// ----------------------------------------
// The first visit finds a part missing; the second fits it. Both belong to the
// one complaint the customer refers to by one number when they ring again — so
// closing the last task does not close the request. Somebody decides that, here.

import { useState } from "react";
import { Send } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Field, Input, Select, Segmented, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, Dialog, ErrorNote, StatusChip, StageChip, dateTime, shortDate } from "@/components/sales/kit";

function AssignVisitDialog({ open, request, team, onClose, onAssigned }) {
  const [employeeId, setEmployeeId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await salesApi.assignService(request._id, {
        assignments: [{ employeeId }],
        scheduledFor: scheduledFor ? new Date(`${scheduledFor}T09:00:00+05:30`).toISOString() : undefined,
        requirePhoto: true,
      });
      onAssigned?.();
      onClose?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Send somebody out"
      sub={request ? `${request.code} · ${request.customerName}` : undefined}
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button tone="primary" size="sm" onClick={submit} disabled={busy || !employeeId}>
            {busy ? "Sending…" : "Assign the visit"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={error} />

        <Field label="Who goes" required>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Choose somebody</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="For the day" hint="Leave blank for today.">
          <Input type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </Field>

        <p className="text-xs text-[var(--g-ink-3)]">
          This becomes a task on their phone like any other, with a photograph required. The request stays
          open until somebody closes it here.
        </p>
      </div>
    </Dialog>
  );
}

export default function SalesServicePage() {
  const [filter, setFilter] = useState("open");
  const [assigning, setAssigning] = useState(null);
  const [error, setError] = useState(null);

  const requests = useAsync(
    () => salesApi.serviceRequests({ status: filter === "all" ? undefined : filter }),
    [filter],
  );
  const team = useAsync(() => salesApi.team(), []);

  const rows = requests.data?.data || [];

  async function setStatus(id, status) {
    setError(null);
    try {
      await salesApi.updateService(id, { status });
      requests.reload({ quiet: true });
    } catch (err) {
      setError(err);
    }
  }

  return (
    <SalesDashboardLayout activeMenu="service">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Sales · after the sale"
          title="Service requests"
          sub={requests.loading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "request" : "requests"}`}
        >
          <Segmented
            label="Filter"
            value={filter}
            onChange={setFilter}
            size="sm"
            options={[
              { id: "open", label: "Open" },
              { id: "assigned,in_progress", label: "Being worked" },
              { id: "resolved,closed", label: "Done" },
              { id: "all", label: "Everything" },
            ]}
          />
        </PageHead>

        {error && <div className="mb-4"><ErrorNote error={error} /></div>}

        <Panel padded={false} label="Requests">
          {requests.error ? (
            <div className="p-5"><ErrorNote error={requests.error} onRetry={requests.reload} /></div>
          ) : requests.loading ? (
            <div className="p-5"><SkeletonRows rows={5} /></div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nothing here"
                body="Requests are raised against a paying customer, from the Customers screen."
              />
            </div>
          ) : (
            <div className="divide-y divide-[var(--g-line)]">
              {rows.map((r) => (
                <div key={r._id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                  <div className="min-w-[240px] flex-1">
                    <p className="text-sm font-medium text-[var(--g-ink)]">{r.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--g-ink-3)]">
                      <span className="tabular-nums">{r.code}</span> · {r.customerName}
                      {r.village ? ` · ${r.village}` : ""} · raised {shortDate(r.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <StageChip tone="neutral">{r.type}</StageChip>
                    {["high", "urgent"].includes(r.priority) && (
                      <StageChip tone={r.priority === "urgent" ? "brick" : "harvest"}>{r.priority}</StageChip>
                    )}
                    <StatusChip status={r.status} />
                  </div>

                  <div className="w-32 text-right text-xs text-[var(--g-ink-3)]">
                    {r.taskIds?.length ? `${r.taskIds.length} visit${r.taskIds.length === 1 ? "" : "s"}` : "not assigned"}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!["resolved", "closed", "cancelled"].includes(r.status) && (
                      <>
                        <Button size="sm" tone="ghost" onClick={() => setAssigning(r)}>
                          <Send size={14} /> Send somebody
                        </Button>
                        <Button size="sm" tone="ghost" onClick={() => setStatus(r._id, "resolved")}>
                          Mark resolved
                        </Button>
                      </>
                    )}
                    {r.status === "resolved" && (
                      <Button size="sm" tone="ghost" onClick={() => setStatus(r._id, "closed")}>
                        Close
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <AssignVisitDialog
          open={Boolean(assigning)}
          request={assigning}
          team={team.data?.data || []}
          onClose={() => setAssigning(null)}
          onAssigned={() => requests.reload({ quiet: true })}
        />
      </div>
    </SalesDashboardLayout>
  );
}
