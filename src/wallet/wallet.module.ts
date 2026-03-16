// ─── wallet.module.ts ─────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet, WalletBalance, LedgerEntry, Transaction, User } from '../entities';
import { FxModule } from '../fx/fx.module';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletBalance, LedgerEntry, Transaction, User]),
    FxModule,
  ],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}