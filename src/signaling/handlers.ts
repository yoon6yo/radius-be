import type { Server, Socket } from 'socket.io';
import type { RoomService } from '../room/roomService';
import type { RateLimiter } from './rateLimiter';
import { normalizeToken, isValidToken } from '../room/token';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  SdpPayload,
  IceCandidatePayload,
  RejoinPayload,
} from '../types/signaling';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function getClientIp(socket: AppSocket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address;
}

export function registerSignalingHandlers(
  io: AppServer,
  roomService: RoomService,
  rateLimiter: RateLimiter,
): void {
  io.on('connection', (socket) => {
    const ip = getClientIp(socket);

    socket.on('create-room', async (callback) => {
      try {
        if (socket.data.roomToken) {
          callback({ ok: false, error: 'Already in a room' });
          return;
        }

        const { allowed } = await rateLimiter.check(ip);
        if (!allowed) {
          callback({ ok: false, error: 'Too many requests' });
          return;
        }

        const { token, expiresAt } = await roomService.createRoom(socket.id);
        socket.data.roomToken = token;
        socket.data.role = 'offerer';
        await socket.join(`room:${token}`);

        callback({ ok: true, token, expiresAt });
      } catch (err) {
        console.error('[create-room]', err);
        callback({ ok: false, error: 'Internal server error' });
      }
    });

    socket.on('join-room', async (rawToken, callback) => {
      try {
        if (socket.data.roomToken) {
          callback({ ok: false, error: 'Already in a room' });
          return;
        }

        if (!isValidToken(rawToken)) {
          callback({ ok: false, error: 'Invalid token format' });
          return;
        }

        const { allowed } = await rateLimiter.check(ip);
        if (!allowed) {
          callback({ ok: false, error: 'Too many requests' });
          return;
        }

        const token = normalizeToken(rawToken);
        const result = await roomService.joinRoom(token, socket.id);

        if (!result) {
          callback({ ok: false, error: 'Room not found or full' });
          return;
        }

        socket.data.roomToken = token;
        socket.data.role = 'answerer';
        await socket.join(`room:${token}`);

        // Trigger offerer to create and send the offer
        socket.to(`room:${token}`).emit('peer-joined');

        callback({ ok: true, expiresAt: result.expiresAt });
      } catch (err) {
        console.error('[join-room]', err);
        callback({ ok: false, error: 'Internal server error' });
      }
    });

    socket.on('rejoin', async ({ token: rawToken, role }: RejoinPayload, callback) => {
      try {
        if (socket.data.roomToken) {
          callback({ ok: false, error: 'Already in a room' });
          return;
        }

        if (!isValidToken(rawToken)) {
          callback({ ok: false, error: 'Invalid token format' });
          return;
        }

        if (role !== 'offerer' && role !== 'answerer') {
          callback({ ok: false, error: 'Invalid role' });
          return;
        }

        const token = normalizeToken(rawToken);
        const result = await roomService.rejoinRoom(token, role, socket.id);

        if (!result) {
          callback({ ok: false, error: 'Room not found or expired' });
          return;
        }

        socket.data.roomToken = token;
        socket.data.role = role;
        await socket.join(`room:${token}`);

        // Notify the other peer so offerer can re-initiate signaling
        socket.to(`room:${token}`).emit('peer-reconnected', { role });

        callback({ ok: true, peerConnected: result.peerConnected, expiresAt: result.expiresAt });
      } catch (err) {
        console.error('[rejoin]', err);
        callback({ ok: false, error: 'Internal server error' });
      }
    });

    socket.on('offer', (data: SdpPayload) => {
      const { roomToken } = socket.data;
      if (!roomToken) return;
      socket.to(`room:${roomToken}`).emit('offer', data);
    });

    socket.on('answer', (data: SdpPayload) => {
      const { roomToken } = socket.data;
      if (!roomToken) return;
      socket.to(`room:${roomToken}`).emit('answer', data);
    });

    socket.on('ice-candidate', (data: IceCandidatePayload) => {
      const { roomToken } = socket.data;
      if (!roomToken) return;
      socket.to(`room:${roomToken}`).emit('ice-candidate', data);
    });

    socket.on('disconnect', async () => {
      try {
        const info = await roomService.clearSocket(socket.id);
        if (!info) return;

        const { roomToken, role } = info;
        socket.to(`room:${roomToken}`).emit('peer-disconnected');
        console.log(`[disconnect] ${role} left room ${roomToken}`);
      } catch (err) {
        console.error('[disconnect]', err);
      }
    });
  });
}
