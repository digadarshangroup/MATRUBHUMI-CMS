// components/sales/Explain.js
//
// The plain-language layer of the sales screens.
//
// WHY THIS EXISTS
// ---------------
// The sales module has a real model behind it — schemes, steps, claims,
// approvals — and a screen that shows the model without saying what it is FOR
// leaves a desk user guessing. Every sales screen now opens with one short
// panel that answers three questions in order: what is this for, what do I do
// here, and what happens after I do it. It can be closed, and stays closed for
// that screen on that browser, so it teaches once and then gets out of the way.
//
// The words in here are the product's vocabulary. If a status is renamed in
// the backend, rename it here too — the glossary is where a user looks up what
// "waiting" or "sent back" means, and a glossary that disagrees with the chips
// is worse than none.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle, X, BookOpen } from "lucide-react";

/** One entry per screen. Keep each answer to two sentences a farmer's manager would say. */
export const SCREENS = {
  configuration: {
    title: "What this screen is for",
    why: "Everything the field team is asked, and everything that happens to a customer afterwards, is set up here — by you, without a developer.",
    what: [
      "New customer form: the questions an employee asks when registering somebody new. One form for everyone.",
      "Schemes: the journeys a customer can be put through. Each scheme has its own ordered steps, and each step has its own form.",
    ],
    next: "Open a scheme to add or change its steps. Nothing you change here alters visits already recorded — they keep the version they were filled against.",
    guide: "#setup",
  },
  scheme: {
    title: "What a scheme is",
    why: "A scheme is the ladder a customer climbs — for example: Initial visit → Requirements → Proposal → Agreement. Different products or programmes can have completely different ladders.",
    what: [
      "Each step has a form the employee fills on that visit. Add the step first, then build or attach its form.",
      "\"Needs approval\" (on by default) means a visit for that step waits for the desk to accept it before the customer moves up.",
      "Mark the last step as \"ends the scheme\" so the system knows when a customer is finished.",
    ],
    next: "Reordering changes what comes next for customers mid-way; it never moves anybody. A step someone is standing on cannot be archived until they are moved on.",
    guide: "#schemes",
  },
  tasks: {
    title: "Two kinds of work",
    why: "The field team does exactly two things: find NEW customers, or FOLLOW UP an existing one. They are assigned differently because they are different.",
    what: [
      "New customer: you give a person a TARGET (\"bring in 10\"). You do not pick customers — they do not exist yet. The employee chooses the scheme for each one as they register them.",
      "Follow-up: you pick the CUSTOMER. The system works out their scheme, the step they are on, and the exact form — you never choose those. One task per customer.",
    ],
    next: "A submitted visit is not finished — it goes to Approvals. Progress on a task counts approved visits only; \"waiting\" and \"to redo\" are shown beside it, never mixed in.",
    guide: "#assignments",
  },
  approvals: {
    title: "Why approval exists",
    why: "When an employee presses Save on the phone they are CLAIMING a step is done. Nothing moves until someone here agrees. This is what stops a customer being marked as \"agreement signed\" because a form was filled in a tea shop.",
    what: [
      "Approve: the step counts as done, the customer moves up exactly one step, and the next follow-up can be assigned.",
      "Reject: the customer stays where they are, the record is kept, and the task reopens on the employee's phone with your reason.",
      "\"Arrived late\": the visit was captured for a step the customer has since left. Approving keeps it as a record without moving them.",
    ],
    next: "Oldest first, because the person waiting longest is the one to deal with next. Two people approving the same row at once is harmless — the second is told it was already decided.",
    guide: "#approvals",
  },
  customers: {
    title: "Where every customer stands",
    why: "A customer is one person from the first knock to the end of their scheme. This list is the book; open Workflow to see the whole story of one person.",
    what: [
      "Workflow shows their scheme, the step they are on, every visit with the form version it used, and every action anybody took, with reasons.",
      "Change scheme / Change step are for corrections — wrong scheme at registration, a step done off the record. Both need a reason and are written to the customer's history.",
    ],
    next: "A customer cannot receive a follow-up while their registration is unapproved, after they have finished, or while somebody already has an open task for the same step. The picker tells you which.",
    guide: "#customers",
  },
  workflow: {
    title: "Reading this page",
    why: "Everything here comes from what actually happened — approved visits and recorded actions — not from guessing backwards from where the customer is now.",
    what: [
      "The ladder: ✓ done, ● where they are, ○ still ahead. A step is \"done\" only when a visit for it was approved.",
      "Visits: every form ever filled, showing the version it was answered against, so a form edited last month still reads as it was.",
      "History: every action, newest first, with who did it and why. Never trimmed.",
    ],
    next: "Use Change scheme only when they were put in the wrong one; the old history is kept, not rewritten. Use Change step only to correct a position — it never rewrites a visit.",
    guide: "#customers",
  },
};

/** What each word on a chip means. Shared by the guide and the tooltips. */
export const GLOSSARY = [
  ["pending approval / waiting", "Submitted from the field; the desk has not decided yet. The customer has not moved."],
  ["approved", "The desk accepted it. For a follow-up, the customer moved up one step. For a registration, they became a real customer."],
  ["rejected / sent back", "The desk refused it, with a reason. The customer stays put; the employee is asked to redo the visit."],
  ["applied", "This step did not ask for approval, so the visit counted the moment it was submitted."],
  ["arrived late", "Captured for a step the customer has since left (usually from the phone's offline queue). Kept as a record; never moves the customer."],
  ["rework", "A task with at least one visit sent back. The employee has something to redo."],
  ["completed (task)", "Every unit of work on the task was approved — not merely submitted."],
  ["pending_approval (customer)", "Registered in the field, not yet accepted. Cannot be given a follow-up yet."],
  ["open / in progress (customer)", "An accepted customer moving through their scheme."],
  ["won", "Reached the step that ends their scheme successfully. They are a customer."],
  ["lost", "Marked as not proceeding by the desk."],
  ["version", "Every edit to a form makes a new version. Old visits keep the version they were filled against, forever."],
];

/**
 * The panel itself. `id` picks the copy; closing it is remembered per screen.
 */
export function Explain({ id }) {
  const copy = SCREENS[id];
  const key = `mb_explain_closed_${id}`;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "1") setOpen(false);
    } catch {
      /* private mode — show it every time, which is fine */
    }
  }, [key]);

  if (!copy) return null;

  function close() {
    setOpen(false);
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
  }
  function reopen() {
    setOpen(true);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={reopen}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <HelpCircle size={15} /> What is this screen for?
      </button>
    );
  }

  return (
    <section
      aria-label={copy.title}
      className="mb-5 rounded-xl p-4"
      style={{
        background: "color-mix(in srgb, var(--g-water) 8%, transparent)",
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--g-water) 22%, transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <HelpCircle size={16} style={{ color: "var(--g-water)" }} /> {copy.title}
        </h2>
        <button type="button" onClick={close} aria-label="Close" className="text-ink-faint hover:text-ink">
          <X size={16} />
        </button>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink">{copy.why}</p>

      <ul className="mt-2.5 space-y-1.5 text-sm text-ink">
        {copy.what.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--g-water)" }} />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{copy.next}</p>

      <Link
        href={`/sales/dashboard/help${copy.guide || ""}`}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        style={{ color: "var(--g-water)" }}
      >
        <BookOpen size={14} /> Read the full guide
      </Link>
    </section>
  );
}

export default Explain;
