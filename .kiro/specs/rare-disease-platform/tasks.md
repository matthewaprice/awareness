# Implementation Plan: Rare Disease Platform

## Overview

Incremental implementation of a Next.js rare disease awareness platform with PostgreSQL, Redis, Prisma, and NextAuth.js. Tasks are ordered to establish foundational layers first (project setup, data models, auth), then build feature modules (surveys, physician registry, content, admin), and finally wire everything together with caching, security, and accessibility.

## Tasks

- [ ] 1. Set up project structure, dependencies, and database schema
  - [x] 1.1 Initialize Next.js project with App Router, install dependencies (Prisma, NextAuth.js, Zod, bcrypt, ioredis, fast-check, Jest, React Testing Library)
    - Configure `tsconfig.json`, ESLint, and project folder structure per design (`src/app`, `src/lib`, `src/actions`, `src/components`, `src/types`)
    - _Requirements: 10.1, 10.2_

  - [x] 1.2 Create Prisma schema with all data models
    - Define `User`, `PatientProfile`, `PhysicianProfile`, `Survey`, `SurveyQuestion`, `SurveyResponse`, `ResponseAnswer`, `ContentPage`, `AuditLog` models with enums (`Role`, `SurveyStatus`, `QuestionType`)
    - Set up relations, unique constraints, and default values per the ER diagram in design
    - Generate Prisma client and create initial migration
    - _Requirements: 1.1, 2.8, 3.1, 4.2, 9.2_

  - [x] 1.3 Create shared utility modules
    - Implement `src/lib/db.ts` (Prisma client singleton), `src/lib/redis.ts` (Redis client), `src/lib/cache.ts` (getCached, setCached, invalidateCache, extendSession), `src/lib/email.ts` (email service abstraction)
    - _Requirements: 8.1, 8.4_

  - [x] 1.4 Create Zod validation schemas
    - Implement `src/lib/validation.ts` with schemas: `registerSchema`, `surveyResponseSchema`, `physicianProfileSchema`, `contentPageSchema`, `physicianSearchSchema`
    - _Requirements: 1.1, 2.3, 4.2, 5.1_

  - [x] 1.5 Create shared TypeScript type definitions
    - Implement `src/types/index.ts` with interfaces: `RegisterInput`, `TokenWithRole`, `SessionWithRole`, `SurveySubmission`, `SurveyDraft`, `PhysicianProfileInput`, `PhysicianSearchQuery`, `ContentInput`, `UserFilters`, `DashboardMetrics`, `PaginatedResult`, `FieldError`
    - _Requirements: 1.1, 2.2, 4.2, 5.1, 7.6_

- [x] 2. Implement authentication and session management
  - [x] 2.1 Configure NextAuth.js with credentials provider
    - Implement `src/lib/auth.ts` with JWT strategy, role-enriched tokens, email verification check, and session callbacks
    - Implement `src/actions/auth.ts` with `registerUser` (hash password with bcrypt, create user, send verification email), `verifyEmail`, and `requestPasswordReset`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.4_

  - [x] 2.2 Implement RBAC middleware
    - Implement `src/middleware.ts` with route protection config (`publicRoutes`, `patientRoutes`, `physicianRoutes`, `adminRoutes`)
    - Check JWT role claim against route config; redirect unauthenticated users to login, unauthorized users to 403
    - _Requirements: 1.8, 6.2, 7.1_

  - [x] 2.3 Implement session management with Redis
    - Store sessions in Redis with configurable TTL, extend expiration on authenticated requests, handle expired session redirect
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 2.4 Initialize shadcn/ui and install core components
    - Run `pnpm dlx shadcn@latest init` to set up shadcn/ui with Tailwind CSS
    - Install core components: Button, Input, Label, Card, Select, Dialog, Table, Badge, Separator, Toast, Form
    - _Requirements: 10.1, 10.3, 10.4_

  - [x] 2.5 Implement login and registration UI pages
    - Create `src/app/(public)/auth/login/page.tsx`, `src/app/(public)/auth/register/page.tsx`, `src/app/(public)/auth/verify-email/page.tsx`
    - Use shadcn/ui components (Card, Input, Label, Button, Select, Form) for all form elements
    - Registration form with email, password, full name, role selection; login form with generic error messages; email verification page
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

  - [x] 2.6 Implement logout functionality
    - Invalidate session in Redis and redirect to home page on logout
    - _Requirements: 1.7_

  - [-] 2.7 Write property test for registration round-trip
    - **Property 1: Registration round-trip**
    - **Validates: Requirements 1.2, 1.3**

  - [ ] 2.8 Write property test for login/logout session lifecycle
    - **Property 2: Login/logout session lifecycle**
    - **Validates: Requirements 1.4, 1.7**

  - [ ] 2.9 Write property test for invalid credentials generic error
    - **Property 3: Invalid credentials produce generic error**
    - **Validates: Requirements 1.5**

  - [ ] 2.10 Write property test for role-based access control
    - **Property 4: Role-based access control**
    - **Validates: Requirements 1.8, 6.2, 7.1**

  - [ ] 2.11 Write property test for password hashing
    - **Property 17: Password hashing**
    - **Validates: Requirements 9.4**

  - [ ] 2.12 Write property test for session management lifecycle
    - **Property 16: Session management lifecycle**
    - **Validates: Requirements 8.1, 8.2**

