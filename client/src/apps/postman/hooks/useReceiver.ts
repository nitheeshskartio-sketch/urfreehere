import { useCallback, useEffect, useRef, useState } from 'react';
import { TransferError, toTransferError } from '../lib/errors';
import { formatBytes } from '../../../lib/format';
import { LIMITS, checkOffer } from '../lib/limits';
import { inspectContent } from '../lib/safety';
import { PeerLink, type RouteKind } from '../lib/peer';
import { Signaling, type SignalMessage } from '../lib/signaling';
import type { FileMeta, TransferProgress } from '../lib/transfer/protocol';
import { FileReceiver, type ReceivedFile, type RejectReason } from '../lib/transfer/receiver';
import { checkCapacity, type SinkFactory } from '../lib/transfer/sink';

export type ReceiverPhase =
  | 'idle'
  | 'joining' // contacting the service
  | 'connecting' // establishing WebRTC with the sender
  | 'waiting' // connected, waiting for the file list
  | 'incoming' // file list received, awaiting accept / decline
  | 'transferring'
  | 'complete'
  | 'declined'
  | 'cancelled'
  | 'error';

export interface ReceiverState {
  phase: ReceiverPhase;
  code?: string;
  route?: RouteKind | null;
  files?: FileMeta[];
  progress?: TransferProgress;
  received?: ReceivedFile[];
  error?: TransferError;
  /** Set when the offered files can't be accepted (limits or storage). */
  offerProblem?: { message: string; reason: RejectReason };
  /** Still checking limits/storage for the offer. */
  checkingOffer?: boolean;
}

async function assessOffer(files: FileMeta[]): Promise<ReceiverState['offerProblem']> {
  const limit = checkOffer(files);
  if (limit) return { message: limit, reason: 'too-large' };
  const total = files.reduce((s, f) => s + f.size, 0);
  const capacity = await checkCapacity(total);
  if (capacity === 'no-space') {
    return { message: `This device doesn't have ${formatBytes(total)} of free storage available to the browser.`, reason: 'no-space' };
  }
  if (capacity === 'too-large-for-memory') {
    return {
      message: `This browser can't save straight to disk, so it can receive at most ${formatBytes(LIMITS.maxInMemory)} per transfer.`,
      reason: 'too-large',
    };
  }
  return undefined;
}

/** Adds content-based warnings (e.g. a program renamed to .jpg) to each received file. */
async function inspectReceived(files: ReceivedFile[]): Promise<ReceivedFile[]> {
  return Promise.all(
    files.map(async (f) => {
      const found = [...(f.meta.warnings ?? []), ...(await inspectContent(f.blob, f.meta.name))];
      const warnings = found.filter((w, i) => found.findIndex((x) => x.message === w.message) === i);
      return { ...f, meta: { ...f.meta, warnings } };
    }),
  );
}

