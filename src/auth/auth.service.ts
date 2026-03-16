// ─── auth.service.ts ──────────────────────────────────────────────────────────
import {
  Injectable, ConflictException, BadRequestException, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, Otp, Wallet, WalletBalance } from '../entities';
import { MailService } from '../mail/mail.service';
import { Currency } from '../common/enums';
import { LoginDto, RegisterDto, VerifyOtpDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private dataSource: DataSource,
    private jwtService: JwtService,
    private mailService: MailService,
    private cfg: ConfigService,
  ) {}

  async resendOtp(email: string) {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { email } });
    if (!user) throw new BadRequestException('User not found');
    if (user.isVerified) throw new BadRequestException('Account already verified');

    await this.issueOtp(user);
    return { message: 'A new OTP has been sent to your email.' };
  }

  async register(dto: RegisterDto) {
    const existing = await this.dataSource
      .getRepository(User)
      .findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.dataSource.getRepository(User).create({
      email: dto.email,
      password: hashed,
    });
    await this.dataSource.getRepository(User).save(user);
    await this.issueOtp(user);

    return { message: 'Registration successful. Check your email for the OTP.' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('User not found');
    if (user.isVerified) throw new BadRequestException('Account already verified');

    const otp = await this.dataSource.getRepository(Otp).findOne({
      where: { userId: user.id, code: dto.otp, isUsed: false },
      order: { createdAt: 'DESC' },
    });

    if (!otp) throw new BadRequestException('Invalid OTP');
    if (new Date() > otp.expiresAt) throw new BadRequestException('OTP has expired');

    await this.dataSource.transaction(async (em) => {
      await em.getRepository(Otp).update(otp.id, { isUsed: true });

      // Use save() instead of update() to ensure boolean is persisted correctly
      await em.getRepository(User).save({ id: user.id, isVerified: true });

      // Re-fetch user to confirm isVerified is persisted correctly
      const wallet = em.getRepository(Wallet).create({ userId: user.id });
      const saved = await em.getRepository(Wallet).save(wallet);

      const balance = em.getRepository(WalletBalance).create({
        walletId: saved.id,
        currency: Currency.NGN,
        balance: String(this.cfg.get<number>('wallet.initialNgnBalance') ?? 0),
        lockedBalance: '0',
      });
      await em.getRepository(WalletBalance).save(balance);
    });

    return { message: 'Account verified successfully. You can now log in.' };
  }

  async login(dto: LoginDto) {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isVerified) throw new UnauthorizedException('Account not verified');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);

    return { accessToken: token, expiresIn: 3600, tokenType: 'Bearer' };
  }

  private async issueOtp(user: User) {
    // OTP rate limit: max 3 per email per 10 minutes (business layer)
    const windowStart = new Date(Date.now() - 10 * 60 * 1000);
    const recentCount = await this.dataSource.getRepository(Otp).count({
      where: { userId: user.id, createdAt: MoreThan(windowStart) },
    });
    if (recentCount >= 3) {
      throw new BadRequestException(
        'Too many OTP requests. Please wait before requesting another.',
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const otp = this.dataSource.getRepository(Otp).create({
      userId: user.id,
      code,
      expiresAt,
    });
    await this.dataSource.getRepository(Otp).save(otp);
    await this.mailService.sendOtpEmail(user.email, code);
  }
}