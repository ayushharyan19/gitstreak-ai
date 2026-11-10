import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { preferencesSchema } from "@/lib/preferences-validation";
import { defaultUserPreferences, type EmailReminderType, type UserPreferences } from "@/types/preferences";

type PreferenceRow = {
  timezone: string;
  daily_goal: number;
  weekly_goal: number;
  preferred_theme: "light" | "dark" | "system";
  reminder_enabled: boolean;
  reminder_time: string | null;
  email?: string | null;
  email_reminders_enabled?: boolean;
  email_reminder_time?: string | null;
  email_reminder_types?: EmailReminderType[];
  email_reminder_days?: number[];
};

const PREFERENCE_COLUMNS =
  "timezone,daily_goal,weekly_goal,preferred_theme,reminder_enabled,reminder_time,email,email_reminders_enabled,email_reminder_time,email_reminder_types,email_reminder_days";

function toPreferences(row: PreferenceRow): UserPreferences {
  return {
    timezone: row.timezone,
    dailyGoal: row.daily_goal,
    weeklyGoal: row.weekly_goal,
    preferredTheme: row.preferred_theme,
    reminderEnabled: row.reminder_enabled,
    reminderTime: row.reminder_time,
    emailRemindersEnabled: row.email_reminders_enabled ?? false,
    emailReminderTime: row.email_reminder_time ?? null,
    emailReminderTypes: Array.isArray(row.email_reminder_types)
      ? row.email_reminder_types
      : ["daily_reminder", "streak_at_risk", "weekly_summary"],
    emailReminderDays: Array.isArray(row.email_reminder_days)
      ? row.email_reminder_days
      : [1, 2, 3, 4, 5, 6, 0],
    email: row.email ?? null,
  };
}

function toRow(preferences: UserPreferences) {
  return {
    timezone: preferences.timezone,
    daily_goal: preferences.dailyGoal,
    weekly_goal: preferences.weeklyGoal,
    preferred_theme: preferences.preferredTheme,
    reminder_enabled: preferences.reminderEnabled,
    reminder_time: preferences.reminderTime,
    email_reminders_enabled: preferences.emailRemindersEnabled,
    email_reminder_time: preferences.emailReminderTime,
    email_reminder_types: preferences.emailReminderTypes,
    email_reminder_days: preferences.emailReminderDays,
  };
}

export class PreferencesError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message);
    this.name = "PreferencesError";
  }
}

export async function getOrCreatePreferences(userId: string): Promise<UserPreferences> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new PreferencesError("Preferences are not configured yet.", 503);

  const select = () =>
    supabase.from("user_preferences").select(PREFERENCE_COLUMNS).eq("user_id", userId).maybeSingle();

  const existing = await select();
  if (existing.error) throw new PreferencesError("Unable to load your preferences.");
  if (existing.data) return toPreferences(existing.data as PreferenceRow);

  const created = await supabase
    .from("user_preferences")
    .insert({ user_id: userId, ...toRow(defaultUserPreferences) })
    .select(PREFERENCE_COLUMNS)
    .maybeSingle();

  if (created.data) return toPreferences(created.data as PreferenceRow);
  if (created.error?.code === "23505") {
    const afterRace = await select();
    if (afterRace.data) return toPreferences(afterRace.data as PreferenceRow);
  }
  throw new PreferencesError("Unable to create your preferences.");
}

export async function updatePreferences(
  userId: string,
  input: unknown,
  accessToken?: string,
  githubUsername?: string,
  verifiedEmail?: string
): Promise<UserPreferences> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    throw new PreferencesError(parsed.error.issues[0]?.message ?? "Invalid preferences.", 400);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new PreferencesError("Preferences are not configured yet.", 503);

  const payload: Record<string, unknown> = { user_id: userId, ...toRow(parsed.data) };
  if (accessToken) payload.access_token = accessToken;
  if (githubUsername) payload.github_username = githubUsername;
  if (verifiedEmail) payload.email = verifiedEmail;

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select(PREFERENCE_COLUMNS)
    .single();

  if (error) throw new PreferencesError("Unable to save your preferences.");
  return toPreferences(data as PreferenceRow);
}
