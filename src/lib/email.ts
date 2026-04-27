export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailService {
  send(options: SendEmailOptions): Promise<void>;
}

/**
 * Stub email service — logs to console in development.
 * Replace with a real SMTP / SES implementation for production.
 */
class StubEmailService implements EmailService {
  async send(options: SendEmailOptions): Promise<void> {
    console.log(`[EmailService] To: ${options.to} | Subject: ${options.subject}`);
  }
}

export const emailService: EmailService = new StubEmailService();
