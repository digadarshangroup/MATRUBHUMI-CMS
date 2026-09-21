// lib/pushNotifications.js
//
// Call initPushNotifications() ONCE after a successful login.
// It: registers /sw.js → asks Notification permission → subscribes with the
// server's VAPID public key → POSTs the subscription to the backend.
//
// Safe to call repeatedly — subscribing twice just refreshes the same endpoint.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function initPushNotifications() {
  try {
    if (typeof window === "undefined") return { ok: false, reason: "ssr" };
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
      return { ok: false, reason: "unsupported" };

    // 1. Register the service worker
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // 2. Ask permission (no-op if already granted)
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    // 3. Get VAPID public key from the server
    const keyRes = await fetch(`${API_URL}/api/cms/notifications/vapid-public-key`, {
      credentials: "include",
    });
    const keyJson = await keyRes.json();
    if (!keyJson.success) return { ok: false, reason: "server-not-configured" };

    // 4. Subscribe (reuses existing subscription if present)
    let subscription = await reg.pushManager.getSubscription();
    // If an existing subscription was created with a DIFFERENT server key (e.g. FCM),
    // it can't be used with our VAPID keys — replace it.
    if (subscription) {
      const currentKey = subscription.options?.applicationServerKey
        ? btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey)))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : null;
      if (currentKey && currentKey !== keyJson.publicKey) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyJson.publicKey),
      });
    }

    // 5. Send to backend (attaches the logged-in user's role via cookie auth)
    const subRes = await fetch(`${API_URL}/api/cms/notifications/subscribe`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    const subJson = await subRes.json();
    return { ok: !!subJson.success, reason: subJson.success ? "subscribed" : subJson.message };
  } catch (err) {
    console.error("[push] init failed:", err);
    return { ok: false, reason: err.message };
  }
}

export async function disablePushNotifications() {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch(`${API_URL}/api/cms/notifications/unsubscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (err) { return { ok: false, reason: err.message }; }
}