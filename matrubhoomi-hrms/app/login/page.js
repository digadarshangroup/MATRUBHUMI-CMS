"use client";
// app/login/page.js
//
// The Matrubhoomi sign-in — plain and light (12 Aug 2026), replacing the honeycomb
// core-flip/attract-auth choreography this page ran for a few weeks. That
// design cost real GPU/VRAM on ordinary machines (IridescentField's own doc
// comment: ten permanently-composited layers, will-change:transform, running
// whether or not anyone is interacting) badly enough to be reported as
// crashing a workstation — see components/onboarding/DepartmentPortal.js's
// header for the fuller story, since it was carrying the identical cost on
// /onboarding. This restores the plain business-software register (Odoo/Zoho
// family) the app used before that experiment: a centred white card on a
// light page, the form always visible — no "click the core to reveal it"
// step, since that step never did anything but add a click.
//
// WHAT DIDN'T CHANGE — every real call this page already made:
//   • POST /api/auth/login, credentials:"include"
//   • the accountant-module token bridge (acc_token)
//   • saveSession() — the first-party cookie + localStorage dance
//     middleware.js and every dashboard guard already depend on
//   • resetDeptRole() so a new sign-in doesn't inherit a cached role
//   • initPushNotifications()
//   • a hard navigation (window.location.assign), not router.push — the
//     session cookie is set on another origin and a client transition can
//     reach the next route's guard before the browser has committed it
//
// PLAIN MARKUP, NOT THE SHARED CEO FORM KIT. components/ceo/ui/Primitives'
// Field/Input/Button read `var(--ink)`/`var(--body-bg)`/etc., which resolve
// against whatever `data-mb-theme` happens to be set on <html> — a global,
// persisted-across-the-app value a visitor could easily be carrying from a
// department dashboard they were in five minutes ago. This page is reached
// signed OUT, before any department chrome exists to have set that value
// intentionally, so it hardcodes its own light palette instead of trusting a
// leftover global one — the same self-containment the pre-hex version of
// this page used, and the one components/onboarding/DepartmentPortal.js's
// square-grid launcher already follows.
import { useState } from "react";
import toast from "react-hot-toast";
import { AlertCircle, ArrowRight, Loader2, X } from "lucide-react";
import { initPushNotifications } from "@/lib/pushNotifications";
import { resetDeptRole } from "@/components/access/useDeptRole";
import { saveSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const ACC_TOKEN_KEY = "acc_token";

function saveAccToken(token) {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(ACC_TOKEN_KEY, token);
    else localStorage.removeItem(ACC_TOKEN_KEY);
  } catch {
    /* private browsing / storage blocked */
  }
}

function BrandMark({ height = 32 }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/matrubhoomi-logo-192.png" alt="Matrubhoomi Farms & Developers" style={{ height, width: "auto" }} className="shrink-0" />
  );
}

/**
 * Forgot password — email → 4-digit OTP → new password, three steps in one
 * small overlay rather than a separate route, so the sign-in card is never
 * left behind. Plain markup and the page's own portal-input/CSS, same reason
 * the sign-in form itself avoids the shared Primitives kit (see file header):
 * this page is reached signed out, before any department theme exists.
 */
