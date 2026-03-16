import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  appConfig, dbConfig, jwtConfig, redisConfig, fxConfig, mailConfig, walletConfig,
} from './config/app.config';
import { User, Otp, Wallet, WalletBalance, LedgerEntry, Transaction } from './entities';
import { RedisModule } from './common/redis/redis.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { FxModule } from './fx/fx.module';
import { WalletModule } from './wallet/wallet.module';
import { TransactionsModule } from './transactions/transactions.module';
import { HealthModule } from './health/health.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, dbConfig, jwtConfig, redisConfig, fxConfig, mailConfig, walletConfig],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('db.host'),
        port: cfg.get<number>('db.port'),
        username: cfg.get<string>('db.username'),
        password: cfg.get<string>('db.password'),
        database: cfg.get<string>('db.name'),
        entities: [User, Otp, Wallet, WalletBalance, LedgerEntry, Transaction],
        synchronize: cfg.get<string>('app.nodeEnv') !== 'production',
        logging: cfg.get<string>('app.nodeEnv') === 'development',
      }),
    }),
    RedisModule,
    MailModule,
    AuthModule,
    FxModule,
    WalletModule,
    TransactionsModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}