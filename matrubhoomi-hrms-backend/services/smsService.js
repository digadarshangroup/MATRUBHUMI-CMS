// services/smsService.js
//
// One seam for outbound SMS, with no provider behind it yet.
//
// WHY IT DEGRADES INSTEAD OF THROWING
// -----------------------------------
// Nothing in this deployment has an SMS account. The OTP flow still has to work
// on the day somebody installs the app, so an unconfigured sender returns
// `{ status: "manual", code }` and the API hands the code back to the EMPLOYEE
// to read out to the farmer.
//
// That is a real, weaker mode and it is labelled as such everywhere it appears:
// the OTP row stores `delivery.status: "manual"`, and the desk sees "read out
// by employee" rather than "verified by SMS". It is not pretending. When
// credentials appear in the environment the same call starts delivering and
// every record after that reads `sent`, with nothing else changing.
//
// Follows the pattern config/firebaseAdmin.js established: the optional
// dependency is required lazily, inside a try, and its absence is a degraded
// feature rather than a server that will not boot.

"use strict";

const PROVIDER = String(process.env.SMS_PROVIDER || "").toLowerCase().trim();

function isConfigured() {
  if (PROVIDER === "msg91") return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID);
  if (PROVIDER === "twilio") {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM,
    );
  }
  return false;
}

/** E.164 for India. Providers reject a bare ten-digit number. */
function toE164(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

async function sendViaMsg91(phone, message) {
  const res = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: process.env.MSG91_AUTH_KEY,
    },
    body: JSON.stringify({
      template_id: process.env.MSG91_TEMPLATE_ID,
      sender: process.env.MSG91_SENDER_ID,
      short_url: "0",
      recipients: [{ mobiles: toE164(phone).replace("+", ""), OTP: message.code, VAR1: message.code }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `MSG91 responded ${res.status}`);
  return { provider: "msg91", providerRef: body?.request_id || "" };
}

async function sendViaTwilio(phone, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: toE164(phone),
      From: process.env.TWILIO_FROM,
      Body: message.text,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `Twilio responded ${res.status}`);
  return { provider: "twilio", providerRef: body?.sid || "" };
}

/**
 * Deliver a verification code.
 *
 * NEVER THROWS. A failed send must not fail the visit the employee is standing
 * in the middle of — it falls back to the manual path and says so, which is
 * exactly what an employee with a farmer in front of them needs.
 *
 * @returns {{status:"sent"|"manual"|"failed", provider:string, providerRef:string, error:string}}
 */
async function sendOtp(phone, code, { companyName = "Matrubhoomi Farms" } = {}) {
  const text = `${code} is your verification code for ${companyName}. It is valid for 10 minutes. Do not share it with anyone.`;

  if (!isConfigured()) {
    return { status: "manual", provider: "", providerRef: "", error: "" };
  }

  try {
    const out =
      PROVIDER === "msg91"
        ? await sendViaMsg91(phone, { code, text })
        : await sendViaTwilio(phone, { code, text });
    return { status: "sent", provider: out.provider, providerRef: out.providerRef, error: "" };
  } catch (err) {
    console.error("[sms] Could not deliver an OTP:", err.message);
    // Deliberately still usable: the code exists, the farmer is present, and
    // the employee can read it out. The record will say the SMS failed.
    return { status: "failed", provider: PROVIDER, providerRef: "", error: err.message };
  }
}

module.exports = { sendOtp, isConfigured, toE164 };
