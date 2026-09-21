"use client";

// app/sales/dashboard/customers/page.js
//
// The people who have actually paid.
//
// It is the SAME collection as leads, filtered to `isCustomer` — a lead and a
// customer are one person at two points of one conversation, so they are one
// row (see SalesLead's header). This screen exists because the questions are
// different: not "where are they on the ladder" but "what have they bought, and
// does anything need doing for them".

import { useState } from "react";
import Link from "next/link";
import { LifeBuoy, Search, GitBranch } from "lucide-react";
import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import {
  Panel, PageHead, Button, Input, Field, Select, Textarea, SkeletonRows, EmptyState,
} from "@/components/ceo/ui/Primitives";
import { salesApi } from "@/lib/salesApi";
import { useAsync, Dialog, ErrorNote, StatusChip, rupees, shortDate } from "@/components/sales/kit";
import { Explain } from "@/components/sales/Explain";
import { LeadDetailDialog } from "@/components/sales/LeadDialogs";

function RaiseServiceDialog({ open, lead, onClose, onRaised }) {
  const [form, setForm] = useState({ type: "maintenance", title: "", description: "", priority: "normal", channel: "call", dueAt: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await salesApi.raiseService({
        leadId: lead._id,
        ...form,
        dueAt: form.dueAt ? new Date(`${form.dueAt}T18:00:00+05:30`).toISOString() : undefined,
      });
      onRaised?.();
      setForm({ type: "maintenance", title: "", description: "", priority: "normal", channel: "call", dueAt: "" });
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
      title="Raise a service request"
      sub={lead ? `${lead.name} · ${lead.code}` : undefined}
      footer={
        <>
          <Button tone="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button tone="primary" size="sm" onClick={submit} disabled={busy || !form.title.trim()}>
            {busy ? "Raising…" : "Raise request"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={error} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="What kind">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="maintenance">Maintenance</option>
              <option value="complaint">Complaint</option>
              <option value="installation">Installation</option>
              <option value="inspection">Inspection</option>
              <option value="collection">Collection</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="How they got in touch">
            <Select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
              <option value="call">Phone call</option>
              <option value="field_visit">During a field visit</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="walk_in">Walked in</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>

        <Field label="What is needed" required>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Pump not starting" />
        </Field>

        <Field label="Details">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </Field>
          <Field label="Wanted by">
            <Input type="date" value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

export default function SalesCustomersPage() {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [raising, setRaising] = useState(null);

  const customers = useAsync(() => salesApi.leads({ customers: "true", q, limit: 200 }), [q]);
  const team = useAsync(() => salesApi.team(), []);

  const rows = customers.data?.data || [];
  const totalValue = rows.reduce((s, r) => s + (r.dealValue || 0), 0);
  const collected = rows.reduce((s, r) => s + (r.amountCollected || 0), 0);

  return (
    <SalesDashboardLayout activeMenu="customers">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        <PageHead
          kicker="Sales"
          title="Customers"
          sub={
            customers.loading
              ? "Loading…"
              : `${rows.length} paying ${rows.length === 1 ? "customer" : "customers"} · ${rupees(collected)} collected of ${rupees(totalValue)}`
          }
          actions={
            <div className="relative w-64">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--g-ink-3)]" aria-hidden />
              <Input
                className="pl-9"
                placeholder="Name or phone"
                aria-label="Search customers"
                onKeyDown={(e) => { if (e.key === "Enter") setQ(e.currentTarget.value.trim()); }}
                onBlur={(e) => setQ(e.target.value.trim())}
              />
            </div>
          }
        />

        <Explain id="customers" />

        <Panel padded={false} label="Customers">
          {customers.error ? (
            <div className="p-5"><ErrorNote error={customers.error} onRetry={customers.reload} /></div>
          ) : customers.loading ? (
            <div className="p-5"><SkeletonRows rows={6} /></div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No customers yet"
                body="A lead becomes a customer the moment it reaches a stage whose outcome is won."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--g-line)] text-left">
                    {["Customer", "Village", "Owner", "Deal", "Collected", "Since", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[11px] font-medium tracking-[0.06em] text-[var(--g-ink-3)] uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const outstanding = (c.dealValue || 0) - (c.amountCollected || 0);
                    return (
                      <tr key={c._id} className="border-b border-[var(--g-line)] last:border-0 hover:bg-[var(--g-surface-2)]">
                        <td className="cursor-pointer px-4 py-3" onClick={() => setOpenId(c._id)}>
                          <p className="font-medium text-[var(--g-ink)]">{c.name}</p>
                          <p className="mt-0.5 text-xs tabular-nums text-[var(--g-ink-3)]">{c.code} · {c.phone}</p>
                        </td>
                        <td className="px-4 py-3 text-[var(--g-ink-2)]">{c.address?.village || "—"}</td>
                        <td className="px-4 py-3 text-[var(--g-ink-2)]">{c.assignedToName || "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-[var(--g-ink-2)]">{rupees(c.dealValue)}</td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className="text-[var(--g-ink-2)]">{rupees(c.amountCollected)}</span>
                          {outstanding > 0 && (
                            <span className="ml-2 text-xs text-[var(--g-hint)]">{rupees(outstanding)} due</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[var(--g-ink-3)]">{shortDate(c.updatedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {/* The scheme, the step, every visit and the audit trail. */}
                          <Link href={`/sales/dashboard/customers/${c._id}`}>
                            <Button size="sm" tone="ghost"><GitBranch size={14} /> Workflow</Button>
                          </Link>
                          <Button size="sm" tone="ghost" onClick={() => setRaising(c)}>
                            <LifeBuoy size={14} /> Service
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <LeadDetailDialog
          open={Boolean(openId)}
          leadId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => customers.reload({ quiet: true })}
          team={team.data?.data || []}
        />

        <RaiseServiceDialog
          open={Boolean(raising)}
          lead={raising}
          onClose={() => setRaising(null)}
          onRaised={() => customers.reload({ quiet: true })}
        />
      </div>
    </SalesDashboardLayout>
  );
}
