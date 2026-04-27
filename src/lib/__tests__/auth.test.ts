// Mock next-auth before any imports to avoid ESM jose/openid-client issues
jest.mock("next-auth", () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({ GET: jest.fn(), POST: jest.fn() })),
  };
});

jest.mock("next-auth/providers/credentials", () => {
  return {
    __esModule: true,
    default: jest.fn((config: Record<string, unknown>) => config),
  };
});

// Mock dependencies
jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
}));

jest.mock("@/lib/cache", () => ({
  createSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/audit", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

import { authOptions } from "../auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcrypt";

// Extract the authorize function from the credentials provider config
const credentialsProvider = authOptions.providers[0] as unknown as {
  authorize: (
    credentials: Record<string, string> | undefined,
    req: unknown
  ) => Promise<unknown>;
};
const authorize = credentialsProvider.authorize;

describe("NextAuth authOptions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("session config", () => {
    it("uses JWT strategy", () => {
      expect(authOptions.session?.strategy).toBe("jwt");
    });

    it("sets maxAge to 30 days", () => {
      expect(authOptions.session?.maxAge).toBe(30 * 24 * 60 * 60);
    });
  });

  describe("authorize", () => {
    const mockReq = {} as never;

    it("throws on missing credentials", async () => {
      await expect(authorize(undefined, mockReq)).rejects.toThrow(
        "Invalid email or password"
      );
    });

    it("throws generic error when user not found", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        authorize({ email: "no@user.com", password: "pass1234" }, mockReq)
      ).rejects.toThrow("Invalid email or password");
    });

    it("throws generic error on wrong password", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        passwordHash: "$2b$12$hash",
        fullName: "Test User",
        role: "PATIENT",
        emailVerified: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authorize({ email: "test@example.com", password: "wrong" }, mockReq)
      ).rejects.toThrow("Invalid email or password");
    });

    it("throws when email not verified", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        passwordHash: "$2b$12$hash",
        fullName: "Test User",
        role: "PATIENT",
        emailVerified: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        authorize({ email: "test@example.com", password: "correct" }, mockReq)
      ).rejects.toThrow("Please verify your email before logging in");
    });

    it("returns user object without email (no PII in token)", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        passwordHash: "$2b$12$hash",
        fullName: "Test User",
        role: "PATIENT",
        emailVerified: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authorize(
        { email: "test@example.com", password: "correct" },
        mockReq
      );

      expect(result).toEqual({
        id: "u1",
        name: "Test User",
        role: "PATIENT",
        emailVerified: true,
      });
      // Ensure email is NOT in the returned object
      expect(result).not.toHaveProperty("email");
    });
  });

  describe("jwt callback", () => {
    const jwtCallback = authOptions.callbacks!.jwt!;

    it("enriches token with role data on sign-in (no email)", async () => {
      const token = { sub: "u1" } as never;
      const user = {
        id: "u1",
        role: "PATIENT",
        emailVerified: true,
      };

      const result = await jwtCallback({
        token,
        user: user as never,
        account: null,
        trigger: "signIn",
      } as never);

      expect(result).toMatchObject({
        id: "u1",
        role: "PATIENT",
        emailVerified: true,
      });
    });

    it("does not store email in token", async () => {
      const token = { sub: "u1" } as never;
      const user = {
        id: "u1",
        role: "PATIENT",
        emailVerified: true,
      };

      const result = await jwtCallback({
        token,
        user: user as never,
        account: null,
        trigger: "signIn",
      } as never);

      // The jwt callback should not set email on the token
      expect((result as Record<string, unknown>).email).toBeUndefined();
    });

    it("returns token unchanged on subsequent calls", async () => {
      const token = {
        sub: "u1",
        id: "u1",
        role: "PATIENT",
        emailVerified: true,
      };

      const result = await jwtCallback({
        token,
        user: undefined as never,
        account: null,
      } as never);

      expect(result).toEqual(token);
    });
  });

  describe("session callback", () => {
    const sessionCallback = authOptions.callbacks!.session!;

    it("enriches session with role info from token (no email)", async () => {
      const session = { user: { name: "Test User" }, expires: "" };
      const token = {
        id: "u1",
        role: "PATIENT",
      };

      const result = await sessionCallback({
        session,
        token,
        user: {} as never,
        newSession: undefined,
        trigger: "update",
      } as never);

      const user = (result as { user: Record<string, unknown> }).user;
      expect(user).toMatchObject({
        id: "u1",
        role: "PATIENT",
        name: "Test User",
      });
      // No email in session
      expect(user.email).toBeUndefined();
    });
  });

  describe("pages config", () => {
    it("sets signIn page to /auth/login", () => {
      expect(authOptions.pages?.signIn).toBe("/auth/login");
    });

    it("sets error page to /auth/login", () => {
      expect(authOptions.pages?.error).toBe("/auth/login");
    });
  });
});
