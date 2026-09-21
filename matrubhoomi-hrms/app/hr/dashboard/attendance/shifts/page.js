"use client";
import { useState, useEffect } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import { Plus, Edit2, Trash2, X, Clock, Users, CheckCircle } from "lucide-react";
import RoleGate from "@/components/access/RoleGate";
import {
    Panel,
    PanelHead,
    PageHead,
    Button,
    Chip,
    Field,
    Input,
    EmptyState,
    Skeleton,
} from "@/components/ceo/ui/Primitives";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
function getHeaders() {
    const t = typeof window !== "undefined" ? (localStorage.getItem("hr_token") || localStorage.getItem("token") || "") : "";
    return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
async function api(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { ...opts, headers: { ...getHeaders(), ...opts.headers }, credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#f97316", "#06b6d4", "#6366f1", "#ec4899", "#84cc16"];

function calcDuration(start, end) {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 1440;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function ShiftModal({ shift, onSave, onClose }) {
    const [form, setForm] = useState(shift || {
        name: "", code: "", startTime: "09:00", endTime: "18:00",
        breakMins: 60, workingDays: [1, 2, 3, 4, 5, 6], color: "#8b5cf6",
    });
    const [saving, setSaving] = useState(false);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const toggleDay = (d) => set("workingDays", form.workingDays.includes(d) ? form.workingDays.filter(x => x !== d) : [...form.workingDays, d].sort());

    const handleSave = async () => {
        if (!form.name.trim() || !form.code.trim()) { alert("Name and code are required"); return; }
        setSaving(true);
        try { await onSave(form); }
        catch (err) { alert(err.message); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
            <div className="frost-bar flex max-h-full w-full min-h-0 max-w-md flex-col rounded-panel border border-hairline">
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-5 py-4">
                    <h3 className="text-[17px] font-medium tracking-[-0.02em] text-ink">{shift ? "Edit Shift" : "Create Shift"}</h3>
                    <Button tone="ghost" size="sm" onClick={onClose} aria-label="Close"><X size={18} /></Button>
                </div>

                <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <Field label="Shift Name">
                                <Input type="text" placeholder="General Shift" value={form.name}
                                    onChange={e => set("name", e.target.value)} />
                            </Field>
                        </div>
                        <div>
                            <Field label="Code">
                                <Input type="text" placeholder="GEN" value={form.code}
                                    onChange={e => set("code", e.target.value.toUpperCase().slice(0, 6))}
                                    className="uppercase" data-figure />
                            </Field>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Field label="Start Time">
                            <Input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} data-figure />
                        </Field>
                        <Field label="End Time">
                            <Input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} data-figure />
                        </Field>
                        <Field label="Break (mins)">
                            <Input type="number" min={0} value={form.breakMins} onChange={e => set("breakMins", +e.target.value)} data-figure />
                        </Field>
                    </div>

                    {/* Working days */}
                    <div>
                        <span className="mb-1.5 block text-sm font-medium text-ink">Working Days</span>
                        <div className="flex flex-wrap gap-1.5">
                            {DAYS.map((d, i) => (
                                <button key={i} type="button" onClick={() => toggleDay(i)}
                                    className={`h-9 w-9 rounded-inset text-xs font-medium transition-colors ${form.workingDays.includes(i) ? "text-slab-ink" : "bg-[var(--control)] text-ink-muted hover:bg-[var(--control-hover)]"}`}
                                    style={form.workingDays.includes(i) ? { background: form.color } : {}}>
                                    {d.slice(0, 2)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Color picker */}
                    <div>
                        <span className="mb-1.5 block text-sm font-medium text-ink">Color</span>
                        <div className="flex flex-wrap gap-2">
                            {COLORS.map(c => (
                                <button key={c} type="button" onClick={() => set("color", c)}
                                    aria-label={`Colour ${c}`}
                                    className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${form.color === c ? "scale-110 shadow-[0_0_0_2px_var(--color-ink)]" : "shadow-[0_0_0_1px_var(--color-hairline)]"}`}
                                    style={{ background: c }} />
                            ))}
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="flex items-center gap-3 rounded-inset bg-[var(--surface-sunken)] p-3">
                        <div className="h-10 w-1 rounded-full" style={{ background: form.color }} />
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{form.name || "Shift Name"}</p>
                            <p className="text-xs text-ink-faint">
                                <span data-figure>{form.startTime}</span> – <span data-figure>{form.endTime}</span>
                                {form.startTime && form.endTime && <span data-figure>{` (${calcDuration(form.startTime, form.endTime)})`}</span>}
                                {form.breakMins > 0 && <span data-figure>{` · ${form.breakMins}m break`}</span>}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 gap-3 border-t border-hairline px-5 py-4">
                    <Button tone="secondary" onClick={onClose} className="flex-1">Cancel</Button>
                    <RoleGate min="editor">
                        <Button tone="primary" onClick={handleSave} disabled={saving} className="flex-1">
                            {saving ? "Saving..." : shift ? "Update Shift" : "Create Shift"}
                        </Button>
                    </RoleGate>
                </div>
            </div>
        </div>
    );
}

export default function ShiftsPage() {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);  // shift object or "new"
    const [deleting, setDeleting] = useState(null);

    const load = () => {
        setLoading(true);
        api("/api/hr/attendance/shifts")
            .then(r => setShifts(r.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };
    useEffect(load, []);

    const handleSave = async (form) => {
        if (editing && editing._id) {
            await api(`/api/hr/attendance/shifts/${editing._id}`, { method: "PUT", body: JSON.stringify(form) });
        } else {
            await api("/api/hr/attendance/shifts", { method: "POST", body: JSON.stringify(form) });
        }
        setEditing(null);
        load();
    };

    const handleDelete = async (id) => {
        await api(`/api/hr/attendance/shifts/${id}`, { method: "DELETE" });
        setDeleting(null);
        load();
    };

    return (
        <DashboardLayout activeMenu="attendance-shifts">
            <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
                <PageHead
                    kicker="Human resources"
                    title="Shift Management"
                    sub={<><span data-figure>{shifts.length}</span> shift{shifts.length !== 1 ? "s" : ""} defined</>}
                    actions={
                        <RoleGate min="editor">
                            <Button tone="primary" onClick={() => setEditing({})}>
                                <Plus size={15} /> New Shift
                            </Button>
                        </RoleGate>
                    }
                />

                {loading ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {Array(4).fill(0).map((_, i) => <Skeleton key={i} block className="h-40 rounded-card" />)}
                    </div>
                ) : shifts.length === 0 ? (
                    <Panel label="Shifts">
                        <EmptyState title="No shifts yet" body="Create your first shift to get started" />
                    </Panel>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {shifts.map(s => {
                            const duration = calcDuration(s.startTime, s.endTime);
                            return (
                                <Panel key={s._id} padded={false} label={s.name} className="overflow-hidden">
                                    <div className="h-1.5" style={{ background: s.color }} />
                                    <div className="p-4">
                                        <div className="mb-3 flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <div data-figure className="flex h-8 w-8 shrink-0 items-center justify-center rounded-inset text-xs font-medium text-slab-ink" style={{ background: s.color }}>
                                                    {s.code}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                                                    {s.isDefault && <Chip tone="positive">Default</Chip>}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 gap-1">
                                                <RoleGate min="editor">
                                                    <Button tone="ghost" size="sm" onClick={() => setEditing(s)} aria-label="Edit shift">
                                                        <Edit2 size={13} />
                                                    </Button>
                                                </RoleGate>
                                                <RoleGate min="owner">
                                                    <Button tone="ghost" size="sm" onClick={() => setDeleting(s)} aria-label="Delete shift">
                                                        <Trash2 size={13} />
                                                    </Button>
                                                </RoleGate>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="rounded-inset bg-[var(--surface-sunken)] p-2.5">
                                                <p className="text-[10px] text-ink-faint">Start</p>
                                                <p data-figure className="mt-0.5 text-ink">{s.startTime}</p>
                                            </div>
                                            <div className="rounded-inset bg-[var(--surface-sunken)] p-2.5">
                                                <p className="text-[10px] text-ink-faint">End</p>
                                                <p data-figure className="mt-0.5 text-ink">{s.endTime}</p>
                                            </div>
                                            <div className="rounded-inset bg-[var(--surface-sunken)] p-2.5">
                                                <p className="text-[10px] text-ink-faint">Duration</p>
                                                <p data-figure className="mt-0.5 text-ink">{duration}</p>
                                            </div>
                                            <div className="rounded-inset bg-[var(--surface-sunken)] p-2.5">
                                                <p className="text-[10px] text-ink-faint">Break</p>
                                                <p data-figure className="mt-0.5 text-ink">{s.breakMins || 0}m</p>
                                            </div>
                                        </div>

                                        {/* Working days */}
                                        <div className="mt-3 flex flex-wrap gap-1">
                                            {DAYS.map((d, i) => (
                                                <span key={i} className={`flex h-6 w-7 items-center justify-center rounded-inset text-[10px] font-medium ${(s.workingDays || []).includes(i) ? "text-slab-ink" : "bg-[var(--control)] text-ink-faint"}`}
                                                    style={(s.workingDays || []).includes(i) ? { background: s.color } : {}}>
                                                    {d.slice(0, 2)}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Employee count */}
                                        <div className="mt-3 flex items-center gap-1.5 border-t border-hairline pt-3">
                                            <Users size={12} className="text-ink-faint" />
                                            <span className="text-xs text-ink-faint"><span data-figure>{s.assignedCount || 0}</span> employee{s.assignedCount !== 1 ? "s" : ""} assigned</span>
                                        </div>
                                    </div>
                                </Panel>
                            );
                        })}
                    </div>
                )}
            </div>

            {editing !== null && (
                <ShiftModal
                    shift={editing?._id ? editing : null}
                    onSave={handleSave}
                    onClose={() => setEditing(null)}
                />
            )}

            {/* Delete confirm */}
            {deleting && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
                    <div className="frost-bar flex max-h-full w-full min-h-0 max-w-sm flex-col rounded-panel border border-hairline p-6">
                        <PanelHead title="Delete Shift?" />
                        <p className="mb-5 text-sm text-ink-muted">
                            Are you sure you want to delete <strong className="text-ink">{deleting.name}</strong>?
                            {deleting.assignedCount > 0 && <span className="text-[var(--state-overdue-ink)]"> <span data-figure>{deleting.assignedCount}</span> employees are assigned to this shift.</span>}
                        </p>
                        <div className="flex gap-3">
                            <Button tone="secondary" onClick={() => setDeleting(null)} className="flex-1">Cancel</Button>
                            <RoleGate min="owner">
                                <Button tone="destructive" onClick={() => handleDelete(deleting._id)} className="flex-1">Delete</Button>
                            </RoleGate>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
