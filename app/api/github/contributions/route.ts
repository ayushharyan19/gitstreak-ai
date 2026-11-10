import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { GitHubContributionsError, getGitHubContributions } from "@/services/github/contributions";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const accessToken = typeof token?.accessToken === "string" ? token.accessToken : undefined;
  if (!accessToken) return NextResponse.json({ error: "Please sign in again to load GitHub activity." }, { status: 401 });

  try {
    const data = await getGitHubContributions(accessToken, Number(request.nextUrl.searchParams.get("year")));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof GitHubContributionsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to load GitHub activity right now." }, { status: 500 });
  }
}
