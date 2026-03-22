import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";
import { db, users } from "@burnless/db";
import { eq } from "drizzle-orm";
import { verifyPassword } from "./password";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      /** true when email is verified (converted from Date | null) */
      isEmailVerified: boolean;
    };
  }
}

export const authConfig = {
  providers: [
    GitHub,
    Google,
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.passwordHash) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours — short sessions for financial data security
  },
  callbacks: {
    async signIn({ user, account }) {
      // OAuth providers already verify emails — ensure emailVerified is set
      // so users don't hit the verification wall after OAuth signup
      if (account?.provider !== "credentials" && user.id) {
        await db
          .update(users)
          .set({ emailVerified: new Date() })
          .where(eq(users.id, user.id));
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user?.id) token.sub = user.id;

      // Fetch emailVerified from DB on sign-in or when session is updated
      if ((user?.id || trigger === "update") && token.sub) {
        const [dbUser] = await db
          .select({ emailVerified: users.emailVerified })
          .from(users)
          .where(eq(users.id, token.sub))
          .limit(1);
        (token as Record<string, unknown>).isEmailVerified = !!dbUser?.emailVerified;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.isEmailVerified = !!(token as Record<string, unknown>).isEmailVerified;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    newUser: "/onboarding",
  },
} satisfies NextAuthConfig;
