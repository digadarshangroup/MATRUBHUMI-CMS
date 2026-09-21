"use client";

// app/track/page.js
//
// The page a CUSTOMER opens to see where their application has got to.
//
// WHO THIS IS FOR, AND WHAT THAT CHANGES
// --------------------------------------
// A farmer, on their own phone, on a village connection, probably standing up.
// Not a member of staff at a desk. Three things follow from that and they shape
// every decision on this page:
//
//   1. ONE answer at the top, in a full sentence. "Next: Requirement
//      collection" is the whole reason they opened it. Everything below
//      supports that line; nothing competes with it.
//   2. Type is LARGER than the internal screens and the tap targets are bigger.
//      This is read at arm's length in daylight, not on a monitor.
//   3. No jargon, no reference numbers as headings, no status codes. "Being
//      reviewed" rather than PENDING_APPROVAL.
//
// WHAT IT DELIBERATELY DOES NOT SHOW
// ----------------------------------
// Why anything was refused, any note an approver wrote, and anything about
// anybody else. The server enforces that — see services/customerPortal.js — and
// this page could not show it even if it tried. Worth stating here too, because
// the temptation to "just add the rejection reason so they know" is exactly the
// change that should be a business decision rather than a patch.

import { useEffect, useState } from "react";
import { Check, Circle, Clock, Phone, CalendarDays, ShieldCheck } from "lucide-react";
import { customerApi, getToken, setToken } from "@/lib/customerApi";
import { COMPANY_NAME, COMPANY_PHONE } from "@/lib/company";

