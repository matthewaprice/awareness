// Mock dependencies before imports
jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/redis", () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock("@/lib/email", () => ({
  emailService: {
    send: jest.fn(),
  },
}));

jest.mock("@/lib/cache", () => ({
  invalidateSession: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  logAuditEvent: jest.fn(),
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
}));

jest.mock("crypto", () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => "mock-verification-token-hex"),
  })),
}));

import { registerUser, verifyEmail, requestPasswordReset, logoutUser } from "../auth";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { emailService } from "@/lib/email";
import { invalidateSession } from "@/lib/cache";
import bcrypt from "bcrypt";

describe("registerUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  const validInput = {
    email: "new@example.com",
    password: "securepass",
    fullName: "Jane Doe",
    role: "PATIENT" as const,
  };

  it("returns error for invalid input", async () => {
    const result = await registerUser({
      email: "bad",
      password: "short",
      fullName: "",
      role: "PATIENT",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns error when email already registered", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "existing" });

    const result = await registerUser(validInput);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Email already registered");
  });

  it("creates user, stores token in Redis, and sends email on success", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue("$2b$12$hashed");
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: "new-user-id",
      email: "new@example.com",
    });
    (redis.set as jest.Mock).mockResolvedValue("OK");
    (emailService.send as jest.Mock).mockResolvedValue(undefined);

    const result = await registerUser(validInput);

    expect(result.success).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith("securepass", 12);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "new@example.com",
        passwordHash: "$2b$12$hashed",
        fullName: "Jane Doe",
        role: "PATIENT",
        emailVerified: false,
      },
    });
    expect(redis.set).toHaveBeenCalledWith(
      "email-verify:mock-verification-token-hex",
      "new-user-id",
      "EX",
      86400
    );
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@example.com",
        subject: "Verify your email address",
      })
    );
  });
});

describe("verifyEmail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns error for empty token", async () => {
    const result = await verifyEmail("");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid verification token");
  });

  it("returns error for invalid/expired token", async () => {
    (redis.get as jest.Mock).mockResolvedValue(null);

    const result = await verifyEmail("bad-token");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid or expired verification token");
  });

  it("marks user as verified and deletes token on success", async () => {
    (redis.get as jest.Mock).mockResolvedValue("user-id-123");
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (redis.del as jest.Mock).mockResolvedValue(1);

    const result = await verifyEmail("valid-token");

    expect(result.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-id-123" },
      data: { emailVerified: true },
    });
    expect(redis.del).toHaveBeenCalledWith("email-verify:valid-token");
  });
});

describe("requestPasswordReset", () => {
  it("returns void without error (stub)", async () => {
    const result = await requestPasswordReset("any@email.com");
    expect(result).toBeUndefined();
  });
});

describe("logoutUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns error when userId is empty", async () => {
    const result = await logoutUser("");
    expect(result.success).toBe(false);
    expect(result.error).toBe("User ID is required");
  });

  it("invalidates session in Redis and returns success", async () => {
    (invalidateSession as jest.Mock).mockResolvedValue(undefined);

    const result = await logoutUser("user-123");

    expect(result.success).toBe(true);
    expect(invalidateSession).toHaveBeenCalledWith("user-123");
  });

  it("returns error when Redis invalidation fails", async () => {
    (invalidateSession as jest.Mock).mockRejectedValue(
      new Error("Redis connection error")
    );

    const result = await logoutUser("user-123");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to invalidate session");
  });
});