- [x] 3. Checkpoint — Auth and session management
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement patient survey module
  - [x] 4.1 Implement survey server actions
    - Implement `src/actions/surveys.ts` with `getAvailableSurveys`, `getSurveyById`, `submitSurveyResponse` (validate with Zod, store in DB with timestamp/patientId/surveyVersion), `saveSurveyDraft` (save to Redis), `getSurveyDraft` (load from Redis)
    - _Requirements: 2.1, 2.3, 2.6, 3.1, 3.4_

  - [x] 4.2 Implement survey list and form UI
    - Create `src/app/(patient)/surveys/page.tsx` (list available surveys) and `src/app/(patient)/surveys/[id]/page.tsx` (step-by-step survey form)
    - Use shadcn/ui components (Card, Button, Input, Label, Select, Badge, Toast) with react-hook-form + zodResolver for survey form handling
    - Implement field-level validation error display, confirmation message on submission, auto-save to Redis at regular intervals
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.7_

  - [x] 4.3 Implement survey response access control
    - Ensure survey responses are only accessible to the submitting patient and admins; deny access to other patients
    - _Requirements: 2.8, 9.3_

  - [ ] 4.4 Write property test for survey submission validation
    - **Property 5: Survey submission validation**
    - **Validates: Requirements 2.3, 2.4**

  - [ ] 4.5 Write property test for survey draft round-trip
    - **Property 6: Survey draft round-trip**
    - **Validates: Requirements 2.6, 2.7**

  - [ ] 4.6 Write property test for survey response access control
    - **Property 7: Survey response access control**
    - **Validates: Requirements 2.8, 9.3**

  - [ ] 4.7 Write property test for survey storage integrity
    - **Property 8: Survey storage integrity**
    - **Validates: Requirements 3.1, 3.4**

- [ ] 5. Implement symptom data aggregation
  - [x] 5.1 Implement aggregated symptom data queries
    - Add query functions to filter symptom data by symptom type, severity, frequency, and date range
    - _Requirements: 3.2_

  - [x] 5.2 Implement public-facing aggregated statistics page
    - Create a public page rendering de-identified, aggregated symptom statistics with no PII
    - _Requirements: 3.3_

  - [ ] 5.3 Write property test for aggregated data query filtering
    - **Property 9: Aggregated data query filtering**
    - **Validates: Requirements 3.2**

  - [ ] 5.4 Write property test for aggregated statistics de-identification
    - **Property 10: Aggregated statistics de-identification**
    - **Validates: Requirements 3.3**

- [x] 6. Checkpoint — Surveys and symptom data
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement physician registry module
  - [x] 7.1 Implement physician registry server actions
    - Implement `src/actions/physicians.ts` with `createOrUpdateProfile` (validate with Zod, upsert), `getPhysicianProfile`, `toggleProfileVisibility`, `searchPhysicians` (filter by location/name/specialty, return only active profiles, paginate)
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 5.2_

  - [x] 7.2 Implement physician profile management UI
    - Create `src/app/(physician)/registry/profile/page.tsx` with form to create/update profile, toggle active/inactive status
    - Use shadcn/ui components (Card, Input, Label, Button, Select, Badge) with react-hook-form + zodResolver for profile form handling
    - Display field-level validation errors for missing required fields
    - _Requirements: 4.1, 4.3, 4.5_

  - [x] 7.3 Implement physician search UI (Find a Doctor)
    - Create `src/app/(public)/find-a-doctor/page.tsx` with search filters (location, name, specialty), results display (name, credentials, specialty, location, contact), no-results message, and Redis caching of search results
    - Use shadcn/ui components (Input, Card, Button, Badge, Separator) for search interface and results
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 7.4 Write property test for physician profile validation
    - **Property 11: Physician profile validation**
    - **Validates: Requirements 4.2, 4.3**

  - [ ] 7.5 Write property test for physician profile update overwrites
    - **Property 12: Physician profile update overwrites**
    - **Validates: Requirements 4.4**

  - [ ] 7.6 Write property test for physician search active profiles
    - **Property 13: Physician search returns matching active profiles**
    - **Validates: Requirements 4.5, 5.2**

  - [ ] 7.7 Write property test for search results required information
    - **Property 14: Search results contain required information**
    - **Validates: Requirements 5.3**

