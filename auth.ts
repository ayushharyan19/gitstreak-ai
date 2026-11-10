import type { NextAuthOptions } from "next-auth";
import NextAuth from "next-auth";
import GitHubProvider, { type GithubProfile } from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.AUTH_GITHUB_ID ?? "",
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? "",
    }),
  ],
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
    error: "/",
  },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      if (profile) {
        token.login = (profile as GithubProfile).login;
        if ((profile as GithubProfile).email) {
          token.email = (profile as GithubProfile).email;
        }
      }

      if (user?.email) {
        token.email = user.email;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.login = typeof token.login === "string" ? token.login : undefined;
        if (typeof token.email === "string") {
          session.user.email = token.email;
        }
      }

      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.access_token && user?.id) {
        try {
          const { getSupabaseAdmin } = await import("@/lib/supabase/server");
          const supabase = getSupabaseAdmin();
          if (supabase) {
            const login = profile ? (profile as GithubProfile).login : undefined;
            const email = user.email || (profile as GithubProfile | undefined)?.email;
            const updatePayload: Record<string, string> = { access_token: account.access_token };
            if (login) updatePayload.github_username = login;
            if (email) updatePayload.email = email;
            await supabase.from("user_preferences").update(updatePayload).eq("user_id", user.id);
          }
        } catch {
          // Graceful fallback: do not interrupt sign-in flow if database is unreachable
        }
      }
    },
  },
};

export default NextAuth(authOptions);
