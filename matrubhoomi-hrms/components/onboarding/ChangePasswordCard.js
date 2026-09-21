// components/onboarding/ChangePasswordCard.js
//
// Self-service password change, on the portal where everybody already lands.
//
// It posts to /api/auth/change-password, which changes the credential belonging
// to whichever identity the caller signed in as — HR record, department login,
// or accounting-only user. That matters: an employee's new password has to go
// onto their Employee document, because that is the one the sign-in path checks.
// Writing it anywhere else would hand them a password that never works.
//
// Collapsed by default. It is a rare action next to a frequent one (choosing a
// department), and an always-open password form on a shared screen is an
// invitation.
//
// Every colour here is one of the portal's own custom properties, so the card
// follows the theme rather than pinning a light one inside a dark page.
//
// NO CURRENT-PASSWORD FIELD, ON PURPOSE. This only ever renders behind an
// already-verified session (the portal you land on signed in) — re-typing the
// password you used seconds ago to reach this exact screen was friction with
// no real payoff for that case. The server trusts the session token itself
// instead when the field is absent (see change-password in deptAuth.js); it
// still checks a current password if one IS sent, so this is additive, not a
// removal of the check for every caller.

"use client";

import { useState } from "react";
import { KeyRound, Loader2, Check, AlertCircle, ChevronDown } from "lucide-react";
import { saveSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [form, setForm] = useState({ next: "", confirm: "" });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setDone("");

    // Checked here only to save a round trip and give an immediate answer; the
    // server enforces the same rules itself.
    if (form.next !== form.confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    if (form.next.length < 8) {
      setError("The new password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword: form.next }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(data?.message || "The password could not be changed.");
        return;
      }

      // Changing the password bumps the account's token version, which kills
      // every token issued before it — INCLUDING the copy this browser is
      // holding. The server hands back a replacement precisely so the person
      // who just changed their own password is not signed out for it; storing
      // it is what makes that work, because the stale copy is sent as a Bearer
      // header and would now be rejected on the very next request.
      saveSession(data.token);

      setDone(data.message || "Password changed.");
      setForm({ next: "", confirm: "" });

      // Some identities invalidate every session on a password change, this one
      // included. Rather than leave a dead cookie in place, start over cleanly.
      if (data.reauth) {
        setTimeout(() => window.location.assign("/onboarding"), 1600);
      }
    } catch {
      setError("Cannot reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pwd">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setError(""); setDone(""); }}
        className="pwd-toggle"
        aria-expanded={open}
      >
        <span className="pwd-toggle-label">
          <KeyRound size={14} />
          Change password
        </span>
        <ChevronDown size={14} className={open ? "pwd-chev is-open" : "pwd-chev"} />
      </button>

      {open && (
        <form onSubmit={submit} className="pwd-form">
          <input
            type="password" required minLength={8} autoComplete="new-password"
            value={form.next} onChange={set("next")}
            placeholder="New password" className="pwd-input"
          />
          <input
            type="password" required minLength={8} autoComplete="new-password"
            value={form.confirm} onChange={set("confirm")}
            placeholder="Repeat new password" className="pwd-input"
          />

          {error && (
            <p className="pwd-msg is-error">
              <AlertCircle size={13} /> {error}
            </p>
          )}
          {done && (
            <p className="pwd-msg is-done">
              <Check size={13} /> {done}
            </p>
          )}

          <button type="submit" disabled={busy} className="pwd-submit">
            {busy && <Loader2 size={14} className="spin" />}
            Update password
          </button>

          <p className="pwd-note">
            This changes the password you just signed in with. Anywhere else you
            are signed in will be logged out.
          </p>
        </form>
      )}

      <style dangerouslySetInnerHTML={{ __html: CARD_CSS }} />
    </div>
  );
}

const CARD_CSS = `
.pwd { width: 100%; max-width: 22rem; }

.pwd-toggle {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: .5rem;
  height: 40px;
  padding-inline: .85rem;
  border: 1px solid var(--line-c);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink-2);
  font: inherit; font-size: 13px; font-weight: 520;
  cursor: pointer;
  transition: border-color .16s, color .16s;
}
.pwd-toggle:hover { border-color: var(--line-strong); color: var(--ink); }
.pwd-toggle:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; box-shadow: var(--ring); }
.pwd-toggle-label { display: inline-flex; align-items: center; gap: .45rem; }
.pwd-chev { transition: transform .18s ease; }
.pwd-chev.is-open { transform: rotate(180deg); }

.pwd-form {
  margin-top: .5rem;
  padding: .85rem;
  border: 1px solid var(--line-c);
  border-radius: 12px;
  background: var(--surface);
  display: flex; flex-direction: column; gap: .5rem;
}

.pwd-input {
  height: 38px;
  padding-inline: .7rem;
  font-size: 13px;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--line-c);
  border-radius: 9px;
  outline: none;
  transition: border-color .16s, box-shadow .16s;
}
.pwd-input::placeholder { color: var(--ink-faint); }
.pwd-input:focus { border-color: var(--brand); box-shadow: var(--ring); }
.pwd-input:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }

.pwd-msg { display: flex; align-items: flex-start; gap: .35rem; font-size: 11.5px; line-height: 1.45; }
.pwd-msg.is-error { color: var(--danger); }
.pwd-msg.is-done  { color: var(--brand); }
.pwd-msg svg { flex-shrink: 0; margin-top: 1px; }

.pwd-submit {
  height: 38px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--brand);
  color: var(--brand-ink);
  font: inherit; font-size: 13px; font-weight: 600;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
  transition: background-color .16s;
}
.pwd-submit:hover:not(:disabled) { background: var(--brand-strong); }
.pwd-submit:disabled { opacity: .6; cursor: default; }
.pwd-submit:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; box-shadow: var(--ring); }

.pwd-note { font-size: 11.5px; line-height: 1.5; color: var(--ink-faint); }

@media (pointer: coarse) {
  .pwd-toggle, .pwd-input, .pwd-submit { height: 44px; }
}
`;
