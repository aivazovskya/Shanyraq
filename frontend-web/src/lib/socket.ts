import { io, Socket } from 'socket.io-client';
import { getStoredSession } from './api';

export const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  (process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
    : 'http://localhost:4000');

export function createRealtimeSocket(): Socket | null {
  const session = getStoredSession();
  if (!session?.token) {
    return null;
  }

  return io(SOCKET_URL, {
    auth: {
      token: session.token,
    },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
}
