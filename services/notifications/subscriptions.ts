import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  PushSubscriptionData,
  PushSubscriptionRecord,
  ReminderDeliveryRecord,
} from "./types";

export class SubscriptionError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message);
    this.name = "SubscriptionError";
  }
}

export async function registerSubscription(
  userId: string,
  data: PushSubscriptionData,
  githubToken?: string,
  githubUsername?: string
): Promise<PushSubscriptionRecord> {
  if (!data?.endpoint || !data?.keys?.p256dh || !data?.keys?.auth) {
    throw new SubscriptionError("Invalid push subscription payload.", 400);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new SubscriptionError("Database is not configured yet.", 503);
  }

  const row = {
    user_id: userId,
    endpoint: data.endpoint,
    p256dh: data.keys.p256dh,
    auth: data.keys.auth,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { data: record, error } = await supabase
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" })
    .select("id, user_id, endpoint, p256dh, auth, created_at, updated_at, last_used_at, is_active")
    .single();

  if (error || !record) {
    throw new SubscriptionError(error?.message || "Unable to save push subscription.", 500);
  }

  // Update GitHub access token and username in user_preferences if provided
  if (githubToken || githubUsername) {
    const updateData: Record<string, string> = {};
    if (githubToken) updateData.access_token = githubToken;
    if (githubUsername) updateData.github_username = githubUsername;

    try {
      await supabase
        .from("user_preferences")
        .update(updateData)
        .eq("user_id", userId);
    } catch {
      // Non-blocking credential sync
    }
  }

  return record as PushSubscriptionRecord;
}

export async function removeSubscription(userId: string, endpoint: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new SubscriptionError("Database is not configured yet.", 503);
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) {
    throw new SubscriptionError("Unable to remove subscription.", 500);
  }

  return true;
}

export async function getActiveSubscriptionsForUser(userId: string): Promise<PushSubscriptionRecord[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, created_at, updated_at, last_used_at, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error || !data) return [];
  return data as PushSubscriptionRecord[];
}

export async function deactivateSubscription(idOrEndpoint: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const isEndpoint = idOrEndpoint.startsWith("http");
  const query = supabase
    .from("push_subscriptions")
    .update({ is_active: false, updated_at: new Date().toISOString() });

  if (isEndpoint) {
    await query.eq("endpoint", idOrEndpoint);
  } else {
    await query.eq("id", idOrEndpoint);
  }
}

export async function touchSubscriptionLastUsed(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase
    .from("push_subscriptions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id);
}

export async function hasReminderBeenDelivered(
  userId: string,
  channelOrType: string,
  reminderDate: string,
  specificType?: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const isChannel = channelOrType === "web_push" || channelOrType === "email" || channelOrType === "whatsapp";
  const channel = isChannel ? channelOrType : "web_push";
  const reminderType = specificType || (isChannel ? "daily_reminder" : channelOrType);

  // Check matching sent delivery
  const query = supabase
    .from("reminder_deliveries")
    .select("id, status")
    .eq("user_id", userId)
    .eq("reminder_date", reminderDate)
    .eq("status", "sent");

  // Check with both multi-channel columns and legacy reminder_type match
  const { data } = await query
    .or(`and(channel.eq.${channel},reminder_type.eq.${reminderType}),and(reminder_type.eq.${channelOrType})`)
    .maybeSingle();

  return Boolean(data);
}

export async function recordReminderDelivery(delivery: ReminderDeliveryRecord): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const channel = delivery.channel || (delivery.reminder_type === "email" ? "email" : "web_push");
  const reminderType = delivery.reminder_type || "daily_reminder";

  const row: Record<string, unknown> = {
    user_id: delivery.user_id,
    channel,
    reminder_type: reminderType,
    reminder_date: delivery.reminder_date,
    sent_at: delivery.sent_at || new Date().toISOString(),
    status: delivery.status,
    error_message: delivery.error_message || null,
  };

  if (delivery.provider_message_id) {
    row.provider_message_id = delivery.provider_message_id;
  }

  // Attempt upsert with multi-channel uniqueness constraint
  const { error } = await supabase.from("reminder_deliveries").upsert(
    row,
    { onConflict: "user_id,channel,reminder_type,reminder_date" }
  );

  // Fallback to legacy onConflict constraint if table has not yet been migrated to multi-channel constraint
  if (error) {
    try {
      await supabase.from("reminder_deliveries").upsert(
        {
          user_id: delivery.user_id,
          reminder_type: delivery.reminder_type,
          reminder_date: delivery.reminder_date,
          sent_at: delivery.sent_at || new Date().toISOString(),
          status: delivery.status,
          error_message: delivery.error_message || null,
        },
        { onConflict: "user_id,reminder_type,reminder_date" }
      );
    } catch {
      // Ignored if legacy fallback fails
    }
  }
}
