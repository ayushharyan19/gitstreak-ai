import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isEmailConfigured, sendEmail } from "@/services/notifications/email";
import { renderTestEmail } from "@/services/notifications/email-templates";

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const userEmail = typeof token.email === "string" && token.email ? token.email : null;
  if (!userEmail) {
    return NextResponse.json(
      {
        error:
          "No verified email address found for your GitHub account. Please ensure your email is public or verified in GitHub settings.",
      },
      { status: 400 }
    );
  }

  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        error: "Email delivery is not configured on the server. RESEND_API_KEY is missing.",
      },
      { status: 503 }
    );
  }

  const dashboardUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard`;
  const rendered = renderTestEmail({
    name: typeof token.login === "string" ? token.login : undefined,
    email: userEmail,
    dashboardUrl,
  });

  const result = await sendEmail({
    to: userEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    reminderType: "test",
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || "Failed to deliver test email." },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      email: userEmail,
      messageId: result.subscriptionId,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
