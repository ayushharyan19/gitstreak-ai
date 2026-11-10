-- Phase 5: Web Push Notifications and Scheduled Reminder Deliveries

-- 1. Table for Web Push Subscriptions (multi-device support per user)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  is_active boolean not null default true
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_endpoint_idx on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_active_idx on public.push_subscriptions (user_id, is_active);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;

-- 2. Table for Reminder Deliveries (idempotency & audit log)
create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  reminder_type text not null default 'web_push',
  reminder_date date not null,
  sent_at timestamptz not null default now(),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error_message text,
  constraint reminder_deliveries_user_type_date_unique unique (user_id, reminder_type, reminder_date)
);

create index if not exists reminder_deliveries_user_date_idx on public.reminder_deliveries (user_id, reminder_date);

alter table public.reminder_deliveries enable row level security;
revoke all on table public.reminder_deliveries from anon, authenticated;

-- 3. Columns on user_preferences for background reminder query capabilities
alter table public.user_preferences add column if not exists access_token text;
alter table public.user_preferences add column if not exists github_username text;
