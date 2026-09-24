// services/salesOtp.js
//
// Issue and verify the farmer's code. See models/Sales_Models/SalesOtp.js for
// why this exists at all and why the code is hashed rather than stored.

"use strict";

const crypto = require("crypto");
const SalesOtp = require("../models/Sales_Models/SalesOtp");
const { sendOtp } = require("./smsService");

const TTL_MINUTES = Number(process.env.SALES_OTP_TTL_MINUTES || 10);
const RESEND_COOLDOWN_SECONDS = Number(process.env.SALES_OTP_COOLDOWN_SECONDS || 45);
// Hashing the codes, so a database dump does not hand somebody every OTP in
// flight. Shared with the token secret deliberately — one secret to rotate.
const { SECRET } = require("../config/jwt");

/** Ten digits, or "" — the same normalisation SalesLead.phone stores under. */
function normalisePhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.length ? digits : "";
}

function hash(code, phone) {
  return crypto.createHash("sha256").update(`${code}:${phone}:${SECRET}`).digest("hex");
}

/**
 * A code that is not guessable and not a birthday.
 *
 * crypto.randomInt rather than Math.random: the whole point of this row is that
 * the person collecting the data cannot produce it themselves, and a
 * predictable PRNG hands that back to anyone who reads this file.
 */
function generate() {
  return String(crypto.randomInt(1000, 10000));
}

/**
 * Send a fresh code to a farmer's handset.
 *
 * @returns {{ otpId, status, expiresAt, manualCode }} `manualCode` is present
 *   ONLY when no SMS provider is configured or delivery failed — it is what the
 *   employee reads out. It is never returned on a successful send, because then
 *   the code would exist in two places and the phone stops being the proof.
 */
async function issueOtp({ phone, purpose = "lead_verify", leadId = null, taskId = null, stageKey = "", employee }) {
  const mobile = normalisePhone(phone);
  if (mobile.length !== 10) throw Object.assign(new Error("A valid 10-digit phone number is required"), { status: 400 });

  // One code in flight at a time. Without the cooldown, a shaky signal turns
  // into six taps on "resend" and six live codes for one visit.
  const recent = await SalesOtp.findOne({ phone: mobile, verifiedAt: null })
    .sort({ createdAt: -1 })
    .lean();
  if (recent) {
    const age = (Date.now() - new Date(recent.createdAt).getTime()) / 1000;
    if (age < RESEND_COOLDOWN_SECONDS) {
      throw Object.assign(
        new Error(`Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - age)}s before requesting another code`),
        { status: 429 },
      );
    }
  }

  const code = generate();
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  const delivery = await sendOtp(mobile, code);

  const row = await SalesOtp.create({
    phone: mobile,
    codeHash: hash(code, mobile),
    purpose,
    leadId,
    taskId,
    stageKey,
    requestedBy: employee.id,
    requestedByName: employee.name || "",
    channel: delivery.status === "sent" ? "sms" : "manual",
    delivery: {
      status: delivery.status,
      provider: delivery.provider,
      providerRef: delivery.providerRef,
      error: delivery.error,
    },
    expiresAt,
  });

  return {
    otpId: String(row._id),
    status: delivery.status,
    expiresAt,
    // See the doc comment: only on the degraded path.
    manualCode: delivery.status === "sent" ? null : code,
  };
}

/**
 * Check a code the farmer read off their phone.
 *
 * Counts attempts and stops at maxAttempts. Four digits is 10,000 guesses; with
 * no ceiling a script exhausts that in seconds and the whole mechanism is
 * theatre.
 */
async function verifyOtp({ otpId, phone, code }) {
  const mobile = normalisePhone(phone);
  const row = otpId
    ? await SalesOtp.findById(otpId)
    : await SalesOtp.findOne({ phone: mobile, verifiedAt: null }).sort({ createdAt: -1 });

  if (!row) throw Object.assign(new Error("No verification is pending for this number"), { status: 404 });
  if (row.verifiedAt) return { verified: true, otpId: String(row._id), alreadyVerified: true };
  if (row.expiresAt < new Date()) {
    throw Object.assign(new Error("That code has expired — send a new one"), { status: 410 });
  }
  if (row.attempts >= row.maxAttempts) {
    throw Object.assign(new Error("Too many incorrect attempts — send a new code"), { status: 429 });
  }

  const supplied = String(code || "").replace(/\D/g, "");
  const expected = row.codeHash;
  const actual = hash(supplied, row.phone);

  // Constant-time compare. The lengths are equal by construction (both are
  // sha256 hex), so timingSafeEqual cannot throw here.
  const ok = crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));

  if (!ok) {
    await SalesOtp.updateOne({ _id: row._id }, { $inc: { attempts: 1 } });
    throw Object.assign(
      new Error(`Incorrect code — ${row.maxAttempts - row.attempts - 1} attempt(s) left`),
      { status: 400 },
    );
  }

  row.verifiedAt = new Date();
  row.attempts += 1;
  await row.save();

  // `leadId` travels back so the caller does not have to repeat what this row
  // already knows — see the note at the /otp/verify route.
  return {
    verified: true,
    otpId: String(row._id),
    phone: row.phone,
    verifiedAt: row.verifiedAt,
    leadId: row.leadId ? String(row.leadId) : null,
  };
}

/**
 * A verification is spendable once. Returns the row if this submission may use
 * it, and marks it spent in the same operation so a second submission cannot.
 */
async function consumeOtp(otpId, submissionId) {
  if (!otpId) return null;
  const row = await SalesOtp.findOneAndUpdate(
    { _id: otpId, verifiedAt: { $ne: null }, consumedAt: null },
    { $set: { consumedAt: new Date(), consumedBySubmission: submissionId } },
    { new: true },
  );
  return row;
}

module.exports = { issueOtp, verifyOtp, consumeOtp, normalisePhone };
