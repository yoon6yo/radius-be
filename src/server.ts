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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  registerSignalingHandlers(io, roomService, rateLimiter);

  return { httpServer, pubClient, subClient };
}
