"use client";

// app/sales/dashboard/help/page.js
//
// The whole sales workflow, explained to the person who runs it.
//
// Written for a sales manager, not a developer: no model names, no field keys,
// no "pipelineKey". Every section answers the same three things — what it is,
// why it exists, what you do — because that is the order a new user asks them
// in. The anchors are linked from the Explain panel on each screen.

import SalesDashboardLayout from "@/components/Sales_DashboardLayout";
import { Panel, PageHead } from "@/components/ceo/ui/Primitives";
import { GLOSSARY } from "@/components/sales/Explain";

const NAV = [
  ["#big-picture", "The big picture"],
  ["#setup", "1 · Setting up"],
  ["#schemes", "2 · Schemes and steps"],
  ["#assignments", "3 · Giving out work"],
  ["#phone", "4 · What the field team sees"],
  ["#approvals", "5 · Approvals"],
  ["#customers", "6 · Customers"],
  ["#customer-page", "7 · The customer's own page"],
  ["#glossary", "Glossary"],
  ["#faq", "Common questions"],
];

function H({ id, children }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-[19px] font-semibold tracking-[-0.01em] text-ink">
      {children}
    </h2>
  );
}
function P({ children }) {
  return <p className="text-[15px] leading-relaxed text-ink">{children}</p>;
}
function Why({ children }) {
  return (
    <p
      className="rounded-lg p-3 text-sm leading-relaxed text-ink"
      style={{ background: "color-mix(in srgb, var(--g-harvest) 10%, transparent)" }}
    >
      <b>Why: </b>{children}
    </p>
  );
}
function Steps({ items }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink">
      {items.map((i) => <li key={i}>{i}</li>)}
    </ol>
  );
}

