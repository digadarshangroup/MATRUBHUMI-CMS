// app/page.js
//
// The landing page — the one public surface, and the way in.
//
// It shares the `--g-*` tokens with the portal, the rail and the login page, so
// the four screens a person meets before they reach a dashboard read as one
// product rather than four.
//
// Deliberately plain. This is a door, not a marketing site: no hero video, no
// scroll animation, no counters. Somebody arriving here is an employee trying
// to reach their attendance record, and everything that delays that is a cost.

import Link from "next/link";
import { ArrowRight, Users, CalendarCheck, Wallet, ShieldCheck } from "lucide-react";

const FEATURES = [
  {
    Icon: Users,
    title: "People",
    body: "One record per employee — joining details, department, documents and history.",
  },
  {
    Icon: CalendarCheck,
    title: "Attendance & Leave",
    body: "Daily punches, shifts, regularisation and the leave balance behind them.",
  },
  {
    Icon: Wallet,
    title: "Payroll",
    body: "Salary structures, monthly runs and payslips, generated from the attendance actually recorded.",
  },
  {
    Icon: ShieldCheck,
    title: "Controlled Access",
    body: "Who can open what is set once, by the executive office, and enforced everywhere.",
  },
];

export default function HomePage() {
  return (
    <div className="home g-sans">
      <header className="home-bar">
        <div className="home-shell home-bar-in">
          <div className="home-brand">
            <img
              src="/matrubhoomi-logo-192.png"
              alt=""
              aria-hidden="true"
              className="home-mark-img"
            />
            <span className="home-brand-text">
              <span className="home-brand-name">Matrubhoomi Farms &amp; Developers</span>
              <span className="home-brand-sub">Private Limited</span>
            </span>
          </div>

          {/* /onboarding, not /login: the portal is the one door. It signs in
              every kind of account and is where a signed-in visitor lands. */}
          <Link href="/onboarding" className="home-cta is-sm">
            Sign in
          </Link>
        </div>
      </header>

      <main className="home-shell home-main">
        <section className="home-hero">
          <h1 className="home-h1">
            The people behind the work
            <span className="home-h1-accent">in one place</span>
          </h1>
          <p className="home-lede">
            The internal workforce system for Matrubhoomi Farms &amp; Developers.
            Employee records, attendance, payroll and documents — across the
            farms, the ponds and every site.
          </p>
          <Link href="/onboarding" className="home-cta">
            Sign in <ArrowRight size={17} />
          </Link>
        </section>

        <section className="home-grid" aria-label="What the system covers">
          {FEATURES.map(({ Icon, title, body }) => (
            <article key={title} className="home-card">
              <span className="home-card-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <h2 className="home-card-title">{title}</h2>
              <p className="home-card-body">{body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="home-foot">
        <div className="home-shell">
          © {new Date().getFullYear()} Matrubhoomi Farms &amp; Developers Private
          Limited. For staff use.
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: HOME_CSS }} />
    </div>
  );
}

// No backticks inside this template literal.
const HOME_CSS = `
.home {
  min-height: 100dvh; color: var(--g-ink); display: flex; flex-direction: column;
  background: var(--g-bg);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.home-shell { width: 100%; max-width: 1180px; margin-inline: auto; padding-inline: clamp(1rem, 3vw, 1.5rem); }

.home-bar {
  position: sticky; top: 0; z-index: 10;
  background: var(--g-surface);
  border-bottom: 1px solid var(--g-line);
}
.home-bar-in { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }

.home-brand { display: flex; align-items: center; gap: .65rem; min-width: 0; }
.home-mark-img { width: 34px; height: 34px; object-fit: contain; flex-shrink: 0; }
.home-brand-text { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.home-brand-name { font-size: 14px; font-weight: 620; letter-spacing: -.011em; }
.home-brand-sub { font-size: 11.5px; color: var(--g-ink-3); }

.home-cta {
  display: inline-flex; align-items: center; gap: .45rem;
  height: 46px; padding-inline: 1.4rem;
  border-radius: var(--g-radius);
  background: var(--g-brand); color: var(--g-brand-ink);
  font-size: 14.5px; font-weight: 640; text-decoration: none;
  transition: background .15s, transform .1s;
}
.home-cta.is-sm { height: 38px; padding-inline: 1.1rem; font-size: 13.5px; }
.home-cta:hover { background: var(--g-brand-strong); }
.home-cta:active { transform: translateY(1px); }
.home-cta:focus-visible { outline: none; box-shadow: var(--g-ring); }

.home-main { flex: 1; padding-block: clamp(3rem, 8vw, 5rem) clamp(3rem, 7vw, 4.5rem); }

.home-hero { max-width: 52rem; }
.home-h1 {
  font-size: clamp(2.2rem, 6vw, 3.5rem);
  font-weight: 660; letter-spacing: -.034em; line-height: 1.06;
}
/* The second line carries the brand colour. A gradient-filled headline was
   tried and dropped: at this weight it reads as a smear rather than a colour,
   and it fails outright in forced-colours mode. */
.home-h1-accent { display: block; color: var(--g-brand); }
.home-lede {
  margin-top: 1.1rem; max-width: 40rem;
  font-size: clamp(1rem, 2vw, 1.12rem); line-height: 1.6;
  color: var(--g-ink-2);
}
.home-hero .home-cta { margin-top: 1.9rem; }

.home-grid {
  margin-top: clamp(3.5rem, 9vw, 5rem);
  display: grid; gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}
.home-card {
  padding: 1.5rem;
  background: var(--g-surface);
  border: 1px solid var(--g-line);
  border-radius: 16px;
  box-shadow: var(--g-shadow);
}
.home-card-icon {
  display: grid; place-items: center;
  width: 42px; height: 42px; border-radius: 12px;
  background: var(--g-brand-wash); color: var(--g-brand);
  margin-bottom: 1rem;
}
.home-card-title { font-size: 15px; font-weight: 620; letter-spacing: -.012em; }
.home-card-body { margin-top: .35rem; font-size: 13px; line-height: 1.55; color: var(--g-ink-3); }

.home-foot {
  border-top: 1px solid var(--g-line);
  padding-block: 1.35rem;
  font-size: 12.5px; color: var(--g-ink-faint); text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .home-cta { transition: none; }
}
`;
