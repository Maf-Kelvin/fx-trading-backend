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
          host: cfg.get<string>('mail.host'),
          port: cfg.get<number>('mail.port'),
          secure: false,         // false = STARTTLS on port 587
          requireTLS: true,      // forces STARTTLS upgrade
          auth: {
            user: cfg.get<string>('mail.user'),
            pass: cfg.get<string>('mail.pass'),
          },
        },
        verifyTransporters: false,
        defaults: { from: `"FX Trading" <${cfg.get<string>('mail.from')}>` },
        template: {
          dir: join(process.cwd(), 'dist', 'mail', 'templates'),
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

