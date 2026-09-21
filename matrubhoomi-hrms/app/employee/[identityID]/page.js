"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

// ═══════════════════════════════════════════════════════════════════════════
//  ROLE & DEPARTMENT PROFILES
// ═══════════════════════════════════════════════════════════════════════════
//
// The public profile card describes the WORK, not the person. That distinction
// is what makes a generic fallback acceptable: nothing here is a judgement
// about an individual, so an unmatched designation getting DEFAULT_PROFILE
// reads as "we do not have a description for this role yet" and never as a
// slight.
//
// Matching is by exact designation first, then a case-insensitive substring,
// then department, then the default — see getRoleProfile below. Adding a role
// is one entry here and nothing else.
const ROLE_PROFILES = {
    // ── Land and crop ──────────────────────────────────────────────────
    "Farm Manager": {
        label: "THE FARM MANAGER",
        intro: "Runs the land day to day — what goes in, when it is watered, and what comes out.",
        quote: "Reads a field the way other people read a report. Knows what a crop needs before it says so.",
        craft: ["Crop Planning", "Irrigation", "Yield", "Team Leadership"],
    },
    "Farm Supervisor": {
        label: "THE FIELD LEAD",
        intro: "Leads the field crew and keeps the day's work moving across every plot.",
        quote: "First on the land and last off it. Problems solved before they reach anyone else.",
        craft: ["Field Operations", "Scheduling", "Crew Coordination", "Quality"],
    },
    Agronomist: {
        label: "THE AGRONOMIST",
        intro: "Matches soil, seed and season — the science behind what the land can carry.",
        quote: "Thinks in soil tests and growing degree days. Patient with a crop that needs another week.",
        craft: ["Soil Health", "Crop Science", "Pest Management", "Nutrition"],
    },
    "Field Worker": {
        label: "THE GROWER",
        intro: "Sowing, tending and harvesting — the hands the whole operation rests on.",
        quote: "Steady through the heat and the rain. The work gets done because they turn up and do it.",
        craft: ["Sowing", "Harvesting", "Irrigation", "Care"],
    },

    // ── Water ──────────────────────────────────────────────────────────
    "Pond Manager": {
        label: "THE POND MANAGER",
        intro: "Keeps the water right — stocking, feeding, and the quiet daily checks that decide a harvest.",
        quote: "Can tell a pond's health from the surface. Tests anyway, every single day.",
        craft: ["Water Quality", "Stocking", "Feeding", "Harvest Planning"],
    },
    "Fisheries Technician": {
        label: "THE TECHNICIAN",
        intro: "Hatchery and grow-out work — sampling, grading, and the health of every batch.",
        quote: "Counts, weighs, records. Catches a problem in a sample long before it reaches the pond.",
        craft: ["Hatchery", "Sampling", "Disease Control", "Records"],
    },
    "Aquaculture Supervisor": {
        label: "THE WATER LEAD",
        intro: "Runs the ponds as one system — feed, labour, and the harvest calendar behind them.",
        quote: "Plans a harvest a season ahead and adjusts it every morning.",
        craft: ["Pond Operations", "Feed Management", "Harvest", "Team Leadership"],
    },

    // ── Build ──────────────────────────────────────────────────────────
    "Site Engineer": {
        label: "THE SITE ENGINEER",
        intro: "Turns the drawing into the building — levels, setting out, and what actually gets poured.",
        quote: "Checks the level twice and the drawing three times. Nothing goes in on a maybe.",
        craft: ["Setting Out", "Quality Control", "Site Supervision", "Measurement"],
    },
    "Civil Engineer": {
        label: "THE ENGINEER",
        intro: "Designs and verifies the structure — loads, materials, and the margin that keeps it standing.",
        quote: "Would rather redo a calculation than assume it. The margin is not negotiable.",
        craft: ["Structural Design", "Estimation", "Specifications", "Compliance"],
    },
    "Site Supervisor": {
        label: "THE SITE LEAD",
        intro: "Runs the site day to day — labour, materials, sequence and safety.",
        quote: "Knows every trade on site by name and what each of them needs next.",
        craft: ["Site Management", "Safety", "Scheduling", "Materials"],
    },
    Foreman: {
        label: "THE FOREMAN",
        intro: "Holds the crew and the day's target together, one task at a time.",
        quote: "Never raises their voice and never has to. The work moves.",
        craft: ["Crew Leadership", "Sequencing", "Safety", "Workmanship"],
    },
    Surveyor: {
        label: "THE SURVEYOR",
        intro: "Establishes what is where — boundaries, levels and the numbers everything else is built on.",
        quote: "Precise to the millimetre and unbothered by anyone in a hurry.",
        craft: ["Survey", "Levelling", "Layout", "Records"],
    },
    Mason: {
        label: "THE MASON",
        intro: "Brick, block and finish — the craft that becomes the visible building.",
        quote: "Lays a straight course without thinking about it. Notices when someone else has not.",
        craft: ["Masonry", "Plastering", "Finishing", "Craftsmanship"],
    },
    "Project Manager": {
        label: "THE CONDUCTOR",
        intro: "Carries a project from first drawing to handover — scope, cost, programme and the people in between.",
        quote: "Keeps three sites moving without ever raising their voice. Schedules in their head.",
        craft: ["Planning", "Cost Control", "Coordination", "Delivery"],
    },

    // ── Shared services ────────────────────────────────────────────────
    Accountant: {
        label: "THE LEDGER KEEPER",
        intro: "Keeps the books balanced and the numbers honest.",
        quote: "Patient with ledgers, precise with decimals. The company runs on numbers they quietly keep straight.",
        craft: ["Bookkeeping", "Finance", "Compliance", "Analysis"],
    },
    "HR Manager": {
        label: "THE PEOPLE LEAD",
        intro: "Builds and keeps the workforce — hiring, records, attendance and everything that follows.",
        quote: "Builds teams that build things. People-first, process-strong.",
        craft: ["Recruitment", "Employee Relations", "Payroll", "Compliance"],
    },
    "Store Keeper": {
        label: "THE KEEPER",
        intro: "Manages materials, tools and the quiet flow of supply.",
        quote: "Knows every shelf, every bag, every drum. The company's memory of what exists.",
        craft: ["Inventory", "Issue & Receipt", "Stock", "Records"],
    },
    Driver: {
        label: "THE DRIVER",
        intro: "Moves people, produce and material between the sites, the ponds and the market.",
        quote: "Knows every road and which one floods. Always where they said they would be.",
        craft: ["Transport", "Logistics", "Vehicle Care", "Timeliness"],
    },
    "Security Guard": {
        label: "THE WATCH",
        intro: "Keeps the site, the stores and the people on them safe, through every shift.",
        quote: "Present, alert, unhurried. Nothing passes the gate unrecorded.",
        craft: ["Site Security", "Access Control", "Patrol", "Records"],
    },
};

