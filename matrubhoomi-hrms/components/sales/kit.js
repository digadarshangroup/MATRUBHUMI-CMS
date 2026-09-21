// components/sales/kit.js
//
// The small shared vocabulary of the sales screens: how a stage is coloured,
// how a figure is written, the dialog, and the one data-loading hook.
//
// It exists so seven screens agree. A stage rendered amber on one screen and
// grey on the next is not a styling inconsistency, it is two different claims
// about the same lead.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

/**
 * A stage's `tone` is one of five palette NAMES, never a hex — the backend
 * stores the name, this maps it to the token, and a theme change moves both.
 * See DESIGN.md rule 1.
 */
export const TONE_VAR = {
  brand: "var(--g-brand)",
  water: "var(--g-water)",
  harvest: "var(--g-harvest)",
  brick: "var(--g-brick)",
  neutral: "var(--color-ink-faint)",
};

export function toneColor(tone) {
  return TONE_VAR[tone] || TONE_VAR.neutral;
}

/**
 * Status colour is NEVER the only signal — every use of this pairs it with the
 * status word itself (DESIGN.md rule 5).
 */
export const STATUS_TONE = {
  open: "neutral",
  in_progress: "water",
  won: "brand",
  lost: "brick",
  on_hold: "harvest",
  assigned: "neutral",
  accepted: "water",
  completed: "brand",
  partial: "harvest",
  cancelled: "brick",
  expired: "brick",
  pending: "neutral",
  done: "brand",
  unreachable: "harvest",
  rejected: "brick",
  rescheduled: "water",
  resolved: "brand",
  closed: "neutral",
};

export function StageChip({ tone = "neutral", children, title }) {
  const color = toneColor(tone);
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] whitespace-nowrap"
      style={{
        color,
        // color-mix rather than a second hardcoded wash token per tone: the
        // wash is always the same colour at 12%, whichever theme is on.
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 24%, transparent)`,
      }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function StatusChip({ status, children }) {
  return (
    <StageChip tone={STATUS_TONE[status] || "neutral"}>
      {children || String(status || "").replace(/_/g, " ")}
    </StageChip>
  );
}

/* ------------------------------------------------------------------ */
/* Writing figures down                                                */
/* ------------------------------------------------------------------ */

export function rupees(n) {
  const v = Number(n) || 0;
  // The Indian grouping, which is what every number on this screen will be
  // read as out loud. en-IN gives 12,34,567 rather than 1,234,567.
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function shortDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function dateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

/** "4 minutes ago" — the only honest way to render a live board's freshness. */
export function ago(d) {
  if (!d) return "never";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Today, as the backend keys its days: YYYY-MM-DD in the company's timezone. */
export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Run an async loader, keep {data, error, loading}, and cancel in flight.
 *
 * The cancellation is the point. Several of these screens reload on a timer or
 * as a filter changes, and without an abort the SECOND response can arrive
 * before the first — leaving the screen showing the older answer with no
 * indication anything is wrong. A ref-counted "is this still the latest call"
 * check is what keeps the newest answer the one on screen.
 */
export function useAsync(loader, deps = [], { interval } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const callRef = useRef(0);
  const savedLoader = useRef(loader);
  savedLoader.current = loader;

  const run = useCallback(async ({ quiet = false } = {}) => {
    const call = ++callRef.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await savedLoader.current();
      if (call === callRef.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (call === callRef.current) setState({ data: null, error: err, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!interval) return undefined;
    // `quiet` on the timer tick: a live board that blanks to a skeleton every
    // thirty seconds is unreadable. The refresh replaces the data in place.
    const id = setInterval(() => run({ quiet: true }), interval);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, run]);

  return { ...state, reload: run };
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

/**
 * A modal that closes on Escape, traps nothing it should not, and restores the
 * body scroll it locked.
 *
 * That last part is why this exists rather than each screen setting
 * `body.style.overflow` itself: AppShell carries a workaround for modals across
 * this app that navigate away while open and leave scrolling locked forever.
 * One dialog with a real cleanup means the sales screens never need it.
 */
export function Dialog({ open, onClose, title, sub, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(16,24,32,0.42)] p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[18px] bg-[var(--g-surface)] shadow-[var(--g-shadow)] sm:rounded-[18px] ${
          wide ? "sm:max-w-[880px]" : "sm:max-w-[560px]"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--g-line)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-medium tracking-[-0.02em] text-[var(--g-ink)]">{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-[var(--g-ink-3)]">{sub}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-full p-1.5 text-[var(--g-ink-3)] transition-colors hover:bg-[var(--g-surface-2)] hover:text-[var(--g-ink)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--g-line)] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** A count and what it counts, sharing one baseline. Figures are tabular. */
export function Figure({ value, label, unit, tone, href, onClick }) {
  const body = (
    <>
      <p className="text-xs text-[var(--g-ink-3)]">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span
          data-figure
          className="text-[24px] leading-none tracking-[-0.025em] tabular-nums"
          style={{ color: tone ? toneColor(tone) : "var(--g-ink)" }}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-[var(--g-ink-3)]">{unit}</span>}
      </p>
    </>
  );

  // Every figure links somewhere — DESIGN.md rule 4. A figure with nowhere to
  // go renders as plain text rather than as a button that does nothing.
  if (!href && !onClick) return <div className="px-5 py-4">{body}</div>;

  return (
    <a
      href={href}
      onClick={onClick}
      className="block px-5 py-4 text-left transition-colors hover:bg-[var(--g-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--g-brand)]"
    >
      {body}
    </a>
  );
}

/** A labelled row in a detail panel. */
export function Row({ label, children, className = "" }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${className}`}>
      <span className="shrink-0 text-xs text-[var(--g-ink-3)]">{label}</span>
      <span className="min-w-0 text-right text-sm text-[var(--g-ink)]">{children ?? "—"}</span>
    </div>
  );
}

/** The one place an API failure is turned into something a person can read. */
export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  const denied = error.isPermission;
  return (
    <div
      role="alert"
      className="rounded-[10px] border px-4 py-3 text-sm"
      style={{
        borderColor: denied ? "var(--g-hint-edge)" : "var(--g-danger-edge)",
        background: denied ? "var(--g-hint-wash)" : "var(--g-danger-wash)",
        color: denied ? "var(--g-hint)" : "var(--g-danger)",
      }}
    >
      <p className="font-medium">{denied ? "You do not have access to this" : "That did not work"}</p>
      <p className="mt-0.5 opacity-90">{error.message}</p>
      {onRetry && !denied && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}
