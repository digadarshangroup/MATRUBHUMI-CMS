"use client";

import RequireRole from "@/components/access/RequireRole";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import {
    Settings, Save, RefreshCw, CheckCircle2, AlertCircle, Info,
    Calendar, Clock, Sparkles, Calculator, Sun, AlertTriangle, Plus, Trash2,
} from "lucide-react";
import RoleGate from "@/components/access/RoleGate";
import {
    Panel,
    PageHead,
    Button,
    Input,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function getHeaders() {
    const t = typeof window !== "undefined"
        ? localStorage.getItem("hr_token") || localStorage.getItem("token") || ""
        : "";
    return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
async function api(path, opts = {}) {
    const r = await fetch(`${API}${path}`, { ...opts, headers: { ...getHeaders(), ...opts.headers }, credentials: "include" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
    return d;
}

export default function PayrollSettingsPage(props) {
  return (
    <RequireRole min="editor">
      <PayrollSettingsPageInner {...props} />
    </RequireRole>
  );
}
function PayrollSettingsPageInner() {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [banner, setBanner] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const r = await api("/api/hr/payroll/settings");
            setSettings(r.data);
        } catch (e) {
            setBanner({ type: "error", msg: e.message });
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const save = async () => {
        setSaving(true);
        setBanner(null);
        try {
            await api("/api/hr/payroll/settings", {
                method: "PUT",
                body: JSON.stringify({
                    payableDaysBasis: settings.payableDaysBasis,
                    clAutoAdjust: settings.clAutoAdjust,
                    mpTreatment: settings.mpTreatment,
                    foodAllowanceInGross: settings.foodAllowanceInGross,
                    sundayOffsetsAbsence: settings.sundayOffsetsAbsence,
                    sundayWorkExtraPay: settings.sundayWorkExtraPay,
                    roundingMode: settings.roundingMode,
                    roundNetPay: settings.roundNetPay,
                    ptSlabs: settings.ptSlabs,
                    lockAfterPaid: settings.lockAfterPaid,
                }),
            });
            setBanner({ type: "success", msg: "Settings saved. Will apply to the next payroll run." });
            setTimeout(() => setBanner(null), 4000);
        } catch (e) {
            setBanner({ type: "error", msg: e.message });
        } finally {
            setSaving(false);
        }
    };

    const update = (patch) => setSettings({ ...settings, ...patch });

    if (loading || !settings) {
        return (
            <DashboardLayout activeMenu="payroll-settings">
                <div className="mx-auto max-w-[1000px] px-4 py-6 deck:px-8">
                    <Panel label="Loading payroll settings">
                        <div className="py-20 text-center">
                            <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-ink-faint" />
                            <p className="text-sm text-ink-muted">Loading payroll settings…</p>
                        </div>
                    </Panel>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout activeMenu="payroll-settings">
            <div className="mx-auto max-w-[1000px] px-4 py-6 pb-28 deck:px-8">
                {/* Header */}
                <PageHead
                    kicker="Human resources"
                    title="Payroll Settings"
                    sub="Rules that govern how monthly payroll is calculated"
                    actions={
                        <>
                            <Button tone="secondary" size="sm" onClick={load} disabled={saving}>
                                <RefreshCw className="w-4 h-4" /> Reset
                            </Button>
                            <RoleGate min="editor">
                            <Button tone="primary" size="sm" onClick={save} disabled={saving}>
                                {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save</>}
                            </Button>
                            </RoleGate>
                        </>
                    }
                />

                <div className="space-y-4">
                {banner && (
                    <div
                        role="status"
                        className={`flex items-start justify-between gap-3 rounded-card px-4 py-3 text-sm ${banner.type === "success"
                            ? "bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] text-[var(--state-positive-ink)]"
                            : "bg-[color-mix(in_srgb,var(--state-overdue)_18%,transparent)] text-[var(--state-overdue-ink)]"
                        }`}>
                        <div className="flex items-start gap-2">
                            {banner.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                            <p>{banner.msg}</p>
                        </div>
                        <button onClick={() => setBanner(null)} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">✕</button>
                    </div>
                )}

                {/* Payable Days Basis */}
                <Section icon={Calendar} title="Payable Days Basis"
                    subtitle="How to convert monthly salary into a per-day rate">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                            { id: "fixed26", label: "Fixed 26 Days", desc: "Standard Indian practice. gross ÷ 26" },
                            { id: "calendar", label: "Calendar Days", desc: "gross ÷ 30 or 31 depending on month" },
                            { id: "working_days", label: "Working Days", desc: "gross ÷ (month − Sundays − holidays)" },
                        ].map((opt) => (
                            <button key={opt.id} onClick={() => update({ payableDaysBasis: opt.id })}
                                aria-pressed={settings.payableDaysBasis === opt.id}
                                className={`rounded-inset p-3 text-left transition-colors ${settings.payableDaysBasis === opt.id
                                        ? "bg-[var(--control-active)] shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
                                        : "bg-[var(--surface-sunken)] hover:bg-[var(--control)]"
                                    }`}>
                                <p className="text-sm font-medium text-ink">{opt.label}</p>
                                <p className="mt-0.5 text-[11px] text-ink-muted">{opt.desc}</p>
                            </button>
                        ))}
                    </div>
                </Section>

                {/* CL Auto-Adjust */}
                <Section icon={Sparkles} title="CL Auto-Adjustment (Monthly CL Cap)"
                    subtitle="Convert up to N absent days per month into paid CL, provided the employee still has CL balance. Remaining absences stay as LOP.">
                    <div className="space-y-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className="relative">
                                <input type="checkbox" checked={settings.clAutoAdjust?.enabled ?? false}
                                    onChange={(e) => update({
                                        clAutoAdjust: { ...(settings.clAutoAdjust || {}), enabled: e.target.checked },
                                    })}
                                    className="sr-only peer" />
                                <div className="h-6 w-11 rounded-full bg-[var(--control-active)] transition-colors peer-checked:bg-ink" />
                                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform peer-checked:translate-x-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-ink">
                                    {settings.clAutoAdjust?.enabled ? "Enabled" : "Disabled"}
                                </p>
                                <p className="text-xs text-ink-muted">
                                    {settings.clAutoAdjust?.enabled
                                        ? `Convert up to ${settings.clAutoAdjust.maxABForAdjustment ?? 2} absent day${settings.clAutoAdjust.maxABForAdjustment === 1 ? "" : "s"} per month into paid CL (if balance available)`
                                        : "Absent days stay as AB and count as LOP"}
                                </p>
                            </div>
                        </label>

                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${settings.clAutoAdjust?.enabled ? "" : "opacity-50 pointer-events-none"
                            }`}>
                            <NumberInput label="Max CL Per Month"
                                value={settings.clAutoAdjust?.maxABForAdjustment ?? 2}
                                onChange={(v) => update({
                                    clAutoAdjust: { ...(settings.clAutoAdjust || {}), maxABForAdjustment: v },
                                })}
                                suffix="days" hint="Convert up to this many AB → CL per month" />
                            <div>
                                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                                    Consume CL Balance?
                                </label>
                                <select
                                    value={settings.clAutoAdjust?.consumeFromBalance ? "yes" : "no"}
                                    onChange={(e) => update({
                                        clAutoAdjust: {
                                            ...(settings.clAutoAdjust || {}),
                                            consumeFromBalance: e.target.value === "yes",
                                        },
                                    })}
                                    className="w-full rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-shadow focus:shadow-[inset_0_0_0_1.5px_var(--color-ink)] focus:outline-none">
                                    <option value="yes">Yes — deduct from CL balance</option>
                                    <option value="no">No — just mark as paid leave</option>
                                </select>
                                <p className="mt-0.5 text-[11px] text-ink-faint">Whether to reduce employee's annual CL counter</p>
                            </div>
                        </div>

                        {settings.clAutoAdjust?.enabled && (
                            <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
                                <p>
                                    <strong>Example:</strong> Max = {settings.clAutoAdjust.maxABForAdjustment ?? 2}, employee has 3 AB days this month with 5 CL remaining.
                                    {" "}First {settings.clAutoAdjust.maxABForAdjustment ?? 2} AB convert to L-CL (paid)
                                    {settings.clAutoAdjust?.consumeFromBalance ? ` — consuming ${settings.clAutoAdjust.maxABForAdjustment ?? 2} CL from balance` : ""}.
                                    {" "}The {3 - (settings.clAutoAdjust.maxABForAdjustment ?? 2)} extra AB day stays as LOP.
                                </p>
                            </div>
                        )}
                    </div>
                </Section>

                {/* MP Treatment */}
                <Section icon={AlertTriangle} title="Miss-Punch (MP) Treatment"
                    subtitle="How MP days are treated in payroll calculation">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                            { id: "present", label: "Paid in Full", desc: "MP counted as present (recommended)" },
                            { id: "half_day", label: "Half Day", desc: "MP paid as 0.5 day" },
                            { id: "absent", label: "Unpaid", desc: "MP treated as AB / LOP" },
                        ].map((opt) => (
                            <button key={opt.id} onClick={() => update({ mpTreatment: opt.id })}
                                aria-pressed={settings.mpTreatment === opt.id}
                                className={`rounded-inset p-3 text-left transition-colors ${settings.mpTreatment === opt.id
                                        ? "bg-[var(--control-active)] shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
                                        : "bg-[var(--surface-sunken)] hover:bg-[var(--control)]"
                                    }`}>
                                <p className="text-sm font-medium text-ink">{opt.label}</p>
                                <p className="mt-0.5 text-[11px] text-ink-muted">{opt.desc}</p>
                            </button>
                        ))}
                    </div>
                </Section>

                {/* Sunday Offsets Absence — NEW */}
                <Section icon={Sun} title="Sunday Offsets Absence (Compensatory Off)"
                    subtitle="Each Sunday an employee worked cancels out one absent day. Applied before the 1-CL rule, so the remaining absence can still be auto-adjusted.">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" checked={settings.sundayOffsetsAbsence ?? true}
                                onChange={(e) => update({ sundayOffsetsAbsence: e.target.checked })}
                                className="sr-only peer" />
                            <div className="h-6 w-11 rounded-full bg-[var(--control-active)] transition-colors peer-checked:bg-ink" />
                            <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform peer-checked:translate-x-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-ink">
                                {settings.sundayOffsetsAbsence ? "Sunday work cancels absences" : "No compensatory off for Sunday work"}
                            </p>
                            <p className="text-xs text-ink-muted">
                                {settings.sundayOffsetsAbsence
                                    ? "1 Sunday worked → 1 absent day forgiven (like comp-off)"
                                    : "Absent days are counted as LOP regardless of Sunday work"}
                            </p>
                        </div>
                    </label>

                    {settings.sundayOffsetsAbsence && (
                        <div className="mt-4 rounded-inset bg-[color-mix(in_srgb,var(--state-risk)_18%,transparent)] p-3 text-xs text-[var(--state-risk-ink)]">
                            <p>
                                <strong>Example:</strong> Employee has 2 AB days and worked 1 Sunday in a month. With this rule on, 1 AB is cancelled out (comp-off). The remaining 1 AB can then be absorbed by the <strong>CL auto-adjust</strong> rule if enabled, giving the employee full pay.
                            </p>
                        </div>
                    )}
                </Section>

                {/* Sunday Worked */}
                <Section icon={Sun} title="Sunday Worked Extra Pay"
                    subtitle="Pay an extra day's wage when an employee punches in on a non-working Sunday (on top of regular monthly gross)">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" checked={settings.sundayWorkExtraPay}
                                onChange={(e) => update({ sundayWorkExtraPay: e.target.checked })}
                                className="sr-only peer" />
                            <div className="h-6 w-11 rounded-full bg-[var(--control-active)] transition-colors peer-checked:bg-ink" />
                            <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform peer-checked:translate-x-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-ink">
                                {settings.sundayWorkExtraPay ? "Extra pay for Sunday work" : "No extra pay for Sunday work"}
                            </p>
                            <p className="text-xs text-ink-muted">
                                {settings.sundayWorkExtraPay
                                    ? "Employee earns 1 extra day's wage for each Sunday worked"
                                    : "Sunday work earns regular day's wage only"}
                            </p>
                        </div>
                    </label>

                    {settings.sundayOffsetsAbsence && settings.sundayWorkExtraPay && (
                        <div className="mt-4 rounded-inset bg-[color-mix(in_srgb,var(--state-rework)_20%,transparent)] p-3 text-xs text-[var(--state-rework-ink)]">
                            <p>
                                <strong>Note:</strong> You have both Sunday rules on. Sunday work will first cancel absences, then earn an extra day's pay for remaining Sundays worked. This is generous — make sure it matches your policy.
                            </p>
                        </div>
                    )}
                </Section>

                {/* Rounding */}
                <Section icon={Calculator} title="Rounding & Output">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                                Rounding Mode
                            </label>
                            <select value={settings.roundingMode}
                                onChange={(e) => update({ roundingMode: e.target.value })}
                                className="w-full rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-shadow focus:shadow-[inset_0_0_0_1.5px_var(--color-ink)] focus:outline-none">
                                <option value="round">Round (nearest)</option>
                                <option value="ceil">Ceiling (round up)</option>
                                <option value="floor">Floor (round down)</option>
                            </select>
                            <p className="mt-0.5 text-[11px] text-ink-faint">Applied to gross, basic, HRA</p>
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                                Round Net Pay?
                            </label>
                            <select value={settings.roundNetPay ? "yes" : "no"}
                                onChange={(e) => update({ roundNetPay: e.target.value === "yes" })}
                                className="w-full rounded-inset bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-shadow focus:shadow-[inset_0_0_0_1.5px_var(--color-ink)] focus:outline-none">
                                <option value="yes">Yes — round net to whole rupees</option>
                                <option value="no">No — keep decimals</option>
                            </select>
                        </div>
                    </div>
                </Section>

                {/* PT Slabs */}
                <Section icon={Calculator} title="Professional Tax Slabs"
                    subtitle="Monthly PT deducted based on BASIC salary (fixed, not prorated)">
                    <div className="space-y-2">
                        {(settings.ptSlabs || []).map((slab, i) => (
                            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                                <NumberInput label={i === 0 ? "Min Basic (>)" : ""}
                                    value={slab.minBasic}
                                    onChange={(v) => {
                                        const next = [...settings.ptSlabs];
                                        next[i] = { ...next[i], minBasic: v };
                                        update({ ptSlabs: next });
                                    }} suffix="₹" />
                                <NumberInput label={i === 0 ? "Max Basic (≤)" : ""}
                                    value={slab.maxBasic}
                                    onChange={(v) => {
                                        const next = [...settings.ptSlabs];
                                        next[i] = { ...next[i], maxBasic: v };
                                        update({ ptSlabs: next });
                                    }} suffix="₹" />
                                <NumberInput label={i === 0 ? "PT Amount" : ""}
                                    value={slab.amount}
                                    onChange={(v) => {
                                        const next = [...settings.ptSlabs];
                                        next[i] = { ...next[i], amount: v };
                                        update({ ptSlabs: next });
                                    }} suffix="₹/mo" />
                                <button onClick={() => {
                                    const next = [...settings.ptSlabs]; next.splice(i, 1);
                                    update({ ptSlabs: next });
                                }}
                                    className="rounded-full p-2 text-ink-muted transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] hover:text-[var(--state-overdue-ink)]"
                                    aria-label="Remove slab">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        <button onClick={() => update({
                            ptSlabs: [...(settings.ptSlabs || []), { minBasic: 0, maxBasic: 0, amount: 0 }],
                        })}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--control)] px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-[var(--control-hover)]">
                            <Plus className="w-4 h-4" /> Add Slab
                        </button>
                        <p className="text-[11px] text-ink-faint">
                            Example slab: Min 15000, Max 999999, Amount 200 — means PT of ₹200/month applies when Basic &gt; 15,000.
                        </p>
                    </div>
                </Section>

                {/* Locking */}
                <Section icon={Info} title="Lock Paid Payroll">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" checked={settings.lockAfterPaid ?? true}
                                onChange={(e) => update({ lockAfterPaid: e.target.checked })}
                                className="sr-only peer" />
                            <div className="h-6 w-11 rounded-full bg-[var(--control-active)] transition-colors peer-checked:bg-ink" />
                            <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform peer-checked:translate-x-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-ink">
                                {settings.lockAfterPaid ? "Locked once paid" : "Edits allowed even after paid"}
                            </p>
                            <p className="text-xs text-ink-muted">
                                Prevent HR from changing earnings/deductions after a payroll item is marked paid
                            </p>
                        </div>
                    </label>
                </Section>
                </div>
            </div>

            {/* Sticky save bar */}
            <div className="fixed bottom-0 left-0 right-0 lg:pl-64 z-30 pointer-events-none">
                <div className="px-4 lg:px-8 pb-4 pointer-events-auto">
                    <div className="frost-bar mx-auto flex max-w-[1000px] items-center justify-between gap-3 rounded-card border border-hairline p-3 shadow-lg">
                        <p className="hidden text-xs text-ink-faint md:block">Applies to the next payroll run</p>
                        <div className="ml-auto flex items-center gap-2">
                            <Button tone="secondary" size="sm" onClick={load} disabled={saving}>
                                <RefreshCw className="w-4 h-4" /> Reset
                            </Button>
                            <RoleGate min="editor">
                            <Button tone="primary" size="sm" onClick={save} disabled={saving}>
                                {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save All</>}
                            </Button>
                            </RoleGate>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

// ─── Small shared primitives ───────────────────────────────────────────────
function Section({ icon: Icon, title, subtitle, children }) {
    return (
        <Panel padded={false} label={title} className="overflow-hidden">
            <div className="border-b border-hairline px-5 py-4">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-inset bg-[var(--control)]">
                        <Icon className="h-4 w-4 text-ink-muted" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">{title}</h3>
                        {subtitle && <p className="mt-1 text-xs text-ink-faint">{subtitle}</p>}
                    </div>
                </div>
            </div>
            <div className="p-5">{children}</div>
        </Panel>
    );
}

function NumberInput({ label, value, onChange, suffix, hint }) {
    return (
        <div>
            {label && <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.09em] text-ink-faint">{label}</label>}
            <div className="relative">
                <Input data-figure type="number" min="0" value={value ?? 0}
                    onChange={(e) => onChange(Number(e.target.value) || 0)}
                    className="pr-12" />
                {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-ink-faint">{suffix}</span>}
            </div>
            {hint && <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>}
        </div>
    );
}