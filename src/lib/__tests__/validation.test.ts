import {
  registerSchema,
  surveyResponseSchema,
  physicianProfileSchema,
  contentPageSchema,
  physicianSearchSchema,
} from "../validation";

describe("registerSchema", () => {
  const validInput = {
    email: "user@example.com",
    password: "securepass",
    fullName: "Jane Doe",
    role: "PATIENT" as const,
  };

  it("accepts valid patient registration", () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid physician registration", () => {
    const result = registerSchema.safeParse({ ...validInput, role: "PHYSICIAN" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({ ...validInput, email: "not-email" });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = registerSchema.safeParse({ ...validInput, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects empty fullName", () => {
    const result = registerSchema.safeParse({ ...validInput, fullName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = registerSchema.safeParse({ ...validInput, role: "ADMIN" });
    expect(result.success).toBe(false);
  });
});

describe("surveyResponseSchema", () => {
  const validInput = {
    surveyId: "550e8400-e29b-41d4-a716-446655440000",
    patientId: "550e8400-e29b-41d4-a716-446655440001",
    responses: [
      { questionId: "550e8400-e29b-41d4-a716-446655440002", answer: "Yes" },
      { questionId: "550e8400-e29b-41d4-a716-446655440003", answer: 5 },
      { questionId: "550e8400-e29b-41d4-a716-446655440004", answer: ["a", "b"] },
    ],
  };

  it("accepts valid survey response with mixed answer types", () => {
    const result = surveyResponseSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid surveyId", () => {
    const result = surveyResponseSchema.safeParse({ ...validInput, surveyId: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects non-uuid patientId", () => {
    const result = surveyResponseSchema.safeParse({ ...validInput, patientId: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects response with non-uuid questionId", () => {
    const result = surveyResponseSchema.safeParse({
      ...validInput,
      responses: [{ questionId: "bad", answer: "Yes" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("physicianProfileSchema", () => {
  const validInput = {
    credentials: "MD, FACP",
    specialty: "Rare Disease Specialist",
    practiceName: "City Medical Center",
    practiceAddress: "123 Main St",
    city: "Springfield",
    state: "IL",
    zipCode: "62701",
    phone: "555-123-4567",
  };

  it("accepts valid profile without website", () => {
    const result = physicianProfileSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid profile with website", () => {
    const result = physicianProfileSchema.safeParse({
      ...validInput,
      website: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty credentials", () => {
    const result = physicianProfileSchema.safeParse({ ...validInput, credentials: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid website URL", () => {
    const result = physicianProfileSchema.safeParse({
      ...validInput,
      website: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("contentPageSchema", () => {
  const validInput = {
    slug: "about-disease",
    title: "About the Disease",
    body: "Content body here.",
    published: true,
  };

  it("accepts valid content page", () => {
    const result = contentPageSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects empty slug", () => {
    const result = contentPageSchema.safeParse({ ...validInput, slug: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing published field", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { published: _, ...rest } = validInput;
    const result = contentPageSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("physicianSearchSchema", () => {
  it("accepts search with all filters", () => {
    const result = physicianSearchSchema.safeParse({
      location: "Springfield, IL",
      name: "Dr. Smith",
      specialty: "Rare Disease",
      page: 1,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for page and pageSize", () => {
    const result = physicianSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(10);
    }
  });

  it("accepts search with only optional filters", () => {
    const result = physicianSearchSchema.safeParse({ specialty: "Neurology" });
    expect(result.success).toBe(true);
  });

  it("rejects page less than 1", () => {
    const result = physicianSearchSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize over 100", () => {
    const result = physicianSearchSchema.safeParse({ pageSize: 101 });
    expect(result.success).toBe(false);
  });
});
