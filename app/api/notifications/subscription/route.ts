import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import {
  getActiveSubscriptionsForUser,
  registerSubscription,
  removeSubscription,
  SubscriptionError,
} from "@/services/notifications/subscriptions";
import { getVapidPublicKey, isVapidConfigured } from "@/services/notifications/web-push";

const subscriptionSchema = z.object({
  endpoint: z.string().url("Valid push endpoint URL is required."),
  keys: z.object({
    p256dh: z.string().min(1, "p256dh key is required."),
    auth: z.string().min(1, "auth key is required."),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url("Valid push endpoint URL is required."),
});

async function getAuthContext(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.sub) return null;
  return {
    userId: token.sub,
    accessToken: typeof token.accessToken === "string" ? token.accessToken : undefined,
    login: typeof token.login === "string" ? token.login : undefined,
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const subscriptions = await getActiveSubscriptionsForUser(auth.userId);
    return NextResponse.json(
      {
        subscribed: subscriptions.length > 0,
        subscriptionCount: subscriptions.length,
        vapidPublicKey: getVapidPublicKey(),
        vapidConfigured: isVapidConfigured(),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof SubscriptionError ? error.message : "Unable to load subscription status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = subscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid subscription data." },
        { status: 400 }
      );
    }

    const record = await registerSubscription(
      auth.userId,
      parsed.data,
      auth.accessToken,
      auth.login
    );

    return NextResponse.json(
      { success: true, subscriptionId: record.id },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof SubscriptionError ? error.message : "Unable to register subscription.";
    const status = error instanceof SubscriptionError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid unsubscribe payload." },
        { status: 400 }
      );
    }

    await removeSubscription(auth.userId, parsed.data.endpoint);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof SubscriptionError ? error.message : "Unable to remove subscription.";
    const status = error instanceof SubscriptionError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
