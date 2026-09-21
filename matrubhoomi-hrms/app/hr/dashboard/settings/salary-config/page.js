"use client";

import RequireRole from "@/components/access/RequireRole";

import { useState, useEffect } from "react";
import { Save, Loader2, RotateCcw, Check, AlertCircle, Info } from "lucide-react";
import Hr_DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
    Panel,
    PageHead,
    Button,
    Chip,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ─── FIELD METADATA ───────────────────────────────────────────────────────────
const FIELD_META = {
    basicPct: {
        label: "Basic %", unit: "%", companyDefault: 50,
        note: "Basic salary as % of gross. Company default: 50%.",
    },
    hraPct: {
        label: "HRA %", unit: "%", companyDefault: 50,
        note: "HRA as % of gross. Company default: 50%.",
    },
    eepfPct: {
        label: "Employee PF %", unit: "%", companyDefault: 12,
        note: "Employee PF contribution % of Basic. Statutory: 12%.",
    },
    epfCapAmount: {
        label: "EPF Cap (\u20b9/mo)", unit: "\u20b9", companyDefault: 1800,
        note: "Monthly rupee cap on EPF. = 12% of \u20b915,000 PF wage ceiling. Default: \u20b91,800.",
    },
    edliPct: {
        label: "EDLI %", unit: "%", companyDefault: 0.5,
        note: "EDLI % of Basic. Statutory: 0.5%. HR can also override this per employee.",
    },
    edliCapAmount: {
        label: "EDLI Wage Cap (\u20b9)", unit: "\u20b9", companyDefault: 15000,
        note: "Monthly cap on Basic wage used for EDLI calculation. Statutory: \u20b915,000.",
    },
    adminChargesPct: {
        label: "EPF Admin Charges %", unit: "%", companyDefault: 0.5,
        note: "EPF admin charges % of Basic. Statutory: 0.5%. HR can override per employee.",
    },
    foodAllowance: {
        label: "Food Allowance (\u20b9/mo)", unit: "\u20b9", companyDefault: 1600,
        note: "Fixed monthly food allowance added to CTC. Does not affect employee net salary.",
    },
    esiWageLimit: {
        label: "ESI Basic Ceiling (\u20b9)", unit: "\u20b9", companyDefault: 21000,
        note: "ESI applies when Basic \u2264 this limit. Statutory: \u20b921,000. Calculated on Basic salary.",
    },
    eeEsicPct: {
        label: "Employee ESIC %", unit: "%", companyDefault: 0.75,
        note: "Employee ESI % of Basic salary. Statutory: 0.75%. Rounded up (ceiling).",
    },
    erEsicPct: {
        label: "Employer ESIC %", unit: "%", companyDefault: 3.25,
        note: "Employer ESI % of Basic salary. Statutory: 3.25%. Rounded up (ceiling).",
    },
};

const GROUPS = [
    {
        title: "Earnings Breakdown",
        color: "",
        headerColor: "text-ink-faint",
        fields: ["basicPct", "hraPct"],
    },
    {
        title: "EPF / PF",
        color: "",
        headerColor: "text-ink-faint",
        fields: ["eepfPct", "epfCapAmount", "edliPct", "edliCapAmount", "adminChargesPct"],
        note: "EDLI and Admin Charges can also be overridden per employee in the employee salary form.",
    },
    {
        title: "Food Allowance",
        color: "",
        headerColor: "text-ink-faint",
        fields: ["foodAllowance"],
        note: "Fixed food allowance added to CTC each month. Does not affect employee net salary.",
    },
    {
        title: "ESI  \u00b7  calculated on Basic salary",
        color: "",
        headerColor: "text-ink-faint",
        fields: ["esiWageLimit", "eeEsicPct", "erEsicPct"],
        note: "ESI is calculated on Basic salary (not Gross). ESIC amounts are always rounded up.",
    },
];

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
function Tip({ note }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative inline-flex" style={{ zIndex: 50 }}>
            <button
                type="button"
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-hairline text-ink-faint transition-colors hover:bg-[var(--control)] hover:text-ink"
            >
                <Info className="w-2 h-2" />
            </button>
            {open && (
                <div
                    className="absolute left-5 top-1/2 -translate-y-1/2 rounded-inset bg-ink px-3 py-2 text-[11px] leading-snug text-[var(--body-bg)] shadow-xl"
                    style={{ zIndex: 9999, minWidth: "230px", maxWidth: "300px" }}
                >
                    <div className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-ink" />
                    {note}
                </div>
            )}
        </div>
    );
}

