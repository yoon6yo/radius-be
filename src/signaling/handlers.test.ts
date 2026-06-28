import { EventEmitter } from 'events';
import { createServer } from 'http';

EventEmitter.defaultMaxListeners = 30;
import type { AddressInfo } from 'net';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';

jest.mock('ioredis', () => {
  const mod = require('ioredis-mock');
  const Cls = mod.__esModule ? mod.default : mod;
  return { __esModule: true, default: Cls };
});

jest.mock('../config', () => ({
  config: {
    redis: { url: 'redis://localhost:6379' },
    room: { ttlSeconds: 7200 },
    rateLimit: { windowMs: 60000, maxRequests: 100 },
    cors: { origin: '*' },
    ice: { stunUrls: ['stun:stun.l.google.com:19302'], turn: null },
  },
}));

import { createApp } from '../server';

type AnyClientSocket = ClientSocket<Record<string, never>, Record<string, never>>;

function connect(port: number): AnyClientSocket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  }) as AnyClientSocket;
}

function waitFor(socket: AnyClientSocket, event: string, timeoutMs = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${event}`)), timeoutMs);
    socket.once(event, (...args: unknown[]) => {
      clearTimeout(timer);
      if (args.length === 0) resolve(undefined);
      else if (args.length === 1) resolve(args[0]);
      else resolve(args);
    });
  });
}

function ack(socket: AnyClientSocket, event: string, ...args: unknown[]): Promise<unknown> {
  return new Promise((resolve) => {
    (socket as unknown as { emit: (...a: unknown[]) => void }).emit(event, ...args, resolve);
  });
}

let port: number;
let closeApp: () => Promise<void>;

beforeAll(async () => {
  const { httpServer, io, pubClient, subClient } = await createApp();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;

  closeApp = () =>
    new Promise<void>((resolve) => {
      io.close();
      httpServer.close(() => {
        pubClient.quit();
        subClient.quit();
        resolve();
      });
    });
});

afterAll(async () => {
  await closeApp();
});

describe('create-room', () => {
  let client: AnyClientSocket;

  beforeEach(() => { client = connect(port); });
  afterEach(() => { client.disconnect(); });

  it('returns ok:true with a token', async () => {
    const result = await ack(client, 'create-room') as { ok: boolean; token: string; expiresAt: number };
    expect(result.ok).toBe(true);
    expect(result.token).toHaveLength(6);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns ok:false when called twice on the same socket', async () => {
    await ack(client, 'create-room');
    const result = await ack(client, 'create-room') as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Already in a room');
  });
});

describe('join-room', () => {
  let offerer: AnyClientSocket;
  let answerer: AnyClientSocket;

  beforeEach(() => {
    offerer = connect(port);
    answerer = connect(port);
  });
  afterEach(() => {
    offerer.disconnect();
    answerer.disconnect();
  });

  it('answerer joins and offerer receives peer-joined', async () => {
    const { token } = await ack(offerer, 'create-room') as { token: string };

    const peerJoined = waitFor(offerer, 'peer-joined');
    const joinResult = await ack(answerer, 'join-room', token) as { ok: boolean; expiresAt: number };

    expect(joinResult.ok).toBe(true);
    await expect(peerJoined).resolves.toBeUndefined();
  });

  it('returns ok:false for an invalid token format', async () => {
    const result = await ack(answerer, 'join-room', '!!!') as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid token format');
  });

  it('returns ok:false for a non-existent token', async () => {
    const result = await ack(answerer, 'join-room', 'XXXXXX') as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Room not found or full');
  });

  it('returns ok:false when room is already full', async () => {
    const { token } = await ack(offerer, 'create-room') as { token: string };
    await ack(answerer, 'join-room', token);

    const third = connect(port);
    try {
      const result = await ack(third, 'join-room', token) as { ok: boolean; error: string };
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Room not found or full');
    } finally {
      third.disconnect();
    }
  });
});

describe('rejoin', () => {
  let offerer: AnyClientSocket;
  let answerer: AnyClientSocket;

  beforeEach(() => {
    offerer = connect(port);
    answerer = connect(port);
  });
  afterEach(() => {
    offerer.disconnect();
    answerer.disconnect();
  });

  it('offerer can rejoin and gets peerConnected: false when answerer absent', async () => {
    const { token } = await ack(offerer, 'create-room') as { token: string };
    offerer.disconnect();

    const newOfferer = connect(port);
    try {
      const result = await ack(newOfferer, 'rejoin', { token, role: 'offerer' }) as {
        ok: boolean; peerConnected: boolean; expiresAt: number;
      };
      expect(result.ok).toBe(true);
      expect(result.peerConnected).toBe(false);
    } finally {
      newOfferer.disconnect();
    }
  });

  it('rejoining peer triggers peer-reconnected on the other side', async () => {
    const { token } = await ack(offerer, 'create-room') as { token: string };
    await ack(answerer, 'join-room', token);

    const reconnected = waitFor(offerer, 'peer-reconnected');
    answerer.disconnect();

    const newAnswerer = connect(port);
    try {
      await ack(newAnswerer, 'rejoin', { token, role: 'answerer' });
      const data = await reconnected as { role: string };
      expect(data.role).toBe('answerer');
    } finally {
      newAnswerer.disconnect();
    }
  });

  it('returns ok:false for a non-existent room', async () => {
    const result = await ack(offerer, 'rejoin', { token: 'XXXXXX', role: 'offerer' }) as {
      ok: boolean; error: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Room not found or expired');
  });
});

describe('signaling relay (offer / answer / ice-candidate)', () => {
  let offerer: AnyClientSocket;
  let answerer: AnyClientSocket;
  let token: string;

  beforeEach(async () => {
    offerer = connect(port);
    answerer = connect(port);
    const res = await ack(offerer, 'create-room') as { token: string };
    token = res.token;
    const joined = waitFor(offerer, 'peer-joined');
    await ack(answerer, 'join-room', token);
    await joined;
  });

  afterEach(() => {
    offerer.disconnect();
    answerer.disconnect();
  });

  it('offer is forwarded from offerer to answerer', async () => {
    const received = waitFor(answerer, 'offer');
    const emit = offerer as unknown as { emit: (...a: unknown[]) => void };
    emit.emit('offer', { sdp: { type: 'offer', sdp: 'mock-sdp' } });
    const data = await received as { sdp: { type: string } };
    expect(data.sdp.type).toBe('offer');
  });

  it('answer is forwarded from answerer to offerer', async () => {
    const received = waitFor(offerer, 'answer');
    const emit = answerer as unknown as { emit: (...a: unknown[]) => void };
    emit.emit('answer', { sdp: { type: 'answer', sdp: 'mock-sdp' } });
    const data = await received as { sdp: { type: string } };
    expect(data.sdp.type).toBe('answer');
  });

  it('ice-candidate is forwarded to the peer', async () => {
    const received = waitFor(answerer, 'ice-candidate');
    const emit = offerer as unknown as { emit: (...a: unknown[]) => void };
    emit.emit('ice-candidate', { candidate: { candidate: 'mock-candidate' } });
    const data = await received as { candidate: { candidate: string } };
    expect(data.candidate.candidate).toBe('mock-candidate');
  });
});

describe('disconnect', () => {
  it('peer-disconnected is emitted to the remaining peer', async () => {
    const offerer = connect(port);
    const answerer = connect(port);

    try {
      const { token } = await ack(offerer, 'create-room') as { token: string };
      const joined = waitFor(offerer, 'peer-joined');
      await ack(answerer, 'join-room', token);
      await joined;

      const disconnected = waitFor(offerer, 'peer-disconnected');
      answerer.disconnect();
      await expect(disconnected).resolves.toBeUndefined();
    } finally {
      offerer.disconnect();
    }
  });
});
