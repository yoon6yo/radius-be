import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';

jest.mock('../config', () => ({
  config: {
    redis: { url: 'redis://localhost:6379' },
    room: { ttlSeconds: 7200 },
    rateLimit: { windowMs: 60000, maxRequests: 3 },
    cors: { origin: '*' },
    ice: { stunUrls: ['stun:stun.l.google.com:19302'], turn: null },
  },
}));

import { RateLimiter } from './rateLimiter';

function makeRedis(): Redis {
  return new RedisMock() as unknown as Redis;
}

let redis: Redis;
let limiter: RateLimiter;

beforeEach(() => {
  redis = makeRedis();
  limiter = new RateLimiter(redis);
});

describe('RateLimiter', () => {
  it('allows requests under the limit', async () => {
    const r1 = await limiter.check('1.2.3.4');
    const r2 = await limiter.check('1.2.3.4');
    const r3 = await limiter.check('1.2.3.4');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it('blocks requests over the limit', async () => {
    await limiter.check('1.2.3.4');
    await limiter.check('1.2.3.4');
    await limiter.check('1.2.3.4');
    const r4 = await limiter.check('1.2.3.4');

    expect(r4.allowed).toBe(false);
  });

  it('tracks different IPs independently', async () => {
    await limiter.check('1.1.1.1');
    await limiter.check('1.1.1.1');
    await limiter.check('1.1.1.1');
    const blocked = await limiter.check('1.1.1.1');

    const fresh = await limiter.check('2.2.2.2');

    expect(blocked.allowed).toBe(false);
    expect(fresh.allowed).toBe(true);
  });
});
