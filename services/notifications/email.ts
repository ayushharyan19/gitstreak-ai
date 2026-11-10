import "server-only";
import { Resend } from "resend";
import type { NotificationDeliveryResult } from "./types";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  reminderType?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getEmailFromAddress(): string {
  return process.env.EMAIL_FROM || "GitStreak AI <onboarding@resend.dev>";
}

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend API key is not configured. Please set RESEND_API_KEY.");
  }
  resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendEmail(options: SendEmailOptions): Promise<NotificationDeliveryResult> {
  if (!isEmailConfigured()) {
    return {
      success: false,
      channel: "email",
      error: "Email delivery is not configured. Set RESEND_API_KEY in environment variables.",
    };
  }

  if (!options.to || !options.to.includes("@")) {
    return {
      success: false,
      channel: "email",
      error: "Recipient email address is invalid or missing.",
    };
  }

  try {
    const resend = getResendClient();
    const fromAddress = getEmailFromAddress();

    let response = await resend.emails.send({
      from: fromAddress,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    // Handle transient network/DNS resolution hiccups with an automatic retry
    if (response.error && response.error.message?.includes("Unable to fetch data")) {
      console.warn("[Email Delivery] Transient network resolution issue. Retrying Resend dispatch in 1s...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await resend.emails.send({
        from: fromAddress,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
    }

    if (response.error) {
      console.error(`[Email Delivery] Provider error (${response.error.name}): ${response.error.message}`);
      const friendlyError = response.error.message.includes("Unable to fetch data")
        ? "Network connection issue reaching Resend (api.resend.com). Please check your internet connection or click Send Test Email again."
        : response.error.message;
      return {
        success: false,
        channel: "email",
        error: friendlyError,
      };
    }

    return {
      success: true,
      channel: "email",
      subscriptionId: response.data?.id,
      statusCode: 200,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to deliver email.";
    console.error(`[Email Delivery] Unexpected error: ${message}`);
    return {
      success: false,
      channel: "email",
      error: message,
    };
  }
}