export function useReceiver() {
  const [state, setState] = useState<ReceiverState>({ phase: 'idle' });
  const phaseRef = useRef<ReceiverPhase>('idle');
  const signalingRef = useRef<Signaling | null>(null);
  const peerRef = useRef<PeerLink | null>(null);
  const receiverRef = useRef<FileReceiver | null>(null);
  const factoryRef = useRef<SinkFactory | null>(null);
  const channelOpenRef = useRef(false);
  const sessionRef = useRef(0);

  const update = useCallback((patch: Partial<ReceiverState>) => {
    if (patch.phase) phaseRef.current = patch.phase;
    setState((s) => ({ ...s, ...patch }));
  }, []);

  /** Closes network resources. Received files stay available until `disposeStorage`. */
  const teardownNetwork = useCallback((graceful = false) => {
    sessionRef.current += 1;
    if (graceful) peerRef.current?.closeWhenPeerCloses();
    else peerRef.current?.close();
    peerRef.current = null;
    signalingRef.current?.close();
    signalingRef.current = null;
    channelOpenRef.current = false;
  }, []);

  const disposeStorage = useCallback(() => {
    const factory = factoryRef.current ?? receiverRef.current?.sinkFactory;
    factoryRef.current = null;
    receiverRef.current = null;
    void factory?.dispose();
  }, []);

  const fail = useCallback(
    (error: TransferError) => {
      const p = phaseRef.current;
      if (p === 'complete' || p === 'cancelled' || p === 'declined' || p === 'error' || p === 'idle') return;
      receiverRef.current?.cancel();
      teardownNetwork();
      disposeStorage();
      update({ phase: 'error', error });
    },
    [disposeStorage, teardownNetwork, update],
  );

  const join = useCallback(
    async (code: string) => {
      teardownNetwork();
      disposeStorage();
      const session = sessionRef.current;
      phaseRef.current = 'joining';
      setState({ phase: 'joining', code });

      let peer: PeerLink | null = null;
      const early: SignalMessage[] = [];

      const signaling = new Signaling({
        onSignal: (m) => {
          if (session !== sessionRef.current) return;
          if (peer) void peer.handleSignal(m);
          else early.push(m);
        },
        onRoomClosed: (reason) => {
          if (session !== sessionRef.current || channelOpenRef.current) return;
          fail(new TransferError(reason === 'expired' ? 'ROOM_EXPIRED' : 'SENDER_DISCONNECTED'));
        },
        onConnectionLost: () => {
          if (session !== sessionRef.current || channelOpenRef.current) return;
          fail(new TransferError('SIGNALING_UNAVAILABLE'));
        },
      });
      signalingRef.current = signaling;

      try {
        const room = await signaling.joinRoom(code);
        if (session !== sessionRef.current) return;
        update({ phase: 'connecting' });

        peer = new PeerLink('receiver', room.ice, {
          onSignal: (m) => signaling.send(m),
          onFailed: (err) => {
            if (session !== sessionRef.current) return;
            const beforeTransfer = phaseRef.current === 'waiting' || phaseRef.current === 'incoming';
            fail(channelOpenRef.current && beforeTransfer ? new TransferError('SENDER_DISCONNECTED') : err);
          },
          onOpen: (channel) => {
            if (session !== sessionRef.current) return;
            channelOpenRef.current = true;
            update({ phase: 'waiting' });
            void peer!.getRoute().then((route) => session === sessionRef.current && update({ route }));

            receiverRef.current = new FileReceiver(channel, {
              onManifest: (files) => {
                update({ phase: 'incoming', files, offerProblem: undefined, checkingOffer: true });
                void assessOffer(files).then((offerProblem) => {
                  if (session === sessionRef.current) update({ offerProblem, checkingOffer: false });
                });
              },
              onProgress: (progress) => update({ progress }),
              onComplete: (received) => {
                factoryRef.current = receiverRef.current?.sinkFactory ?? null;
                void inspectReceived(received).then((checked) => update({ phase: 'complete', received: checked }));
                // The sender closes the connection once it reads "complete".
                teardownNetwork(true);
              },
              onError: fail,
            });
          },
        });
        peerRef.current = peer;
        for (const m of early.splice(0)) void peer.handleSignal(m);
      } catch (err) {
        if (session !== sessionRef.current) return;
        fail(toTransferError(err, 'SIGNALING_UNAVAILABLE'));
      }
    },
    [disposeStorage, fail, teardownNetwork, update],
  );

  const offerRef = useRef<ReceiverState>(state);
  offerRef.current = state;

  const accept = useCallback(() => {
    const receiver = receiverRef.current;
    const { offerProblem, checkingOffer } = offerRef.current;
    if (!receiver || phaseRef.current !== 'incoming' || offerProblem || checkingOffer) return;
    update({ phase: 'transferring', progress: receiver.progress() });
    void receiver.accept();
  }, [update]);

  const decline = useCallback((reason: RejectReason = 'declined') => {
    receiverRef.current?.reject(reason);
    update({ phase: 'declined' });
    teardownNetwork(true);
    disposeStorage();
  }, [disposeStorage, teardownNetwork, update]);

  const cancel = useCallback(() => {
    receiverRef.current?.cancel();
    teardownNetwork(true);
    disposeStorage();
    update({ phase: 'cancelled' });
  }, [disposeStorage, teardownNetwork, update]);

  const reset = useCallback(() => {
    receiverRef.current?.cancel();
    teardownNetwork();
    disposeStorage();
    phaseRef.current = 'idle';
    setState({ phase: 'idle' });
  }, [disposeStorage, teardownNetwork]);

  useEffect(() => {
    const onHide = () => void factoryRef.current?.dispose();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      receiverRef.current?.cancel();
      teardownNetwork(true);
      disposeStorage();
      phaseRef.current = 'idle';
      setState({ phase: 'idle' });
    };
  }, [disposeStorage, teardownNetwork]);

  return { state, join, accept, decline, cancel, reset };
}
