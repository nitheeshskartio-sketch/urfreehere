import { useSyncExternalStore } from 'react';
import type { RoomClient } from './lib/room';

export function useRoom(client: RoomClient) {
  useSyncExternalStore(client.subscribe, client.getVersion);
  return client;
}
