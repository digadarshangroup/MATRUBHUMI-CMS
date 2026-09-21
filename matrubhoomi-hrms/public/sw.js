/**
 * public/sw.js
 * Web-push service worker.
 *
 * Registered from lib/pushNotifications.js at sign-in. Separate from
 * firebase-messaging-sw.js, which handles FCM; this one handles the VAPID
 * web-push subscription.
 *
 * Features:
 *  - Rich notifications: icon, badge, image, action buttons
 *  - Sound via AudioContext played in the client (a SW cannot play audio itself)
 *  - Deep-link routing to the screen that owns the thing being notified about
 *  - notificationclick focuses an existing tab where possible rather than
 *    opening a second copy of the app
 *  - renotify: true so each new notification re-alerts even with the same tag
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

/* ── Notification icons ───────────────────────────────────────────────────── */
// One mark for every type. A per-type icon set was inherited from a product
// that shipped the artwork for it; drawing a notification with a src that 404s
// silently gives you the browser's own default and a wasted request.
const TYPE_ICONS = {};
const DEFAULT_ICON = "/matrubhoomi-mark.png";
const BADGE_ICON = "/matrubhoomi-mark.png";

/* ── Deep-link URL for each notification type ─────────────────────────────── */
// Every branch must name a route that EXISTS. A click that lands on a 404 reads
// as a broken app, which is worse than a notification that does not route.
function resolveUrl(data) {
  const { type } = data || {};
  if (type === "leave") return "/hr/dashboard/leaves";
  if (type === "regularization") return "/hr/dashboard/attendance/regularizations";
  if (type === "attendance") return "/hr/dashboard/attendance/daily";
  if (type === "payslip") return "/hr/dashboard/payroll/payslip";
  if (type === "document") return "/hr/dashboard/documents";
  if (type === "candidate") return "/hr/dashboard/recruitment";
  return "/hr/dashboard";
}

/* ── Action buttons by notification type ─────────────────────────────────── */
function resolveActions(type) {
  if (type === "request")
    return [
      { action: "open", title: "View Request" },
      { action: "dismiss", title: "Dismiss" },
    ];
  if (type === "task_assigned")
    return [
      { action: "open", title: "Open Task" },
      { action: "dismiss", title: "Dismiss" },
    ];
  if (type === "task_chat")
    return [
      { action: "open", title: "Reply" },
      { action: "dismiss", title: "Dismiss" },
    ];
  if (type === "daily_report")
    return [
      { action: "open", title: "View Report" },
      { action: "dismiss", title: "Dismiss" },
    ];
  if (type === "completion")
    return [
      { action: "open", title: "Review" },
      { action: "dismiss", title: "Dismiss" },
    ];
  return [
    { action: "open", title: "Open" },
    { action: "dismiss", title: "Dismiss" },
  ];
}

/* ── Build full notification options ─────────────────────────────────────── */
function buildOptions(payload) {
  const { title, body, type, tag, data, image } = payload;
  const icon = TYPE_ICONS[type] || DEFAULT_ICON; // always use app/type icon, not sender avatar
  // An explicit url in the payload wins over the type-based routing above
  const url = payload.url || data?.url || resolveUrl({ type, ...data });
  const actions = resolveActions(type);

  const opts = {
    body: body || "",
    icon,
    badge: BADGE_ICON,
    tag: tag || `mb-${type || "notif"}-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    silent: false, // lets the OS play its default sound
    vibrate: [120, 60, 120, 60, 200],
    timestamp: Date.now(),
    actions,
    data: { url, type, ...data },
  };

  // Attach image preview when an attachment URL is provided
  if (image) opts.image = image;

  return opts;
}

/* ── postMessage from the app (foreground tab) ───────────────────────────── */
self.addEventListener("message", (e) => {
  const payload = e.data || {};
  if (payload.type !== "SHOW_NOTIFICATION") return;

  e.waitUntil(
    self.registration
      .showNotification(payload.title || "Matrubhoomi HRMS", buildOptions(payload))
      .then(() => {
        // Ask the originating client to play a sound — SW has no Web Audio API
        e.source?.postMessage({
          type: "PLAY_NOTIF_SOUND",
          notifType: payload.notifType || payload.type || "default",
        });
      }),
  );
});

/* ── Background push event (FCM / VAPID future support) ─────────────────── */
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let payload = {};
  try {
    const raw = e.data.json();
    // FCM can wrap payload in different structures:
    // 1. { title, body, data: {...} }        — notification message
    // 2. { data: { title, body, type, ... } } — data-only message (our preferred format)
    // 3. { notification: { title, body }, data: {...} } — combined
    if (raw.data?.title) {
      // data-only message — extract everything from data field
      payload = {
        title: raw.data.title,
        body: raw.data.body || "",
        type: raw.data.type || "",
        tag: raw.data.tag || "",
        data: raw.data,
      };
    } else if (raw.notification?.title) {
      // notification message
      payload = {
        title: raw.notification.title,
        body: raw.notification.body || "",
        type: raw.data?.type || "",
        tag: raw.data?.tag || "",
        data: raw.data || {},
      };
    } else {
      // direct format
      payload = raw;
    }
  } catch {
    return;
  }

  const title = payload.title || "Matrubhoomi HRMS";
  e.waitUntil(self.registration.showNotification(title, buildOptions(payload)));
});

/* ── Notification click — deep-link routing ──────────────────────────────── */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "dismiss") return;

  const url = e.notification.data?.url || "/hr/dashboard";

  e.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Any tab already on this app will do. Matching on a path prefix
        // meant a person sitting on the dashboard got a SECOND copy of the app
        // opened next to it instead of the one they had focused.
        const match = clients[0];
        if (match) {
          match.focus();
          match.postMessage({
            type: "NOTIF_CLICK",
            url,
            data: e.notification.data,
          });
          if ("navigate" in match) match.navigate(url);
        } else {
          self.clients.openWindow(url);
        }
      }),
  );
});
