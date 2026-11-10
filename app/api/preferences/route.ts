import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getOrCreatePreferences, PreferencesError, updatePreferences } from "@/services/preferences";

async function getAuthContext(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token?.sub) return null;
  return {
    userId: token.sub,
    accessToken: typeof token.accessToken === "string" ? token.accessToken : undefined,
    login: typeof token.login === "string" ? token.login : undefined,
    email: typeof token.email === "string" ? token.email : undefined,
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const preferences = await getOrCreatePreferences(auth.userId);
    // Ensure verified email from session is populated if not yet stored
    if (!preferences.email && auth.email) {
      preferences.email = auth.email;
    }
    return NextResponse.json(preferences, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof PreferencesError ? error.message : "Unable to load preferences.";
    const status = error instanceof PreferencesError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const preferences = await updatePreferences(
      auth.userId,
      await request.json(),
      auth.accessToken,
      auth.login,
      auth.email
    );
    return NextResponse.json(preferences, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof PreferencesError ? error.message : "Unable to save preferences.";
    const status = error instanceof PreferencesError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
