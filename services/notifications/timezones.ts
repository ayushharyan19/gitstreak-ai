/**
 * Timezone calculation utilities for GitStreak AI reminders.
 * Strictly uses IANA timezones and Intl.DateTimeFormat (no hardcoded offsets).
 */

export function isValidTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the calendar date (YYYY-MM-DD) for a given timezone at the specified instant.
 */
export function getUserLocalDate(timeZone: string, now: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(now);
  } catch {
    // If timezone is invalid, fallback safely to UTC date
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Returns the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * for a given timezone at the specified instant.
 */
export function getUserLocalDayOfWeek(timeZone: string, now: Date = new Date()): number {
  const localDateStr = getUserLocalDate(timeZone, now);
  const date = new Date(`${localDateStr}T12:00:00.000Z`);
  return date.getUTCDay();
}

/**
 * Returns the 24-hour local hour and minute for a given timezone at the specified instant.
 */
export function getUserLocalTime(timeZone: string, now: Date = new Date()): { hour: number; minute: number } {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return { hour, minute };
  } catch {
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

/**
 * Checks whether a user's configured reminder time (HH:MM) is due.
 *
 * @param reminderTime "HH:MM" in 24h format
 * @param timeZone IANA timezone identifier (e.g. "Asia/Kolkata", "America/New_York")
 * @param now Current Date instant
 * @param toleranceMinutes Window in minutes after the reminder time during which it is considered due (default: 30)
 */
export function isReminderDue(
  reminderTime: string | null | undefined,
  timeZone: string,
  now: Date = new Date(),
  toleranceMinutes = 30
): boolean {
  if (!reminderTime || !isValidTimezone(timeZone)) {
    return false;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(reminderTime.trim());
  if (!match) {
    return false;
  }

  const reminderHour = parseInt(match[1], 10);
  const reminderMinute = parseInt(match[2], 10);
  const reminderTotalMinutes = reminderHour * 60 + reminderMinute;

  const { hour: localHour, minute: localMinute } = getUserLocalTime(timeZone, now);
  const currentTotalMinutes = localHour * 60 + localMinute;

  const diffMinutes = currentTotalMinutes - reminderTotalMinutes;

  // The reminder is due if current time has reached the reminder time and is within the tolerance window
  return diffMinutes >= 0 && diffMinutes <= toleranceMinutes;
}