const DEPARTMENT_PROFILES = {
    AGRICULTURE: {
        label: "THE GROWER",
        intro: "Works the land — sowing, irrigation, care and harvest, season after season.",
        quote: "Reads the sky and the soil. Patient with things that take their own time.",
        craft: ["Crop Care", "Irrigation", "Harvest", "Land"],
    },
    FARM: {
        label: "THE GROWER",
        intro: "Works the land — sowing, irrigation, care and harvest, season after season.",
        quote: "Reads the sky and the soil. Patient with things that take their own time.",
        craft: ["Crop Care", "Irrigation", "Harvest", "Land"],
    },
    AQUACULTURE: {
        label: "THE WATER KEEPER",
        intro: "Works the ponds — water quality, feed, health and the harvest that follows.",
        quote: "Understands water the way a farmer understands soil. Every reading teaches something.",
        craft: ["Water Quality", "Feeding", "Health", "Harvest"],
    },
    FISHERIES: {
        label: "THE WATER KEEPER",
        intro: "Works the ponds — water quality, feed, health and the harvest that follows.",
        quote: "Understands water the way a farmer understands soil. Every reading teaches something.",
        craft: ["Water Quality", "Feeding", "Health", "Harvest"],
    },
    CONSTRUCTION: {
        label: "THE BUILDER",
        intro: "On site, where the drawing becomes a structure and every measurement counts.",
        quote: "Builds it right the first time. Would rather take the extra hour than take it down.",
        craft: ["Construction", "Workmanship", "Safety", "Quality"],
    },
    PROJECTS: {
        label: "THE PLANNER",
        intro: "Carries projects from drawing to handover — scope, programme and the people in between.",
        quote: "Sees the whole programme and the one task blocking it, at the same time.",
        craft: ["Planning", "Coordination", "Cost", "Delivery"],
    },
    ENGINEERING: {
        label: "THE ENGINEER",
        intro: "The calculations, drawings and checks the built work stands on.",
        quote: "Would rather redo a calculation than assume it.",
        craft: ["Design", "Estimation", "Verification", "Standards"],
    },
    ACCOUNTS: {
        label: "THE LEDGER KEEPER",
        intro: "Keeps the books balanced and the numbers honest. Steady hand on the company's finances.",
        quote: "Patient with ledgers, precise with decimals. The company runs on numbers they quietly keep straight.",
        craft: ["Bookkeeping", "Finance", "Compliance", "Analysis"],
    },
    ADMIN: {
        label: "THE COORDINATOR",
        intro: "Keeps the wheels turning through quiet, persistent coordination.",
        quote: "Always knows where everyone is and what they need next. Silent, organized, essential.",
        craft: ["Administration", "Coordination", "Operations", "Support"],
    },
    HR: {
        label: "THE PEOPLE LEAD",
        intro: "Hiring, records, attendance and everything that follows from them.",
        quote: "Builds teams that build things. People-first, process-strong.",
        craft: ["Recruitment", "Records", "Payroll", "Compliance"],
    },
    STORES: {
        label: "THE KEEPER",
        intro: "Manages materials, tools and the quiet flow of supply.",
        quote: "Knows every shelf, every bag, every drum. The company's memory of what exists.",
        craft: ["Inventory", "Organization", "Stock", "Flow"],
    },
    SECURITY: {
        label: "THE WATCH",
        intro: "Keeps the sites, the stores and the people on them safe, through every shift.",
        quote: "Present, alert, unhurried. Nothing passes the gate unrecorded.",
        craft: ["Site Security", "Access Control", "Patrol", "Records"],
    },
    TRANSPORT: {
        label: "THE DRIVER",
        intro: "Moves people, produce and material between the sites, the ponds and the market.",
        quote: "Knows every road and which one floods. Always where they said they would be.",
        craft: ["Transport", "Logistics", "Vehicle Care", "Timeliness"],
    },
};

