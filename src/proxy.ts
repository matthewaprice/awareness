import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getSession, extendSession } from "@/lib/cache";

// ---------------------------------------------------------------------------
// Route configuration
// ---------------------------------------------------------------------------

/** Routes accessible without authentication */
export const publicRoutes = [
  "/",
  "/about/*",
  "/research/*",
  "/find-a-doctor/*",
  "/auth/*",
  "/api/auth/*",
];

/** Routes restricted to PATIENT role */
export const patientRoutes = ["/surveys/*", "/dashboard/*"];

/** Routes restricted to PHYSICIAN role */
export const physicianRoutes = ["/registry/*"];

/** Routes restricted to ADMIN role */
export const adminRoutes = ["/admin/*"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether `pathname` matches any pattern in `patterns`.
 * Patterns ending with `/*` match the prefix and any sub-path.
 * Exact patterns match only the exact pathname.
 */
export function matchesRoute(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2); // strip "/*"
      return pathname === prefix || pathname.startsWith(prefix + "/");
    }
    return pathname === pattern;
  });
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Public routes — always allowed
  if (matchesRoute(pathname, publicRoutes)) {
    return NextResponse.next();
  }

  // 2. Read JWT token (next-auth v4)
  const token = await getToken({ req: request });

  // 3. Unauthenticated → redirect to login
  if (!token) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string;
  const userId = token.id as string;

  // 4. Check Redis session — if JWT is valid but session expired, redirect with message
  const session = await getSession(userId);
  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("reason", "session-expired");
    return NextResponse.redirect(loginUrl);
  }

  // 5. Extend session TTL on each authenticated request
  await extendSession(userId);

  // 6. Check role-specific routes
  const isPatientRoute = matchesRoute(pathname, patientRoutes);
  const isPhysicianRoute = matchesRoute(pathname, physicianRoutes);
  const isAdminRoute = matchesRoute(pathname, adminRoutes);

  // Admin can access admin routes only
  if (isAdminRoute && role !== "ADMIN") {
    const forbiddenUrl = new URL("/403", request.url);
    return NextResponse.redirect(forbiddenUrl);
  }

  // Patient routes — only PATIENT (and ADMIN)
  if (isPatientRoute && role !== "PATIENT" && role !== "ADMIN") {
    const forbiddenUrl = new URL("/403", request.url);
    return NextResponse.redirect(forbiddenUrl);
  }

  // Physician routes — only PHYSICIAN (and ADMIN)
  if (isPhysicianRoute && role !== "PHYSICIAN" && role !== "ADMIN") {
    const forbiddenUrl = new URL("/403", request.url);
    return NextResponse.redirect(forbiddenUrl);
  }

  return NextResponse.next();
}

// ---------------------------------------------------------------------------
// Matcher — only run middleware on relevant paths
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    "/surveys/:path*",
    "/dashboard/:path*",
    "/registry/:path*",
    "/admin/:path*",
  ],
};
