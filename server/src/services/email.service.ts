import axios from 'axios';
import { logger } from '../utils/logger';

export class EmailService {
  private static instance: EmailService;
  private isEnabled: boolean;
  private fromEmail?: string;
  private apiKey?: string;

  private constructor() {
    this.isEnabled = process.env.EMAIL_ENABLED === 'true';
    this.fromEmail = process.env.EMAIL_FROM;
    this.apiKey = process.env.RESEND_API_KEY;
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<any> {
    if (!this.isEnabled) {
      logger.info('--- [EMAIL_DISABLED] DEV MODE CONSOLE EMAIL LOG ---');
      logger.info(`To: ${to}`);
      logger.info(`Subject: ${subject}`);
      logger.info(`Body:\n${html}`);
      logger.info('----------------------------------------------------');
      return { success: true, message: 'Email logged to console in development mode.' };
    }

    if (!this.fromEmail || !this.apiKey) {
      throw new Error('EMAIL_FROM or RESEND_API_KEY is not configured on the platform.');
    }

    try {
      const response = await axios.post(
        'https://api.resend.com/emails',
        {
          from: this.fromEmail,
          to: [to],
          subject,
          html,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      logger.info(`Email successfully dispatched via Resend API to: ${to}`);
      return response.data;
    } catch (err: any) {
      logger.error(err, `Failed to dispatch email via Resend to ${to}`);
      throw err;
    }
  }

  // Invitation template for newly created managers
  public async sendManagerInvite(to: string, name: string, restaurantName: string, setupLink: string): Promise<any> {
    const subject = `Welcome to ${restaurantName}! Set up your Manager account`;
    const html = `
      <div style="font-family: sans-serif; padding: 24px; max-width: 600px; color: #111827;">
        <h2 style="font-size: 24px; font-weight: 800; tracking: -0.05em; color: #111827;">Hi ${name},</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          You have been registered as a **Manager** for <strong>${restaurantName}</strong> on the Pixora QR platform.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          Please use the link below to access your operations dashboard and configure your tables and menu:
        </p>
        <div style="margin: 24px 0;">
          <a href="${setupLink}" style="background-color: #111827; color: #ffffff; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: bold; text-decoration: none; display: inline-block;">
            Access Dashboard
          </a>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 32px; border-t: 1px solid #e2e8f0; padding-top: 16px;">
          Pixora Studios — Mobile-First QR Ordering & Operations.
        </p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  // Invitation template for floor service staff
  public async sendStaffInvite(to: string, name: string, restaurantName: string, setupLink: string): Promise<any> {
    const subject = `Invited as Staff for ${restaurantName}`;
    const html = `
      <div style="font-family: sans-serif; padding: 24px; max-width: 600px; color: #111827;">
        <h2 style="font-size: 24px; font-weight: 800; tracking: -0.05em; color: #111827;">Hi ${name},</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          You have been invited as a **Service Staff** member for <strong>${restaurantName}</strong> on the Pixora QR platform.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          Click below to access your floor service operations board:
        </p>
        <div style="margin: 24px 0;">
          <a href="${setupLink}" style="background-color: #111827; color: #ffffff; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: bold; text-decoration: none; display: inline-block;">
            Access Kitchen Board
          </a>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 32px; border-t: 1px solid #e2e8f0; padding-top: 16px;">
          Pixora Studios — Mobile-First QR Ordering & Operations.
        </p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  // Password reset template
  public async sendPasswordReset(to: string, name: string, resetLink: string): Promise<any> {
    const subject = 'Reset your Pixora account password';
    const html = `
      <div style="font-family: sans-serif; padding: 24px; max-width: 600px; color: #111827;">
        <h2 style="font-size: 24px; font-weight: 800; color: #111827;">Hi ${name},</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          We received a request to reset your Pixora platform password. If you did not make this request, you can safely ignore this email.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          Otherwise, use the button below to set a new password:
        </p>
        <div style="margin: 24px 0;">
          <a href="${resetLink}" style="background-color: #111827; color: #ffffff; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: bold; text-decoration: none; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 32px; border-t: 1px solid #e2e8f0; padding-top: 16px;">
          Pixora Studios — Mobile-First QR Ordering & Operations.
        </p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }

  // Restaurant Creation Template (Super Admin)
  public async sendRestaurantCreated(to: string, managerName: string, restaurantName: string, slug: string): Promise<any> {
    const subject = `Restaurant Registered: Welcome to ${restaurantName}!`;
    const html = `
      <div style="font-family: sans-serif; padding: 24px; max-width: 600px; color: #111827;">
        <h2 style="font-size: 24px; font-weight: 800; color: #111827;">Congratulations ${managerName}!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          Your restaurant tenant <strong>${restaurantName}</strong> has been successfully registered on our SaaS core platform.
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569;">
          Your custom customer QR scan slug is: <strong>${slug}</strong>.
        </p>
        <p style="font-size: 12px; color: #64748b; margin-top: 32px; border-t: 1px solid #e2e8f0; padding-top: 16px;">
          Pixora Studios — Mobile-First QR Ordering & Operations.
        </p>
      </div>
    `;
    return this.sendEmail(to, subject, html);
  }
}
export default EmailService;
