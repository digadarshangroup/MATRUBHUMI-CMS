// app/hr/dashboard/documents/appointmentTemplate.js
//
// The two Matrubhoomi appointment letters, as data.
//
// TRANSCRIBED FROM THE SIGNED WORD FILES — do not "improve" the prose:
//   executive → "Appointment Letter Format- Executive.docx"
//   worker    → "AL- ANITA MANDAL.docx"
// These are the letters HR already issues on paper. A reworded clause here is
// a different contract from the one on file, so the wording below is the
// source of truth and any change to it is a legal decision, not a copy edit.
//
// WHAT ACTUALLY DIFFERS between the two — everything else is byte-identical:
//   1. Reporting line   — "Head of the Department" vs "Production Manager"
//   2. Annexure I       — the worker letter carries a Professional Tax row
//   3. Annexure II      — 16 flat office clauses vs 15 headed factory clauses,
//                         the factory set having a nested duties list and
//                         explicit overtime/shift terms the office set omits
// Points 1 and 2 are single fields. Point 3 is why this file has two bodies
// rather than one body and a flag.
//
// Output is a block list, rendered by letterPdf.js. Content and layout are
// split on purpose: the clause text is a legal artefact that HR will amend,
// the pagination is not, and neither should force a rewrite of the other.

// ─────────────────────────────────────────────────────────────────────────────
//  Salary
//
//  THE EMPLOYEE'S OWN PAYROLL ROW IS THE SOURCE OF TRUTH. Annexure I prints
//  what the Employee record stores, field by field, because that is what the
//  employee already sees on their profile and on their payslip. A letter that
//  computes its own numbers will eventually disagree with both, and a signed
//  contract disagreeing with the payslip is not a rounding argument.
//
//  The formulas in salaryBreakdown() are the FALLBACK for a record with no
//  salary on it. They reproduce payroll's own conventions — verified against
//  two live records:
//
//    gross 12,406 → basic 6,203 · HRA 6,203 · EPF 744 · ESIC 47
//                 → deductions 791 · net 11,615
//    gross 24,567 → basic 12,284 · HRA 12,284 · EPF 1,474 · EDLI 61
//                 → admin 61 · ESIC ee 93 / er 400
//                 → deductions 1,567 · net 23,000 · CTC 28,041
//
//  NOTE THE BASE. EPF, EDLI, admin charges and ESIC are all computed on BASIC,
//  not on gross. Statutory ESIC is normally 0.75% of GROSS — 184 on 24,567,
//  not 93 — but payroll and the signed letters both use basic, and a generator
//  that "corrects" them would put two different numbers in front of the same
//  employee. Matching what the company already issues is the requirement.
// ─────────────────────────────────────────────────────────────────────────────

/** PF is statutorily capped at a basic of INR 15,000 — stated in the letter. */
import {
    COMPANY_NAME,
    COMPANY_LEGAL_NAME,
    COMPANY_PLACE_OF_POSTING,
} from "@/lib/company";

export const PF_WAGE_CEILING = 15000;
/** ESIC applies only up to a gross of INR 21,000. Above it, both rows vanish. */
export const ESIC_GROSS_CEILING = 21000;

export const SALARY_RATES = {
    basicPct: 0.5,
    hraPct: 0.5,      // of GROSS, independently rounded — see salaryBreakdown
    epfPct: 0.12,
    edliPct: 0.005,
    adminPct: 0.005,
    eeEsicPct: 0.0075,
    erEsicPct: 0.0325,
};

const r0 = (n) => Math.round(Number(n) || 0);

