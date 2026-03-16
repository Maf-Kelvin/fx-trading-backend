// ─── redis.provider.ts ────────────────────────────────────────────────────────
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.decorator';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => {
    const client = new Redis({
      host: cfg.get<string>('redis.host') || 'localhost',
      port: cfg.get<number>('redis.port') || 6379,
      lazyConnect: true,
    });
    client.on('error', (err) => {
      console.warn('[Redis] Connection error:', err.message);
    });
    return client;
  },
};