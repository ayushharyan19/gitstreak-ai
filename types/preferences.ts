export type PreferredTheme = "light" | "dark" | "system";

export type EmailReminderType = "daily_reminder" | "streak_at_risk" | "weekly_summary";

export type UserPreferences = {
  timezone: string;
  dailyGoal: number;
  weeklyGoal: number;
  preferredTheme: PreferredTheme;
  reminderEnabled: boolean;
  reminderTime: string | null;
  emailRemindersEnabled: boolean;
  emailReminderTime: string | null;
  emailReminderTypes: EmailReminderType[];
  emailReminderDays: number[];
  email?: string | null;
};

export const defaultUserPreferences: UserPreferences = {
  timezone: "Asia/Kolkata",
  dailyGoal: 1,
  weeklyGoal: 5,
  preferredTheme: "system",
  reminderEnabled: false,
  reminderTime: null,
  emailRemindersEnabled: false,
  emailReminderTime: null,
  emailReminderTypes: ["daily_reminder", "streak_at_risk", "weekly_summary"],
  emailReminderDays: [1, 2, 3, 4, 5, 6, 0],
  email: null,
};
