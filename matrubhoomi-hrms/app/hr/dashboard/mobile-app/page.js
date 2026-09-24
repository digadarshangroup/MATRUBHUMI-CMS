// app/hr/dashboard/mobile-app/page.js
//
// The employee app, from HR's side: who has it, on which version, who has never
// signed in — and the releases the phones are offered.
//
// "Using it" is read from the app's own requests (Employee.appInfo, written by
// the backend's AllEmployeeAppMiddleware), so it means the app was opened this
// week, not that someone was told to install it. A release is published as a
// LINK to the APK; the app compares its build number with the latest release's
// version code and offers the update itself.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import HRDashboardLayout from "@/components/Hr_DashboardLayout";
import {
  Smartphone,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  UserX,
  ArrowUpCircle,
  Link2,
  Trash2,
  Star,
  AlertCircle,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const ago = (d) => {
  if (!d) return "Never";
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
};

const STATES = {
  active: { label: "Using it", chip: "is-ok" },
  idle: { label: "Not this week", chip: "is-warn" },
  never: { label: "Never signed in", chip: "is-danger" },
};

function Figure({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="ck-panel px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" style={{ color: tone }} />
        <span className="ck-label">{label}</span>
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: "var(--ck-ink)" }}>{value}</div>
      {hint ? <div className="mt-1 text-xs" style={{ color: "var(--ck-ink-3)" }}>{hint}</div> : null}
    </div>
  );
}

