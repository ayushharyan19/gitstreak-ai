import "server-only";
import webpush from "web-push";
import type { NotificationDeliveryResult, NotificationPayload, PushSubscriptionRecord } from "./types";

export function isVapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "Web Push VAPID credentials are not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT."
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendWebPushToSubscription(
  subscription: Pick<PushSubscriptionRecord, "id" | "endpoint" | "p256dh" | "auth">,
  payload: NotificationPayload
): Promise<NotificationDeliveryResult> {
  if (!isVapidConfigured()) {
    return {
      success: false,
      channel: "web_push",
      subscriptionId: subscription.id,
      error: "VAPID credentials are not configured on the server.",
    };
  }

  try {
    ensureVapidConfigured();

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    const notificationData = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/dashboard",
      icon: payload.icon || "/favicon.ico",
      badge: payload.badge || "/favicon.ico",
      tag: payload.tag || "gitstreak-reminder",
    });

    const result = await webpush.sendNotification(pushSubscription, notificationData);

    return {
      success: true,
      channel: "web_push",
      subscriptionId: subscription.id,
      statusCode: result.statusCode,
    };
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string } | undefined;
    const statusCode = err?.statusCode;
    // 404 Not Found or 410 Gone means the subscription is expired or unsubscribed
    const shouldDeactivate = statusCode === 404 || statusCode === 410;

    return {
      success: false,
      channel: "web_push",
      subscriptionId: subscription.id,
      statusCode,
      error: err?.message || "Failed to deliver web push notification",
      shouldDeactivate,
    };
  }
}
