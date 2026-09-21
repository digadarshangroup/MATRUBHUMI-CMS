// lib/company.js
//
// The company's own particulars — ONE place, read by everything that prints
// them.
//
// WHY THIS FILE EXISTS
// --------------------
// The registered name, address, phone and CIN appear on the appointment letter,
// the offer letter, the experience and relieving letters, the salary
// certificate, every payslip, and the ID card. Before this they were literals
// inside each of those generators, which meant a change of address was six
// edits and the guarantee that at least one document would keep printing the
// old one for months.
//
// EVERY VALUE HERE IS OVERRIDABLE FROM THE ENVIRONMENT, because a registration
// detail changing must never require a code change and a deploy. The literals
// below are the fallback, not the authority.
//
// ⚠ THE PLACEHOLDERS MARKED "TO BE CONFIRMED" ARE NOT REAL.
// They print on legal documents. Set the real values — in `.env.local` for a
// local run, in the deployment's environment for a real one — before any letter
// is issued to an actual employee.

const env = (key, fallback) => {
  const v = process.env[key];
  return v && String(v).trim() ? String(v).trim() : fallback;
};

/** Short form, for a heading or a sentence. */
export const COMPANY_NAME = env(
  "NEXT_PUBLIC_COMPANY_NAME",
  "Matrubhoomi Farms & Developers Pvt. Ltd.",
);

/** The registered name, for the top of a legal document. */
export const COMPANY_LEGAL_NAME = env(
  "NEXT_PUBLIC_COMPANY_LEGAL_NAME",
  "Matrubhoomi Farms & Developers Private Limited",
);

/**
 * The registered address, one line per printed line.
 *
 * Two lines is what the letterhead's footer band is sized for — a third will
 * overrun into the dark bar. If the real address needs three, raise BOT_Y in
 * app/hr/dashboard/documents/letterPdf.js to match.
 */
export const COMPANY_ADDRESS_LINES = (
  env("NEXT_PUBLIC_COMPANY_ADDRESS", "Address — TO BE CONFIRMED|Odisha, India")
).split("|");

/** Where a new employee is posted unless HR says otherwise. */
export const COMPANY_PLACE_OF_POSTING = env(
  "NEXT_PUBLIC_COMPANY_PLACE_OF_POSTING",
  "Odisha",
);

export const COMPANY_PHONE = env("NEXT_PUBLIC_COMPANY_PHONE", "TO BE CONFIRMED");
export const COMPANY_CIN = env("NEXT_PUBLIC_COMPANY_CIN", "TO BE CONFIRMED");
export const COMPANY_EMAIL = env(
  "NEXT_PUBLIC_COMPANY_EMAIL",
  "hr@matrubhoomifarms.in",
);
export const COMPANY_WEBSITE = env("NEXT_PUBLIC_COMPANY_WEBSITE", "");

/**
 * The letterhead's contact strip.
 *
 * A literal "|" rather than a box-drawing bar (U+2502): the Helvetica fallback
 * cannot encode that character, and a separator that vanishes only when the
 * embedded font fails to load is a bad way to find out.
 */
export const COMPANY_CONTACT_LINE = `Contact- ${COMPANY_PHONE}  |  CIN- ${COMPANY_CIN}`;

/** True while any legally-printed field is still a placeholder. */
export const COMPANY_DETAILS_INCOMPLETE = [
  COMPANY_PHONE,
  COMPANY_CIN,
  ...COMPANY_ADDRESS_LINES,
].some((v) => String(v).includes("TO BE CONFIRMED"));
