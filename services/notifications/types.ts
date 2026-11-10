import type { EmailReminderType } from "@/types/preferences";

export type ReminderChannel = "web_push" | "email" | "whatsapp";

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
}

export interface NotificationDeliveryResult {
  success: boolean;
  channel: ReminderChannel;
  subscriptionId?: string;
  statusCode?: number;
  error?: string;
  shouldDeactivate?: boolean;
}

export interface ReminderDeliveryRecord {
  id?: string;
  user_id: string;
  channel: ReminderChannel;
  reminder_type: string;
  reminder_date: string;
  sent_at?: string;
  status: "sent" | "failed" | "skipped";
  error_message?: string | null;
  provider_message_id?: string | null;
}

export interface UserReminderProfile {
  user_id: string;
  timezone: string;
  daily_goal: number;
  weekly_goal: number;
  reminder_enabled: boolean;
  reminder_time: string | null;
  access_token?: string | null;
  github_username?: string | null;
  email?: string | null;
  email_reminders_enabled?: boolean;
  email_reminder_time?: string | null;
  email_reminder_types?: EmailReminderType[];
  email_reminder_days?: number[];
}

export interface SchedulerSummary {
  timestamp: string;
  processedUsers: number;
  eligibleUsers: number;
  sent: number;
  skipped: number;
  failed: number;
  deactivatedSubscriptions: number;
  webPushSent: number;
  emailSent: number;
  errors: Array<{ userId: string; channel?: string; error: string }>;
}