- [ ] 8. Implement content management module
  - [x] 8.1 Implement content server actions
    - Implement `src/actions/content.ts` with `getPublishedContent`, `listPublishedContent`, `createContent`, `updateContent`, `togglePublishStatus`
    - Cache published content in Redis
    - _Requirements: 6.1, 6.4_

  - [x] 8.2 Implement public content pages
    - Create `src/app/(public)/about/page.tsx` and `src/app/(public)/research/page.tsx` rendering published content in accessible, readable format
    - Ensure pages are accessible without login
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. Checkpoint — Physician registry and content
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement admin panel
  - [x] 10.1 Implement admin server actions
    - Implement `src/actions/admin.ts` with `listUsers`, `updateUserStatus`, `updateUserRole`, `getDashboardMetrics`, `reviewPhysicianProfile`
    - Add admin survey management actions: create, edit, publish, archive surveys
    - Add admin content management actions: create, edit, publish, unpublish content pages
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 10.2 Implement admin dashboard UI
    - Create `src/app/(admin)/admin/dashboard/page.tsx` displaying key metrics (total users, survey completions, active physician profiles)
    - Use shadcn/ui components (Card, Badge) for metric cards
    - _Requirements: 7.6_

  - [x] 10.3 Implement admin user management UI
    - Create `src/app/(admin)/admin/users/page.tsx` with user list, search, activate/deactivate, role assignment, and confirmation dialogs for destructive actions
    - Use shadcn/ui components (Table, Dialog, Button, Input, Select, Badge) for admin interface
    - _Requirements: 7.2, 7.7_

  - [x] 10.4 Implement admin survey management UI
    - Create `src/app/(admin)/admin/surveys/page.tsx` with survey CRUD, publish/archive controls, and confirmation dialogs
    - Use shadcn/ui components (Table, Dialog, Button, Card, Badge) for survey management
    - _Requirements: 7.3, 7.7_

  - [x] 10.5 Implement admin content management UI
    - Create `src/app/(admin)/admin/content/page.tsx` with content CRUD, publish/unpublish controls
    - Use shadcn/ui components (Table, Dialog, Button, Card, Input, Label) for content management
    - _Requirements: 7.4, 6.4_

  - [x] 10.6 Implement admin physician registry management UI
    - Create `src/app/(admin)/admin/physicians/page.tsx` with physician profile review, approve, remove, and confirmation dialogs
    - Use shadcn/ui components (Table, Dialog, Button, Card, Badge) for physician management
    - _Requirements: 7.5, 7.7_

  - [ ] 10.7 Write property test for dashboard metrics accuracy
    - **Property 15: Dashboard metrics accuracy**
    - **Validates: Requirements 7.6**

- [x] 11. Checkpoint — Admin panel
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement audit logging, data privacy, and account deletion
  - [x] 12.1 Implement audit trail logging
    - Create audit log utility that records authentication events (login, logout, failed login) and administrative actions (user status change, content publish, profile approval) to the `AuditLog` table
    - Integrate audit logging into auth actions, admin actions, and middleware
    - _Requirements: 9.6_

  - [x] 12.2 Implement account deletion and de-identification
    - Implement account deletion flow: remove PII from user record, de-identify associated survey responses (remove patient link while retaining response data), within 30-day processing window
    - _Requirements: 9.5_

  - [ ] 12.3 Write property test for audit trail completeness
    - **Property 19: Audit trail completeness**
    - **Validates: Requirements 9.6**

  - [ ] 12.4 Write property test for account deletion de-identification
    - **Property 18: Account deletion de-identification**
    - **Validates: Requirements 9.5**

- [ ] 13. Implement caching layer and performance optimization
  - [x] 13.1 Implement Redis caching for public pages and search results
    - Cache physician search results (`physician-search:{queryHash}`), published content (`content:{slug}`), dashboard metrics (`metrics:dashboard`), and public aggregated stats
    - Implement cache invalidation on data mutations
    - _Requirements: 5.5, 8.4, 10.2_

- [ ] 14. Implement accessibility and responsive layout
  - [x] 14.1 Implement responsive layout and semantic HTML
    - Ensure all pages use semantic HTML elements, ARIA attributes, responsive CSS adapting to desktop/tablet/mobile
    - Implement keyboard navigation for all interactive elements (forms, buttons, links, dialogs)
    - _Requirements: 10.1, 10.3, 10.4_

  - [ ] 14.2 Write unit tests for accessibility compliance
    - Test semantic HTML structure, ARIA attributes, and keyboard navigation using axe-core and React Testing Library
    - _Requirements: 6.3, 10.3, 10.4_

- [x] 15. Final checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- **Package manager**: Use `pnpm` for all dependency installation and script execution
- **UI components**: Use shadcn/ui (built on Radix UI + Tailwind CSS) for all UI primitives — buttons, forms, dialogs, cards, tables, etc.
- **Form pattern**: All forms use react-hook-form + zodResolver + shadcn/ui Form components for consistent validation and UX
- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major feature area
- Property tests validate universal correctness properties using fast-check with 100+ iterations
- Unit tests validate specific examples, edge cases, and accessibility
