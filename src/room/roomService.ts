import type { Redis } from 'ioredis';
import { config } from '../config';
import { generateToken } from './token';
import type { PeerRole, RoomData } from '../types/signaling';

function roomKey(token: string): string {
  return `room:${token}`;
}

function socketKey(socketId: string): string {
  return `socket:${socketId}`;
}

export class RoomService {
  constructor(private readonly redis: Redis) {}

  async createRoom(offererSocketId: string): Promise<{ token: string; expiresAt: number }> {
    const token = generateToken();
    const now = Date.now();
    const expiresAt = now + config.room.ttlSeconds * 1000;

    await this.redis
      .multi()
      .hset(roomKey(token), {
        token,
        offererSocketId,
        answererSocketId: '',
        createdAt: String(now),
        expiresAt: String(expiresAt),
      })
      .expire(roomKey(token), config.room.ttlSeconds)
      .hset(socketKey(offererSocketId), { roomToken: token, role: 'offerer' })
      .expire(socketKey(offererSocketId), config.room.ttlSeconds)
      .exec();

    return { token, expiresAt };
  }

  async joinRoom(
    token: string,
    answererSocketId: string,
  ): Promise<{ expiresAt: number } | null> {
    const room = await this.redis.hgetall(roomKey(token));

    if (!room.token) return null;
    if (room.answererSocketId) return null; // room already has two peers

    const expiresAt = parseInt(room.expiresAt, 10);
    if (Date.now() >= expiresAt) return null;

    const ttlRemaining = Math.ceil((expiresAt - Date.now()) / 1000);

    await this.redis
      .multi()
      .hset(roomKey(token), 'answererSocketId', answererSocketId)
      .hset(socketKey(answererSocketId), { roomToken: token, role: 'answerer' })
      .expire(socketKey(answererSocketId), ttlRemaining)
      .exec();

    return { expiresAt };
  }

  async rejoinRoom(
    token: string,
    role: PeerRole,
    newSocketId: string,
  ): Promise<{ expiresAt: number; peerConnected: boolean } | null> {
    const room = await this.redis.hgetall(roomKey(token));

    if (!room.token) return null;

    const expiresAt = parseInt(room.expiresAt, 10);
    if (Date.now() >= expiresAt) return null;

    const socketField = role === 'offerer' ? 'offererSocketId' : 'answererSocketId';
    const peerField = role === 'offerer' ? 'answererSocketId' : 'offererSocketId';

    const oldSocketId = room[socketField] ?? '';
    const peerSocketId = room[peerField] ?? '';

    const ttlRemaining = Math.ceil((expiresAt - Date.now()) / 1000);

    const pipeline = this.redis.multi();
    pipeline.hset(roomKey(token), socketField, newSocketId);
    pipeline.hset(socketKey(newSocketId), { roomToken: token, role });
    pipeline.expire(socketKey(newSocketId), ttlRemaining);
    if (oldSocketId) {
      pipeline.del(socketKey(oldSocketId));
    }
    await pipeline.exec();

    return { expiresAt, peerConnected: peerSocketId !== '' };
  }

  async getRoom(token: string): Promise<RoomData | null> {
    const data = await this.redis.hgetall(roomKey(token));
    if (!data.token) return null;
    return data as unknown as RoomData;
  }

  async clearSocket(
    socketId: string,
  ): Promise<{ roomToken: string; role: PeerRole } | null> {
    const data = await this.redis.hgetall(socketKey(socketId));
    if (!data.roomToken) return null;

    const { roomToken, role } = data as { roomToken: string; role: PeerRole };
    const socketField = role === 'offerer' ? 'offererSocketId' : 'answererSocketId';

    await this.redis
      .multi()
      .hset(roomKey(roomToken), socketField, '')
      .del(socketKey(socketId))
      .exec();

    return { roomToken, role };
  }
}