/**
 * The whole Annexure I table.
 *
 * STORED FIGURES WIN, FIELD BY FIELD.
 *
 * The Employee record already carries a full payroll breakdown — gross, basic,
 * hra, epf, edli, adminCharges, eeesic, erEsic, foodAllowance, totalDeduction,
 * netSalary, employerCost — and it is what the employee sees on their own
 * profile and on their payslip. Re-deriving those numbers here produced a
 * letter that disagreed with both, which is the worst possible outcome for a
 * document someone signs. So anything payroll has already decided is copied
 * verbatim, and the formulas below are a FALLBACK for a record that has no
 * salary on it at all.
 *
 * The formulas match payroll's own conventions, which are not the obvious ones:
 *   · HRA is its own rounded 50% of gross, NOT the remainder — so basic + hra
 *     can exceed gross by a rupee on an odd figure, exactly as payroll shows
 *   · EPF, EDLI and admin charges are computed on BASIC, capped at 15,000
 *   · ESIC rounds UP (24,567 gross → 93, not 92)
 *
 * @param gross  monthly gross, rupees — ignored when `opts.stored.gross` is set
 * @param opts   { stored, foodAllowance, professionalTax, esic }
 *               `esic` is a tri-state: undefined = decide from the ceiling,
 *               true/false = HR has said so explicitly (an employee already
 *               out of ESIC mid-year is not inferable from salary alone).
 */
export function salaryBreakdown(gross, opts = {}) {
    const st = opts.stored || {};
    // A stored field counts only if it is a real number. Payroll writes 0 for
    // "not applicable", and 0 is a legitimate answer we must not overwrite.
    const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    const pick = (v, derived) => (num(v) === null ? derived : Math.max(0, r0(v)));

    const G = num(st.gross) !== null ? Math.max(0, r0(st.gross)) : Math.max(0, r0(gross));

    const basic = pick(st.basic, r0(G * SALARY_RATES.basicPct));
    const hra = pick(st.hra, r0(G * SALARY_RATES.hraPct));

    const pfBase = Math.min(basic, PF_WAGE_CEILING);
    const epf = pick(st.epf, r0(pfBase * SALARY_RATES.epfPct));
    const edli = pick(st.edli, r0(pfBase * SALARY_RATES.edliPct));
    const adminCharges = pick(st.adminCharges, r0(pfBase * SALARY_RATES.adminPct));

    // Whether ESIC applies is decided BEFORE consulting stored values, because
    // a stored 0 on an out-of-scope employee and a stored 0 on an in-scope one
    // mean the same thing on the page: leave the rows off.
    //
    // The ceiling is tested against BASIC, not gross. That looks wrong against
    // the statute — the 21,000 limit is a gross-wages limit — but this payroll
    // computes ESIC on basic throughout, and a live record at 24,567 gross
    // carries ESIC of 93/400 precisely because its basic is 12,284. Testing
    // gross here would strip both rows off a letter for someone payroll is
    // actually deducting ESIC from.
    const esicApplies =
        opts.esic === undefined
            ? num(st.eeesic) !== null
                ? Number(st.eeesic) > 0 || Number(st.erEsic) > 0
                : basic > 0 && basic <= ESIC_GROSS_CEILING
            : !!opts.esic;

    const eeEsic = esicApplies
        ? pick(st.eeesic, Math.ceil(basic * SALARY_RATES.eeEsicPct))
        : 0;
    const erEsic = esicApplies
        ? pick(st.erEsic, Math.ceil(basic * SALARY_RATES.erEsicPct))
        : 0;

    const professionalTax = Math.max(0, r0(opts.professionalTax));
    const foodAllowance =
        opts.foodAllowance === "" || opts.foodAllowance === undefined
            ? pick(st.foodAllowance, 0)
            : Math.max(0, r0(opts.foodAllowance));

    // THE TOTALS ARE ALWAYS DERIVED, never copied — the one place stored values
    // deliberately lose.
    //
    // With an untouched payroll row they come out identical to the stored
    // totals anyway (verified: 1,474 + 93 = 1,567 = stored totalDeduction;
    // 24,567 + 1,474 + 61 + 61 + 400 + 1,478 = 28,041 = stored employerCost).
    // But the moment HR overrides the food allowance or adds professional tax,
    // a copied total describes a different set of rows than the ones printed
    // above it — a table that visibly does not add up, on a document someone
    // signs. Deriving keeps it footing in every case.
    const erEpf = epf;
    const totalDeduction = epf + eeEsic + professionalTax;
    const netSalary = G - totalDeduction;
    const ctc = G + erEpf + edli + adminCharges + erEsic + foodAllowance;

    return {
        gross: G, basic, hra,
        epf, edli, adminCharges,
        eeEsic, professionalTax, totalDeduction, netSalary,
        erEpf, erEsic, foodAllowance, ctc,
        esicApplies,
        pfCapped: basic > PF_WAGE_CEILING,
        fromPayroll: num(st.gross) !== null,
    };
}