const DEFAULT_PROFILE = {
    label: "THE TEAM MEMBER",
    intro: "Contributing specialised skills across the farms, the ponds and the sites.",
    quote: "Reliable, dedicated, proud of the work. The company runs better because they are here.",
    craft: ["Skill", "Quality", "Teamwork", "Reliability"],
};


function getRoleProfile(designation, department) {
    if (designation && ROLE_PROFILES[designation]) return ROLE_PROFILES[designation];
    if (designation) {
        const lower = designation.toLowerCase();
        for (const key in ROLE_PROFILES) {
            if (lower.includes(key.toLowerCase())) return ROLE_PROFILES[key];
        }
    }
    if (department) {
        const upper = department.toUpperCase().trim();
        if (DEPARTMENT_PROFILES[upper]) return DEPARTMENT_PROFILES[upper];
        for (const key in DEPARTMENT_PROFILES) {
            if (upper.includes(key) || key.includes(upper)) return DEPARTMENT_PROFILES[key];
        }
    }
    return DEFAULT_PROFILE;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatTenure(dateOfJoining) {
    const today = new Date();
    const joining = new Date(dateOfJoining);

    let years = today.getFullYear() - joining.getFullYear();
    let months = today.getMonth() - joining.getMonth();
    const days = today.getDate() - joining.getDate();

    if (days < 0) months--;
    if (months < 0) { years--; months += 12; }

    if (years === 0 && months === 0) return "Less than a month";
    if (years === 0) return `${months} ${months === 1 ? "month" : "months"}`;
    if (months === 0) return `${years} ${years === 1 ? "year" : "years"}`;
    return `${years} ${years === 1 ? "yr" : "yrs"}, ${months} ${months === 1 ? "mo" : "mos"}`;
}

function joinedFmt(date) {
    return new Date(date).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
    });
}

function joinedMonthYear(date) {
    return new Date(date).toLocaleDateString("en-US", {
        month: "short", year: "numeric",
    });
}

function getInitials(first, last) {
    return ((first?.[0] || "") + (last?.[0] || "")).toUpperCase();
}

function splitLocation(workLocation) {
    if (!workLocation) return { site: null, location: null };
    const s = workLocation.trim();
    if (s.includes(" — ")) {
        const [a, ...rest] = s.split(" — ");
        return { site: a.trim(), location: rest.join(" — ").trim() || null };
    }
    if (s.includes(" - ")) {
        const [a, ...rest] = s.split(" - ");
        return { site: a.trim(), location: rest.join(" - ").trim() || null };
    }
    if (s.includes(",")) {
        const [a, ...rest] = s.split(",");
        return { site: a.trim(), location: rest.join(",").trim() || null };
    }
    return { site: s, location: null };
}

function formatDOB(date) {
    if (!date) return null;
    return new Date(date).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
    });
}

function formatEmploymentType(type) {
    const map = {
        full_time: "Full Time",
        part_time: "Part Time",
        contract: "Contract",
        intern: "Intern",
    };
    return map[type] || type || null;
}

function getAddressLines(addr) {
    if (!addr) return [];
    const lines = [];
    if (addr.street) lines.push(addr.street);
    if (addr.state) lines.push(addr.state);
    return lines;
}


// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function EmployeePublicProfile() {
    const params = useParams();
    const identityID = params.identityID;
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [theme, setTheme] = useState("light");

    useEffect(() => {
        const fetchEmployee = async () => {
            try {
                setLoading(true);
                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/employee/public/${identityID}`
                );
                if (!response.ok) throw new Error("Employee not found");
                const data = await response.json();
                setEmployee(data.data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        if (identityID) fetchEmployee();
    }, [identityID]);

    if (loading) return <LoadingView theme={theme} />;
    if (error || !employee) return <ErrorView theme={theme} />;

    return (
        <>
            <GlobalStyles />
            {theme === "light" ? (
                <LightTheme employee={employee} onToggleTheme={() => setTheme("dark")} />
            ) : (
                <DarkTheme employee={employee} onToggleTheme={() => setTheme("light")} />
            )}
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════════════════
function GlobalStyles() {
    return (
        <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,500;1,9..144,700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      .font-serif { font-family: 'Fraunces', 'Playfair Display', Georgia, serif; font-optical-sizing: auto; }
      .font-sans { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
      .font-mono { font-family: 'JetBrains Mono', 'Menlo', monospace; }
      .stripes-light { background-image: repeating-linear-gradient(45deg, transparent 0, transparent 4px, rgba(0,0,0,0.4) 4px, rgba(0,0,0,0.4) 5px); }
      .stripes-dark { background-image: repeating-linear-gradient(45deg, transparent 0, transparent 4px, rgba(255,255,255,0.3) 4px, rgba(255,255,255,0.3) 5px); }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .fade-in { animation: fadeIn 0.6s ease-out; }
    `}</style>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOADING & ERROR
// ═══════════════════════════════════════════════════════════════════════════
function LoadingView({ theme }) {
    const bg = theme === "dark" ? "#0a0a0a" : "#f4f1ea";
    const fg = theme === "dark" ? "#e8e8e8" : "#1a1a1a";
    return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: bg, color: fg }}>
            <div className="text-center font-mono text-xs tracking-widest uppercase opacity-60">
                Loading record...
            </div>
        </div>
    );
}

