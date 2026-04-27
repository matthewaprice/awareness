import NextAuth from "next-auth";
import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/cache";
import { logAuditEvent } from "@/lib/audit";
import type { TokenWithRole, SessionWithRole } from "@/types";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid email or password");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error("Invalid email or password");
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
          // Audit: failed login attempt
          await logAuditEvent({
            userId: user.id,
            action: "LOGIN_FAILED",
            entityType: "User",
            entityId: user.id,
            metadata: { reason: "invalid_password" },
          });
          throw new Error("Invalid email or password");
        }

        if (!user.emailVerified) {
          throw new Error("Please verify your email before logging in");
        }

        // Return only non-PII fields; email is NOT included in the token
        return {
          id: user.id,
          name: user.fullName,
          role: user.role,
          emailVerified: user.emailVerified,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // On sign-in, enrich the token with role — no PII (email) stored
        const u = user as unknown as {
          id: string;
          role: string;
          emailVerified: boolean;
        };
        token.id = u.id;
        token.role = u.role;
        token.emailVerified = u.emailVerified;

        // Create a session entry in Redis for supplementary session tracking
        await createSession(u.id);

        // Audit: successful login
        await logAuditEvent({
          userId: u.id,
          action: "LOGIN",
          entityType: "User",
          entityId: u.id,
        });
      }
      return token;
    },
    async session({ session, token }) {
      // Build SessionWithRole — no PII (email) in session
      const enriched = session as unknown as SessionWithRole;
      enriched.user = {
        id: token.id as string,
        role: token.role as TokenWithRole["role"],
        name: session.user?.name ?? undefined,
      };
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
