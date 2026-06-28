import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { RoomService } from './roomService';

function makeRedis(): Redis {
  return new RedisMock() as unknown as Redis;
}

let redis: Redis;
let service: RoomService;

beforeEach(() => {
  redis = makeRedis();
  service = new RoomService(redis);
});

describe('createRoom', () => {
  it('returns a 6-char token and a future expiresAt', async () => {
    const before = Date.now();
    const { token, expiresAt } = await service.createRoom('socket-offerer');

    expect(token).toHaveLength(6);
    expect(expiresAt).toBeGreaterThan(before);
  });

  it('stores room and socket data in Redis', async () => {
    const { token } = await service.createRoom('socket-offerer');

    const room = await redis.hgetall(`room:${token}`);
    expect(room.offererSocketId).toBe('socket-offerer');
    expect(room.answererSocketId).toBe('');
    expect(room.token).toBe(token);

    const sock = await redis.hgetall('socket:socket-offerer');
    expect(sock.roomToken).toBe(token);
    expect(sock.role).toBe('offerer');
  });

  it('two rooms get different tokens', async () => {
    const { token: t1 } = await service.createRoom('socket-a');
    const { token: t2 } = await service.createRoom('socket-b');
    expect(t1).not.toBe(t2);
  });
});

describe('joinRoom', () => {
  it('answerer can join an empty room', async () => {
    const { token } = await service.createRoom('socket-offerer');
    const result = await service.joinRoom(token, 'socket-answerer');

    expect(result).not.toBeNull();
    expect(result!.expiresAt).toBeGreaterThan(Date.now());

    const room = await redis.hgetall(`room:${token}`);
    expect(room.answererSocketId).toBe('socket-answerer');

    const sock = await redis.hgetall('socket:socket-answerer');
    expect(sock.role).toBe('answerer');
  });

  it('returns null for a non-existent token', async () => {
    const result = await service.joinRoom('XXXXXX', 'socket-answerer');
    expect(result).toBeNull();
  });

  it('returns null when the room already has an answerer', async () => {
    const { token } = await service.createRoom('socket-offerer');
    await service.joinRoom(token, 'socket-answerer-1');

    const result = await service.joinRoom(token, 'socket-answerer-2');
    expect(result).toBeNull();
  });
});

describe('rejoinRoom', () => {
  it('offerer can rejoin and gets peerConnected: false when answerer absent', async () => {
    const { token } = await service.createRoom('socket-old');
    const result = await service.rejoinRoom(token, 'offerer', 'socket-new');

    expect(result).not.toBeNull();
    expect(result!.peerConnected).toBe(false);

    const room = await redis.hgetall(`room:${token}`);
    expect(room.offererSocketId).toBe('socket-new');
  });

  it('answerer can rejoin and gets peerConnected: true when offerer is present', async () => {
    const { token } = await service.createRoom('socket-offerer');
    await service.joinRoom(token, 'socket-old-answerer');

    const result = await service.rejoinRoom(token, 'answerer', 'socket-new-answerer');

    expect(result).not.toBeNull();
    expect(result!.peerConnected).toBe(true);

    const room = await redis.hgetall(`room:${token}`);
    expect(room.answererSocketId).toBe('socket-new-answerer');
  });

  it('removes the old socket key on rejoin', async () => {
    const { token } = await service.createRoom('socket-old');
    await service.rejoinRoom(token, 'offerer', 'socket-new');

    const oldSock = await redis.hgetall('socket:socket-old');
    expect(Object.keys(oldSock)).toHaveLength(0);
  });

  it('returns null for expired / non-existent room', async () => {
    const result = await service.rejoinRoom('XXXXXX', 'offerer', 'socket-new');
    expect(result).toBeNull();
  });
});

describe('clearSocket', () => {
  it('clears offerer socket and returns room info', async () => {
    const { token } = await service.createRoom('socket-offerer');
    const result = await service.clearSocket('socket-offerer');

    expect(result).toEqual({ roomToken: token, role: 'offerer' });

    const sock = await redis.hgetall('socket:socket-offerer');
    expect(Object.keys(sock)).toHaveLength(0);

    const room = await redis.hgetall(`room:${token}`);
    expect(room.offererSocketId).toBe('');
  });

  it('clears answerer socket and returns room info', async () => {
    const { token } = await service.createRoom('socket-offerer');
    await service.joinRoom(token, 'socket-answerer');

    const result = await service.clearSocket('socket-answerer');
    expect(result).toEqual({ roomToken: token, role: 'answerer' });

    const room = await redis.hgetall(`room:${token}`);
    expect(room.answererSocketId).toBe('');
  });

  it('returns null for an unknown socket', async () => {
    const result = await service.clearSocket('socket-unknown');
    expect(result).toBeNull();
  });
});

describe('getRoom', () => {
  it('returns room data for a valid token', async () => {
    const { token } = await service.createRoom('socket-offerer');
    const room = await service.getRoom(token);

    expect(room).not.toBeNull();
    expect(room!.token).toBe(token);
    expect(room!.offererSocketId).toBe('socket-offerer');
  });

  it('returns null for a non-existent token', async () => {
    const room = await service.getRoom('XXXXXX');
    expect(room).toBeNull();
  });
});
