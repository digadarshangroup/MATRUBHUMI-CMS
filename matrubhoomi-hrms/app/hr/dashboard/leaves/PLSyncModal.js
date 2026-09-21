"use client";

// app/hr/dashboard/leaves/PLSyncModal.js
// ─────────────────────────────────────────────────────────────────────────────
// PL SYNC MODAL — opened from the "Sync PL" button on the leaves page header.
//
// Flow:
//   1. Modal opens, immediately POSTs to /sync-pl-eligibility with dryRun=true
//      to fetch the preview (no DB writes yet).
//   2. Shows: "N employees will be granted 18 PL. M already have PL. K below
//      threshold." with a list of who'd be granted.
//   3. User clicks "Apply" → POSTs again with dryRun=false → actual grant.
//   4. Shows success state with confirmed counts.
//
// Safety:
//   • Already-PL-eligible employees are SKIPPED (no renewal — preserves any
//     PL they've already used).
//   • Employees below the daysRequiredForPL threshold are never touched.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { Button } from "@/components/ceo/ui/Primitives";
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Award,
  ChevronRight,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function apiFetch(url, opts = {}) {
  return fetch(`${API}${url}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.message || "Request failed");
    return d;
  });
}

export default function PLSyncModal({ onClose, onSuccess, showBanner }) {
  const [step, setStep] = useState("preview"); // preview | applying | done | error
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // Fetch dry-run preview on mount.
  useEffect(() => {
    apiFetch("/api/hr/leaves/sync-pl-eligibility", {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    })
      .then((d) => setPreview(d.data))
      .catch((e) => {
        setError(e.message);
        setStep("error");
      })
      .finally(() => setLoading(false));
  }, []);

  const apply = async () => {
    setStep("applying");
    try {
      const d = await apiFetch("/api/hr/leaves/sync-pl-eligibility", {
        method: "POST",
        body: JSON.stringify({ dryRun: false }),
      });
      setResult(d.data);
      setStep("done");
      showBanner?.("success", `Granted PL to ${d.data.granted} employee(s)`);
      onSuccess?.();
    } catch (e) {
      setError(e.message);
      setStep("error");
    }
  };

  const canApply =
    step === "preview" && !loading && preview && preview.eligible > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="frost-bar relative flex max-h-full min-h-0 w-full max-w-lg flex-col rounded-panel border border-hairline">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[var(--state-positive-ink)]">
            <Award className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-medium tracking-[-0.02em] text-ink">
              Sync PL Eligibility
            </h2>
            <p className="text-xs text-ink-faint">
              {step === "preview" && "Preview before applying"}
              {step === "applying" && "Granting PL…"}
              {step === "done" && "Complete"}
              {step === "error" && "Something went wrong"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-6 w-6 animate-spin text-ink-faint" />
              <p className="text-xs text-ink-faint">
                Checking eligibility for all active employees…
              </p>
            </div>
          ) : step === "error" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--state-overdue)_20%,transparent)]">
                <AlertCircle className="h-7 w-7 text-[var(--state-overdue-ink)]" />
              </div>
              <p className="text-[15px] font-medium text-ink">Failed</p>
              <p className="max-w-sm text-center text-xs text-ink-muted">
                {error}
              </p>
            </div>
          ) : step === "done" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--state-positive)_20%,transparent)]">
                <CheckCircle2 className="h-7 w-7 text-[var(--state-positive-ink)]" />
              </div>
              <p className="text-[15px] font-medium text-ink">PL Granted</p>
              <p className="text-center text-xs text-ink-muted">
                <b data-figure className="font-medium text-ink">
                  {result?.granted}
                </b>{" "}
                employee
                {result?.granted === 1 ? " has" : "s have"} been granted{" "}
                <b data-figure className="font-medium text-ink">
                  {result?.plPerYear} PL
                </b>{" "}
                for <span data-figure>{result?.year}</span>.
              </p>
            </div>
          ) : step === "applying" ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--state-positive-ink)]" />
              <p className="text-xs text-ink-faint">
                Granting PL to <span data-figure>{preview?.eligible}</span>{" "}
                employee
                {preview?.eligible === 1 ? "" : "s"}…
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Summary tiles ── */}
              <div className="grid grid-cols-3 gap-2">
                <SummaryTile
                  value={preview.eligible}
                  label="Will Grant"
                  tone="emerald"
                />
                <SummaryTile
                  value={preview.alreadyEligible}
                  label="Already Have PL"
                  tone="slate"
                />
                <SummaryTile
                  value={preview.notYetEligible}
                  label="Below Threshold"
                  tone="amber"
                />
              </div>

              {/* ── Policy notes ── */}
              <div className="space-y-1 rounded-inset bg-[var(--surface-sunken)] p-3 text-xs text-ink-muted">
                <p>
                  <b className="font-medium text-ink">Threshold:</b>{" "}
                  <span data-figure>{preview.threshold}</span> working days
                  since joining
                </p>
                <p>
                  <b className="font-medium text-ink">Grant amount:</b>{" "}
                  <span data-figure>{preview.plPerYear}</span> PL days for{" "}
                  <span data-figure>{preview.year}</span>
                </p>
                <p>
                  <b className="font-medium text-ink">Skipped:</b> Employees who
                  already have PL —{" "}
                  <i>no renewal, their consumed PL is preserved</i>
                </p>
              </div>

              {/* ── Who will get PL (list) ── */}
              {preview.eligible > 0 && preview.list?.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                    Employees to be granted PL (
                    <span data-figure>{preview.list.length}</span>)
                  </p>
                  <div className="scroll-slim max-h-64 divide-y divide-hairline overflow-y-auto rounded-inset border border-hairline">
                    {preview.list.map((p) => (
                      <div
                        key={p.employeeId}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--row-hover)]"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)] text-[10px] font-medium text-[var(--state-positive-ink)]">
                          {(p.name || "")
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink">
                            {p.name}
                          </p>
                          <p className="truncate text-[11px] text-ink-faint">
                            <span data-figure>{p.biometricId}</span> ·{" "}
                            {p.department || "—"}
                          </p>
                        </div>
                        <span
                          data-figure
                          className="text-[10px] text-ink-muted"
                        >
                          {p.workingDays}d
                        </span>
                        <ChevronRight className="h-3 w-3 shrink-0 text-ink-faint" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.eligible === 0 && (
                <div className="py-6 text-center text-sm text-ink-muted">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-[var(--state-positive-ink)]" />
                  All eligible employees already have PL — nothing to sync.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-5 py-3">
          {step === "done" || step === "error" ? (
            <Button
              tone="primary"
              size="sm"
              onClick={onClose}
              className="ml-auto"
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                tone="ghost"
                size="sm"
                onClick={onClose}
                disabled={step === "applying"}
              >
                Cancel
              </Button>
              <Button
                tone="primary"
                size="sm"
                onClick={apply}
                disabled={!canApply || step === "applying"}
                className="ml-auto"
              >
                {step === "applying" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Applying…
                  </>
                ) : (
                  <>
                    <Award className="h-4 w-4" /> Grant PL to{" "}
                    <span data-figure>{preview?.eligible || 0}</span> Employees
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ value, label, tone = "slate" }) {
  const tones = {
    emerald:
      "bg-[color-mix(in_srgb,var(--state-positive)_20%,transparent)] text-[var(--state-positive-ink)]",
    slate: "bg-[var(--surface-sunken)] text-ink",
    amber:
      "bg-[color-mix(in_srgb,var(--state-rework)_22%,transparent)] text-[var(--state-rework-ink)]",
  };
  return (
    <div className={`rounded-inset p-3 text-center ${tones[tone]}`}>
      <p data-figure className="text-[22px] leading-none tracking-[-0.025em]">
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-medium tracking-[0.09em] uppercase opacity-80">
        {label}
      </p>
    </div>
  );
}
