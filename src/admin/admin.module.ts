// ─── admin.module.ts ───────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Transaction, Wallet, WalletBalance } from '../entities';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Transaction, Wallet, WalletBalance])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}