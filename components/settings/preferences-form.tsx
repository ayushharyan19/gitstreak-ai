"use client";

import { useEffect, useState } from "react";
import { PreferencesThemeSync } from "@/components/preferences-theme-sync";
import type { PreferredTheme, UserPreferences } from "@/types/preferences";
import {
  getCurrentSubscription,
  getNotificationPermission,
  isPushSupported,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/web-push-client";

const fallback: UserPreferences = {
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

const DAYS = [
  { value: 1, label: "Mon", short: "M" },
  { value: 2, label: "Tue", short: "T" },
  { value: 3, label: "Wed", short: "W" },
  { value: 4, label: "Thu", short: "T" },
  { value: 5, label: "Fri", short: "F" },
  { value: 6, label: "Sat", short: "S" },
  { value: 0, label: "Sun", short: "S" },
];

const REMINDER_TYPES = [
  {
    type: "daily_reminder" as const,
    label: "Daily Contribution Reminder",
    desc: "Alert when today's contribution goal has not yet been met.",
  },
  {
    type: "streak_at_risk" as const,
    label: "Streak at Risk Alert",
    desc: "Urgent warning before your local day ends if your active streak is in danger.",
  },
  {
    type: "weekly_summary" as const,
    label: "Weekly Progress Summary",
    desc: "A weekly recap of your total contributions, streak status, and weekly goal progress.",
  },
];

interface SubscriptionServerState {
  subscribed: boolean;
  subscriptionCount: number;
  vapidPublicKey: string | null;
  vapidConfigured: boolean;
}

export function PreferencesForm({ initialPreferences }: { initialPreferences: UserPreferences | null }) {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    if (!initialPreferences) return fallback;
    return {
      ...fallback,
      ...initialPreferences,
      emailReminderTypes: initialPreferences.emailReminderTypes || fallback.emailReminderTypes,
      emailReminderDays: initialPreferences.emailReminderDays || fallback.emailReminderDays,
    };
  });
  const [savedTheme, setSavedTheme] = useState<PreferredTheme>(preferences.preferredTheme);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(initialPreferences ? "idle" : "error");
  const [message, setMessage] = useState(initialPreferences ? "" : "Preferences are unavailable until Supabase is configured.");

  // Web Push states
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [pushActionLoading, setPushActionLoading] = useState<"none" | "subscribing" | "unsubscribing" | "testing">("none");
  const [pushFeedback, setPushFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Email Reminders states
  const [emailActionLoading, setEmailActionLoading] = useState<"none" | "testing">("none");
  const [emailFeedback, setEmailFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Initialize Service Worker & Push status on mount
  useEffect(() => {
    const hasSupport = isPushSupported();
    if (!hasSupport) return;

    void registerServiceWorker();

    // Check current browser subscription and server subscription status
    Promise.all([
      getCurrentSubscription(),
      fetch("/api/notifications/subscription", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<SubscriptionServerState>) : null))
        .catch(() => null),
    ]).then(([localSub, serverState]) => {
      setSupported(true);
      setPermission(getNotificationPermission());
      if (serverState) {
        setVapidPublicKey(serverState.vapidPublicKey);
        setVapidConfigured(serverState.vapidConfigured);
        setIsSubscribed(Boolean(localSub) && serverState.subscribed);
      } else if (localSub) {
        setIsSubscribed(true);
      }
    });
  }, []);

  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const body = (await response.json()) as UserPreferences | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "Unable to save preferences.");
      }
      setPreferences(body);
      setSavedTheme(body.preferredTheme);
      setStatus("success");
      setMessage("Preferences saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to save preferences.");
    }
  }

  async function handleEnablePush() {
    setPushActionLoading("subscribing");
    setPushFeedback(null);

    try {
      if (!supported) {
        throw new Error("Push notifications are not supported in this browser.");
      }

      if (!vapidPublicKey) {
        throw new Error("Web Push is not fully configured on the server (missing VAPID public key).");
      }

      // Request browser permission and create push subscription
      const sub = await subscribeToPush(vapidPublicKey);
      setPermission(Notification.permission);

      const serialized = JSON.parse(JSON.stringify(sub)) as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      // Register subscription on authenticated server
      const response = await fetch("/api/notifications/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serialized),
      });

      const body = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Failed to register subscription with server.");
      }

      setIsSubscribed(true);
      setPushFeedback({
        type: "success",
        text: "This browser is now registered for push notifications!",
      });
    } catch (error: unknown) {
      setPermission(getNotificationPermission());
      setPushFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to enable notifications.",
      });
    } finally {
      setPushActionLoading("none");
    }
  }

  async function handleDisablePush() {
    setPushActionLoading("unsubscribing");
    setPushFeedback(null);

    try {
      const sub = await getCurrentSubscription();
      if (sub) {
        await fetch("/api/notifications/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => null);

        await unsubscribeFromPush();
      }

      setIsSubscribed(false);
      setPushFeedback({
        type: "info",
        text: "Browser push notifications disabled for this device.",
      });
    } catch (error: unknown) {
      setPushFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to disable notifications.",
      });
    } finally {
      setPushActionLoading("none");
    }
  }

  async function handleSendTest() {
    setPushActionLoading("testing");
    setPushFeedback(null);

    try {
      const response = await fetch("/api/notifications/test", {
        method: "POST",
      });
      const body = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !body.success) {
        throw new Error(body.error || "Failed to send test notification.");
      }

      setPushFeedback({
        type: "success",
        text: "Test notification sent! Check your system notification tray.",
      });
    } catch (error: unknown) {
      setPushFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to deliver test notification.",
      });
    } finally {
      setPushActionLoading("none");
    }
  }

  function toggleReminderType(type: (typeof REMINDER_TYPES)[number]["type"]) {
    setPreferences((current) => {
      const types = current.emailReminderTypes || [];
      const exists = types.includes(type);
      const updated = exists ? types.filter((t) => t !== type) : [...types, type];
      return { ...current, emailReminderTypes: updated };
    });
  }

  function toggleReminderDay(day: number) {
    setPreferences((current) => {
      const days = current.emailReminderDays || [];
      const exists = days.includes(day);
      const updated = exists ? days.filter((d) => d !== day) : [...days, day];
      return { ...current, emailReminderDays: updated };
    });
  }

  function setAllReminderDays(all: boolean) {
    setPreferences((current) => ({
      ...current,
      emailReminderDays: all ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5],
    }));
  }

  async function handleSendTestEmail() {
    setEmailActionLoading("testing");
    setEmailFeedback(null);

    try {
      const response = await fetch("/api/notifications/email/test", {
        method: "POST",
      });
      const body = (await response.json()) as { success?: boolean; error?: string; email?: string };

      if (!response.ok || !body.success) {
        throw new Error(body.error || "Failed to deliver test email.");
      }

      setEmailFeedback({
        type: "success",
        text: `Test email sent successfully to ${body.email || "your address"}! Please check your inbox.`,
      });
    } catch (error: unknown) {
      setEmailFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to deliver test email.",
      });
    } finally {
      setEmailActionLoading("none");
    }
  }

  // Evaluate genuine Web Push notification delivery status (Section 14)
  const isPushReminderConfigured = preferences.reminderEnabled && Boolean(preferences.reminderTime);
  const isPermissionGranted = permission === "granted";
  const isDeviceReady = isSubscribed && isPermissionGranted;
  const isPushFullyActive = isPushReminderConfigured && isDeviceReady && vapidConfigured;

  // Evaluate genuine Email Reminders delivery status
  const hasVerifiedEmail = Boolean(preferences.email);
  const isEmailConfigured = preferences.emailRemindersEnabled && Boolean(preferences.emailReminderTime);
  const hasSelectedDays = (preferences.emailReminderDays?.length ?? 0) > 0;
  const hasSelectedTypes = (preferences.emailReminderTypes?.length ?? 0) > 0;
  const isEmailFullyActive =
    isEmailConfigured && hasVerifiedEmail && hasSelectedDays && hasSelectedTypes;

  return (
    <form onSubmit={save} className="mt-8 space-y-6">
      <PreferencesThemeSync preferredTheme={savedTheme} />

      {/* General Settings */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold">General</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set your local time and visual preference.</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Timezone
            <input
              required
              list="timezones"
              value={preferences.timezone}
              onChange={(event) => update("timezone", event.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
            <datalist id="timezones">
              <option value="Asia/Kolkata" />
              <option value="America/New_York" />
              <option value="America/Los_Angeles" />
              <option value="Europe/London" />
              <option value="Europe/Berlin" />
              <option value="Asia/Tokyo" />
              <option value="Australia/Sydney" />
            </datalist>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Preferred theme
            <select
              value={preferences.preferredTheme}
              onChange={(event) => update("preferredTheme", event.target.value as PreferredTheme)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </section>

      {/* Streak Goals */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold">Streak goals</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use goals to keep your practice intentional.</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Daily contribution goal
            <input
              type="number"
              min="1"
              max="1000"
              required
              value={preferences.dailyGoal}
              onChange={(event) => update("dailyGoal", Number(event.target.value))}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Weekly active-day goal
            <input
              type="number"
              min="1"
              max="7"
              required
              value={preferences.weeklyGoal}
              onChange={(event) => update("weeklyGoal", Number(event.target.value))}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      </section>

      {/* Daily Reminders & Web Push Configuration */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Web Push Reminders</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Receive a browser notification when today&apos;s GitHub contribution goal is pending.
            </p>
          </div>

          {/* Genuine Notification Status Badge */}
          <div className="mt-2 sm:mt-0">
            {isPushFullyActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active at {preferences.reminderTime}
              </span>
            ) : !preferences.reminderEnabled ? (
              <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                Reminders Paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Setup Incomplete
              </span>
            )}
          </div>
        </div>

        {/* Schedule Inputs */}
        <div className="mt-5 space-y-4">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={preferences.reminderEnabled}
              onChange={(event) => update("reminderEnabled", event.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            Enable daily contribution reminder
          </label>

          <label className="grid max-w-xs gap-2 text-sm font-medium">
            Reminder time ({preferences.timezone})
            <input
              type="time"
              disabled={!preferences.reminderEnabled}
              required={preferences.reminderEnabled}
              value={preferences.reminderTime ?? ""}
              onChange={(event) => update("reminderTime", event.target.value || null)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>

        {/* Browser Device Registration Section */}
        <div className="mt-6 rounded-lg border border-border/70 bg-muted/30 p-4">
          <h3 className="text-sm font-semibold">Device & Browser Registration</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Web Push works in the background even when GitStreak AI is closed. We require your explicit browser permission to send streak reminders to this device.
          </p>

          <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Browser Support:</span>
              <span className={supported ? "font-medium text-foreground" : "text-destructive"}>
                {supported ? "Supported" : "Not supported in this browser"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Notification Permission:</span>
              <span
                className={
                  permission === "granted"
                    ? "font-medium text-emerald-600 dark:text-emerald-400"
                    : permission === "denied"
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                }
              >
                {permission === "granted"
                  ? "Granted"
                  : permission === "denied"
                  ? "Blocked in browser settings"
                  : "Not yet granted"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Device Subscription:</span>
              <span className={isSubscribed ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                {isSubscribed ? "Registered for push" : "Not registered"}
              </span>
            </div>
          </div>

          {/* Status Diagnostic Message */}
          {preferences.reminderEnabled && !isPushFullyActive && (
            <div className="mt-3 rounded-md bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              {!isPermissionGranted ? (
                <p>
                  <strong>Action needed:</strong> Click &ldquo;Enable Notifications&rdquo; below and allow notifications in the browser prompt.
                </p>
              ) : !isSubscribed ? (
                <p>
                  <strong>Action needed:</strong> Register this browser for notifications below so our scheduled backend can deliver reminders.
                </p>
              ) : !vapidConfigured ? (
                <p>
                  <strong>Server setup needed:</strong> VAPID keys are not configured in the server environment. Please configure them in your environment variables.
                </p>
              ) : null}
            </div>
          )}

          {/* Push Action Buttons */}
          <div className="mt-4 flex flex-wrap gap-2.5">
            {!isSubscribed ? (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={!supported || pushActionLoading !== "none"}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pushActionLoading === "subscribing" ? "Requesting permission…" : "Enable Notifications on this Browser"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={pushActionLoading !== "none"}
                  className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3.5 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pushActionLoading === "testing" ? "Sending test…" : "Send Test Notification"}
                </button>
                <button
                  type="button"
                  onClick={handleDisablePush}
                  disabled={pushActionLoading !== "none"}
                  className="inline-flex h-9 items-center rounded-md border border-destructive/20 text-destructive px-3.5 text-xs font-medium transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pushActionLoading === "unsubscribing" ? "Disabling…" : "Disable on this device"}
                </button>
              </>
            )}
          </div>

          {/* Push Feedback Notification */}
          {pushFeedback && (
            <div
              className={`mt-3 rounded-md p-2.5 text-xs ${
                pushFeedback.type === "error"
                  ? "bg-destructive/10 text-destructive"
                  : pushFeedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-foreground"
              }`}
            >
              {pushFeedback.text}
            </div>
          )}
        </div>
      </section>

      {/* Email Reminders Configuration */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Email Reminders</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Receive streak alerts and progress summaries in your inbox.
            </p>
          </div>

          {/* Genuine Email Notification Status Badge */}
          <div className="mt-2 sm:mt-0">
            {isEmailFullyActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active at {preferences.emailReminderTime}
              </span>
            ) : !preferences.emailRemindersEnabled ? (
              <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                Email Reminders Paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Setup Incomplete
              </span>
            )}
          </div>
        </div>

        {/* Enable / Disable Switch */}
        <div className="mt-5 space-y-4">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={preferences.emailRemindersEnabled}
              onChange={(event) => update("emailRemindersEnabled", event.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            Enable email reminders
          </label>
        </div>

        {/* Verified Recipient Email Display */}
        <div className="mt-5 rounded-lg border border-border/70 bg-muted/30 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recipient Email
              </span>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                {preferences.email || "No email address found"}
              </p>
            </div>
            {preferences.email ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Verified via GitHub
              </span>
            ) : (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                Email Required
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Reminders are delivered strictly to your authenticated GitHub email address. To change your recipient address, update your primary email in your GitHub account settings.
          </p>
        </div>

        {/* Time, Days & Types Controls */}
        <div className="mt-6 space-y-6">
          {/* Reminder Time Picker */}
          <label className="grid max-w-xs gap-2 text-sm font-medium">
            Reminder time ({preferences.timezone})
            <input
              type="time"
              disabled={!preferences.emailRemindersEnabled}
              required={preferences.emailRemindersEnabled}
              value={preferences.emailReminderTime ?? ""}
              onChange={(event) => update("emailReminderTime", event.target.value || null)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>

          {/* Reminder Days Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Reminder days</span>
              {preferences.emailRemindersEnabled && (
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setAllReminderDays(true)}
                    className="text-primary hover:underline"
                  >
                    All days
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={() => setAllReminderDays(false)}
                    className="text-primary hover:underline"
                  >
                    Weekdays only
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Choose the days of the week on which email reminders should be sent.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {DAYS.map((day) => {
                const isSelected = preferences.emailReminderDays?.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    disabled={!preferences.emailRemindersEnabled}
                    onClick={() => toggleReminderDay(day.value)}
                    className={`inline-flex h-9 w-12 items-center justify-center rounded-md border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reminder Types Checklist */}
          <div className="space-y-2.5">
            <span className="text-sm font-medium">Reminder types</span>
            <p className="text-xs text-muted-foreground">
              Select which notifications you would like delivered to your inbox.
            </p>
            <div className="mt-2 space-y-2.5">
              {REMINDER_TYPES.map((item) => {
                const isChecked = preferences.emailReminderTypes?.includes(item.type);
                return (
                  <label
                    key={item.type}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      !preferences.emailRemindersEnabled
                        ? "cursor-not-allowed opacity-50 border-border bg-muted/20"
                        : isChecked
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-background hover:bg-muted/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!preferences.emailRemindersEnabled}
                      checked={isChecked}
                      onChange={() => toggleReminderType(item.type)}
                      className="mt-0.5 size-4 rounded border-border accent-primary disabled:cursor-not-allowed"
                    />
                    <div className="grid gap-0.5">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Email Diagnostic Guidance */}
        {preferences.emailRemindersEnabled && !isEmailFullyActive && (
          <div className="mt-6 rounded-md bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            {!hasVerifiedEmail ? (
              <p>
                <strong>Email address required:</strong> No verified GitHub email is linked to your account. Reminders cannot be delivered.
              </p>
            ) : !preferences.emailReminderTime ? (
              <p>
                <strong>Time needed:</strong> Please choose a reminder time above.
              </p>
            ) : !hasSelectedDays ? (
              <p>
                <strong>Days needed:</strong> Please select at least one day for reminder delivery.
              </p>
            ) : !hasSelectedTypes ? (
              <p>
                <strong>Types needed:</strong> Please check at least one reminder type above.
              </p>
            ) : null}
          </div>
        )}

        {/* Test Email Action */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Send a sample reminder to verify that email delivery is working properly.
            </p>
            <button
              type="button"
              onClick={handleSendTestEmail}
              disabled={!hasVerifiedEmail || emailActionLoading !== "none"}
              className="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-background px-3.5 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {emailActionLoading === "testing" ? "Sending test email…" : "Send Test Email"}
            </button>
          </div>

          {emailFeedback && (
            <div
              className={`mt-3 rounded-md p-2.5 text-xs ${
                emailFeedback.type === "error"
                  ? "bg-destructive/10 text-destructive"
                  : emailFeedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-foreground"
              }`}
            >
              {emailFeedback.text}
            </div>
          )}
        </div>
      </section>

      {/* Global Form Status & Save Button */}
      {message ? (
        <p role="status" className={status === "error" ? "text-sm text-destructive" : "text-sm text-primary"}>
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "saving"}
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
      >
        {status === "saving" ? "Saving…" : "Save preferences"}
      </button>
    </form>
  );
}
