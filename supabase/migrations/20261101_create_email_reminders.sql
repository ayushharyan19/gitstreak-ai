-- Phase 6: Email Reminders and Multi-Channel Delivery Tracking

-- 1. Extend user_preferences to support email reminders and verified email storage
alter table public.user_preferences add column if not exists email text;
alter table public.user_preferences add column if not exists email_reminders_enabled boolean not null default false;
alter table public.user_preferences add column if not exists email_reminder_time time;
alter table public.user_preferences add column if not exists email_reminder_types text[] not null default array['daily_reminder', 'streak_at_risk', 'weekly_summary']::text[];
alter table public.user_preferences add column if not exists email_reminder_days integer[] not null default array[1,2,3,4,5,6,0]::integer[];

-- Check constraint ensuring reminder time is set when email reminders are enabled
alter table public.user_preferences drop constraint if exists user_preferences_email_reminder_check;
alter table public.user_preferences add constraint user_preferences_email_reminder_check
  check ((email_reminders_enabled and email_reminder_time is not null) or not email_reminders_enabled);

-- 2. Extend reminder_deliveries for multi-channel idempotency and provider tracking
alter table public.reminder_deliveries add column if not exists channel text not null default 'web_push';
alter table public.reminder_deliveries add column if not exists provider_message_id text;

-- Replace old single-channel constraint with multi-channel unique constraint
alter table public.reminder_deliveries drop constraint if exists reminder_deliveries_user_type_date_unique;
alter table public.reminder_deliveries drop constraint if exists reminder_deliveries_user_channel_type_date_unique;
alter table public.reminder_deliveries add constraint reminder_deliveries_user_channel_type_date_unique
  unique (user_id, channel, reminder_type, reminder_date);

-- Add index on channel and user delivery history
create index if not exists reminder_deliveries_user_channel_date_idx
  on public.reminder_deliveries (user_id, channel, reminder_date);
