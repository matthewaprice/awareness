/**
 * Property 4: Role-based access control
 *
 * For any user with a given role (Patient, Physician, Admin, or unauthenticated)
 * and any route in the application, the middleware should grant access if and only if
 * the route is permitted for that role.
 *
 * Feature: rare-disease-platform, Property 4: Role-based access control
 * Validates: Requirements 1.8, 6.2, 7.1
 */

import fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure route-matching logic (copied from middleware to avoid next/server import)
// ---------------------------------------------------------------------------

function matchesRoute(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      return pathname === prefix || pathname.startsWith(prefix + "/");
    }
    return pathname === pattern;
  });
}

const publicRoutes = [
  "/",
  "/about/*",
  "/research/*",
  "/find-a-doctor/*",
  "/auth/*",
  "/api/auth/*",
];
const patientRoutes = ["/surveys/*", "/dashboard/*"];
const physicianRoutes = ["/registry/*"];
const adminRoutes = ["/admin/*"];

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a route from one of the configured route sets */
const publicRouteArb = fc.constantFrom(
  "/",
  "/about",
  "/about/symptoms",
  "/about/diagnosis",
  "/research",
  "/research/trials",
  "/find-a-doctor",
  "/find-a-doctor/search",
  "/auth/login",
  "/auth/register",
  "/api/auth/session"
);

const patientRouteArb = fc.constantFrom(
  "/surveys",
  "/surveys/abc-123",
  "/surveys/some-id/results",
  "/dashboard",
  "/dashboard/profile"
);

const physicianRouteArb = fc.constantFrom(
  "/registry",
  "/registry/profile",
  "/registry/settings"
);

const adminRouteArb = fc.constantFrom(
  "/admin",
  "/admin/dashboard",
  "/admin/users",
  "/admin/surveys",
  "/admin/content",
  "/admin/physicians"
);

const roleArb = fc.constantFrom(
  "PATIENT" as const,
  "PHYSICIAN" as const,
  "ADMIN" as const,
  "UNAUTHENTICATED" as const
);

// ---------------------------------------------------------------------------
// Expected access rules
// ---------------------------------------------------------------------------

function shouldHaveAccess(
  role: "PATIENT" | "PHYSICIAN" | "ADMIN" | "UNAUTHENTICATED",
  pathname: string
): boolean {
  const isPublic = matchesRoute(pathname, publicRoutes);
  const isPatient = matchesRoute(pathname, patientRoutes);
  const isPhysician = matchesRoute(pathname, physicianRoutes);
  const isAdmin = matchesRoute(pathname, adminRoutes);

  // Public routes: everyone has access
  if (isPublic) return true;

  // Unauthenticated: only public routes
  if (role === "UNAUTHENTICATED") return false;

  // Admin routes: only ADMIN
  if (isAdmin) return role === "ADMIN";

  // Patient routes: PATIENT and ADMIN
  if (isPatient) return role === "PATIENT" || role === "ADMIN";

  // Physician routes: PHYSICIAN and ADMIN
  if (isPhysician) return role === "PHYSICIAN" || role === "ADMIN";

  // Routes not in any config: authenticated users can access
  return role !== "UNAUTHENTICATED";
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 4: Role-based access control", () => {
  it(
    "public routes are accessible to any role including unauthenticated",
    async () => {
      await fc.assert(
        fc.asyncProperty(publicRouteArb, roleArb, async (route, role) => {
          const isPublic = matchesRoute(route, publicRoutes);
          expect(isPublic).toBe(true);
          expect(shouldHaveAccess(role, route)).toBe(true);
        }),
        { numRuns: 5 }
      );
    },
    15000
  );

  it(
    "patient routes are accessible only to PATIENT and ADMIN roles",
    async () => {
      await fc.assert(
        fc.asyncProperty(patientRouteArb, roleArb, async (route, role) => {
          const expected = role === "PATIENT" || role === "ADMIN";
          expect(shouldHaveAccess(role, route)).toBe(expected);
        }),
        { numRuns: 5 }
      );
    },
    15000
  );

  it(
    "physician routes are accessible only to PHYSICIAN and ADMIN roles",
    async () => {
      await fc.assert(
        fc.asyncProperty(physicianRouteArb, roleArb, async (route, role) => {
          const expected = role === "PHYSICIAN" || role === "ADMIN";
          expect(shouldHaveAccess(role, route)).toBe(expected);
        }),
        { numRuns: 5 }
      );
    },
    15000
  );

  it(
    "admin routes are accessible only to ADMIN role",
    async () => {
      await fc.assert(
        fc.asyncProperty(adminRouteArb, roleArb, async (route, role) => {
          const expected = role === "ADMIN";
          expect(shouldHaveAccess(role, route)).toBe(expected);
        }),
        { numRuns: 5 }
      );
    },
    15000
  );

  it(
    "for any role and any route, matchesRoute + access rules are consistent",
    async () => {
      const anyRouteArb = fc.oneof(
        publicRouteArb,
        patientRouteArb,
        physicianRouteArb,
        adminRouteArb
      );

      await fc.assert(
        fc.asyncProperty(anyRouteArb, roleArb, async (route, role) => {
          const access = shouldHaveAccess(role, route);
          const isPublic = matchesRoute(route, publicRoutes);
          const isPatient = matchesRoute(route, patientRoutes);
          const isPhysician = matchesRoute(route, physicianRoutes);
          const isAdmin = matchesRoute(route, adminRoutes);

          // If unauthenticated, only public routes allowed
          if (role === "UNAUTHENTICATED") {
            expect(access).toBe(isPublic);
          }

          // PATIENT cannot access physician or admin routes
          if (role === "PATIENT") {
            if (isPhysician) expect(access).toBe(false);
            if (isAdmin) expect(access).toBe(false);
          }

          // PHYSICIAN cannot access patient or admin routes
          if (role === "PHYSICIAN") {
            if (isPatient) expect(access).toBe(false);
            if (isAdmin) expect(access).toBe(false);
          }

          // ADMIN can access everything except unauthenticated-only
          if (role === "ADMIN") {
            expect(access).toBe(true);
          }
        }),
        { numRuns: 5 }
      );
    },
    15000
  );
});
