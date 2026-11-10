import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getGitHubContributions, GitHubContributionsError } from "@/services/github/contributions";
import {
  getUserLocalDate,
  getUserLocalDayOfWeek,
  isReminderDue,
  isValidTimezone,
} from "./timezones";
import { sendWebPushToSubscription } from "./web-push";
import { sendEmail } from "./email";
import {
  renderDailyReminderEmail,
  renderStreakAtRiskEmail,
  renderWeeklySummaryEmail,
} from "./email-templates";
import {
  deactivateSubscription,
  getActiveSubscriptionsForUser,
  hasReminderBeenDelivered,
  recordReminderDelivery,
  touchSubscriptionLastUsed,
} from "./subscriptions";
import type { NotificationPayload, SchedulerSummary, UserReminderProfile } from "./types";

export interface SchedulerOptions {
  forceUserId?: string;
  now?: Date;
  toleranceMinutes?: number;
  ignoreTimeCheck?: boolean;
}

export async function runReminderScheduler(
  options: SchedulerOptions = {}
): Promise<SchedulerSummary> {
  const now = options.now || new Date();
  const summary: SchedulerSummary = {
    timestamp: now.toISOString(),
    processedUsers: 0,
    eligibleUsers: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    deactivatedSubscriptions: 0,
    webPushSent: 0,
    emailSent: 0,
    errors: [],
  };

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    summary.errors.push({ userId: "system", error: "Database not configured." });
    return summary;
  }

  // 1. Load users with at least one reminder channel enabled
  let query = supabase
    .from("user_preferences")
    .select(
      "user_id, timezone, daily_goal, weekly_goal, reminder_enabled, reminder_time, access_token, github_username, email, email_reminders_enabled, email_reminder_time, email_reminder_types, email_reminder_days"
    )
    .or("reminder_enabled.eq.true,email_reminders_enabled.eq.true");

  if (options.forceUserId) {
    query = query.eq("user_id", options.forceUserId);
  }

  const { data: users, error: fetchError } = await query;
  if (fetchError || !users) {
    summary.errors.push({
      userId: "system",
      error: fetchError?.message || "Failed to query reminder preferences.",
    });
    return summary;
  }

  summary.processedUsers = users.length;

  for (const rawUser of users) {
    const user = rawUser as UserReminderProfile;

    try {
      // Validate timezone
      if (!isValidTimezone(user.timezone)) {
        summary.failed++;
        summary.errors.push({
          userId: user.user_id,
          error: `Invalid user timezone: ${user.timezone}`,
        });
        continue;
      }

      const localDate = getUserLocalDate(user.timezone, now);
      const localDayOfWeek = getUserLocalDayOfWeek(user.timezone, now);

      // Check Web Push eligibility
      const webPushEligible =
        Boolean(user.reminder_enabled && user.reminder_time) &&
        (options.ignoreTimeCheck ||
          isReminderDue(user.reminder_time, user.timezone, now, options.toleranceMinutes ?? 30));

      // Check Email eligibility
      const userEmail = user.email;
      const emailDays = Array.isArray(user.email_reminder_days) ? user.email_reminder_days : [1, 2, 3, 4, 5, 6, 0];
      const isDayEligible = emailDays.includes(localDayOfWeek);
      const emailEligible =
        Boolean(user.email_reminders_enabled && user.email_reminder_time && userEmail) &&
        isDayEligible &&
        (options.ignoreTimeCheck ||
          isReminderDue(user.email_reminder_time, user.timezone, now, options.toleranceMinutes ?? 30));

      if (!webPushEligible && !emailEligible) {
        summary.skipped++;
        continue;
      }

      summary.eligibleUsers++;

      // Evaluate GitHub contribution goals
      const token = user.access_token || process.env.GITHUB_TOKEN;
      if (!token) {
        summary.failed++;
        summary.errors.push({
          userId: user.user_id,
          error: "No GitHub access token available to check contributions.",
        });
        if (webPushEligible) {
          await recordReminderDelivery({
            user_id: user.user_id,
            channel: "web_push",
            reminder_type: "daily_reminder",
            reminder_date: localDate,
            sent_at: now.toISOString(),
            status: "failed",
            error_message: "Missing GitHub token to evaluate goal.",
          });
        }
        if (emailEligible) {
          await recordReminderDelivery({
            user_id: user.user_id,
            channel: "email",
            reminder_type: "daily_reminder",
            reminder_date: localDate,
            sent_at: now.toISOString(),
            status: "failed",
            error_message: "Missing GitHub token to evaluate goal.",
          });
        }
        continue;
      }

      const localYear = parseInt(localDate.slice(0, 4), 10);
      let contributionData;
      try {
        contributionData = await getGitHubContributions(token, localYear);
      } catch (ghError) {
        const message =
          ghError instanceof GitHubContributionsError
            ? ghError.message
            : "Failed to fetch GitHub contributions.";
        summary.failed++;
        summary.errors.push({ userId: user.user_id, error: message });

        if (webPushEligible) {
          await recordReminderDelivery({
            user_id: user.user_id,
            channel: "web_push",
            reminder_type: "daily_reminder",
            reminder_date: localDate,
            sent_at: now.toISOString(),
            status: "failed",
            error_message: message,
          });
        }
        if (emailEligible) {
          await recordReminderDelivery({
            user_id: user.user_id,
            channel: "email",
            reminder_type: "daily_reminder",
            reminder_date: localDate,
            sent_at: now.toISOString(),
            status: "failed",
            error_message: message,
          });
        }
        continue;
      }

      // Find local day in contribution calendar
      const dayRecord = contributionData.days.find((d) => d.date === localDate);
      const contributionsToday = dayRecord?.contributionCount ?? 0;
      const goalMet = contributionsToday >= user.daily_goal;
      const currentStreak = contributionData.statistics.currentStreak;

      // Calculate weekly active days for weekly progress summary
      const current = new Date(`${localDate}T00:00:00.000Z`);
      const sunday = new Date(current);
      sunday.setUTCDate(current.getUTCDate() - current.getUTCDay());
      const weekDates = Array.from({ length: 7 }, (_, index) => {
        const d = new Date(sunday);
        d.setUTCDate(sunday.getUTCDate() + index);
        return d.toISOString().slice(0, 10);
      });
      const activeDaysThisWeek = contributionData.days.filter(
        (day) => weekDates.includes(day.date) && day.contributionCount > 0
      ).length;
      const weeklyContributions = contributionData.days
        .filter((day) => weekDates.includes(day.date))
        .reduce((sum, d) => sum + d.contributionCount, 0);

      const dashboardUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard`;

      // -------------------------------------------------------------
      // Channel 1: Web Push Delivery
      // -------------------------------------------------------------
      if (webPushEligible) {
        try {
          const alreadySentWebPush = await hasReminderBeenDelivered(
            user.user_id,
            "web_push",
            localDate,
            "daily_reminder"
          );

          if (alreadySentWebPush) {
            summary.skipped++;
          } else if (goalMet) {
            summary.skipped++;
            await recordReminderDelivery({
              user_id: user.user_id,
              channel: "web_push",
              reminder_type: "daily_reminder",
              reminder_date: localDate,
              sent_at: now.toISOString(),
              status: "skipped",
              error_message: `Daily goal completed (${contributionsToday}/${user.daily_goal}).`,
            });
          } else {
            const subscriptions = await getActiveSubscriptionsForUser(user.user_id);
            if (subscriptions.length === 0) {
              summary.skipped++;
              await recordReminderDelivery({
                user_id: user.user_id,
                channel: "web_push",
                reminder_type: "daily_reminder",
                reminder_date: localDate,
                sent_at: now.toISOString(),
                status: "skipped",
                error_message: "No active push subscriptions registered.",
              });
            } else {
              const notificationPayload: NotificationPayload = {
                title: "Your GitStreak is waiting",
                body: "You haven't completed today's contribution goal yet. Make a small contribution to keep your streak going.",
                url: "/dashboard",
                icon: "/favicon.ico",
                badge: "/favicon.ico",
                tag: `gitstreak-daily-${localDate}`,
              };

              let anySuccess = false;
              let lastError: string | null = null;

              for (const sub of subscriptions) {
                const result = await sendWebPushToSubscription(sub, notificationPayload);
                if (result.success) {
                  anySuccess = true;
                  await touchSubscriptionLastUsed(sub.id);
                } else {
                  lastError = result.error || "Delivery failed";
                  if (result.shouldDeactivate) {
                    await deactivateSubscription(sub.id);
                    summary.deactivatedSubscriptions++;
                  }
                }
              }

              if (anySuccess) {
                summary.sent++;
                summary.webPushSent++;
                await recordReminderDelivery({
                  user_id: user.user_id,
                  channel: "web_push",
                  reminder_type: "daily_reminder",
                  reminder_date: localDate,
                  sent_at: now.toISOString(),
                  status: "sent",
                  error_message: null,
                });
              } else {
                summary.failed++;
                summary.errors.push({
                  userId: user.user_id,
                  channel: "web_push",
                  error: lastError || "All subscription deliveries failed.",
                });
                await recordReminderDelivery({
                  user_id: user.user_id,
                  channel: "web_push",
                  reminder_type: "daily_reminder",
                  reminder_date: localDate,
                  sent_at: now.toISOString(),
                  status: "failed",
                  error_message: lastError,
                });
              }
            }
          }
        } catch (pushErr: unknown) {
          const message = pushErr instanceof Error ? pushErr.message : "Web push delivery error.";
          summary.failed++;
          summary.errors.push({ userId: user.user_id, channel: "web_push", error: message });
        }
      }

      // -------------------------------------------------------------
      // Channel 2: Email Delivery
      // -------------------------------------------------------------
      if (emailEligible && userEmail) {
        try {
          const userTypes = Array.isArray(user.email_reminder_types)
            ? user.email_reminder_types
            : ["daily_reminder", "streak_at_risk"];

          if (goalMet) {
            // Check if Sunday and weekly_summary enabled
            if (localDayOfWeek === 0 && userTypes.includes("weekly_summary")) {
              const alreadySentWeekly = await hasReminderBeenDelivered(
                user.user_id,
                "email",
                localDate,
                "weekly_summary"
              );

              if (!alreadySentWeekly) {
                const rendered = renderWeeklySummaryEmail({
                  name: user.github_username || undefined,
                  weeklyContributions,
                  weeklyGoal: user.weekly_goal,
                  activeDaysThisWeek,
                  currentStreak,
                  dashboardUrl,
                });

                const emailResult = await sendEmail({
                  to: userEmail,
                  subject: rendered.subject,
                  html: rendered.html,
                  text: rendered.text,
                  reminderType: "weekly_summary",
                });

                if (emailResult.success) {
                  summary.sent++;
                  summary.emailSent++;
                  await recordReminderDelivery({
                    user_id: user.user_id,
                    channel: "email",
                    reminder_type: "weekly_summary",
                    reminder_date: localDate,
                    sent_at: now.toISOString(),
                    status: "sent",
                    provider_message_id: emailResult.subscriptionId,
                  });
                } else {
                  summary.failed++;
                  summary.errors.push({
                    userId: user.user_id,
                    channel: "email",
                    error: emailResult.error || "Email delivery failed",
                  });
                  await recordReminderDelivery({
                    user_id: user.user_id,
                    channel: "email",
                    reminder_type: "weekly_summary",
                    reminder_date: localDate,
                    sent_at: now.toISOString(),
                    status: "failed",
                    error_message: emailResult.error,
                  });
                }
              } else {
                summary.skipped++;
              }
            } else {
              summary.skipped++;
              await recordReminderDelivery({
                user_id: user.user_id,
                channel: "email",
                reminder_type: "daily_reminder",
                reminder_date: localDate,
                sent_at: now.toISOString(),
                status: "skipped",
                error_message: `Daily goal completed (${contributionsToday}/${user.daily_goal}).`,
              });
            }
          } else {
            // Daily goal NOT met -> Determine whether streak_at_risk or daily_reminder
            const shouldSendStreakAtRisk = userTypes.includes("streak_at_risk") && currentStreak > 0;
            const reminderTypeToSend = shouldSendStreakAtRisk ? "streak_at_risk" : "daily_reminder";

            const alreadySentEmail = await hasReminderBeenDelivered(
              user.user_id,
              "email",
              localDate,
              reminderTypeToSend
            );

            if (alreadySentEmail) {
              summary.skipped++;
            } else {
              const rendered = shouldSendStreakAtRisk
                ? renderStreakAtRiskEmail({
                    name: user.github_username || undefined,
                    currentStreak,
                    todayCount: contributionsToday,
                    dailyGoal: user.daily_goal,
                    dashboardUrl,
                  })
                : renderDailyReminderEmail({
                    name: user.github_username || undefined,
                    todayCount: contributionsToday,
                    dailyGoal: user.daily_goal,
                    currentStreak,
                    dashboardUrl,
                  });

              const emailResult = await sendEmail({
                to: userEmail,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
                reminderType: reminderTypeToSend,
              });

              if (emailResult.success) {
                summary.sent++;
                summary.emailSent++;
                await recordReminderDelivery({
                  user_id: user.user_id,
                  channel: "email",
                  reminder_type: reminderTypeToSend,
                  reminder_date: localDate,
                  sent_at: now.toISOString(),
                  status: "sent",
                  provider_message_id: emailResult.subscriptionId,
                });
              } else {
                summary.failed++;
                summary.errors.push({
                  userId: user.user_id,
                  channel: "email",
                  error: emailResult.error || "Email delivery failed",
                });
                await recordReminderDelivery({
                  user_id: user.user_id,
                  channel: "email",
                  reminder_type: reminderTypeToSend,
                  reminder_date: localDate,
                  sent_at: now.toISOString(),
                  status: "failed",
                  error_message: emailResult.error,
                });
              }
            }
          }
        } catch (emailErr: unknown) {
          const message = emailErr instanceof Error ? emailErr.message : "Email delivery error.";
          summary.failed++;
          summary.errors.push({ userId: user.user_id, channel: "email", error: message });
        }
      }
    } catch (userError: unknown) {
      const message = userError instanceof Error ? userError.message : "Unexpected error processing user reminder.";
      summary.failed++;
      summary.errors.push({
        userId: user.user_id,
        error: message,
      });
    }
  }

  return summary;
}