export default function SalesHelpPage() {
  return (
    <SalesDashboardLayout activeMenu="help">
      <PageHead
        kicker="Sales"
        title="How it works"
        sub="The whole workflow, in plain language. Start at the top if it is your first day."
      />

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="lg:sticky lg:top-6 lg:self-start">
          <ul className="space-y-1 text-sm">
            {NAV.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="block rounded-md px-2 py-1 text-ink-muted hover:bg-[var(--control)] hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-10">
          {/* ── Big picture ─────────────────────────────────────── */}
          <Panel label="The big picture">
            <div className="space-y-4">
              <H id="big-picture">The big picture</H>
              <P>
                The field team does exactly two things: <b>find new customers</b>, and <b>follow up</b> the
                ones we already have. Everything in this module is built around those two jobs.
              </P>
              <P>
                Every customer belongs to one <b>scheme</b> — a ladder of steps such as
                <i> Initial visit → Requirements → Proposal → Agreement</i>. At any moment a customer is
                standing on one step of their scheme. A follow-up visit is always about the step they are
                on, and when that visit is <b>approved</b> they move up one step. When the last step is
                approved, they are finished.
              </P>
              <Why>
                An employee pressing <i>Save</i> on the phone is a <b>claim</b> that a step is done. The
                desk <b>approving</b> it is the company agreeing. Keeping those two apart is what stops a
                customer being recorded as "agreement signed" because somebody filled in a form from a tea
                shop. Nothing moves a customer except an approval.
              </Why>
              <div className="rounded-lg p-4 font-mono text-[13px] leading-relaxed text-ink" style={{ background: "var(--control)" }}>
                Desk sets up form + schemes<br />
                → Desk assigns "bring in 10 new customers" to Ramesh<br />
                → Ramesh registers a farmer, picks the scheme → <b>waiting for approval</b><br />
                → Desk approves → farmer is a customer, on step 1<br />
                → Desk assigns a follow-up for that farmer → scheme, step and form resolved automatically<br />
                → Sunita fills the step-1 form → <b>waiting for approval</b> (farmer has NOT moved)<br />
                → Desk approves → farmer is on step 2<br />
                → … repeat until the last step → <b>finished</b>
              </div>
            </div>
          </Panel>

          {/* ── Setup ───────────────────────────────────────────── */}
          <Panel label="Setting up">
            <div className="space-y-4">
              <H id="setup">1 · Setting up — <span className="text-ink-muted">Configuration</span></H>
              <P>
                Two things live under <b>Sales → Configuration</b>, and they are the only setup you need.
              </P>
              <h3 className="font-semibold text-ink">The New customer form</h3>
              <P>
                The questions an employee asks when registering somebody new — name, village, land, whatever
                you decide. There is one such form for everyone, whichever scheme they end up in. The
                scheme itself is chosen by the employee at the doorstep, so it is not a question you add.
              </P>
              <Why>
                One form means one thing to learn for the field team. If you find you want different
                questions per scheme, put them on that scheme's <i>first step</i> instead.
              </Why>
              <h3 className="font-semibold text-ink">Editing a form that is already in use</h3>
              <P>
                Every save of a form makes a <b>new version</b>. Visits already recorded keep the version
                they were filled against, with the exact wording of the questions at the time, forever. You
                can rename a question freely. You cannot rename its internal key once answers exist — the
                builder shows it greyed out and says why — add a new question instead.
              </P>
            </div>
          </Panel>

          {/* ── Schemes ─────────────────────────────────────────── */}
          <Panel label="Schemes and steps">
            <div className="space-y-4">
              <H id="schemes">2 · Schemes and steps — <span className="text-ink-muted">the Scheme Builder</span></H>
              <P>
                A scheme is a journey. Create one, give it a name, then add its steps in order. Each step has
                its own form — the questions asked on <i>that</i> visit.
              </P>
              <Steps items={[
                "Configuration → New scheme → give it a name.",
                "Open it → Add step for each rung of the ladder, in order.",
                "On each step, build or attach a form (the row says \"No form — add one\" until you do).",
                "Tick \"This step ends the scheme\" on the final step, with outcome Won.",
                "The warning box at the top tells you if the scheme cannot be used yet, and why.",
              ]} />
              <h3 className="font-semibold text-ink">The switches on a step</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink">
                <li><b>Needs approval</b> (on by default) — a visit for this step waits for the desk before the customer moves. Turn it off only for a step nobody needs to double-check, such as "called, no answer".</li>
                <li><b>Photograph / Location / Customer OTP required</b> — the server refuses a visit without them, whatever the phone says.</li>
                <li><b>Ends the scheme</b> — reaching this step finishes the customer. Won makes them a customer; Lost closes them.</li>
              </ul>
              <h3 className="font-semibold text-ink">Changing a scheme people are already in</h3>
              <P>
                <b>Reorder</b> changes what comes <i>next</i> for customers mid-way; it never moves anybody.
                <b> Archive</b> a step and it disappears from the ladder but every visit recorded against it
                stays readable; you cannot archive a step somebody is standing on. A scheme with customers
                in it can be <b>closed to new customers</b> (nobody new enters; everyone inside carries on)
                or, once empty, archived. Nothing is ever deleted once it has been used.
              </P>
              <Why>
                This system will run for years. A visit from 2026 must still make sense in 2029 after the
                form has been rewritten five times and the steps rearranged twice. Versioning and archiving
                are how it stays true.
              </Why>
            </div>
          </Panel>

          {/* ── Assignments ─────────────────────────────────────── */}
          <Panel label="Giving out work">
            <div className="space-y-4">
              <H id="assignments">3 · Giving out work — <span className="text-ink-muted">Assignments</span></H>
              <P>The first choice on the Assign screen is the kind of work. Everything after it differs.</P>
              <h3 className="font-semibold text-ink">New customer</h3>
              <Steps items={[
                "Pick the people and give each a target — \"Ramesh 5, Sunita 5\", or use Split.",
                "Set the date and any instructions. You do not pick customers; they do not exist yet.",
                "On the phone the employee registers each person and chooses the scheme they belong to.",
                "Each registration lands in Approvals. The target counts approved registrations only.",
              ]} />
              <h3 className="font-semibold text-ink">Follow-up</h3>
              <Steps items={[
                "Search for the customer by name, phone, village or reference. The list tells you if someone cannot be assigned, and why.",
                "The system shows their scheme, the step they are on, and the exact form version — you never choose these.",
                "Say who visits, set the date, assign. One task per customer.",
                "The employee's phone already knows the customer, the scheme and the step; they just fill the step's form.",
              ]} />
              <Why>
                The customer decides the scheme; the scheme and their position decide the step; the step
                decides the form. Letting a manager — or an employee — pick those by hand is how a step-3
                form gets filled for somebody on step 1. Those details are <b>frozen onto the task</b> when
                it is assigned, so rearranging the scheme on Tuesday cannot change what Monday's task asked.
              </Why>
              <h3 className="font-semibold text-ink">Reading a task's progress</h3>
              <P>
                <b>Approved</b> is the headline number. <b>Waiting</b> means submitted, desk has not decided.
                <b> To redo</b> means sent back. They are shown side by side and never added together, and
                the target never grows because somebody had to try twice.
              </P>
            </div>
          </Panel>

          {/* ── Phone ───────────────────────────────────────────── */}
          <Panel label="The field team">
            <div className="space-y-4">
              <H id="phone">4 · What the field team sees</H>
              <P>
                After signing in once with signal, the phone downloads everything it needs — the tasks, every
                form those tasks use, the registration form and the list of schemes — and works with no
                signal at all. Visits are saved on the phone instantly and sent when a connection returns.
                Sending the same visit twice because of bad signal never creates two records.
              </P>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink">
                <li><b>New customer task</b> — shows target · approved · waiting · to redo · remaining, and a <i>Register a customer</i> button. Registration asks for name, phone and village, then <i>which scheme</i>, then the form.</li>
                <li><b>Follow-up task</b> — shows the customer, their scheme, the step this visit is for and the form. The employee chooses none of it.</li>
                <li>After saving, the phone says the visit is saved and <i>waiting for approval</i>. It never says a step is done until the desk approves.</li>
                <li>A rejected visit comes back to the phone as <i>sent back</i> with the desk's reason and a <i>Redo this visit</i> button.</li>
              </ul>
            </div>
          </Panel>

          {/* ── Approvals ───────────────────────────────────────── */}
          <Panel label="Approvals">
            <div className="space-y-4">
              <H id="approvals">5 · Approvals</H>
              <P>
                Every visit for a step that needs approval appears here, oldest first. Open one to see the
                customer, the scheme and step, the answers exactly as asked (with the form version), the
                photos, where the phone was, and the customer's earlier visits for comparison.
              </P>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink">
                <li><b>Approve</b> — for a registration: the person becomes a customer on step 1 of their scheme. For a follow-up: the step is done and they move up exactly one step.</li>
                <li><b>Reject</b> — a reason is required. The customer stays where they are, the record is kept, and the task reopens on the employee's phone with your reason.</li>
                <li><b>Arrived late</b> — the visit was captured for a step the customer has since left (usually because it sat in the phone's queue). Approving it keeps it as a record but does not move the customer. Use the <i>Conflicts</i> filter to find these.</li>
              </ul>
              <Why>
                Two managers can safely open the same row. Whoever clicks first decides; the other is told
                "already approved" and nothing happens twice. Only people with the <b>approver</b> role can
                decide — the server enforces it, not the screen.
              </Why>
            </div>
          </Panel>

          {/* ── Customers ───────────────────────────────────────── */}
          <Panel label="Customers">
            <div className="space-y-4">
              <H id="customers">6 · Customers</H>
              <P>
                A lead and a customer are the same person at different points of the same conversation, so
                they are one record. <b>Workflow</b> on any row opens the full story: their scheme, the step
                they are on, the ladder with ticks, every visit with its form version, every task, and every
                action anybody took — with reasons — newest first.
              </P>
              <h3 className="font-semibold text-ink">The two corrections</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink">
                <li><b>Change scheme</b> — for a customer put in the wrong scheme, or one who legitimately moves to another. Their history under the old scheme is closed and kept, never rewritten; open tasks under it are cancelled; they start the new scheme at its first step. Needs a reason.</li>
                <li><b>Change step</b> — moves them by hand, for a step done off the record. Never rewrites a visit. Needs a reason.</li>
              </ul>
              <P>Both are approver-only and both go on the customer's permanent history. They are not edits.</P>
            </div>
          </Panel>

          {/* ── Customer page ───────────────────────────────────── */}
          <Panel label="The customer's own page">
            <div className="space-y-4">
              <H id="customer-page">7 · The customer's own page</H>
              <P>
                A customer can open <b>/track</b> on their own phone, enter their mobile number, type the code
                sent to it, and see their scheme, which steps are done, which are ahead, and when the next
                visit is. It shows nothing about anyone else and never shows why a visit was sent back —
                that is a conversation between the desk and the field team, not a web page.
              </P>
            </div>
          </Panel>

          {/* ── Glossary ────────────────────────────────────────── */}
          <Panel label="Glossary">
            <div className="space-y-4">
              <H id="glossary">Glossary — what the words on the chips mean</H>
              <dl className="divide-y divide-[var(--color-hairline)]">
                {GLOSSARY.map(([term, meaning]) => (
                  <div key={term} className="grid gap-1 py-2.5 sm:grid-cols-[220px_minmax(0,1fr)]">
                    <dt className="text-sm font-medium text-ink">{term}</dt>
                    <dd className="text-sm text-ink-muted">{meaning}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>

          {/* ── FAQ ─────────────────────────────────────────────── */}
          <Panel label="Common questions">
            <div className="space-y-5">
              <H id="faq">Common questions</H>
              {[
                ["Why can't I assign a follow-up to this customer?",
                 "The picker says why on the row. Usually: their registration is still waiting for approval; they have finished their scheme; or somebody already has an open task for that same step. The last one can be overridden deliberately by an approver."],
                ["The employee submitted five, but the task says 2 of 5. Why?",
                 "Progress counts approved visits only. The other three are \"waiting\" (not decided yet) or \"to redo\" (sent back). Check Approvals."],
                ["Why did the customer not move when the visit was submitted?",
                 "Because submitting is a claim, not a decision. Approve it in Approvals and they move one step."],
                ["I changed the form — will old visits break?",
                 "No. Each save is a new version. Old visits keep their version and their exact question wording."],
                ["What does \"arrived late\" mean?",
                 "The phone sent a visit for a step the customer had already left — it sat in the offline queue while somebody else moved them on. It is kept and shown to you; approving it records it without moving the customer."],
                ["Why can't I delete this scheme / step?",
                 "Because something references it — a customer, a task or a past visit. Archive it instead; history stays readable. Only something never used can be deleted."],
                ["Why does a new step wait for approval by default?",
                 "Because a customer moving up a ladder is a business fact, and the company — not the phone — should be the one to say it happened. Turn it off per step if a step genuinely needs no second look."],
                ["Who can approve?",
                 "Anyone with the approver or owner role in the Sales department (Executive → Access Control). Editors can set up schemes and assign work but cannot approve, change a customer's scheme or reorder a ladder."],
              ].map(([q, a]) => (
                <div key={q}>
                  <p className="font-medium text-ink">{q}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{a}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </SalesDashboardLayout>
  );
}
