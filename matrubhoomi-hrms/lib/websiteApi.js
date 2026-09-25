// lib/websiteApi.js
//
// One client for /api/website/*, the content that ends up on the public
// marketing site.
//
// WHY THIS IS NOT A SECTION INSIDE salesApi.js
// --------------------------------------------
// `salesApi.schemes()` already exists and means something else entirely — the
// pipelines a customer is put through, whose key IS the `pipelineKey` every
// sales document carries. Adding a second `schemes` there would have forced a
// name like `websiteSchemes` on one of them and left the two a keystroke apart
// in autocomplete, on a screen where picking the wrong one silently edits the
// live sales pipeline. A separate module makes the mistake unavailable rather
// than merely unlikely.
//
// The envelope and error handling are the same as salesApi's, deliberately, so
// a screen can use either without learning a second set of rules.

import { SalesApiError } from "@/lib/salesApi";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function request(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      signal,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new SalesApiError("Could not reach the server. Check your connection.", { status: 0 });
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok || payload?.success === false) {
    throw new SalesApiError(payload?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: payload?.code,
      fields: payload?.fields,
      payload,
    });
  }

  return payload;
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

export const websiteApi = {
  /* Public scheme listings — the cards on matrubhoomifarms.com/<category>. */
  schemes: (params) => request(`/api/website/schemes${qs(params)}`),
  scheme: (id) => request(`/api/website/schemes/${id}`),
  createScheme: (body) => request("/api/website/schemes", { method: "POST", body }),
  updateScheme: (id, body) => request(`/api/website/schemes/${id}`, { method: "PATCH", body }),
  deleteScheme: (id) => request(`/api/website/schemes/${id}`, { method: "DELETE" }),
};

export default websiteApi;
