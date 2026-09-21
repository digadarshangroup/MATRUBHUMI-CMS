// lib/customerApi.js
//
// The customer's own client for /api/customer/*.
//
// WHY IT IS NOT lib/salesApi.js
// -----------------------------
// salesApi speaks to /api/sales as a signed-in member of staff, with the CMS
// cookie replayed on every call. This speaks to a completely different identity
// — a farmer holding a code that was texted to them — and carries a bearer
// token this file is the only holder of. Sharing one client between them would
// mean one `credentials: "include"` away from sending a staff session to a
// public page, or a customer token to a desk route.
//
// THE TOKEN LIVES IN sessionStorage, NOT localStorage
// ---------------------------------------------------
// It expires in thirty minutes server-side either way. sessionStorage means it
// also dies when the tab closes, which matters because the likeliest device for
// this page is a shared handset in a village — and a token that outlives the
// person holding the phone is the one thing this page must not leave behind.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const KEY = "mb_customer_token";

export class CustomerApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CustomerApiError";
    this.status = status;
  }
}

export function getToken() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    // A locked-down browser is not a reason for the page to throw; it just
    // means the customer signs in again.
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do — see getToken */
  }
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth && getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new CustomerApiError("Could not reach us. Check your connection and try again.", 0);
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    throw new CustomerApiError(payload?.message || "Something went wrong.", res.status);
  }
  return payload;
}

export const customerApi = {
  requestCode: (phone) => request("/api/customer/otp", { method: "POST", body: { phone } }),
  signIn: (phone, otpId, code) => request("/api/customer/verify", { method: "POST", body: { phone, otpId, code } }),
  me: () => request("/api/customer/me", { auth: true }),
};

export default customerApi;
