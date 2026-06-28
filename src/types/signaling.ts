export type PeerRole = 'offerer' | 'answerer';

export interface RoomData {
  token: string;
  offererSocketId: string;
  answererSocketId: string;
  createdAt: string;
  expiresAt: string;
}

// Callback response types
export type CreateRoomResult =
  | { ok: true; token: string; role: 'offerer'; expiresAt: number }
  | { ok: false; error: string };

export type JoinRoomResult =
  | { ok: true; role: 'answerer'; expiresAt: number }
  | { ok: false; error: string };

export type RejoinResult =
  | { ok: true; role: PeerRole; peerConnected: boolean; expiresAt: number }
  | { ok: false; error: string };

// Signaling payloads
export interface SdpPayload {
  sdp: object;
}

export interface IceCandidatePayload {
  candidate: object;
}

export interface RejoinPayload {
  token: string;
  role: PeerRole;
}

// Socket.io typed event maps
export interface ServerToClientEvents {
  'peer-joined': () => void;
  'peer-reconnected': (data: { role: PeerRole }) => void;
  'peer-disconnected': () => void;
  offer: (data: SdpPayload) => void;
  answer: (data: SdpPayload) => void;
  'ice-candidate': (data: IceCandidatePayload) => void;
}

export interface ClientToServerEvents {
  'create-room': (callback: (result: CreateRoomResult) => void) => void;
  'join-room': (token: string, callback: (result: JoinRoomResult) => void) => void;
  rejoin: (payload: RejoinPayload, callback: (result: RejoinResult) => void) => void;
  offer: (data: SdpPayload) => void;
  answer: (data: SdpPayload) => void;
  'ice-candidate': (data: IceCandidatePayload) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  roomToken?: string;
  role?: PeerRole;
}
