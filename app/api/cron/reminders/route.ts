import { NextRequest, NextResponse } from "next/server";
import { runReminderScheduler } from "@/services/notifications/scheduler";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If no secret is configured, disallow external invocations for safety
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === cronSecret) return true;
  }

  const customHeader = request.headers.get("x-cron-secret");
  if (customHeader && customHeader === cronSecret) return true;

  // Check URL query parameter (useful for manual testing when configured)
  const querySecret = request.nextUrl.searchParams.get("secret");
  if (querySecret && querySecret === cronSecret) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Provide valid cron authorization secret." },
      { status: 401 }
    );
  }

  try {
    const summary = await runReminderScheduler();
    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to execute reminder scheduler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
