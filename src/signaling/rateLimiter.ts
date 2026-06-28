import type { Redis } from 'ioredis';
import { config } from '../config';

// INCR와 조건부 EXPIRE를 원자적으로 처리 (TOCTOU 방지)
const INCR_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async check(ip: string): Promise<{ allowed: boolean }> {
    const key = `ratelimit:${ip}`;
    const windowSec = Math.ceil(config.rateLimit.windowMs / 1000);

    const count = await this.redis.eval(INCR_SCRIPT, 1, key, String(windowSec)) as number;

    return { allowed: count <= config.rateLimit.maxRequests };
  }
}