// ─── FIELD ROW ────────────────────────────────────────────────────────────────
function FieldRow({ fieldKey, value, onChange, dirty }) {
    const meta = FIELD_META[fieldKey];
    const step = meta.unit === "%" ? "0.01" : "1";
    const isChanged = Number(value) !== meta.companyDefault;

    const defaultDisplay = meta.unit === "\u20b9"
        ? `\u20b9${meta.companyDefault.toLocaleString("en-IN")}`
        : `${meta.companyDefault}%`;

    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline py-3 last:border-0">
            <div className="flex w-52 flex-shrink-0 items-center gap-1.5">
                <span className="text-sm text-ink">{meta.label}</span>
                <Tip note={meta.note} />
            </div>
            <div className="flex flex-1 items-center gap-1">
                <div className={`flex items-center gap-1 border-b transition-colors ${dirty ? "border-[var(--color-ink)]" : "border-hairline"}`}>
                    <input
                        data-figure
                        type="number"
                        step={step}
                        min="0"
                        value={value ?? ""}
                        onChange={(e) => onChange(fieldKey, e.target.value)}
                        className="w-24 bg-transparent px-0 py-0.5 text-right text-sm text-ink outline-none focus:ring-0"
                    />
                    {meta.unit === "%" && <span className="text-xs text-ink-faint">%</span>}
                </div>
            </div>
            <div className="flex w-48 flex-shrink-0 items-center justify-end gap-2">
                <span className="text-xs text-ink-faint">
                    Default: <span data-figure>{defaultDisplay}</span>
                </span>
                {isChanged ? (
                    <button
                        type="button"
                        onClick={() => onChange(fieldKey, meta.companyDefault)}
                        className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] text-[var(--state-rework-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-rework)_26%,transparent)]"
                        title="Reset to company default"
                    >
                        <RotateCcw className="w-2.5 h-2.5" /> Reset
                    </button>
                ) : (
                    <span className="flex items-center gap-0.5 text-[10px] text-[var(--state-positive-ink)]">
                        <Check className="w-2.5 h-2.5" /> Default
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SalaryConfigPage(props) {
  return (
    <RequireRole min="editor">
      <SalaryConfigPageInner {...props} />
    </RequireRole>
  );
}
function SalaryConfigPageInner() {
    const [config, setConfig] = useState(null);
    const [original, setOriginal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => { fetchConfig(); }, []);

    // Merge DB response with FIELD_META defaults so newly-added fields
    // (like foodAllowance) always show even if not yet in the DB document.
    const normalize = (data) => {
        const out = { ...data };
        Object.keys(FIELD_META).forEach(k => {
            if (out[k] === undefined || out[k] === null) {
                out[k] = FIELD_META[k].companyDefault;
            }
        });
        return out;
    };

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/api/employees/config/salary`, { credentials: "include" });
            const d = await r.json();
            if (d.success) {
                const filled = normalize(d.data);
                setConfig(filled);
                setOriginal(filled);
            } else {
                setError(d.message || "Failed to load config");
            }
        } catch {
            setError("Failed to connect to server");
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (key, val) => {
        setConfig(prev => ({ ...prev, [key]: val === "" ? "" : Number(val) }));
        setSuccess(false);
        setError(null);
    };

    const handleResetAll = () => {
        const defaults = {};
        Object.keys(FIELD_META).forEach(k => { defaults[k] = FIELD_META[k].companyDefault; });
        setConfig(prev => ({ ...prev, ...defaults }));
        setSuccess(false);
    };

    const handleSave = async () => {
        setSaving(true); setError(null); setSuccess(false);
        try {
            const body = {};
            Object.keys(FIELD_META).forEach(k => {
                const val = Number(config[k]);
                body[k] = isNaN(val) ? FIELD_META[k].companyDefault : val;
            });

            const r = await fetch(`${API}/api/employees/config/salary`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const d = await r.json();
            if (!r.ok || !d.success) {
                setError(d.message || (d.errors ? d.errors.join(", ") : "Failed to save"));
            } else {
                const saved = normalize(d.data);
                setConfig(saved);
                setOriginal(saved);
                setSuccess(true);
                setTimeout(() => setSuccess(false), 3000);
            }
        } catch {
            setError("Failed to connect to server");
        } finally {
            setSaving(false);
        }
    };

    const dirtyFields = new Set(
        Object.keys(FIELD_META).filter(
            k => config && original && Number(config[k]) !== Number(original[k])
        )
    );
    const hasDirty = dirtyFields.size > 0;

    return (
        <Hr_DashboardLayout>
            <div className="mx-auto max-w-[900px] px-4 py-6 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Salary Formula Config"
                    sub="Configure the rates used to auto-calculate payroll components for all employees. Changes take effect on the next salary save."
                    actions={
                        <>
                            <RoleGate min="editor">
                                <Button
                                    tone="secondary" size="sm"
                                    type="button" onClick={handleResetAll} disabled={saving || loading}
                                >
                                    <RotateCcw className="w-3 h-3" /> Reset All to Default
                                </Button>
                            </RoleGate>
                            <RoleGate min="editor">
                                <Button
                                    tone="primary" size="sm"
                                    type="button" onClick={handleSave} disabled={saving || loading || !hasDirty}
                                >
                                    {saving
                                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving&hellip;</>
                                        : success
                                            ? <><Check className="w-3 h-3" /> Saved</>
                                            : <><Save className="w-3 h-3" /> Save Changes</>}
                                </Button>
                            </RoleGate>
                        </>
                    }
                >
                    {(hasDirty && !saving) || success || error ? (
                        <div className="flex flex-wrap items-center gap-2">
                            {hasDirty && !saving && (
                                <Chip tone="rework">
                                    <AlertCircle className="w-3 h-3" />
                                    <span data-figure>{dirtyFields.size}</span> unsaved change{dirtyFields.size > 1 ? "s" : ""}
                                </Chip>
                            )}
                            {success && (
                                <Chip tone="positive">
                                    <Check className="w-3 h-3" /> Config saved successfully
                                </Chip>
                            )}
                            {error && (
                                <Chip tone="overdue">
                                    <AlertCircle className="w-3 h-3" /> {error}
                                </Chip>
                            )}
                        </div>
                    ) : null}
                </PageHead>

                {loading && (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 className="h-7 w-7 animate-spin text-ink-faint" />
                    </div>
                )}

                {!loading && config && (
                    <div className="space-y-4">
                        {GROUPS.map(group => (
                            <Panel key={group.title} label={group.title} className={group.color}>
                                <p className={`mb-1 text-[11px] font-medium uppercase tracking-[0.09em] ${group.headerColor}`}>
                                    {group.title}
                                </p>
                                {group.note && (
                                    <p className="mb-4 text-[11px] text-ink-muted">{group.note}</p>
                                )}
                                {!group.note && <div className="mb-4" />}
                                <div>
                                    {group.fields.map(key => (
                                        <FieldRow
                                            key={key}
                                            fieldKey={key}
                                            value={config[key]}
                                            onChange={handleChange}
                                            dirty={dirtyFields.has(key)}
                                        />
                                    ))}
                                </div>
                            </Panel>
                        ))}

                        {config.updatedAt && (
                            <p className="pt-1 text-right text-xs text-ink-faint">
                                Last updated:{" "}
                                <span data-figure>
                                    {new Date(config.updatedAt).toLocaleString("en-IN", {
                                        day: "2-digit", month: "short", year: "numeric",
                                        hour: "2-digit", minute: "2-digit",
                                    })}
                                </span>
                            </p>
                        )}
                    </div>
                )}
            </div>
        </Hr_DashboardLayout>
    );
}