export default function CustomerTrackPage() {
  const [stage, setStage] = useState("loading"); // loading | phone | code | done
  const [phone, setPhone] = useState("");
  const [otpId, setOtpId] = useState(null);
  const [manualCode, setManualCode] = useState(null);
  const [code, setCode] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // A token from earlier in this tab. If it has expired the server says so and
  // we fall back to the phone step rather than showing an empty page.
  useEffect(() => {
    if (!getToken()) {
      setStage("phone");
      return;
    }
    customerApi
      .me()
      .then((res) => {
        setData(res.data);
        setStage("done");
      })
      .catch(() => {
        setToken(null);
        setStage("phone");
      });
  }, []);

  async function askForCode(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await customerApi.requestCode(phone);
      setOtpId(res.data?.otpId || null);
      // Only present when no SMS provider is configured. Shown rather than
      // hidden so a deployment without SMS is still usable and the weaker path
      // is visible instead of disguised.
      setManualCode(res.data?.manualCode || null);
      setStage("code");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signIn(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await customerApi.signIn(phone, otpId, code);
      setToken(res.data.token);
      const me = await customerApi.me();
      setData(me.data);
      setStage("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken(null);
    setData(null);
    setPhone("");
    setCode("");
    setOtpId(null);
    setManualCode(null);
    setStage("phone");
  }

  return (
    <main className="min-h-dvh bg-[var(--g-bg)] px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-7 text-center">
          <p className="text-[13px] font-medium tracking-[0.1em] text-[var(--g-ink-3)] uppercase">
            {COMPANY_NAME}
          </p>
          <h1 className="mt-1.5 text-[26px] leading-tight font-light tracking-[-0.02em] text-[var(--g-ink)]">
            Your application
          </h1>
        </header>

        {stage === "loading" ? (
          <Card><p className="text-center text-[15px] text-[var(--g-ink-3)]">Loading…</p></Card>
        ) : stage === "phone" ? (
          <Card>
            <h2 className="text-[17px] font-medium text-[var(--g-ink)]">Check your progress</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--g-ink-3)]">
              Enter the mobile number you gave us. We will send a code to it.
            </p>

            <form onSubmit={askForCode} className="mt-5">
              <label className="block text-[14px] font-medium text-[var(--g-ink-2)]" htmlFor="phone">
                Mobile number
              </label>
              <div className="relative mt-1.5">
                <Phone size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--g-ink-faint)]" />
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit number"
                  className="w-full rounded-xl border border-[var(--g-line)] bg-white py-3.5 pr-4 pl-11 text-[17px] tracking-wide text-[var(--g-ink)] outline-none focus:border-[var(--g-brand)]"
                />
              </div>

              {error ? <Problem>{error}</Problem> : null}

              <button
                type="submit"
                disabled={busy || phone.length !== 10}
                className="mt-4 w-full rounded-xl bg-[var(--g-brand)] py-3.5 text-[16px] font-medium text-white disabled:opacity-45"
              >
                {busy ? "Sending…" : "Send code"}
              </button>
            </form>
          </Card>
        ) : stage === "code" ? (
          <Card>
            <h2 className="text-[17px] font-medium text-[var(--g-ink)]">Enter the code</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--g-ink-3)]">
              We sent it to {phone.slice(0, 2)}xxxxxx{phone.slice(-2)}.
            </p>

            {manualCode ? (
              <p className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--g-harvest)_14%,transparent)] p-3 text-[14px] text-[var(--g-ink-2)]">
                SMS is not switched on for this system, so here is your code:{" "}
                <b className="tracking-[0.2em]">{manualCode}</b>
              </p>
            ) : null}

            <form onSubmit={signIn} className="mt-5">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className="w-full rounded-xl border border-[var(--g-line)] bg-white py-3.5 text-center text-[24px] tracking-[0.5em] text-[var(--g-ink)] outline-none focus:border-[var(--g-brand)]"
              />

              {error ? <Problem>{error}</Problem> : null}

              <button
                type="submit"
                disabled={busy || code.length < 4}
                className="mt-4 w-full rounded-xl bg-[var(--g-brand)] py-3.5 text-[16px] font-medium text-white disabled:opacity-45"
              >
                {busy ? "Checking…" : "See my progress"}
              </button>
              <button
                type="button"
                onClick={() => { setStage("phone"); setError(null); setCode(""); }}
                className="mt-2 w-full py-2.5 text-[15px] text-[var(--g-ink-3)]"
              >
                Use a different number
              </button>
            </form>
          </Card>
        ) : (
          <Progress data={data} onSignOut={signOut} />
        )}

        <p className="mt-6 text-center text-[13px] text-[var(--g-ink-faint)]">
          Questions? Call us on {COMPANY_PHONE}.
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Card({ children }) {
  return (
    <section className="rounded-2xl border border-[var(--g-line)] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {children}
    </section>
  );
}

function Problem({ children }) {
  return (
    <p role="alert" className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--g-brick)_10%,transparent)] p-3 text-[14px] text-[var(--g-brick)]">
      {children}
    </p>
  );
}

/**
 * The answer, then the ladder.
 *
 * The steps are drawn as a vertical line with a mark per rung — filled for
 * done, ringed for where they are, hollow for what is still ahead. The state is
 * never colour alone: each rung also carries the word, because a farmer reading
 * this in sunlight on a cheap screen should not have to distinguish two greens.
 */
