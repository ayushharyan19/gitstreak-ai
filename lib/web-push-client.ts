/**
 * Client-side Web Push utilities for GitStreak AI
 */

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    return registration;
  } catch (error) {
    console.error("Failed to register service worker:", error);
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error("Web Push is not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notification permission was denied. Please allow notifications in your browser settings."
        : "Notification permission was dismissed."
    );
  }

  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  // Unsubscribe any stale existing subscription to avoid key mismatch errors
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe();
    }
  } catch {
    // Continue if cleanup fails
  }

  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as unknown as BufferSource,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("push service error")) {
      const nav = navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> | boolean } };
      const isBrave = Boolean(nav.brave && typeof nav.brave.isBrave === "function");
      if (isBrave) {
        throw new Error(
          "Registration failed - push service error. In Brave, go to brave://settings/privacy and turn ON 'Use Google services for push messaging', then restart the browser."
        );
      }
      throw new Error(
        "Registration failed - push service error. The browser could not reach the push notification service. Please ensure you are not in an Incognito window, restart 'npm run dev' to ensure latest VAPID keys are loaded, and check if an ad blocker or VPN is blocking push messaging."
      );
    }
    throw err;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const subscription = await getCurrentSubscription();
    if (subscription) {
      return await subscription.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}