export default function MobileAppPage() {
  const [data, setData] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ version: "", versionCode: "", downloadUrl: "", releaseNotes: "" });
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [a, v] = await Promise.all([
        fetch(`${API}/api/hr/app/adoption`, { credentials: "include" }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/api/hr/app/versions?app=employee`, { credentials: "include" }).then((r) => r.json()).catch(() => null),
      ]);
      if (a?.success) setData(a.data);
      else setErr(a?.message || "Could not load who is using the app.");
      if (v?.success) setVersions(v.data || []);
    } catch (e) {
      setErr(e.message || "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.rows || []).filter(
      (r) =>
        (filter === "all" || r.state === filter || (filter === "behind" && data?.latest?.versionCode && r.build && r.build < data.latest.versionCode)) &&
        (!needle || `${r.name} ${r.code} ${r.department} ${r.device}`.toLowerCase().includes(needle)),
    );
  }, [data, filter, q]);

  async function publish(e) {
    e.preventDefault();
    setPublishing(true);
    try {
      const res = await fetch(`${API}/api/hr/app/versions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, versionCode: Number(form.versionCode), app: "employee" }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success) {
        toast.success(json.message || "Published.");
        setForm({ version: "", versionCode: "", downloadUrl: "", releaseNotes: "" });
        load();
      } else toast.error(json?.message || "Not published.");
    } catch (e2) {
      toast.error(e2.message || "Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  }

  async function makeLatest(v) {
    const res = await fetch(`${API}/api/hr/app/versions/${v._id}/set-latest`, { method: "PATCH", credentials: "include" });
    const json = await res.json().catch(() => null);
    json?.success ? toast.success(json.message || "Done.") : toast.error(json?.message || "Could not change it.");
    load();
  }

  async function remove(v) {
    if (!window.confirm(`Delete release v${v.version}? Phones will no longer be offered it.`)) return;
    const res = await fetch(`${API}/api/hr/app/versions/${v._id}`, { method: "DELETE", credentials: "include" });
    const json = await res.json().catch(() => null);
    json?.success ? toast.success(json.message || "Deleted.") : toast.error(json?.message || "Could not delete it.");
    load();
  }

  const s = data?.summary;
  return (
    <HRDashboardLayout activeMenu="mobile-app">
      <div className="px-4 py-5 sm:px-6 space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--ck-ink)" }}>Mobile app</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--ck-ink-3)" }}>
              Who has the employee app, on which version — and the release the phones are offered.
            </p>
          </div>
          <button onClick={load} disabled={loading} className="ck-btn inline-flex items-center gap-1.5 text-xs disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </header>

        {err ? (
          <div className="ck-panel px-4 py-3 flex items-start gap-2 text-sm" style={{ color: "var(--ck-danger)" }}>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Figure icon={CheckCircle2} label="Using it" value={loading ? "—" : s?.active ?? 0} hint="Opened the app in the last 7 days" tone="var(--ck-accent)" />
          <Figure icon={Clock} label="Not this week" value={loading ? "—" : s?.idle ?? 0} hint="Signed in before, quiet since" tone="var(--ck-warn)" />
          <Figure icon={UserX} label="Never signed in" value={loading ? "—" : s?.never ?? 0} hint={`of ${s?.total ?? 0} on the rolls (interns have no app)`} tone="var(--ck-danger)" />
          <Figure
            icon={ArrowUpCircle}
            label="On an older version"
            value={loading ? "—" : s?.behind ?? 0}
            hint={data?.latest ? `Latest is v${data.latest.version} (build ${data.latest.versionCode})` : "No release published yet"}
            tone="var(--ck-purple)"
          />
        </section>

        <section className="ck-panel p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="ck-tabs flex gap-1 flex-wrap">
              {[
                ["all", "Everyone"],
                ["active", "Using it"],
                ["idle", "Not this week"],
                ["never", "Never signed in"],
                ["behind", "Needs update"],
              ].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFilter(key)} className={`ck-btn text-xs ${filter === key ? "is-primary" : ""}`}>
                  {label}
                </button>
              ))}
            </div>
            <label className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ck-ink-3)" }} />
              <input className="ck-input pl-8 w-64" placeholder="Name, code, department, phone model" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="ck-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Last opened</th>
                  <th>Version</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="font-medium" style={{ color: "var(--ck-ink)" }}>{r.name}</div>
                      <div className="text-xs" style={{ color: "var(--ck-ink-3)" }}>{r.code || "—"} · {r.designation || "—"}</div>
                    </td>
                    <td>{r.department || "—"}</td>
                    <td><span className={`ck-chip ${STATES[r.state]?.chip || ""}`}>{STATES[r.state]?.label || r.state}</span></td>
                    <td className="tabular-nums">{ago(r.lastSeenAt)}</td>
                    <td className="tabular-nums">
                      {r.version ? `v${r.version}` : "—"}
                      {data?.latest?.versionCode && r.build && r.build < data.latest.versionCode ? (
                        <span className="ml-1.5 ck-chip is-warn">update</span>
                      ) : null}
                    </td>
                    <td className="text-xs" style={{ color: "var(--ck-ink-2)" }}>{r.device ? `${r.device}${r.os ? ` · ${r.os}` : ""}` : "—"}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-sm" style={{ color: "var(--ck-ink-3)" }}>Nobody matches.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-5">
          <form onSubmit={publish} className="ck-panel p-4 lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center w-8 h-8 rounded-xl" style={{ background: "var(--ck-wash)", color: "var(--ck-accent)" }}>
                <Smartphone className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-semibold" style={{ color: "var(--ck-ink)" }}>Publish a release</h2>
            </div>
            <p className="text-xs" style={{ color: "var(--ck-ink-3)" }}>
              Phones on an older build see &ldquo;Update available&rdquo; on their home screen and download from this link.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="ck-label">Version</span>
                <input className="ck-input mt-1 w-full" placeholder="1.5.0" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </label>
              <label className="block">
                <span className="ck-label">Build number</span>
                <input className="ck-input mt-1 w-full" inputMode="numeric" placeholder="15" value={form.versionCode} onChange={(e) => setForm({ ...form, versionCode: e.target.value.replace(/\D/g, "") })} />
              </label>
            </div>
            <label className="block">
              <span className="ck-label">Download link (APK)</span>
              <input className="ck-input mt-1 w-full" placeholder="https://…/matrubhoomi-1.5.0.apk" value={form.downloadUrl} onChange={(e) => setForm({ ...form, downloadUrl: e.target.value })} />
            </label>
            <label className="block">
              <span className="ck-label">What changed</span>
              <textarea className="ck-input mt-1 w-full min-h-[80px]" placeholder="Shown to employees with the update prompt." value={form.releaseNotes} onChange={(e) => setForm({ ...form, releaseNotes: e.target.value })} />
            </label>
            <button type="submit" disabled={publishing || !form.version || !form.versionCode || !form.downloadUrl} className="ck-btn is-primary text-xs inline-flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> {publishing ? "Publishing…" : "Publish release"}
            </button>
          </form>

          <div className="ck-panel p-4 lg:col-span-3">
            <h2 className="ck-label">Releases</h2>
            {versions.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "var(--ck-ink-3)" }}>No release published for the employee app yet.</p>
            ) : (
              <ul className="mt-2 divide-y" style={{ borderColor: "var(--ck-line)" }}>
                {versions.map((v) => (
                  <li key={v._id} className="py-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: "var(--ck-ink)" }}>v{v.version}</span>
                        <span className="text-xs tabular-nums" style={{ color: "var(--ck-ink-3)" }}>build {v.versionCode || "—"}</span>
                        {v.isLatest ? <span className="ck-chip is-ok">Offered to phones</span> : null}
                      </div>
                      {v.releaseNotes ? <p className="mt-1 text-sm whitespace-pre-wrap" style={{ color: "var(--ck-ink-2)" }}>{v.releaseNotes}</p> : null}
                      <div className="mt-1 text-xs break-all" style={{ color: "var(--ck-ink-3)" }}>
                        {new Date(v.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {v.uploadedByName || "HR"} ·{" "}
                        <a href={v.driveDownloadUrl || v.driveViewUrl} target="_blank" rel="noreferrer" style={{ color: "var(--ck-accent)" }}>
                          download link
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!v.isLatest ? (
                        <button type="button" onClick={() => makeLatest(v)} className="ck-btn text-xs inline-flex items-center gap-1" title="Offer this one to phones">
                          <Star className="w-3 h-3" /> Offer
                        </button>
                      ) : null}
                      <button type="button" onClick={() => remove(v)} className="ck-btn is-danger text-xs inline-flex items-center gap-1" title="Delete release">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </HRDashboardLayout>
  );
}
