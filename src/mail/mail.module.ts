// ─── mail.module.ts ───────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { MailService } from './mail.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        transport: {
          host: cfg.get('mail.host'),
          port: cfg.get<number>('mail.port'),
          secure: false,
          auth: {
            user: cfg.get('mail.user'),
            pass: cfg.get('mail.pass'),
          },
          // Suppress startup verification — prevents boot error when SMTP
          // credentials are not configured (safe for local development)
          ignoreTLS: cfg.get('app.nodeEnv') !== 'production',
        },
        verifyTransporters: false,
        defaults: { from: cfg.get('mail.from') },
        template: {
          dir: join(__dirname, '..', 'mail', 'templates'),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