function ErrorView({ theme }) {
    const bg = theme === "dark" ? "#0a0a0a" : "#f4f1ea";
    const fg = theme === "dark" ? "#e8e8e8" : "#1a1a1a";
    return (
        <div className="min-h-screen flex items-center justify-center p-8" style={{ background: bg, color: fg }}>
            <div className="text-center max-w-md">
                <div className="font-mono text-xs tracking-widest uppercase mb-4 opacity-60">Record not found</div>
                <h1 className="font-serif text-4xl mb-4">No file on record.</h1>
                <p className="font-sans text-sm opacity-70">The employee file you're looking for doesn't exist or has been archived.</p>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  THEME TOGGLE
// ═══════════════════════════════════════════════════════════════════════════
function ThemeToggle({ theme, onClick }) {
    const isDark = theme === "dark";
    return (
        <button
            onClick={onClick}
            className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
            style={{
                background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
                color: isDark ? "#e8e8e8" : "#1a1a1a",
            }}
            aria-label="Toggle theme"
        >
            {isDark ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
            ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
            )}
        </button>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PORTRAIT
// ═══════════════════════════════════════════════════════════════════════════
function Portrait({ src, name, theme, aspectRatio = "3/4" }) {
    const [imgError, setImgError] = useState(false);
    const isDark = theme === "dark";
    const stripeClass = isDark ? "stripes-dark" : "stripes-light";
    const borderColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.3)";
    const labelColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

    if (src && !imgError) {
        return (
            <div className="relative w-full overflow-hidden" style={{ aspectRatio, border: `1px solid ${borderColor}` }}>
                <img src={src} alt={name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
            </div>
        );
    }
    return (
        <div className={`relative w-full flex items-end justify-start ${stripeClass}`} style={{ aspectRatio, border: `1px solid ${borderColor}` }}>
            <div className="absolute bottom-2 left-2 font-mono text-[9px] tracking-wider uppercase px-1.5 py-0.5" style={{ background: isDark ? "#0a0a0a" : "#f4f1ea", color: labelColor }}>
                PORTRAIT
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHONE ICON
// ═══════════════════════════════════════════════════════════════════════════
function PhoneIcon({ size = 15 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
        </svg>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  LIGHT THEME — THE STUDIO EDITION
// ═══════════════════════════════════════════════════════════════════════════
function LightTheme({ employee, onToggleTheme }) {
    const firstName = employee.firstName || "";
    const lastName = employee.lastName || "";
    const middleName = employee.middleName || "";
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");

    const profile = getRoleProfile(employee.designation || employee.jobTitle, employee.department);
    const profileImage = employee.profilePhoto?.url;
    const tenure = employee.dateOfJoining ? formatTenure(employee.dateOfJoining) : null;
    const joinDate = employee.dateOfJoining ? joinedFmt(employee.dateOfJoining) : null;
    const { site, location } = splitLocation(employee.workLocation);
    const addressLines = getAddressLines(employee.address);

    return (
        <div className="min-h-screen fade-in" style={{ background: "#f4f1ea", color: "#1a1a1a" }}>
            <ThemeToggle theme="light" onClick={onToggleTheme} />

            <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
                {/* ─── Masthead ─────────────────────────────────────────────────── */}
                <div className="flex items-center gap-3 pb-6 mb-8 border-b" style={{ borderColor: "rgba(0,0,0,0.2)" }}>
                    <Image src="/matrubhoomi-logo-64.png" alt="Matrubhoomi Logo" width={40} height={40} className="flex-shrink-0" />
                    <span className="font-serif text-2xl sm:text-3xl font-bold italic">Matrubhoomi</span>
                    <span className="font-mono text-[10px] tracking-widest uppercase opacity-50 ml-auto hidden sm:block">
                        Employee File
                    </span>
                </div>

                {/* ─── Content Grid ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8 lg:gap-12">
                    {/* ─── LEFT COLUMN ────────────────────────────────────────────── */}
                    <div className="space-y-6">
                        {/* Portrait + Label */}
                        <div className="flex gap-4 lg:gap-6 items-start">
                            <div className="w-24 sm:w-28 lg:w-36 flex-shrink-0">
                                <Portrait src={profileImage} name={fullName} theme="light" />
                            </div>
                            <div className="flex-1 pt-2">
                                <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-2">
                                    {profile.label}
                                </div>
                                <p className="font-serif text-sm sm:text-base leading-relaxed italic">
                                    {profile.intro}
                                </p>
                            </div>
                        </div>

                        {/* Name */}
                        <div className="pt-4 border-t" style={{ borderColor: "rgba(0,0,0,0.15)" }}>
                            <h1 className="font-serif leading-[0.95] tracking-tight" style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)" }}>
                                <span className="font-bold">{firstName}</span>
                                <br />
                                <span className="italic font-medium">{lastName}</span>
                                <span style={{ color: "#c8472d" }}>.</span>
                            </h1>
                            <div className="mt-4 flex items-center gap-3 flex-wrap">
                                <span className="font-sans text-base sm:text-lg font-medium">
                                    {employee.designation || employee.jobTitle || "Employee"}
                                </span>
                                {employee.department && (
                                    <>
                                        <span className="opacity-40">—</span>
                                        <span className="font-sans text-base sm:text-lg opacity-70">
                                            {employee.department}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* On The Record Quote */}
                        <div className="pt-6 border-t" style={{ borderColor: "rgba(0,0,0,0.15)" }}>
                            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-3">
                                ON THE RECORD
                            </div>
                            <blockquote className="font-serif text-lg sm:text-xl italic leading-relaxed">
                                "{profile.quote}"
                            </blockquote>
                            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-50 mt-3">
                                — A NOTE FROM THE STUDIO
                            </div>
                        </div>
                    </div>

                    {/* ─── RIGHT COLUMN — DETAILS ─────────────────────────────────── */}
                    {/* CHANGED: Phone is now the top highlighted block; employee number 
                        is shown as a plain detail row; biometricId removed from here entirely */}
                    <div className="space-y-5">

                        {/* Call Button — PRIMARY at the top ───────────────────────── */}
                        {employee.phone && (
                            <div className="pb-5 border-b-2" style={{ borderColor: "#1a1a1a" }}>
                                <a
                                    href={`tel:${String(employee.phone).replace(/[^\d+]/g, "")}`}
                                    className="w-full flex items-center gap-3 px-5 py-4 transition-all hover:opacity-90"
                                    style={{ background: "#1a1a1a", color: "#f4f1ea", textDecoration: "none" }}
                                >
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                                        <PhoneIcon size={15} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="font-sans text-sm font-bold leading-tight">Call {firstName}</div>
                                        <div className="font-mono text-[10px] tracking-wider opacity-70 leading-tight mt-0.5">
                                            {employee.phone}{employee.extension ? ` · ext ${employee.extension}` : ""}
                                        </div>
                                    </div>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M5 12h14M12 5l7 7-7 7" />
                                    </svg>
                                </a>
                            </div>
                        )}

                        {/* Emergency Contact — Alternate Phone */}
                        {employee.alternatePhone && (
                            <a
                                href={`tel:${String(employee.alternatePhone).replace(/[^\d+]/g, "")}`}
                                className="flex items-center gap-3 p-3 border transition-all hover:bg-black/5"
                                style={{ borderColor: "rgba(0,0,0,0.3)", textDecoration: "none", color: "#1a1a1a" }}
                            >
                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(200,71,45,0.1)", color: "#c8472d" }}>
                                    <PhoneIcon size={13} />
                                </div>
                                <div className="text-left flex-1 min-w-0 gap-2">
                                    <div className="font-mono text-[9px] tracking-[0.2em] uppercase" style={{ color: "#c8472d" }}>
                                        IN CASE OF EMERGENCY
                                    </div>
                                    <div className="font-sans text-sm font-semibold truncate">
                                        {employee.alternatePhone}
                                    </div>
                                </div>
                            </a>
                        )}

                        {/* Employee Number — plain detail row, not bolded heading */}
                        {employee.identityId && (
                            <DetailRowLight label="EMPLOYEE NUMBER" value={employee.identityId} />
                        )}

                        {/* Department */}
                        {employee.department && (
                            <DetailRowLight label="DEPARTMENT" value={employee.department} />
                        )}

                        {/* ADDRESS — street + state only ──────────────────────────── */}
                        {addressLines.length > 0 && (
                            <div className="pb-4 border-b" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
                                <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-1.5">
                                    ADDRESS
                                </div>
                                <div className="font-sans text-base sm:text-lg font-medium leading-relaxed">
                                    {addressLines.map((line, idx) => (
                                        <div key={idx}>{line}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Joined */}
                        {joinDate && (
                            <DetailRowLight
                                label="JOINED"
                                value={`${joinDate} · ${tenure}`}
                            />
                        )}

                        {employee.dateOfBirth && (
                            <DetailRowLight label="DATE OF BIRTH" value={formatDOB(employee.dateOfBirth)} />
                        )}

                        {employee.bloodGroup && (
                            <DetailRowLight label="BLOOD GROUP" value={employee.bloodGroup} />
                        )}

                        {employee.employmentType && (
                            <DetailRowLight label="EMPLOYMENT" value={formatEmploymentType(employee.employmentType)} />
                        )}

                        {/* The Craft */}
                        <div className="pt-4">
                            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-3">
                                THE CRAFT
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {profile.craft.map((skill, idx) => (
                                    <span key={idx} className="font-sans text-xs sm:text-sm px-3 py-1.5 border"
                                        style={{
                                            borderColor: idx === 0 ? "#1a1a1a" : "rgba(0,0,0,0.3)",
                                            background: idx === 0 ? "#1a1a1a" : "transparent",
                                            color: idx === 0 ? "#f4f1ea" : "#1a1a1a",
                                        }}>
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Verified Stamp */}
                        <div className="pt-4">
                            <div className="inline-flex items-center gap-2 border px-3 py-2" style={{ borderColor: "rgba(0,0,0,0.3)" }}>
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#2a7a4f" }}></div>
                                <span className="font-mono text-[10px] tracking-[0.2em] uppercase">
                                    Verified Employee
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── FOOTER — Site, Logo, Biometric (faded, stays in footer) ── */}
                <div className="mt-16 pt-6 border-t" style={{ borderColor: "rgba(0,0,0,0.2)" }}>
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
                        {/* Left: Logo + Site Info */}
                        <div className="flex items-start gap-3 flex-1">
                            <Image src="/matrubhoomi-logo-64.png" alt="Matrubhoomi Logo" width={40} height={40} className="flex-shrink-0" />
                            <div>
                                <div className="font-serif text-base italic font-bold">Matrubhoomi</div>
                                <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-2">
                                    Farms, ponds and sites across Odisha
                                </div>
                                {site && (
                                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
                                        <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-1">
                                            WORKS AT
                                        </div>
                                        <div className="font-sans text-sm font-medium">{site}</div>
                                        {location && (
                                            <div className="font-sans text-sm opacity-70 mt-0.5">{location}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Biometric ID — demoted to footer, very faded */}
                        {employee.biometricId && (
                            <div className="text-right">
                                <div className="font-mono text-[9px] tracking-[0.2em] uppercase opacity-40 mb-1">
                                    BIOMETRIC · INTERNAL
                                </div>
                                <div className="font-mono text-xs tracking-wider opacity-50">
                                    {employee.biometricId}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DetailRowLight({ label, value }) {
    return (
        <div className="pb-4 border-b" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-1.5">
                {label}
            </div>
            <div className="font-sans text-base sm:text-lg font-medium">{value}</div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  DARK THEME — THE MAKER SERIES
// ═══════════════════════════════════════════════════════════════════════════
function DarkTheme({ employee, onToggleTheme }) {
    const firstName = employee.firstName || "";
    const lastName = employee.lastName || "";
    const fullName = [firstName, employee.middleName, lastName].filter(Boolean).join(" ");
    const nickname = getInitials(firstName, lastName);

    const profile = getRoleProfile(employee.designation || employee.jobTitle, employee.department);
    const profileImage = employee.profilePhoto?.url;
    const tenure = employee.dateOfJoining ? formatTenure(employee.dateOfJoining) : null;
    const joinedShortDate = employee.dateOfJoining ? joinedMonthYear(employee.dateOfJoining) : null;
    const { site, location } = splitLocation(employee.workLocation);
    const addressLines = getAddressLines(employee.address);

    const ACCENT = "#d4ff4d";

    return (
        <div className="min-h-screen fade-in" style={{ background: "#0a0a0a", color: "#e8e8e8" }}>
            <ThemeToggle theme="dark" onClick={onToggleTheme} />

            <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
                {/* Masthead */}
                <div className="flex items-center gap-3 pb-6 mb-10 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                    <Image src="/matrubhoomi-logo-64.png" alt="Matrubhoomi Logo" width={40} height={40} className="flex-shrink-0" />
                    <span className="font-serif text-2xl sm:text-3xl font-bold italic">Matrubhoomi</span>
                    <span className="font-mono text-[10px] tracking-widest uppercase opacity-50 ml-auto hidden sm:block">
                        Employee File
                    </span>
                </div>

                {/* Name */}
                <div className="mb-10 sm:mb-12">
                    <h1 className="font-serif leading-[0.95] tracking-tight" style={{ fontSize: "clamp(3rem, 9vw, 6.5rem)" }}>
                        <span className="font-medium">{firstName}</span>{" "}
                        {nickname && (
                            <span className="font-serif italic" style={{ color: ACCENT, fontWeight: 500 }}>
                                "{nickname}"
                            </span>
                        )}
                        <br />
                        <span className="font-medium">{lastName}</span>
                    </h1>
                    <div className="mt-6 flex items-center gap-3 flex-wrap">
                        <div className="w-8 h-px" style={{ background: ACCENT }}></div>
                        <span className="font-sans text-base sm:text-lg font-medium" style={{ color: "#fff" }}>
                            {employee.designation || employee.jobTitle || "Employee"}
                        </span>
                        {joinedShortDate && (
                            <span className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-50">
                                SINCE {joinedShortDate.toUpperCase()}
                            </span>
                        )}
                    </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-10">
                    {/* Portrait + Details */}
                    <div className="flex gap-4">
                        <div className="w-28 sm:w-32 lg:w-36 flex-shrink-0">
                            <Portrait src={profileImage} name={fullName} theme="dark" />
                        </div>
                        <div className="flex-1 p-5 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)" }}>
                            {/* Employee Number */}
                            <div className="mb-4 pb-3 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                                <div className="font-mono text-[9px] tracking-[0.2em] uppercase opacity-60 mb-1">
                                    EMPLOYEE NUMBER
                                </div>
                                <div className="font-serif text-2xl font-bold" style={{ color: ACCENT }}>
                                    {employee.identityId || "N/A"}
                                </div>
                            </div>

                            <div className="space-y-3">
                                {employee.department && (
                                    <DetailRowDark label="DEPARTMENT" value={employee.department} />
                                )}
                                {/* ADDRESS — street + state only in dark theme too */}
                                {addressLines.length > 0 && (
                                    <div>
                                        <div className="font-mono text-[9px] tracking-[0.2em] uppercase opacity-50 mb-0.5">
                                            ADDRESS
                                        </div>
                                        <div className="font-sans text-sm font-medium leading-relaxed" style={{ color: "#fff" }}>
                                            {addressLines.map((line, idx) => (
                                                <div key={idx}>{line}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {joinedShortDate && (
                                    <DetailRowDark label="JOINED" value={`${joinedShortDate} · ${tenure}`} />
                                )}
                                {employee.dateOfBirth && (
                                    <DetailRowDark label="DATE OF BIRTH" value={formatDOB(employee.dateOfBirth)} />
                                )}
                                {employee.bloodGroup && (
                                    <DetailRowDark label="BLOOD GROUP" value={employee.bloodGroup} />
                                )}
                                {employee.employmentType && (
                                    <DetailRowDark label="EMPLOYMENT" value={formatEmploymentType(employee.employmentType)} />
                                )} 
                            </div>
                        </div>
                    </div>

                    {/* Reach Section */}
                    <div className="p-5 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)" }}>
                        <div className="flex items-center justify-between mb-5 pb-3 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                            <div className="font-mono text-[9px] tracking-[0.2em] uppercase opacity-60">
                                REACH {firstName.toUpperCase()}
                            </div>
                            <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-wider">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }}></div>
                                <span style={{ color: ACCENT }}>VERIFIED</span>
                            </div>
                        </div>

                        {/* Primary Call */}
                        {employee.phone ? (
                            <a
                                href={`tel:${String(employee.phone).replace(/[^\d+]/g, "")}`}
                                className="w-full p-4 mb-3 flex items-center justify-between transition-all hover:opacity-90"
                                style={{ background: ACCENT, color: "#0a0a0a", textDecoration: "none" }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.15)" }}>
                                        <PhoneIcon size={14} />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-sans text-sm font-bold">Call {firstName}</div>
                                        <div className="font-mono text-[9px] tracking-wider opacity-70">
                                            {employee.phone}{employee.extension ? ` · ext ${employee.extension}` : ""}
                                        </div>
                                    </div>
                                </div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </a>
                        ) : (
                            <div className="p-4 mb-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.15)" }}>
                                <div className="font-mono text-[10px] tracking-wider uppercase opacity-50">
                                    Direct contact unavailable
                                </div>
                            </div>
                        )}

                        {/* Emergency Contact */}
                        {employee.alternatePhone && (
                            <a
                                href={`tel:${String(employee.alternatePhone).replace(/[^\d+]/g, "")}`}
                                className="w-full p-3 mb-3 flex items-center gap-2.5 transition-all hover:bg-white/5"
                                style={{
                                    border: "1px solid rgba(255,100,80,0.3)",
                                    background: "rgba(255,100,80,0.05)",
                                    color: "#e8e8e8",
                                    textDecoration: "none",
                                }}
                            >
                                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,100,80,0.15)", color: "#ff8870" }}>
                                    <PhoneIcon size={12} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="font-mono text-[9px] tracking-[0.2em] uppercase gap-2" style={{ color: "#ff8870" }}>
                                        IN CASE OF EMERGENCY
                                    </div>
                                    <div className="font-sans text-xs font-semibold" style={{ color: "#fff" }}>
                                        {employee.alternatePhone}
                                    </div>
                                </div>
                            </a>
                        )}

                        {/* Share */}
                        <button
                            onClick={() => {
                                if (navigator.share) {
                                    navigator.share({
                                        title: fullName,
                                        text: `${fullName} — ${employee.designation || "Employee"} at Matrubhoomi`,
                                        url: window.location.href,
                                    });
                                } else {
                                    navigator.clipboard.writeText(window.location.href);
                                }
                            }}
                            className="w-full p-3 border flex items-center gap-2.5 transition-all hover:bg-white/5 text-left"
                            style={{ borderColor: "rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)", color: "#e8e8e8" }}
                        >
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                                    <polyline points="16 6 12 2 8 6" />
                                    <line x1="12" y1="2" x2="12" y2="15" />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="font-sans text-xs font-semibold" style={{ color: "#fff" }}>Share Profile</div>
                                <div className="font-mono text-[9px] tracking-wider opacity-50">Copy link or share</div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Note from Site */}
                <div className="pt-8 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                    <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-4">
                        <span style={{ color: ACCENT }}>✦</span>
                        <span>A NOTE FROM THE STUDIO</span>
                    </div>
                    <blockquote className="font-serif text-xl sm:text-2xl leading-relaxed max-w-4xl italic">
                        "{profile.quote}"
                    </blockquote>
                </div>

                {/* The Craft */}
                <div className="mt-10">
                    <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-3">
                        THE CRAFT
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {profile.craft.map((skill, idx) => (
                            <span key={idx} className="font-sans text-xs sm:text-sm px-3 py-1.5 border"
                                style={{
                                    borderColor: idx === 0 ? ACCENT : "rgba(255,255,255,0.2)",
                                    background: idx === 0 ? ACCENT : "transparent",
                                    color: idx === 0 ? "#0a0a0a" : "#e8e8e8",
                                    fontWeight: idx === 0 ? 600 : 400,
                                }}>
                                {skill}
                            </span>
                        ))}
                    </div>
                </div>

                {/* ─── FOOTER — Site + Biometric ─────────────────────────────── */}
                <div className="mt-16 pt-6 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
                        <div className="flex items-start gap-3 flex-1">
                            <Image src="/matrubhoomi-logo-64.png" alt="Matrubhoomi Logo" width={40} height={40} className="flex-shrink-0" />
                            <div>
                                <div className="font-serif text-base italic font-bold">Matrubhoomi</div>
                                <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-2">
                                    Farms, ponds and sites across Odisha
                                </div>
                                {site && (
                                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                                        <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-1">
                                            WORKS AT
                                        </div>
                                        <div className="font-sans text-sm font-medium" style={{ color: "#fff" }}>{site}</div>
                                        {location && (
                                            <div className="font-sans text-sm opacity-70 mt-0.5">{location}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        {employee.biometricId && (
                            <div className="text-right">
                                <div className="font-mono text-[9px] tracking-[0.2em] uppercase opacity-40 mb-1">
                                    BIOMETRIC · INTERNAL
                                </div>
                                <div className="font-mono text-xs tracking-wider opacity-50">
                                    {employee.biometricId}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DetailRowDark({ label, value, accent }) {
    return (
        <div>
            <div className="font-mono text-[9px] tracking-[0.2em] uppercase opacity-50 mb-0.5">
                {label}
            </div>
            <div className="font-sans text-sm font-medium" style={{ color: accent || "#fff" }}>
                {value}
            </div>
        </div>
    );
}