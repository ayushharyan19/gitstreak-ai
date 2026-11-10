# GitStreak AI ⚡

> **Build Consistency. Protect Your Streak.**
> A developer productivity platform that tracks GitHub contribution consistency, goal completion, and delivers timezone-aware multi-channel reminders (Web Push & Email) before your streak breaks.

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase)](https://supabase.com/)
[![Resend](https://img.shields.io/badge/Resend-Email_API-black?style=flat&logo=resend)](https://resend.com/)
[![Tests](https://img.shields.io/badge/Vitest-47_passed-6E9F18?style=flat&logo=vitest)](https://vitest.dev/)

---

## 🚀 Key Features

* **GitHub Contribution Calendar & Analytics**:
  * Real-time contribution matrix fetched directly via the GitHub GraphQL API.
  * Comprehensive streak tracking: Current streak, longest streak, total contributions, and active days.
  * Year-by-year historical drill-down with intuitive navigation.
* **Goal-Oriented Productivity**:
  * Customizable **Daily Contribution Goal** (e.g. 1+ commits/reviews/PRs).
  * Customizable **Weekly Active-Day Goal** (e.g. 5 days/week) with progress ring metrics.
* **Multi-Channel Notification Engine**:
  * **Web Push Notifications**: Browser background push reminders via Service Workers & VAPID, functioning even when the tab is closed.
  * **Branded Email Reminders**: Responsive, dark-themed HTML & plain-text emails delivered via Resend.
    * *Daily Goal Incomplete Reminder*
    * *Streak at Risk Alert* (urgent reminder before your local day ends)
    * *Weekly Progress Summary*
  * **Timezone-Aware Scheduling**: Evaluates reminders against each user's local IANA timezone (`Asia/Kolkata`, `America/New_York`, `Europe/London`, etc.) with accurate Daylight Saving Time (DST) handling.
  * **Day-of-Week Filters**: Configure specific reminder days (e.g. weekdays only vs. everyday).
  * **Atomic Idempotency**: Database-level unique constraint (`user_id`, `channel`, `reminder_type`, `reminder_date`) preventing duplicate alerts.
  * **Goal-Met Skipping**: Automatically suppresses reminder deliveries if you've already met your goal for the day.
* **Security & Authentication**:
  * GitHub OAuth authentication with NextAuth / Auth.js.
  * Verified GitHub email enforcement (users cannot redirect test or reminder emails to arbitrary recipients).
  * Protected background cron endpoints using Bearer authorization (`CRON_SECRET`).
  * Supabase Service-Role key restricted strictly to server-side executions.
* **Modern Developer UI**:
  * Sleek dark mode by default with light and system theme synchronization.
  * Responsive mobile-friendly dashboard, stats cards, and settings form.

---

## 🛠️ Tech Stack

* **Framework**: Next.js 16 (App Router)
* **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide icons
* **Authentication**: Auth.js / NextAuth with GitHub OAuth Provider
* **Database**: Supabase (PostgreSQL with Row Level Security)
* **Data Ingestion**: GitHub GraphQL API (`viewer.contributionsCollection`)
* **Notifications**:
  * Web Push API + `web-push` library + Service Workers (`public/sw.js`)
  * Email Delivery via [Resend](https://resend.com) SDK (`resend`)
* **Testing**: Vitest (47 unit and integration tests across calculator, preferences, and scheduler)

---

## 📁 Repository Structure

```
gitstreak-ai/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts     # Auth.js GitHub OAuth routes
│   │   ├── cron/reminders/route.ts         # Secure cron scheduler endpoint
│   │   ├── github/contributions/route.ts   # Cached contributions API
│   │   ├── notifications/
│   │   │   ├── email/test/route.ts         # Authenticated test email route
│   │   │   ├── subscription/route.ts      # Web Push subscription CRUD
│   │   │   └── test/route.ts               # Web Push test trigger
│   │   └── preferences/route.ts            # User preferences API
│   ├── dashboard/page.tsx                  # Protected user dashboard
│   ├── settings/page.tsx                   # User settings & notifications page
│   ├── globals.css                         # Tailwind CSS design system
│   ├── layout.tsx                          # Root layout with theme provider
│   └── page.tsx                            # Landing page
├── components/
│   ├── dashboard/                          # Contribution graphs, metrics & streak cards
│   ├── settings/                           # Preferences & notification management form
│   └── navbar.tsx, footer.tsx, etc.        # Layout primitives
├── lib/
│   ├── preferences-validation.ts           # Zod schema validation
│   ├── supabase/server.ts                  # Supabase admin client
│   └── web-push-client.ts                  # Browser-side Push registration helper
├── public/
│   └── sw.js                               # Service Worker for Web Push events
├── services/
│   ├── github/contributions.ts             # GitHub GraphQL service
│   ├── notifications/
│   │   ├── email-templates.ts              # HTML & text email templates
│   │   ├── email.ts                        # Resend email sender service
│   │   ├── scheduler.ts                    # Multi-channel reminder scheduler
│   │   ├── subscriptions.ts                # Subscriptions & delivery idempotency
│   │   ├── timezones.ts                    # Timezone & DST calculations
│   │   └── web-push.ts                     # VAPID Push sender
│   └── preferences.ts                      # Supabase preferences data access
├── supabase/
│   └── migrations/                         # SQL migrations for preferences & deliveries
└── utils/
    └── streak-calculator.ts                # Streak algorithm & day-gap math
```

---

## ⚙️ Getting Started

### 1. Prerequisites

* Node.js 18.18+ or 20+
* A GitHub account (for OAuth credentials)
* A [Supabase](https://supabase.com) project
* A [Resend](https://resend.com) account (for email reminders)

### 2. Clone and Install Dependencies

```bash
git clone https://github.com/ayushharyan19/gitstreak-ai.git
cd gitstreak-ai
npm install
```

### 3. Environment Variables Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Populate the required keys in `.env.local`:

```env
# GitHub OAuth App (GitHub Settings -> Developer Settings -> OAuth Apps)
AUTH_GITHUB_ID=your_github_client_id
AUTH_GITHUB_SECRET=your_github_client_secret
AUTH_SECRET=your_random_auth_secret_key

# Supabase (Project Settings -> API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_secret_key

# Web Push VAPID credentials
# Generate using: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_vapid_key
VAPID_PRIVATE_KEY=your_private_vapid_key
VAPID_SUBJECT=mailto:support@yourdomain.com

# Resend Email Provider credentials
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=GitStreak AI <notifications@yourdomain.com>
# Note: For testing without a verified custom domain, use:
# EMAIL_FROM=GitStreak AI <onboarding@resend.dev>

# Cron Authorization Secret
CRON_SECRET=your_strong_random_cron_secret_token
```

### 4. Supabase Database Migrations

Run the SQL migration scripts in order in your Supabase SQL Editor:

1. `supabase/migrations/20261030_create_user_preferences.sql` (User preferences & goals)
2. `supabase/migrations/20261030_create_push_notifications.sql` (Web Push subscriptions & delivery logs)
3. `supabase/migrations/20261101_create_email_reminders.sql` (Email settings & multi-channel composite unique constraint)

### 5. Run the Application

```bash
# Start development server
npm run dev

# Run automated test suite
npm test

# Run ESLint
npm run lint

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) to view GitStreak AI.

---

## ⏰ Automated Reminder Scheduling

GitStreak AI uses a unified scheduler endpoint:

```http
GET /api/cron/reminders
Authorization: Bearer <CRON_SECRET>
```

### Setting Up Periodic Execution:
* **Vercel Cron**: Pre-configured in [`vercel.json`](file:///Users/ayush.aryan/Downloads/gitstreak-ai/vercel.json) to trigger every 15 or 30 minutes.
* **GitHub Actions or External Cron**: Send a periodic `GET` request with the `Authorization: Bearer <CRON_SECRET>` header.

The scheduler automatically:
1. Queries users with at least one notification channel active.
2. Checks whether the current UTC time falls within the user's local reminder time window (`HH:MM`).
3. Evaluates today's GitHub contributions in real-time.
4. Skips users who have already achieved their daily goal.
5. Checks the atomic database unique constraint (`user_id`, `channel`, `reminder_type`, `reminder_date`) to prevent duplicates.
6. Delivers Web Push and/or Email alerts in parallel with complete channel failure isolation.

---

## 🧪 Testing

The repository includes a comprehensive test suite powered by [Vitest](https://vitest.dev):

```bash
npm test
```

Test coverage includes:
* **Streak Calculator**: Consecutive day streaks, leap years, timezone date conversions, gaps, and longest streak algorithms.
* **Preferences Validation**: Zod schema boundary tests, timezone validation, and multi-channel independence.
* **Notification System**: Web Push delivery, VAPID verification, 410 Gone subscription deactivations, cron token authorization, and daylight-saving transitions.
* **Email Reminders**: HTML/plain-text template rendering, Resend provider error handling, test email endpoint security, and multi-channel failure isolation.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
