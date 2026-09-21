// middleware.js
// Until now, access control was the filesystem: if you knew the URL, you got
// the page. Typing /hr/dashboard or /ceo/dashboard rendered the full
// interface to anyone, signed in or not — the individual API calls inside it
// would fail one at a time, but the shell, the navigation and any cached data
// were all visible. That is not a login; that is a speed bump.
//
// This runs on the server before any page is sent, so there is no flash of
// protected content and no client-side check to disable.
//
// WHAT THIS DOES AND DOES NOT DO
// ------------------------------
// It checks that a session cookie EXISTS and bounces to the sign-in portal if
// it does not. It deliberately does NOT verify the token's signature or read
// its claims: doing that here would mean either shipping the signing secret to
// the edge runtime or making a blocking network call on every single page
// navigation.
//
// Verification is done properly one layer in, by <DepartmentGuard>, which calls
// /api/auth/verify — and that endpoint re-reads the user, their department and
// their assignment from the database on every request. So this file stops the
// unauthenticated case cheaply, and the guard stops the wrong-department case
// authoritatively. Neither is sufficient alone.

import { NextResponse } from "next/server";

const COOKIE = "auth_token";

/** Every department dashboard. Anything under these needs a session. */
const PROTECTED_PREFIXES = ["/hr", "/ceo", "/sales", "/employee"];

/**
 * Open to everyone. Listed explicitly rather than inferred, because the cost of
 * accidentally protecting the login page is an infinite redirect and the cost
 * of accidentally exposing a dashboard is a data leak — so the list that grants
 * access should be the one that is written down.
 */
const PUBLIC_PATHS = ["/", "/onboarding", "/login", "/not-found"];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  if (request.cookies.get(COOKIE)?.value) return NextResponse.next();

  // Carry where they were headed so they land there after signing in rather
  // than on a generic dashboard.
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals, the API proxy and static files. Matching
  // images and fonts would triple the middleware invocations for no benefit.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$).*)"],
};
