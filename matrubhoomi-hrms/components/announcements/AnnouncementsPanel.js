// components/announcements/AnnouncementsPanel.js
//
// Writing to the workforce, and seeing who has read it.
//
// Shared by HR (/hr/dashboard/announcements) and the executive office
// (/ceo/dashboard/announcements); only the API base differs. An announcement
// is delivered to the employee app's inbox — the phone raises it as a
// notification within fifteen minutes, or at once when the app is opened — so
// "read" here means somebody opened it in the app, not that it was sent.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Megaphone, Send, RefreshCw, Users, Undo2, AlertCircle, Eye } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const when = (d) =>
  d
    ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "";

export default function AnnouncementsPanel({ apiBase, departmentsUrl }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [picked, setPicked] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [reach, setReach] = useState(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API}${apiBase}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (json?.success) setRows(json.data || []);
      else setErr(json?.message || "Could not load announcements.");
    } catch (e) {
      setErr(e.message || "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}${departmentsUrl}`, { credentials: "include" });
        const json = await res.json().catch(() => null);
        const list = (json?.data || json?.departments || [])
          .map((d) => (typeof d === "string" ? d : d?.name))
          .filter(Boolean);
        setDepartments([...new Set(list)].sort());
      } catch {
        setDepartments([]);
      }
    })();
  }, [departmentsUrl]);

  // How many a draft reaches, asked of the server so interns and leavers are
  // left out exactly as they will be when it is sent.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ audience, departments: picked.join(",") });
        const res = await fetch(`${API}${apiBase}/reach?${q}`, { credentials: "include" });
        const json = await res.json().catch(() => null);
        setReach(json?.success ? json.data.recipients : null);
      } catch {
        setReach(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [audience, picked, apiBase]);

  const ready = title.trim() && body.trim() && (audience === "all" || picked.length > 0) && reach !== 0;

  async function send() {
    setSending(true);
    try {
      const res = await fetch(`${API}${apiBase}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), audience, departments: picked }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success) {
        toast.success(json.message || "Sent.");
        setTitle("");
        setBody("");
        setPicked([]);
        setAudience("all");
        setConfirming(false);
        load();
      } else {
        toast.error(json?.message || "Not sent.");
      }
    } catch (e) {
      toast.error(e.message || "Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  async function retract(row) {
    if (!window.confirm(`Take back "${row.title}"? It disappears from every inbox. People who already read it will have seen it.`)) return;
    const res = await fetch(`${API}${apiBase}/${row._id}`, { method: "DELETE", credentials: "include" });
    const json = await res.json().catch(() => null);
    if (json?.success) {
      toast.success(json.message || "Taken back.");
      load();
    } else toast.error(json?.message || "Could not take it back.");
  }

  const toggle = (d) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const audienceText = useMemo(
    () => (audience === "all" ? "Everyone on the rolls" : picked.length ? picked.join(", ") : "Pick departments"),
    [audience, picked],
  );

  return (
    <div className="px-4 py-5 sm:px-6 space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--ck-ink)" }}>
            Announcements
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ck-ink-3)" }}>
            Arrives on every employee&apos;s phone as a notification, and stays in their app&apos;s inbox.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="ck-btn inline-flex items-center gap-1.5 text-xs disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      <section className="grid gap-5 lg:grid-cols-5">
        {/* ── Compose ───────────────────────────────────────── */}
        <div className="ck-panel p-4 lg:col-span-3 space-y-4">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-8 h-8 rounded-xl" style={{ background: "var(--ck-wash)", color: "var(--ck-accent)" }}>
              <Megaphone className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-semibold" style={{ color: "var(--ck-ink)" }}>New announcement</h2>
          </div>

          <label className="block">
            <span className="ck-label">Title</span>
            <input
              className="ck-input mt-1 w-full"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Office closed on Friday"
            />
            <span className="mt-1 block text-[11px] text-right" style={{ color: "var(--ck-ink-3)" }}>{title.length}/120</span>
          </label>

          <label className="block">
            <span className="ck-label">Message</span>
            <textarea
              className="ck-input mt-1 w-full min-h-[120px]"
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Say it the way you would on the notice board — who it is for, what to do, by when."
            />
            <span className="mt-1 block text-[11px] text-right" style={{ color: "var(--ck-ink-3)" }}>{body.length}/2000</span>
          </label>

          <div>
            <span className="ck-label">Send to</span>
            <div className="mt-2 flex gap-2 flex-wrap">
              {[
                ["all", "Everyone"],
                ["departments", "Some departments"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAudience(key)}
                  className={`ck-btn text-xs ${audience === key ? "is-primary" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {audience === "departments" ? (
              <div className="mt-3 flex gap-2 flex-wrap">
                {departments.length === 0 ? (
                  <span className="text-xs" style={{ color: "var(--ck-ink-3)" }}>No departments found.</span>
                ) : (
                  departments.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggle(d)}
                      className={`ck-chip ${picked.includes(d) ? "is-ok" : ""}`}
                      style={{ cursor: "pointer" }}
                    >
                      {d}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: reach === 0 ? "var(--ck-danger)" : "var(--ck-ink-3)" }}>
              <Users className="w-3.5 h-3.5" />
              {reach == null ? "Working out who this reaches…" : reach === 0 ? "Nobody currently works there" : `Reaches ${reach} ${reach === 1 ? "person" : "people"}`}
            </div>
            {confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--ck-ink-2)" }}>Send to {reach} now?</span>
                <button type="button" className="ck-btn text-xs" onClick={() => setConfirming(false)} disabled={sending}>Not yet</button>
                <button type="button" className="ck-btn is-primary text-xs inline-flex items-center gap-1.5" onClick={send} disabled={sending}>
                  <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Yes, send"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="ck-btn is-primary text-xs inline-flex items-center gap-1.5"
                disabled={!ready}
                onClick={() => setConfirming(true)}
              >
                <Send className="w-3.5 h-3.5" /> Send announcement
              </button>
            )}
          </div>
        </div>

        {/* ── Preview, the way the phone shows it ───────────── */}
        <div className="lg:col-span-2 space-y-2">
          <span className="ck-label">On the phone</span>
          <div className="ck-panel p-4">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-9 h-9 rounded-full shrink-0" style={{ background: "var(--ck-wash)", color: "var(--ck-accent)" }}>
                <Megaphone className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--ck-ink)" }}>{title.trim() || "Your title"}</div>
                <div className="mt-1 text-sm whitespace-pre-wrap break-words" style={{ color: "var(--ck-ink-2)" }}>
                  {body.trim() || "Your message appears here, exactly as written."}
                </div>
                <div className="mt-2 text-[11px]" style={{ color: "var(--ck-ink-3)" }}>Announcement · {audienceText}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What has been said ─────────────────────────────── */}
      <section className="ck-panel p-4">
        <h2 className="ck-label">Sent</h2>
        {err ? (
          <div className="mt-3 flex items-start gap-2 text-sm" style={{ color: "var(--ck-danger)" }}>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {err}
          </div>
        ) : null}
        {!loading && rows && rows.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--ck-ink-3)" }}>Nothing has been announced yet.</p>
        ) : null}
        <div className="mt-2 divide-y" style={{ borderColor: "var(--ck-line)" }}>
          {(rows || []).map((r) => {
            const pct = r.delivered ? Math.round((r.read / r.delivered) * 100) : 0;
            return (
              <article key={r._id} className="py-3 flex items-start gap-3" style={{ borderColor: "var(--ck-line)" }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: r.retractedAt ? "var(--ck-ink-3)" : "var(--ck-ink)" }}>
                      {r.title}
                    </span>
                    {r.retractedAt ? <span className="ck-chip is-warn">Taken back</span> : null}
                    <span className="ck-chip is-info">{r.audience === "all" ? "Everyone" : r.departments.join(", ")}</span>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap break-words" style={{ color: "var(--ck-ink-2)" }}>{r.body}</p>
                  <div className="mt-1.5 text-xs" style={{ color: "var(--ck-ink-3)" }}>
                    {when(r.createdAt)} · {r.sentByName || "—"}
                    {r.retractedAt ? ` · taken back ${when(r.retractedAt)}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0 w-32">
                  {r.retractedAt ? (
                    <span className="text-xs" style={{ color: "var(--ck-ink-3)" }}>{r.recipients} were sent it</span>
                  ) : (
                    <>
                      <div className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums" style={{ color: "var(--ck-ink)" }}>
                        <Eye className="w-3.5 h-3.5" /> {r.read}/{r.delivered}
                      </div>
                      <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ck-panel-2)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--ck-accent)" }} />
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: "var(--ck-ink-3)" }}>{pct}% have read it</div>
                      <button
                        type="button"
                        onClick={() => retract(r)}
                        className="mt-2 inline-flex items-center gap-1 text-xs"
                        style={{ color: "var(--ck-danger)" }}
                      >
                        <Undo2 className="w-3 h-3" /> Take back
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
