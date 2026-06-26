import type { Redis } from 'ioredis';
import { config } from '../config';

export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async check(ip: string): Promise<{ allowed: boolean }> {
    const key = `ratelimit:${ip}`;
    const windowSec = Math.ceil(config.rateLimit.windowMs / 1000);

    const count = await this.redis.incr(key);
    if (count === 1) {
      // Set expiry only on first increment to preserve the fixed window
      await this.redis.expire(key, windowSec);
    }

    return { allowed: count <= config.rateLimit.maxRequests };
  }
}
