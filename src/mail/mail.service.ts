// ─── mail.service.ts ──────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private mailerService: MailerService) {}

  async sendOtpEmail(email: string, otp: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Account Verification',
        template: './otp',
        context: { otp, expiresInMinutes: 10 },
      });
    } catch (err) {
      this.logger.warn(`Failed to send OTP email to ${email}: ${err.message}`);
    }
  }
}