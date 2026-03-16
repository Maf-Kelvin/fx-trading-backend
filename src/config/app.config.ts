import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
}));

export const dbConfig = registerAs('db', () => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  name: process.env.DB_NAME || 'fx_trading',
}));

export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'fallback_secret_change_in_prod',
  expiresIn: process.env.JWT_EXPIRES_IN || '3600s',
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
}));

export const fxConfig = registerAs('fx', () => ({
  apiKey: process.env.FX_API_KEY || '',
  apiBaseUrl: process.env.FX_API_BASE_URL || 'https://v6.exchangerate-api.com',
  cacheTtlSeconds: parseInt(process.env.FX_CACHE_TTL_SECONDS, 10) || 300,
}));

export const mailConfig = registerAs('mail', () => ({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || 'noreply@fxtrading.com',
}));

export const walletConfig = registerAs('wallet', () => ({
  initialNgnBalance: parseFloat(process.env.INITIAL_NGN_BALANCE) || 0,
}));