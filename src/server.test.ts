import request from 'supertest';
import type { Server as HttpServer } from 'http';
import type { Server as IoServer } from 'socket.io';
import type { Redis } from 'ioredis';

jest.mock('ioredis', () => {
  const mod = require('ioredis-mock');
  const Cls = mod.__esModule ? mod.default : mod;
  return { __esModule: true, default: Cls };
});

jest.mock('./config', () => ({
  config: {
    redis: { url: 'redis://localhost:6379' },
    room: { ttlSeconds: 7200 },
    rateLimit: { windowMs: 600000, maxRequests: 20 },
    cors: { origin: '*' },
    ice: {
      stunUrls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      turn: null,
    },
  },
}));

import { createApp } from './server';

let httpServer: HttpServer;
let io: IoServer;
let pubClient: Redis;
let subClient: Redis;

beforeAll(async () => {
  ({ httpServer, io, pubClient, subClient } = await createApp());
});

afterAll(async () => {
  io.close();
  httpServer.close();
  await pubClient.quit();
  await subClient.quit();
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(httpServer).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('GET /ice-config', () => {
  it('returns iceServers array with STUN urls', async () => {
    const res = await request(httpServer).get('/ice-config');
    expect(res.status).toBe(200);
    expect(res.body.iceServers).toBeInstanceOf(Array);
    expect(res.body.iceServers.length).toBeGreaterThan(0);

    const stunServer = res.body.iceServers[0];
    expect(stunServer.urls).toContain('stun:stun.l.google.com:19302');
  });

  it('does not include TURN when TURN_URL is not configured', async () => {
    const res = await request(httpServer).get('/ice-config');
    const hasTurn = res.body.iceServers.some(
      (s: { urls: string | string[] }) =>
        (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u: string) => u.startsWith('turn:')),
    );
    expect(hasTurn).toBe(false);
  });
});
