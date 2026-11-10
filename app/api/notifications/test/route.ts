import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  deactivateSubscription,
  getActiveSubscriptionsForUser,
  touchSubscriptionLastUsed,
} from "@/services/notifications/subscriptions";
import { isVapidConfigured, sendWebPushToSubscription } from "@/services/notifications/web-push";

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!isVapidConfigured()) {
    return NextResponse.json(
      { error: "Web push is not configured on the server. VAPID keys are missing." },
      { status: 503 }
    );
  }

  const subscriptions = await getActiveSubscriptionsForUser(token.sub);
  if (subscriptions.length === 0) {
    return NextResponse.json(
      { error: "No active push subscriptions found for this browser or device. Please enable notifications first." },
      { status: 400 }
    );
  }

  let delivered = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const sub of subscriptions) {
    const result = await sendWebPushToSubscription(sub, {
      title: "GitStreak AI",
      body: "Web push notifications are working! We'll alert you if your daily streak goal is incomplete.",
      url: "/dashboard",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    });

    if (result.success) {
      delivered++;
      await touchSubscriptionLastUsed(sub.id);
    } else {
      failed++;
      lastError = result.error || "Delivery failed";
      if (result.shouldDeactivate) {
        await deactivateSubscription(sub.id);
      }
    }
  }

  if (delivered === 0) {
    return NextResponse.json(
      { error: `Failed to deliver test notification: ${lastError}` },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { success: true, delivered, failed },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