function Progress({ data, onSignOut }) {
  const { customer, scheme, progress, steps, nextVisit, underReview } = data || {};

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[19px] font-medium text-[var(--g-ink)]">{customer?.name}</h2>
          <span className="text-[13px] text-[var(--g-ink-faint)]">{customer?.reference}</span>
        </div>
        {scheme?.name ? (
          <p className="mt-0.5 text-[15px] text-[var(--g-ink-3)]">{scheme.name}</p>
        ) : null}

        {/* THE one line this page exists for. */}
        <p className="mt-4 text-[17px] leading-snug font-medium text-[var(--g-ink)]">
          {progress?.headline}
        </p>

        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[13px] text-[var(--g-ink-3)]">
            <span>{progress?.completed} of {progress?.total} steps done</span>
            <span>{progress?.percent}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--g-line)]">
            <div
              className="h-full rounded-full bg-[var(--g-brand)] transition-[width] duration-500"
              style={{ width: `${progress?.percent || 0}%` }}
            />
          </div>
        </div>

        {underReview ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--g-water)_12%,transparent)] p-3 text-[14px] text-[var(--g-ink-2)]">
            <Clock size={16} className="mt-0.5 shrink-0" />
            Our team is checking your most recent visit. You do not need to do anything.
          </p>
        ) : null}

        {nextVisit ? (
          <p className="mt-3 flex items-start gap-2 text-[14px] text-[var(--g-ink-2)]">
            <CalendarDays size={16} className="mt-0.5 shrink-0 text-[var(--g-ink-faint)]" />
            <span>
              Next visit{nextVisit.step ? ` for ${nextVisit.step}` : ""}
              {nextVisit.scheduledFor
                ? ` on ${new Date(nextVisit.scheduledFor).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`
                : ""}
              {nextVisit.officer ? `, by ${nextVisit.officer}` : ""}.
            </span>
          </p>
        ) : null}
      </Card>

      <Card>
        <h3 className="mb-4 text-[15px] font-medium text-[var(--g-ink-2)]">Your steps</h3>

        {(steps || []).length === 0 ? (
          <p className="text-[15px] text-[var(--g-ink-3)]">
            Your steps will appear here once your application is set up.
          </p>
        ) : (
          <ol className="relative">
            {steps.map((step, i) => {
              const last = i === steps.length - 1;
              const done = step.state === "done";
              const current = step.state === "current";

              return (
                <li key={step.number} className="relative flex gap-3.5 pb-5 last:pb-0">
                  {/* The spine, stopping at the last rung. */}
                  {!last ? (
                    <span
                      aria-hidden
                      className="absolute top-7 left-[13px] w-0.5"
                      style={{
                        bottom: 0,
                        background: done ? "var(--g-brand)" : "var(--g-line)",
                      }}
                    />
                  ) : null}

                  <span
                    aria-hidden
                    className="relative z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: done ? "var(--g-brand)" : current ? "white" : "var(--g-bg)",
                      boxShadow: current
                        ? "inset 0 0 0 2.5px var(--g-brand)"
                        : done
                          ? "none"
                          : "inset 0 0 0 1.5px var(--g-line)",
                    }}
                  >
                    {done ? (
                      <Check size={15} strokeWidth={3} className="text-white" />
                    ) : current ? (
                      <span className="h-2 w-2 rounded-full bg-[var(--g-brand)]" />
                    ) : (
                      <Circle size={7} className="text-[var(--g-ink-faint)]" fill="currentColor" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span
                        className="text-[16px] font-medium"
                        style={{ color: done || current ? "var(--g-ink)" : "var(--g-ink-3)" }}
                      >
                        {step.name}
                      </span>
                      {/* The word, never the colour alone. */}
                      <span className="text-[13px] text-[var(--g-ink-faint)]">
                        {done ? "Done" : current ? "In progress" : "Not started"}
                      </span>
                    </div>

                    {step.description ? (
                      <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--g-ink-3)]">
                        {step.description}
                      </p>
                    ) : null}

                    {done && step.completedAt ? (
                      <p className="mt-1 text-[13px] text-[var(--g-ink-faint)]">
                        Completed{" "}
                        {new Date(step.completedAt).toLocaleDateString("en-IN", {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                        {step.visitedBy ? ` · ${step.visitedBy}` : ""}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {progress?.finished ? (
          <p className="mt-5 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--g-brand)_12%,transparent)] p-3 text-[15px] font-medium text-[var(--g-brand)]">
            <ShieldCheck size={17} /> Everything is complete.
          </p>
        ) : null}
      </Card>

      <button
        type="button"
        onClick={onSignOut}
        className="w-full py-3 text-[15px] text-[var(--g-ink-3)]"
      >
        Sign out
      </button>
    </div>
  );
}
