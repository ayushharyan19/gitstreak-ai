create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  timezone text not null default 'Asia/Kolkata',
  daily_goal integer not null default 1 check (daily_goal >= 1),
  weekly_goal integer not null default 5 check (weekly_goal between 1 and 7),
  preferred_theme text not null default 'system' check (preferred_theme in ('light', 'dark', 'system')),
  reminder_enabled boolean not null default false,
  reminder_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((reminder_enabled and reminder_time is not null) or not reminder_enabled)
);

create index if not exists user_preferences_user_id_idx on public.user_preferences (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.user_preferences enable row level security;

-- This app uses Auth.js, not Supabase Auth. There are deliberately no client
-- policies: anon/authenticated API keys cannot access this table at all.
-- The server-only service-role client bypasses RLS after verifying Auth.js's
-- encrypted JWT and always scopes queries to token.sub.
revoke all on table public.user_preferences from anon, authenticated;
