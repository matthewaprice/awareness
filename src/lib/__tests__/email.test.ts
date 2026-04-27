import { emailService } from "../email";

describe("EmailService", () => {
  it("exposes a send method", () => {
    expect(typeof emailService.send).toBe("function");
  });

  it("send resolves without throwing", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    await expect(
      emailService.send({ to: "test@example.com", subject: "Hi", html: "<p>Hello</p>" })
    ).resolves.toBeUndefined();
    consoleSpy.mockRestore();
  });

  it("logs the email details", async () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    await emailService.send({ to: "a@b.com", subject: "Test", html: "" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("a@b.com")
    );
    consoleSpy.mockRestore();
  });
});
