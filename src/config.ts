import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  room: {
    ttlSeconds: 7200,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '600000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '20', 10),
  },
  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
  },
} as const;
