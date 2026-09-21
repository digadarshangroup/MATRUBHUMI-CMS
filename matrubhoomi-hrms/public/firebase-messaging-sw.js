// public/firebase-messaging-sw.js
// ONE unified service worker for ALL push notifications:
// 1. FCM background push (app closed/background) via onBackgroundMessage
// 2. Foreground push (app open) via postMessage SHOW_NOTIFICATION from usePushNotifications
// 3. Click routing — opens correct page

importScripts(
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js",
);

// ⚠ FILL THIS IN, or background push simply never arrives.
//
// A service worker runs outside the bundle, so it cannot read process.env and
// these cannot come from .env like every other Firebase value. They are the
// PUBLIC half of a Firebase config — safe to commit — but they must be YOUR
// project's, and they must match NEXT_PUBLIC_FIREBASE_* exactly or the token
// the page registers will not match the project this worker listens on.
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  databaseURL: "",
};

// Unconfigured is a supported state, not an error: everything else in the app
// works without push. Initialising with empty strings throws inside the SDK and
// kills the whole worker, taking the click-routing below with it.
const PUSH_CONFIGURED = Boolean(FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
if (PUSH_CONFIGURED) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

const messaging = PUSH_CONFIGURED ? firebase.messaging() : null;

// Take over as soon as a new version is installed, instead of waiting for every
// tab to close. Without this, an updated worker sits in "waiting" and the old
// one keeps running — which is why earlier worker changes appeared to do
// nothing. Safe here: this worker only handles push / clicks, no fetch caching.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
// ── URL routing map ───────────────────────────────────────────────────────────
//
// Where a notification takes you when it is tapped. Every value must be a route
// that EXISTS — a click that lands on a 404 is worse than a notification that
// does not route at all, because it looks like the app is broken rather than
// like the feature is absent.
const URL_MAP = {
  leave_applied: "/hr/dashboard/leaves",
  leave_approved: "/hr/dashboard/leaves",
  leave_rejected: "/hr/dashboard/leaves",
  attendance_regularization: "/hr/dashboard/attendance/regularizations",
  attendance_override: "/hr/dashboard/attendance/daily",
  payslip_released: "/hr/dashboard/payroll/payslip",
  document_released: "/hr/dashboard/documents",
  document_requested: "/hr/dashboard/documents/requests",
  candidate_applied: "/hr/dashboard/recruitment",
};

function getUrl(type) {
  return URL_MAP[type] || "/hr/dashboard";
}

// ── 1. FCM Background/Closed push (Android Chrome + desktop) ─────────────────
// Guarded: with no Firebase config there is no messaging instance, and calling
// through a null here would throw and take the click routing below with it.
if (messaging) messaging.onBackgroundMessage((payload) => {});

// iOS push handled by onBackgroundMessage above

// ── 2. Foreground push — from usePushNotifications postMessage ────────────────
self.addEventListener("message", (event) => {
  const payload = event.data || {};
  if (payload.type !== "SHOW_NOTIFICATION") return;

  const { title, body, tag, data } = payload;
  const type = data?.type || "";

  self.registration.showNotification(title || "Matrubhoomi HRMS", {
    body: body || "",
    icon: "/matrubhoomi-mark.png",
    badge: "/matrubhoomi-mark.png",
    tag: tag || "mb-" + (type || "notif"),
    renotify: true,
    data: { url: data?.url || getUrl(type), ...data },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  });
});


self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/hr/dashboard";
  const fullUrl = self.location.origin + url;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const exactMatch = list.find((c) => c.url === fullUrl);
        if (exactMatch) {
          exactMatch.focus();
          return;
        }
        const anyTab = list.find((c) => c.url.startsWith(self.location.origin));
        if (anyTab) {
          anyTab.navigate(fullUrl);
          anyTab.focus();
          return;
        }
        if (clients.openWindow) return clients.openWindow(fullUrl);
      }),
  );
});
