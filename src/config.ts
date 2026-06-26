import 'dotenv/config';

function parseCorsOrigin(raw: string | undefined): string | string[] {
  if (!raw || raw === '*') return '*';
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

function parseStunUrls(raw: string | undefined): string[] {
  return (raw ?? 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const turnConfig = process.env.TURN_URL
  ? {
      url: process.env.TURN_URL,
      username: process.env.TURN_USERNAME ?? '',
      credential: process.env.TURN_CREDENTIAL ?? '',
    }
  : null;

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
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
  },
  ice: {
    stunUrls: parseStunUrls(process.env.STUN_URLS),
    turn: turnConfig,
  },
};
