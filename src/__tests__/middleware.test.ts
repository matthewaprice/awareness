import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { matchesRoute } from "../proxy";

// ---------------------------------------------------------------------------
// Mock next-auth/jwt before importing middleware
// ---------------------------------------------------------------------------
const mockGetToken = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>();
jest.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

// ---------------------------------------------------------------------------
// Mock cache session functions
// ---------------------------------------------------------------------------
const mockGetSession = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown> | null>>();
const mockExtendSession = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock("@/lib/cache", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  extendSession: (...args: unknown[]) => mockExtendSession(...args),
}));

// ---------------------------------------------------------------------------
// Minimal stubs for NextRequest / NextResponse used by the middleware
// ---------------------------------------------------------------------------
let redirectedTo: string | null = null;
let nextCalled = false;

jest.mock("next/server", () => ({
  NextResponse: {
    next: () => {
      nextCalled = true;
      return { type: "next" };
    },
    redirect: (url: URL) => {
      redirectedTo = url.toString();
      return { type: "redirect", url: url.toString() };
    },
  },
}));

function makeRequest(pathname: string): unknown {
  const base = "http://localhost:3000";
  return {
    nextUrl: new URL(pathname, base),
    url: base,
  };
}

// Import proxy AFTER mocks are set up
import { proxy } from "../proxy";
import type { NextRequest } from "next/server";

beforeEach(() => {
  redirectedTo = null;
  nextCalled = false;
  mockGetToken.mockReset();
  mockGetSession.mockReset();
  mockExtendSession.mockReset();
  // Default: session exists in Redis
  mockGetSession.mockResolvedValue({ userId: "user-1", createdAt: Date.now() });
  mockExtendSession.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// matchesRoute unit tests
// ---------------------------------------------------------------------------
describe("matchesRoute", () => {
  it("matches exact route", () => {
    expect(matchesRoute("/", ["/"])).toBe(true);
  });

  it("matches wildcard prefix", () => {
    expect(matchesRoute("/about/symptoms", ["/about/*"])).toBe(true);
  });

  it("matches wildcard prefix root", () => {
    expect(matchesRoute("/about", ["/about/*"])).toBe(true);
  });

  it("does not match unrelated route", () => {
    expect(matchesRoute("/admin/users", ["/about/*"])).toBe(false);
  });

  it("does not match partial prefix without separator", () => {
    expect(matchesRoute("/aboutus", ["/about/*"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Middleware integration tests
// ---------------------------------------------------------------------------
describe("middleware", () => {
  it("allows public routes without token", async () => {
    mockGetToken.mockResolvedValue(null);
    await proxy(makeRequest("/") as NextRequest);
    expect(nextCalled).toBe(true);
  });

  it("allows public sub-routes without token", async () => {
    mockGetToken.mockResolvedValue(null);
    await proxy(makeRequest("/about/symptoms") as NextRequest);
    expect(nextCalled).toBe(true);
  });

  it("redirects unauthenticated user on patient route to login", async () => {
    mockGetToken.mockResolvedValue(null);
    await proxy(makeRequest("/surveys/1") as NextRequest);
    expect(redirectedTo).toContain("/auth/login");
    expect(redirectedTo).toContain("callbackUrl=%2Fsurveys%2F1");
  });

  it("allows PATIENT to access patient routes", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "PATIENT" });
    await proxy(makeRequest("/surveys/1") as NextRequest);
    expect(nextCalled).toBe(true);
  });

  it("redirects PHYSICIAN from patient routes to 403", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "PHYSICIAN" });
    await proxy(makeRequest("/dashboard") as NextRequest);
    expect(redirectedTo).toContain("/403");
  });

  it("allows PHYSICIAN to access physician routes", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "PHYSICIAN" });
    await proxy(makeRequest("/registry/profile") as NextRequest);
    expect(nextCalled).toBe(true);
  });

  it("redirects PATIENT from physician routes to 403", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "PATIENT" });
    await proxy(makeRequest("/registry/profile") as NextRequest);
    expect(redirectedTo).toContain("/403");
  });

  it("allows ADMIN to access admin routes", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "ADMIN" });
    await proxy(makeRequest("/admin/dashboard") as NextRequest);
    expect(nextCalled).toBe(true);
  });

  it("redirects PATIENT from admin routes to 403", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "PATIENT" });
    await proxy(makeRequest("/admin/users") as NextRequest);
    expect(redirectedTo).toContain("/403");
  });

  it("redirects PHYSICIAN from admin routes to 403", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "PHYSICIAN" });
    await proxy(makeRequest("/admin/users") as NextRequest);
    expect(redirectedTo).toContain("/403");
  });

  it("allows ADMIN to access patient routes", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "ADMIN" });
    await proxy(makeRequest("/surveys/1") as NextRequest);
    expect(nextCalled).toBe(true);
  });

  it("allows ADMIN to access physician routes", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "ADMIN" });
    await proxy(makeRequest("/registry/profile") as NextRequest);
    expect(nextCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Session management in middleware
// ---------------------------------------------------------------------------
describe("middleware session management", () => {
  it("redirects to login with session-expired when Redis session is missing", async () => {
    mockGetToken.mockResolvedValue({ id: "user-1", role: "PATIENT" });
    mockGetSession.mockResolvedValue(null);

    await proxy(makeRequest("/surveys/1") as NextRequest);

    expect(redirectedTo).toContain("/auth/login");
    expect(redirectedTo).toContain("reason=session-expired");
  });

  it("extends session TTL on each authenticated request", async () => {
    mockGetToken.mockResolvedValue({ id: "user-42", role: "PATIENT" });
    mockGetSession.mockResolvedValue({ userId: "user-42", createdAt: Date.now() });

    await proxy(makeRequest("/surveys/1") as NextRequest);

    expect(mockExtendSession).toHaveBeenCalledWith("user-42");
    expect(nextCalled).toBe(true);
  });

  it("checks session using userId from JWT token", async () => {
    mockGetToken.mockResolvedValue({ id: "user-99", role: "ADMIN" });
    mockGetSession.mockResolvedValue({ userId: "user-99", createdAt: Date.now() });

    await proxy(makeRequest("/admin/dashboard") as NextRequest);

    expect(mockGetSession).toHaveBeenCalledWith("user-99");
  });

  it("does not check session for public routes", async () => {
    mockGetToken.mockResolvedValue(null);

    await proxy(makeRequest("/") as NextRequest);

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(nextCalled).toBe(true);
  });

  it("does not extend session for unauthenticated requests", async () => {
    mockGetToken.mockResolvedValue(null);

    await proxy(makeRequest("/surveys/1") as NextRequest);

    expect(mockExtendSession).not.toHaveBeenCalled();
  });
});
