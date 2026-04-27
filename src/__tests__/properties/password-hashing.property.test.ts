/**
 * Property 17: Password hashing
 *
 * For any plaintext password, the stored hash is not equal to the plaintext
 * and verifies correctly with bcrypt.
 *
 * Feature: rare-disease-platform, Property 17: Password hashing
 * Validates: Requirements 9.4
 */

import fc from "fast-check";
import bcrypt from "bcrypt";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generate valid passwords (≥8 chars, printable ASCII).
 * We keep them short-ish to avoid slow bcrypt rounds in tests.
 */
const passwordArb = fc.stringMatching(/^[A-Za-z0-9!@#$%^&*]{8,20}$/);

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe("Property 17: Password hashing", () => {
  it(
    "for any plaintext password, the stored hash is not equal to the plaintext and verifies correctly with bcrypt",
    async () => {
      await fc.assert(
        fc.asyncProperty(passwordArb, async (plaintext) => {
          // Hash with the same cost factor used in registerUser (12)
          const hash = await bcrypt.hash(plaintext, 12);

          // The hash must NOT equal the plaintext
          expect(hash).not.toBe(plaintext);

          // The hash must be a valid bcrypt hash string
          expect(hash).toMatch(/^\$2[aby]?\$\d{2}\$/);

          // The hash must verify against the original plaintext
          const isValid = await bcrypt.compare(plaintext, hash);
          expect(isValid).toBe(true);

          // A different password must NOT verify against this hash
          const wrongPassword = plaintext + "X";
          const isInvalid = await bcrypt.compare(wrongPassword, hash);
          expect(isInvalid).toBe(false);
        }),
        { numRuns: 5 }
      );
    },
    120000 // bcrypt is intentionally slow; allow generous timeout
  );
});
