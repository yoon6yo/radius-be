import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { config } from './config';
import { RoomService } from './room/roomService';
import { RateLimiter } from './signaling/rateLimiter';
import { registerSignalingHandlers } from './signaling/handlers';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './types/signaling';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export async function createApp() {
  const app = express();
  const httpServer = createServer(app);

  const pubClient = new Redis(config.redis.url);
  const subClient = pubClient.duplicate();

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
      },
    },
  );

  io.adapter(createAdapter(pubClient, subClient));

  const roomService = new RoomService(pubClient);
  const rateLimiter = new RateLimiter(pubClient);

  app.get('/health', async (_req, res) => {
    try {
      await pubClient.ping();
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
    }
  });

  // ICE 서버 설정 제공: 프론트엔드가 RTCPeerConnection 생성 시 사용
  app.get('/ice-config', (_req, res) => {
    const iceServers: IceServer[] = [{ urls: config.ice.stunUrls }];

    if (config.ice.turn) {
      iceServers.push({
        urls: config.ice.turn.url,
        username: config.ice.turn.username,
        credential: config.ice.turn.credential,
      });
    }

    res.json({ iceServers });
  });

  registerSignalingHandlers(io, roomService, rateLimiter);

  return { httpServer, pubClient, subClient };
}