function ForgotPasswordModal({ onClose, onDone }) {
  const [step, setStep] = useState("email"); // "email" | "otp" | "reset"
  const [fpEmail, setFpEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState(null);

  async function requestOtp(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Could not send a code.");
        return;
      }
      toast.success(data.message || "A code has been sent to your email.");
      setDevOtp(data._devOtp || null);
      setStep("otp");
    } catch (err) {
      console.error(err);
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/check-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail, otp }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "That code isn't right.");
        return;
      }
      setError(null);
      setStep("reset");
    } catch (err) {
      console.error(err);
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail, otp, newPassword }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Could not reset your password.");
        return;
      }
      toast.success("Password reset. Please sign in with your new password.");
      onDone(fpEmail);
    } catch (err) {
      console.error(err);
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const titles = {
    email: "Reset your password",
    otp: "Enter the code",
    reset: "Set a new password",
  };

  return (
    <div className="fp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[23rem] rounded-lg border border-slate-200 bg-white p-6 shadow-[0_8px_32px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-slate-900">{titles[step]}</p>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              {step === "email" && "We'll email you a 4-digit code."}
              {step === "otp" && <>Sent to <span className="font-medium text-slate-600">{fpEmail}</span></>}
              {step === "reset" && "Code verified — choose a new password."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "email" && (
          <form onSubmit={requestOtp} className="mt-4 space-y-3.5">
            <div>
              <label htmlFor="fp-email" className="mb-1.5 block text-[12px] font-medium text-slate-700">Work email</label>
              <input
                id="fp-email"
                autoFocus
                type="email"
                autoComplete="username"
                placeholder="you@matrubhoomifarms.in"
                value={fpEmail}
                onChange={(e) => setFpEmail(e.target.value)}
                required
                className="portal-input"
              />
            </div>
            {error && <FpError message={error} />}
            <button type="submit" disabled={loading} className="fp-primary-btn">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Sending…" : "Send code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="mt-4 space-y-3.5">
            <div>
              <label htmlFor="fp-otp" className="mb-1.5 block text-[12px] font-medium text-slate-700">4-digit code</label>
              <input
                id="fp-otp"
                autoFocus
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="0000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
                className="portal-input text-center tracking-[0.5em]"
              />
              {devOtp && (
                <p className="mt-1.5 text-[11px] text-slate-400">Dev only — code: <span className="font-medium text-slate-600">{devOtp}</span></p>
              )}
            </div>
            {error && <FpError message={error} />}
            <button type="submit" disabled={loading || otp.length !== 4} className="fp-primary-btn">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Verifying…" : "Verify code"}
            </button>
            <div className="flex items-center justify-between text-[11.5px]">
              <button type="button" onClick={() => { setStep("email"); setOtp(""); setError(null); }} className="text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline">
                Use a different email
              </button>
              <button type="button" onClick={requestOtp} disabled={loading} className="text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline disabled:opacity-50">
                Resend code
              </button>
            </div>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={resetPassword} className="mt-4 space-y-3.5">
            <div>
              <label htmlFor="fp-new-password" className="mb-1.5 block text-[12px] font-medium text-slate-700">New password</label>
              <div className="relative">
                <input
                  id="fp-new-password"
                  autoFocus
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="portal-input pr-14"
                />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="fp-show-btn">
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="fp-confirm-password" className="mb-1.5 block text-[12px] font-medium text-slate-700">Confirm new password</label>
              <input
                id="fp-confirm-password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="portal-input"
              />
            </div>
            {error && <FpError message={error} />}
            <button type="submit" disabled={loading} className="fp-primary-btn">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function FpError({ message }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-[12px] text-red-600">
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (data.success) {
        resetDeptRole();
        initPushNotifications();
        saveAccToken(data.accountantToken);
        saveSession(data.token);
        toast.success("Login successful!");
        // Full page load — see the file header for why.
        window.location.assign(data.redirectTo || "/onboarding");
        return; // stay in the loading state through the navigation
      }

      const message = data.message || "Login failed";
      setError(message);
      toast.error(message);
      setLoading(false);
    } catch (err) {
      console.error(err);
      const message = "Network error - Please check your connection";
      setError(message);
      toast.error(message);
      setLoading(false);
    }
  }

  return (
    <div className="portal-sans grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-[23rem] rounded-lg border border-slate-200 bg-white p-7 shadow-[0_2px_16px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-[15px] font-medium text-slate-900">Sign in to Matrubhoomi</p>
            <p className="text-xs text-slate-400">Manufacturing Suite</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3.5" aria-label="Sign in">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-[12px] font-medium text-slate-700">
              Work email
            </label>
            <input
              id="login-email"
              autoFocus
              type="email"
              autoComplete="username"
              placeholder="you@matrubhoomifarms.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="portal-input"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="login-password" className="text-[12px] font-medium text-slate-700">
                Password
              </label>
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-[11.5px] font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-900 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id="login-password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="portal-input pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12px] text-red-600">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Signing in…" : "Sign in"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="mt-5 border-t border-slate-200 pt-3.5 text-[11px] leading-relaxed text-slate-400">
          Not assigned to a department yet? Speak to HR.
        </p>
      </div>

      {forgotOpen && (
        <ForgotPasswordModal
          onClose={() => setForgotOpen(false)}
          onDone={(resetEmail) => {
            setForgotOpen(false);
            setEmail(resetEmail);
            setPassword("");
          }}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: LOGIN_CSS }} />
    </div>
  );
}

const LOGIN_CSS = `
.portal-sans {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.portal-input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  font-size: 13.5px;
  color: #1e293b;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.portal-input::placeholder { color: #94a3b8; }
.portal-input:focus {
  border-color: #0f172a;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, .1);
}
.fp-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, .45);
}
.fp-primary-btn {
  margin-top: 0.15rem;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 0.5rem;
  background: #0f172a;
  padding: 0.6rem 1rem;
  font-size: 13.5px;
  font-weight: 500;
  color: #fff;
  transition: opacity .15s;
}
.fp-primary-btn:hover { opacity: .9; }
.fp-primary-btn:disabled { cursor: not-allowed; opacity: .6; }
.fp-show-btn {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  border-radius: 9999px;
  padding: 0.25rem 0.5rem;
  font-size: 11px;
  font-weight: 500;
  color: #94a3b8;
  transition: background-color .15s, color .15s;
}
.fp-show-btn:hover { background: #f1f5f9; color: #334155; }
`;
