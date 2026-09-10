import io, { Socket } from 'socket.io-client';
import { Config } from '../constants/config';
import { TokenStorage } from '../storage/token-storage';

/**
 * Shared mobile socket helper for connecting to the NestJS realtime WebSocket gateway.
 * Mirrors frontend-web/src/lib/socket.ts architecture.
 */
export async function createRealtimeSocket(): Promise<Socket | null> {
  const token = await TokenStorage.getAccessToken();
  if (!token) {
    return null;
  }

  return io(Config.SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
}
