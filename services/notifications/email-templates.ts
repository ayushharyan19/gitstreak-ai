/**
 * GitStreak AI - Email Templates
 * Responsive, email-client safe HTML layouts with plain-text alternatives.
 */

interface DailyReminderEmailData {
  name?: string;
  todayCount: number;
  dailyGoal: number;
  currentStreak: number;
  dashboardUrl: string;
}

interface StreakAtRiskEmailData {
  name?: string;
  currentStreak: number;
  todayCount: number;
  dailyGoal: number;
  dashboardUrl: string;
}

interface WeeklySummaryEmailData {
  name?: string;
  weeklyContributions: number;
  weeklyGoal: number;
  activeDaysThisWeek: number;
  currentStreak: number;
  dashboardUrl: string;
}

interface TestEmailData {
  name?: string;
  email: string;
  dashboardUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function baseEmailLayout({
  title,
  preheader,
  contentHtml,
  dashboardUrl,
}: {
  title: string;
  preheader: string;
  contentHtml: string;
  dashboardUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; width: 100%; }
    .container { max-width: 580px; margin: 0 auto; padding: 32px 20px; }
    .card { background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px 28px; }
    .badge { display: inline-block; background-color: rgba(16, 185, 129, 0.12); color: #10b981; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 6px; }
    .heading { color: #ffffff; font-size: 22px; font-weight: 700; line-height: 1.3; margin: 16px 0 8px 0; }
    .subtext { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; }
    .stat-box { background-color: #1a2234; border: 1px solid #283548; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-value { font-size: 26px; font-weight: 800; color: #10b981; margin: 0; }
    .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-top: 4px; }
    .btn { display: inline-block; background-color: #10b981; color: #ffffff !important; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin-top: 24px; text-align: center; }
    .btn:hover { background-color: #059669; }
    .footer { text-align: center; font-size: 12px; color: #64748b; margin-top: 28px; }
    .footer a { color: #94a3b8; text-decoration: underline; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#090d16;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}
  </div>
  <table role="presentation">
    <tr>
      <td align="center">
        <div class="container">
          <div class="card">
            <!-- Brand header -->
            <div style="margin-bottom: 20px;">
              <span style="font-weight: 800; font-size: 16px; letter-spacing: -0.02em; color: #ffffff;">GitStreak<span style="color:#10b981;">.ai</span></span>
            </div>
            ${contentHtml}
            <div style="text-align: center;">
              <a href="${dashboardUrl}" class="btn">Open GitStreak Dashboard &rarr;</a>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0 0 6px 0;">GitStreak AI &bull; Developer Consistency & GitHub Streak Tracker</p>
            <p style="margin: 0;">You received this because you enabled email reminders in your account settings. <a href="${dashboardUrl.replace('/dashboard', '/settings')}">Manage preferences</a></p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderDailyReminderEmail(data: DailyReminderEmailData): RenderedEmail {
  const remaining = Math.max(0, data.dailyGoal - data.todayCount);
  const userGreeting = data.name ? `Hey ${data.name},` : "Hey developer,";
  const subject = `Keep your streak alive! ${remaining} more contribution${remaining === 1 ? "" : "s"} needed today`;

  const html = baseEmailLayout({
    title: subject,
    preheader: `You have ${data.todayCount} of ${data.dailyGoal} contributions today. Complete your goal to keep your ${data.currentStreak}-day streak moving!`,
    dashboardUrl: data.dashboardUrl,
    contentHtml: `
      <div><span class="badge">Daily Goal Reminder</span></div>
      <h1 class="heading">Your daily goal is waiting</h1>
      <p class="subtext">${userGreeting} you haven't completed today's GitHub contribution goal yet. Commit code, open a pull request, or review work to maintain your momentum!</p>
      
      <table role="presentation" style="margin-bottom: 20px;">
        <tr>
          <td style="width: 32%; padding-right: 6px;">
            <div class="stat-box">
              <div class="stat-value">${data.todayCount} / ${data.dailyGoal}</div>
              <div class="stat-label">Today's Goal</div>
            </div>
          </td>
          <td style="width: 32%; padding: 0 3px;">
            <div class="stat-box">
              <div class="stat-value" style="color: #f59e0b;">${remaining}</div>
              <div class="stat-label">Remaining</div>
            </div>
          </td>
          <td style="width: 32%; padding-left: 6px;">
            <div class="stat-box">
              <div class="stat-value">${data.currentStreak}d</div>
              <div class="stat-label">Current Streak</div>
            </div>
          </td>
        </tr>
      </table>
    `,
  });

  const text = `${userGreeting}

You haven't completed today's GitHub contribution goal yet on GitStreak AI.

Today's Progress: ${data.todayCount} / ${data.dailyGoal}
Remaining Needed: ${remaining}
Current Streak: ${data.currentStreak} days

Make a commit, open a PR, or review a teammate's work to keep your streak going:
${data.dashboardUrl}

Manage reminder preferences: ${data.dashboardUrl.replace("/dashboard", "/settings")}`;

  return { subject, html, text };
}

export function renderStreakAtRiskEmail(data: StreakAtRiskEmailData): RenderedEmail {
  const remaining = Math.max(0, data.dailyGoal - data.todayCount);
  const userGreeting = data.name ? `Hey ${data.name},` : "Hey developer,";
  const subject = `Your ${data.currentStreak}-day streak is at risk on GitStreak AI`;

  const html = baseEmailLayout({
    title: subject,
    preheader: `Your ${data.currentStreak}-day coding streak will break if you don't contribute today. Make a commit before midnight!`,
    dashboardUrl: data.dashboardUrl,
    contentHtml: `
      <div><span class="badge" style="background-color: rgba(239, 68, 68, 0.15); color: #ef4444;">Streak At Risk</span></div>
      <h1 class="heading">Don't break your ${data.currentStreak}-day streak!</h1>
      <p class="subtext">${userGreeting} you've built an impressive streak of <strong>${data.currentStreak} consecutive days</strong>. Today's goal has not been reached yet, and your streak is at risk of ending tonight.</p>
      
      <table role="presentation" style="margin-bottom: 20px;">
        <tr>
          <td style="width: 50%; padding-right: 6px;">
            <div class="stat-box" style="border-color: rgba(239, 68, 68, 0.3);">
              <div class="stat-value" style="color: #ef4444;">${data.currentStreak} Days</div>
              <div class="stat-label">Streak on the Line</div>
            </div>
          </td>
          <td style="width: 50%; padding-left: 6px;">
            <div class="stat-box">
              <div class="stat-value">${data.todayCount} / ${data.dailyGoal}</div>
              <div class="stat-label">Contributions Today</div>
            </div>
          </td>
        </tr>
      </table>
      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0 0 16px 0;">
        You only need <strong>${remaining} more contribution${remaining === 1 ? "" : "s"}</strong> before the day ends in your timezone.
      </p>
    `,
  });

  const text = `${userGreeting}

Your ${data.currentStreak}-day GitHub streak is at risk on GitStreak AI!

You have completed ${data.todayCount} of ${data.dailyGoal} contributions today.
Remaining Needed: ${remaining}
Streak at Risk: ${data.currentStreak} consecutive days

Make a commit before the day ends to protect your streak:
${data.dashboardUrl}

Manage reminder preferences: ${data.dashboardUrl.replace("/dashboard", "/settings")}`;

  return { subject, html, text };
}

export function renderWeeklySummaryEmail(data: WeeklySummaryEmailData): RenderedEmail {
  const percent = data.weeklyGoal > 0 ? Math.min(100, Math.round((data.activeDaysThisWeek / data.weeklyGoal) * 100)) : 100;
  const userGreeting = data.name ? `Hey ${data.name},` : "Hey developer,";
  const subject = `Your GitStreak weekly progress summary (${data.activeDaysThisWeek}/${data.weeklyGoal} active days)`;

  const html = baseEmailLayout({
    title: subject,
    preheader: `You contributed ${data.weeklyContributions} times across ${data.activeDaysThisWeek} days this week (${percent}% of your goal).`,
    dashboardUrl: data.dashboardUrl,
    contentHtml: `
      <div><span class="badge">Weekly Progress</span></div>
      <h1 class="heading">Weekly Consistency Report</h1>
      <p class="subtext">${userGreeting} here is a quick snapshot of how your GitHub contributions stacked up against your weekly goals over the past 7 days.</p>
      
      <table role="presentation" style="margin-bottom: 20px;">
        <tr>
          <td style="width: 32%; padding-right: 6px;">
            <div class="stat-box">
              <div class="stat-value">${data.activeDaysThisWeek} / ${data.weeklyGoal}</div>
              <div class="stat-label">Active Days</div>
            </div>
          </td>
          <td style="width: 32%; padding: 0 3px;">
            <div class="stat-box">
              <div class="stat-value">${data.weeklyContributions}</div>
              <div class="stat-label">Contributions</div>
            </div>
          </td>
          <td style="width: 32%; padding-left: 6px;">
            <div class="stat-box">
              <div class="stat-value">${percent}%</div>
              <div class="stat-label">Weekly Goal</div>
            </div>
          </td>
        </tr>
      </table>
      <div style="background-color: #1a2234; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; text-align: center;">
        <span style="font-size: 13px; color: #94a3b8;">Current Streak: <strong style="color: #10b981;">${data.currentStreak} days</strong></span>
      </div>
    `,
  });

  const text = `${userGreeting}

Here is your GitStreak AI Weekly Consistency Report:

Active Days: ${data.activeDaysThisWeek} / ${data.weeklyGoal} days (${percent}% of goal)
Weekly Contributions: ${data.weeklyContributions}
Current Streak: ${data.currentStreak} days

View your full contribution activity and statistics:
${data.dashboardUrl}

Manage reminder preferences: ${data.dashboardUrl.replace("/dashboard", "/settings")}`;

  return { subject, html, text };
}

export function renderTestEmail(data: TestEmailData): RenderedEmail {
  const userGreeting = data.name ? `Hey ${data.name},` : "Hey developer,";
  const subject = "GitStreak AI — Test email reminder";

  const html = baseEmailLayout({
    title: subject,
    preheader: "Your GitStreak AI email reminder setup is working correctly!",
    dashboardUrl: data.dashboardUrl,
    contentHtml: `
      <div><span class="badge">Test Notification</span></div>
      <h1 class="heading">Email reminders are working!</h1>
      <p class="subtext">${userGreeting} this test email confirms that your email reminder preferences are active and configured to deliver to <strong>${data.email}</strong>.</p>
      <div style="background-color: #1a2234; border: 1px solid #283548; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 13px; color: #94a3b8;">
          When enabled, GitStreak AI will monitor your GitHub activity and email you if your daily contribution goal has not been reached by your chosen reminder time.
        </p>
      </div>
    `,
  });

  const text = `${userGreeting}

This test email confirms that your GitStreak AI email reminder setup is working correctly!

Recipient: ${data.email}

We will monitor your GitHub activity and alert you before the day ends in your timezone if your contribution goal is pending.

Open your dashboard:
${data.dashboardUrl}`;

  return { subject, html, text };
}