/** Indian digit grouping. The renderer writes "INR" — WinAnsi has no rupee glyph. */
export const inr = (n) => Number(n || 0).toLocaleString("en-IN");

// ─────────────────────────────────────────────────────────────────────────────
//  Subject-line helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S/o · D/o · W/o. Derived, never guessed silently — HR can override both the
 * relation and the name in the form, because a widowed or separated employee
 * is not something the marital-status field reliably records.
 */
export function guardianRelation({ gender, maritalStatus }) {
    const g = String(gender || "").toLowerCase();
    const m = String(maritalStatus || "").toLowerCase();
    if (g === "female") return m.startsWith("married") ? "W/o" : "D/o";
    if (g === "male") return "S/o";
    return "S/o";
}

/** "Mr." · "Ms." — falls back to the stored title, then to gender. */
export function honorific({ title, gender, maritalStatus }) {
    if (title) return title;
    const g = String(gender || "").toLowerCase();
    if (g === "female") {
        return String(maritalStatus || "").toLowerCase().startsWith("married")
            ? "Mrs."
            : "Ms.";
    }
    if (g === "male") return "Mr.";
    return "";
}

/** The address block under the name, one line per element, empties dropped. */
export function addressLines(addr) {
    if (!addr) return [];
    const a = addr.current || addr.permanent || addr;
    const street = [a?.street].filter(Boolean).join(", ");
    const tail = [a?.city, a?.state].filter(Boolean).join(", ");
    const pin = a?.pincode ? `- ${a.pincode}` : "";
    return [street, [tail, pin].filter(Boolean).join(" ")].filter((l) => l && l.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
//  Variant registry
// ─────────────────────────────────────────────────────────────────────────────

export const APPOINTMENT_VARIANTS = {
    executive: {
        label: "Executive / staff",
        hint: "Office roles. Reports to the Head of the Department; the office terms annexure.",
        reportsTo: "Head of the Department",
        showProfessionalTax: false,
    },
    worker: {
        label: "Worker / operator",
        hint: "Shop-floor roles. Reports to the Production Manager; the factory terms annexure, with shift and overtime clauses.",
        reportsTo: "Production Manager",
        showProfessionalTax: true,
    },
};

export const DEFAULT_VARIANT = "executive";

/** The variant the designation/department suggests. HR still confirms it. */
export function suggestVariant({ designation = "", department = "" } = {}) {
    const hay = `${designation} ${department}`.toLowerCase();
    const floor = [
        "operator", "tailor", "helper", "worker", "cutting", "stitching",
        "checker", "packing", "ironing", "loader", "production", "machine",
    ];
    return floor.some((w) => hay.includes(w)) ? "worker" : "executive";
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared body — clauses 1..9, identical in both letters bar the reporting line
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clauses 1–9.
 *
 * Every heading is wrapped in a `group` with the paragraphs that belong to it,
 * so a section either fits on the page or moves to the next one entire. That is
 * the difference between a letter and a printout.
 */
const sharedBody = (v, cfg) => [
    {
        t: "group",
        items: [
            { t: "h2", text: "REPORTING" },
            {
                t: "p",
                text: [
                    { t: "You will report to the '" },
                    { t: cfg.reportsTo, b: true },
                    { t: "' or any other individual designated by them, who will assign your place of posting, duties, and responsibilities." },
                ],
            },
        ],
    },
    {
        t: "group",
        items: [
            { t: "h2", text: "COMPENSATIONS & BENEFITS" },
            {
                t: "p",
                text: "Your monthly/annual allowances, reimbursements, benefits, and perquisites are outlined in Annexure I of this letter. The detailed policies, procedures, rules, and regulations governing these will be provided upon your joining and may be revised at the sole discretion of Management, based on business needs.",
            },
        ],
    },
    {
        t: "group",
        items: [
            { t: "h2", text: "PROBATION / CONFIRMATION" },
            {
                t: "p",
                text: "You will initially be placed on probation for a period of six (6) months from the date of your appointment. If your performance is deemed unsatisfactory, the probation period may be extended by up to an additional three months, with written notification from the Company. However, during the probationary period, Management reserves the right to terminate your employment without notice and without providing any reason. Confirmation of your services will be based on your performance during probation and is solely at the discretion of the Management.",
            },
        ],
    },
    {
        t: "group",
        items: [
            { t: "h2", text: "NOTICE PERIOD" },
            {
                t: "p",
                text: "If you choose to resign during the probationary period, a notice period of one month or a salary payment in lieu of notice will be required. Upon confirmation of your services or after completing six months of employment, whichever comes first, either party may terminate this agreement by providing one month's written notice.",
            },
            {
                t: "p",
                text: "During the notice period, you are not allowed to utilize any accumulated leave in place of the notice period unless expressly approved by Management. You are expected to fulfill your professional responsibilities and serve the entire duration of the notice period. The Company retains the right to terminate your employment immediately, without compensation for any remaining portion of the notice period, in cases of misappropriation, financial negligence, or moral turpitude.",
            },
        ],
    },
    {
        t: "group",
        items: [
            { t: "h2", text: "PLACE OF POSTING" },
            {
                t: "p",
                text: [
                    { t: "Your initial assignment will be at " },
                    { t: `${v.companyName}, ${v.placeOfPosting}`, b: true },
                    { t: ". However, if the Company requires it in response to work needs and demands, you may be relocated or transferred to other units of the Company as deemed necessary." },
                ],
            },
        ],
    },
    {
        t: "group",
        items: [
            { t: "h2", text: "SEPARATION" },
            {
                t: "p",
                text: "Upon termination of your employment or resignation during your probationary period or thereafter, you must promptly return all tools, accessories, documents, specifications, passwords, and any other items in your possession or control to the Company. Clearance from the relevant person(s), office(s), or department(s) is required for the return of these items, as it is only upon their production that any dues owed to you will be settled by the Company.",
            },
            {
                t: "p",
                text: "The Company reserves the right to terminate your appointment immediately, at any time, without prior notice or compensation in lieu of notice.",
            },
            {
                t: "p",
                text: "For the purposes of this agreement, “termination for cause” shall include, but is not limited to, termination of employment due to the following:",
            },
            {
                t: "ul",
                items: [
                    "Violation of the Company’s rules, practices, procedures, or policies.",
                    "The discontinuation or elimination of your position.",
                ],
            },
        ],
    },
    {
        t: "group",
        items: [
            { t: "h2", text: "RETIREMENT" },
            {
                t: "p",
                text: `Your retirement age from the Company will be upon the completion of ${v.retirementAgeWords} (${v.retirementAge}) years, with retirement taking effect at the end of the accounting year in which you reach this age.`,
            },
        ],
    },
    {
        t: "group",
        items: [
            { t: "h2", text: "CONFLICT OF INTEREST" },
            {
                t: "p",
                text: "As a full-time employee of this organization, you are prohibited from taking on any other assignments, work, or employment, whether paid or unpaid, with any other employer. Additionally, you may not engage, either directly or indirectly, with any external agency or individual that provides services to the Company or its customers. If this policy is violated, you may face strict disciplinary actions, including the possibility of termination.",
            },
        ],
    },
    {
        t: "group",
        items: [
            { t: "h2", text: "OTHER TERMS AND CONDITIONS" },
            {
                t: "p",
                text: "Your employment with the Company will be governed by its rules and regulations, which may be updated periodically concerning your conduct, discipline, and other relevant matters. Furthermore, all existing rules and regulations applicable at the time you accept this appointment, as well as any future amendments made at the Company's discretion, will also apply to you. (Refer to Annexure II)",
            },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Annexure II — the two divergent clause sets
// ─────────────────────────────────────────────────────────────────────────────

/** Executive: 16 flat numbered clauses, no sub-headings. */
const EXECUTIVE_TERMS = [
    "You will be required to work 9 hours per day (including break time) as per the assigned roster. Please understand and acknowledge that the responsibilities of your position may occasionally require a higher level of commitment beyond the standard working hours.",
    "You are expected to comply with the organization's attendance and security systems at your workplace. This includes, but is not limited to, biometric punching, signing the attendance register, and adhering to physical or personal security checks, along with any other applicable procedures.",
    "Your annual increment will be based on your performance and the company’s performance in the previous year and should not be considered a routine matter.",
    "Any declaration or information you provide to the Company prove to be false, or if you are found to have intentionally withheld any material information, you may be removed from your position without notice or compensation.",
    "You are expected to perform your duties diligently, faithfully, and to the best of your abilities. You must also show proper respect and follow the instructions and orders of your supervisors, as well as provide accurate and truthful information regarding all tasks assigned to you by the Company.",
    "In addition to your assigned responsibilities, you may be required to undertake any other tasks as needed based on the demands of the work.",
    "The Company reserves the right to call upon you as needed for various skills or beyond normal office hours without additional remuneration or allowances.",
    "The Company may introduce or modify any rules and conditions deemed necessary for improving the existing structure, considering factors such as computerization and modern technology.",
    "You will be responsible for the proper care, usage, and return of any Company property entrusted to you. You must also account for this property and compensate for any financial loss incurred by the Company.",
    "You should strive to serve and promote the Company’s interests, earning the Management’s trust by demonstrating a sense of responsibility in all assignments, maturity in your relationships, and a high level of commitment to the organization.",
    "You are required to maintain absolute confidentiality regarding the Company’s business operations during your employment and thereafter.",
    "If the Management determines that you are negligent or inefficient in your duties, unreliable, have unsavory habits, exhibit immoral conduct, will fully disobey orders, or are guilty of any misconduct as outlined in the Service Conditions and House Rules, the Management may terminate your employment without notice or compensation after providing you the opportunity to explain your actions.",
    "A loss of confidence by the Management will be considered a valid reason for terminating your services without any explanation.",
    "Your absence from work for seven (7) consecutive days without prior permission will allow the Management to treat your absence as abandonment, leading to a loss of your employment.",
    "You must provide us with your mailing address for correspondence and notify us in writing of any changes. Any communication sent to you at the last address provided will be considered duly served.",
    "The Management warmly welcomes you to the Organization and anticipates a long and productive partnership with the Company. We trust that you will consistently act in the best interests of the Organization and contribute to both its success and your own career growth.",
];

/** Worker: headed clauses, one carrying a nested duties list. */
const WORKER_TERMS = [
    {
        heading: "Working Hours",
        paras: [
            "You will be required to work as per the factory shift schedule assigned by the Management. Normal working hours shall be up to 9 hours per day and 48 hours per week, including rest intervals, in accordance with applicable labour laws.",
        ],
    },
    {
        heading: "Overtime",
        paras: [
            "You may be required to work overtime based on production requirements. Any work beyond normal working hours will be treated as overtime and paid as per applicable labour laws and Company policy.",
        ],
    },
    {
        heading: "Attendance and Discipline",
        paras: [
            "You must follow the Company's attendance and security procedures, including biometric attendance, entry registers, and security checks. Late attendance or unauthorized absence may result in disciplinary action.",
        ],
    },
    {
        heading: "Duties and Responsibilities",
        paras: [
            "You shall perform your duties honestly, diligently, and to the best of your ability and shall follow lawful instructions of supervisors.",
            "You may be assigned duties such as:",
        ],
        bullets: [
            "Machine operation or assistance",
            "Material handling",
            "Cleaning of work area",
            "Shop-floor support work within your skill level and job category.",
        ],
    },
    {
        heading: "Additional Duties",
        paras: [
            "You may be required to perform other related work connected with factory operations as assigned by the Management.",
        ],
    },
    {
        heading: "Performance and Increment",
        paras: [
            "Annual increments, if any, will be based on individual performance and Company performance and shall not be considered automatic.",
        ],
    },
    {
        heading: "Company Rules",
        paras: [
            "You shall follow all factory rules, safety rules, standing orders, and policies issued by the Company from time to time.",
        ],
    },
    {
        heading: "Company Property",
        paras: [
            "You will be responsible for proper use and safe custody of Company tools, machines, uniforms, or equipment issued to you. Any loss or damage due to negligence may be recovered as per rules.",
        ],
    },
    {
        heading: "Confidentiality",
        paras: [
            "You shall maintain confidentiality regarding Company processes, production methods, and business information during and after employment.",
        ],
    },
    {
        heading: "False Information",
        paras: [
            "If any information provided by you is found to be false or misleading, the Company may terminate your employment as per applicable rules.",
        ],
    },
    {
        heading: "Misconduct",
        paras: [
            "In case of misconduct, negligence, disobedience, or violation of Company rules, disciplinary action may be taken as per Company rules and applicable labour laws.",
        ],
    },
    {
        heading: "Absence from Duty",
        paras: [
            "Absence without permission for 7 consecutive days may be treated as abandonment of service and may lead to termination as per Company rules.",
        ],
    },
    {
        heading: "Termination of Employment",
        paras: [
            "Either party may terminate employment by giving notice or wages in lieu of notice as per applicable labour laws or Company policy.",
        ],
    },
    {
        heading: "Address for Communication",
        paras: [
            "You must inform the Company in writing of any change in your address. Any communication sent to your last recorded address shall be treated as delivered.",
        ],
    },
    {
        heading: "Amendments",
        paras: [
            "The Company reserves the right to amend or modify rules and policies in accordance with applicable laws and operational requirements.",
        ],
    },
];

const CLOSING_PARAS = [
    "The Management warmly welcomes you to the Organization and anticipates a long and productive partnership with the Company. We trust that you will consistently act in the best interests of the Organization and contribute to both its success and your own career growth.",
    "Please sign the duplicate copy of this letter as a confirmation of your acceptance of the terms and conditions outlined above.",
    "Thanking you,",
];

// ─────────────────────────────────────────────────────────────────────────────
//  The builder
// ─────────────────────────────────────────────────────────────────────────────

/** Every knob, with the value the signed letters use. HR overrides in the form. */
export const APPOINTMENT_DEFAULTS = {
    companyName: COMPANY_NAME,
    companyLongName: COMPANY_LEGAL_NAME,
    placeOfPosting: COMPANY_PLACE_OF_POSTING,
    retirementAge: 58,
    retirementAgeWords: "fifty-eight",
    signatoryDesignation: "Sr. Executive- HR",
    foodAllowance: 1600,
    professionalTax: 0,
};

/**
 * Build the block list for one appointment letter.
 *
 * @param variant  "executive" | "worker"
 * @param v        the merged view model — see EMPTY_APPOINTMENT in documentKit
 * @returns        { blocks, salary }  salary is returned too so the form can
 *                 show HR the same figures the PDF will print.
 */
export function buildAppointmentLetter(variant, v) {
    const cfg = APPOINTMENT_VARIANTS[variant] || APPOINTMENT_VARIANTS[DEFAULT_VARIANT];
    const d = { ...APPOINTMENT_DEFAULTS, ...v };

    const salary = salaryBreakdown(d.grossSalary, {
        // The employee's own payroll row. Every figure it holds is copied
        // straight onto the page, so Annexure I and the employee's profile can
        // never disagree.
        stored: d.storedSalary,
        foodAllowance: d.foodAllowance,
        professionalTax: d.professionalTax,
        esic: d.esicApplicable,
    });

    const blocks = [];
    const push = (...b) => blocks.push(...b);

    // ── Date, addressee ─────────────────────────────────────────────────────
    // The addressee block is bold in both signed letters — name, relation and
    // every address line. Only the "Date:" label itself stays plain.
    push({ t: "p", text: [{ t: "Date: " }, { t: d.issueDate || "", b: true }], size: 11, tight: true });
    if (d.referenceNo) {
        push({ t: "p", text: [{ t: "Ref: " }, { t: d.referenceNo, b: true }], size: 11, tight: true });
    }
    push({ t: "space", h: 10 });

    const addr = [];
    addr.push(`${d.fullName || ""},`);
    if (d.guardianName) addr.push(`${d.guardianRelation || "S/o"}- ${d.guardianName},`);
    for (const line of d.addressLines || []) addr.push(`${line},`);
    // The last line of an address block does not end in a comma.
    if (addr.length > 1) addr[addr.length - 1] = addr[addr.length - 1].replace(/,$/, "");
    push({ t: "lines", items: addr, bold: true });

    push({ t: "space", h: 16 });
    push({ t: "h1", text: "LETTER OF APPOINTMENT" });
    push({ t: "space", h: 10 });

    // ── Opening ─────────────────────────────────────────────────────────────
    push({
        t: "group",
        items: [
            {
                t: "p",
                text: [
                    { t: "Dear " },
                    { t: [d.honorific, d.firstName || d.fullName].filter(Boolean).join(" "), b: true },
                    { t: "," },
                ],
            },
            {
                t: "p",
                text: [
                    { t: "With reference to your application and subsequent interview, we are pleased to offer you the position of " },
                    { t: d.designation || "-", b: true },
                    { t: ", effective from " },
                    { t: d.effectiveDate || d.dateOfJoining || "your date of joining", b: true },
                    { t: ` at ${d.companyName} under the operations of ${d.companyLongName}. The appointment is subject to the following terms of employment:` },
                ],
            },
        ],
    });
    push({
        t: "group",
        items: [
            { t: "p", text: "Your Designation & Department will be as follows:" },
            { t: "kv", label: "Designation:", value: d.designation || "-" },
            { t: "kv", label: "Department:", value: d.department || "-" },
        ],
    });

    push(...sharedBody(d, cfg));

    // ── Signature + acknowledgement ─────────────────────────────────────────
    // Signature and acknowledgement travel together — see the note on the
    // Annexure I tail below.
    push({ t: "space", h: 14 });
    push({
        t: "group",
        items: [
            { t: "sign", company: d.companyName, name: d.signatoryName, designation: d.signatoryDesignation },
            { t: "space", h: 12 },
            { t: "p", text: [{ t: "Employee Acknowledgement:", u: true }], tight: true },
            {
                t: "p",
                text: "I acknowledge that I have read and agree to the terms outlined in this appointment letter.",
            },
            {
                t: "sigfields",
                lead: 30,
                items: [
                    { label: "Signature:", w: 210 },
                    { label: "Date:", w: 170 },
                ],
            },
        ],
    });

    // ── ANNEXURE I ──────────────────────────────────────────────────────────
    push({ t: "pagebreak" });
    push({ t: "h1", text: "ANNEXURE I:  SALARY & BENEFITS", center: false });
    push({ t: "space", h: 8 });
    // Underlined, not bold — that is how it reads in both signed letters.
    push({
        t: "p",
        text: [{
            t: `FULL NAME OF EMPLOYEE: ${[d.honorific, d.fullName].filter(Boolean).join(" ")}`,
            u: true,
        }],
    });
    push({ t: "space", h: 6 });
    push({
        t: "group",
        items: [
            { t: "h2", text: "MONTHLY EMOLUMENTS:" },
            {
                t: "p",
                text: [
                    { t: "You will receive a monthly gross salary of " },
                    { t: `₹${inr(salary.gross)}`, b: true },
                    { t: " with the breakdown as follows:" },
                ],
            },
        ],
    });
    push({ t: "space", h: 4 });

    // Row order and row KIND both match the Word table exactly:
    //   GROSS SALARY is an ordinary bold row carrying an amount, not a heading;
    //   the two section captions are MERGED and centred with no amount; and
    //   there is one deliberately empty row before EMPLOYER CONTRIBUTION.
    const rows = [
        { label: "GROSS SALARY", amount: inr(salary.gross), strong: true },
        { label: "Basic Salary (50%)", amount: inr(salary.basic) },
        { label: "HRA (50%)", amount: inr(salary.hra) },
        { band: "EMPLOYEE DEDUCTIONS" },
        { label: "EPF (12%)", amount: inr(salary.epf) },
    ];
    // The ESIC rows disappear entirely above the wage ceiling rather than
    // printing a zero — a zero reads as "not deducted this month".
    if (salary.esicApplies) rows.push({ label: "ESIC (0.75%)", amount: inr(salary.eeEsic) });
    if (cfg.showProfessionalTax || salary.professionalTax > 0) {
        rows.push({ label: "Professional Tax", amount: inr(salary.professionalTax) });
    }
    rows.push(
        { label: "Total Deductions", amount: inr(salary.totalDeduction), strong: true },
        { label: "Net Salary", amount: inr(salary.netSalary), strong: true },
        { empty: true },
        { band: "EMPLOYER CONTRIBUTION" },
        { label: "Employer EPF (12%)", amount: inr(salary.erEpf) },
    );
    // EDLI and the EPF admin charge were missing from the first version, and
    // they are the reason the CTC row did not foot: payroll includes both in
    // employerCost, so leaving them off printed a total nobody could add up.
    // Shown only when payroll actually charges them.
    if (salary.edli > 0) rows.push({ label: "EDLI (0.5%)", amount: inr(salary.edli) });
    if (salary.adminCharges > 0) {
        rows.push({ label: "EPF Admin Charges (0.5%)", amount: inr(salary.adminCharges) });
    }
    if (salary.esicApplies) rows.push({ label: "Employer ESIC (3.25%)", amount: inr(salary.erEsic) });
    if (salary.foodAllowance > 0) {
        rows.push({ label: "Food Allowance", amount: inr(salary.foodAllowance) });
    }
    rows.push({ label: "Total Monthly CTC", amount: inr(salary.ctc), strong: true });

    push({ t: "table", head: ["Component", "Monthly Amount (₹)"], rows });

    push({ t: "space", h: 10 });
    // The whole tail of Annexure I is ONE group: the provident-fund clause, the
    // signature and the acknowledgement.
    //
    // Grouped only the acknowledgement and it landed alone on a page of its
    // own — three lines under a full letterhead, which reads as a printing
    // error. Either the tail follows the table or the tail becomes its own
    // properly-filled page; there is no arrangement where a stray fragment is
    // the better answer.
    push({
        t: "group",
        items: [
            { t: "h2", text: "PROVIDENT FUND" },
            {
                t: "p",
                text: `You will become a member of the Employee Provident Fund upon your date of joining. The Provident Fund will be calculated on a maximum Basic Salary of INR ${inr(PF_WAGE_CEILING)}/- at a rate of 12%, in accordance with the current PF regulations in India.`,
            },
            { t: "space", h: 14 },
            { t: "sign", company: null, name: d.signatoryName, designation: d.signatoryDesignation },
            { t: "space", h: 10 },
            { t: "p", text: [{ t: "Employee Acknowledgement:", u: true }], tight: true },
            {
                t: "p",
                text: "I confirm that I have read and agree to the terms outlined in this Appointment Letter",
            },
            {
                t: "sigfields",
                lead: 30,
                items: [
                    { label: "Employee's Signature:", w: 230 },
                    { label: "Date:", w: 150 },
                ],
            },
        ],
    });

    // ── ANNEXURE II ─────────────────────────────────────────────────────────
    push({ t: "pagebreak" });
    push({ t: "h1", text: "ANNEXURE II", center: false });
    push({ t: "p", text: "(Refer to Clause 9 of Contract of Employment)" });
    push({ t: "space", h: 8 });
    push({ t: "h2", text: "TERMS AND CONDITIONS" });
    push({ t: "space", h: 4 });

    if (variant === "worker") {
        // One group per clause: heading, its paragraphs and its bullets travel
        // together or move to the next page together.
        for (const c of WORKER_TERMS) {
            push({
                t: "group",
                items: [
                    { t: "h3", text: c.heading },
                    ...c.paras.map((p) => ({ t: "p", text: p })),
                    ...(c.bullets ? [{ t: "ul", items: c.bullets }] : []),
                ],
            });
        }
        for (const p of CLOSING_PARAS) push({ t: "p", text: p });
    } else {
        // The executive letter runs the welcome paragraph as clause 16 of the
        // numbered list, then the two closing lines outside it. The renderer
        // keeps each numbered clause whole on its own.
        push({ t: "ol", items: EXECUTIVE_TERMS });
        for (const p of CLOSING_PARAS.slice(1)) push({ t: "p", text: p });
    }

    push({ t: "space", h: 14 });
    push({
        t: "group",
        items: [
            { t: "sign", company: d.companyName, name: d.signatoryName, designation: d.signatoryDesignation },
            { t: "space", h: 12 },
            { t: "p", text: [{ t: "Employee Acknowledgement:", u: true }], tight: true },
            { t: "p", text: "I accept, agree to, and confirm the terms and conditions outlined above." },
            {
                t: "sigfields",
                lead: 36,
                items: [
                    { label: "Full Name:", w: 200 },
                    { label: "Signature:", w: 180 },
                ],
            },
            {
                t: "sigfields",
                lead: 22,
                items: [{ label: "Date:", w: 200 }],
            },
        ],
    });

    return { blocks, salary };
}
