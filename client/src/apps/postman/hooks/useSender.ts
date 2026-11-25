import { useCallback, useEffect, useRef, useState } from 'react';
import { TransferError, toTransferError } from '../lib/errors';
import { PeerLink, type RouteKind } from '../lib/peer';
import { Signaling, type RoomInfo } from '../lib/signaling';
import type { TransferProgress } from '../lib/transfer/protocol';
import { FileSender } from '../lib/transfer/sender';

export type SenderPhase =
  | 'idle'
  | 'creating' // creating the room
  | 'waiting' // code shown, waiting for receiver
  | 'connecting' // receiver joined, establishing WebRTC
  | 'ready' // channel open, file list sent, waiting for receiver to accept
  | 'transferring'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface SenderState {
  phase: SenderPhase;
  code?: string;
  expiresAt?: number;
  route?: RouteKind | null;
  progress?: TransferProgress;
  error?: TransferError;
  /** Files that were actually offered (frozen once the receiver connects). */
  sentFiles?: File[];
  /** The receiver accepted and data started flowing. */
  started?: boolean;
}

export function useSender() {
  const [state, setState] = useState<SenderState>({ phase: 'idle' });
  const phaseRef = useRef<SenderPhase>('idle');
  const filesRef = useRef<File[]>([]);
  const signalingRef = useRef<Signaling | null>(null);
  const peerRef = useRef<PeerLink | null>(null);
  const senderRef = useRef<FileSender | null>(null);
  const roomRef = useRef<RoomInfo | null>(null);
  const channelOpenRef = useRef(false);
  /** Incremented on every teardown so stale callbacks can be ignored. */
  const sessionRef = useRef(0);

  const update = useCallback((patch: Partial<SenderState>) => {
    if (patch.phase) phaseRef.current = patch.phase;
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const teardownPeer = useCallback((graceful = false) => {
    senderRef.current?.cancel();
    senderRef.current = null;
    if (graceful) peerRef.current?.closeWhenPeerCloses();
    else peerRef.current?.close();
    peerRef.current = null;
    channelOpenRef.current = false;
  }, []);

  /** `graceful`: we just sent a final message (cancel) — let the receiver close first. */
  const teardown = useCallback((graceful = false) => {
    sessionRef.current += 1;
    teardownPeer(graceful);
    signalingRef.current?.close();
    signalingRef.current = null;
    roomRef.current = null;
  }, [teardownPeer]);

  const fail = useCallback(
    (error: TransferError) => {
      const p = phaseRef.current;
      if (p === 'complete' || p === 'cancelled' || p === 'error' || p === 'idle') return;
      teardown();
      update({ phase: 'error', error });
    },
    [teardown, update],
  );

  const startPeer = useCallback(() => {
    const room = roomRef.current;
    const signaling = signalingRef.current;
    if (!room || !signaling) return;
    const session = sessionRef.current;
    teardownPeer();
    update({ phase: 'connecting', route: undefined });

    const peer = new PeerLink('sender', room.ice, {
      onSignal: (m) => signaling.send(m),
      onFailed: (err) => {
        if (session !== sessionRef.current) return;
        fail(channelOpenRef.current && phaseRef.current === 'ready' ? new TransferError('RECEIVER_DISCONNECTED') : err);
      },
      onOpen: (channel) => {
        if (session !== sessionRef.current) return;
        channelOpenRef.current = true;
        const files = filesRef.current.slice();
        void peer.getRoute().then((route) => session === sessionRef.current && update({ route }));

        const sender = new FileSender(channel, files, peer.chunkSize, {
          onAccepted: () => update({ phase: 'transferring', started: true }),
          onProgress: (progress) => update({ progress }),
          onComplete: (progress) => {
            update({ phase: 'complete', progress });
            // The receiver is waiting for us to close.
            teardown();
          },
          onError: fail,
        });
        senderRef.current = sender;
        update({ phase: 'ready', sentFiles: files, progress: sender.progress() });
        try {
          sender.start();
        } catch (err) {
          fail(toTransferError(err, 'RECEIVER_DISCONNECTED'));
        }
      },
    });
    peerRef.current = peer;
    void peer.start();
  }, [fail, teardown, teardownPeer, update]);

  /** Creates a room for the given files. File list can change until a receiver connects. */
  const share = useCallback(
    async (files: File[]) => {
      filesRef.current = files;
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'error' && phaseRef.current !== 'cancelled') return;
      teardown();
      const session = sessionRef.current;
      update({ phase: 'creating', error: undefined, progress: undefined, route: undefined, code: undefined, started: false });

      const signaling = new Signaling({
        onPeerJoined: () => {
          if (session !== sessionRef.current) return;
          if (phaseRef.current === 'waiting' || phaseRef.current === 'connecting') startPeer();
        },
        onPeerLeft: () => {
          if (session !== sessionRef.current || channelOpenRef.current) return;
          // Receiver left before the devices connected: keep waiting with the same code.
          teardownPeer();
          if (phaseRef.current === 'connecting') update({ phase: 'waiting' });
        },
        onRoomClosed: (reason) => {
          if (session !== sessionRef.current || channelOpenRef.current) return;
          fail(new TransferError(reason === 'expired' ? 'ROOM_EXPIRED' : 'SIGNALING_UNAVAILABLE'));
        },
        onConnectionLost: () => {
          if (session !== sessionRef.current || channelOpenRef.current) return;
          fail(new TransferError('SIGNALING_UNAVAILABLE'));
        },
        onSignal: (m) => {
          if (session === sessionRef.current) void peerRef.current?.handleSignal(m);
        },
      });
      signalingRef.current = signaling;

      try {
        const room = await signaling.createRoom();
        if (session !== sessionRef.current) return;
        roomRef.current = room;
        update({ phase: 'waiting', code: room.code, expiresAt: room.expiresAt });
      } catch (err) {
        if (session !== sessionRef.current) return;
        fail(toTransferError(err, 'SIGNALING_UNAVAILABLE'));
      }
    },
    [fail, startPeer, teardown, teardownPeer, update],
  );

  const setFiles = useCallback((files: File[]) => {
    filesRef.current = files;
  }, []);

  const cancel = useCallback(() => {
    senderRef.current?.cancel();
    teardown(true);
    update({ phase: 'cancelled' });
  }, [teardown, update]);

  const reset = useCallback(() => {
    teardown();
    phaseRef.current = 'idle';
    setState({ phase: 'idle' });
  }, [teardown]);

  useEffect(
    () => () => {
      teardown(true);
      // If React remounts this component (StrictMode in dev), start over cleanly.
      phaseRef.current = 'idle';
      setState({ phase: 'idle' });
    },
    [teardown],
  );

  return { state, share, setFiles, cancel, reset };
}
