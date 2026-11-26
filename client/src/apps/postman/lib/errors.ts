export type ErrorCode =
  | 'INVALID_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_FULL'
  | 'RATE_LIMITED'
  | 'SERVER_BUSY'
  | 'PAUSED'
  | 'SIGNALING_UNAVAILABLE'
  | 'SENDER_DISCONNECTED'
  | 'RECEIVER_DISCONNECTED'
  | 'WEBRTC_FAILED'
  | 'TURN_FAILED'
  | 'INTERRUPTED'
  | 'REJECTED'
  | 'TOO_LARGE'
  | 'NO_SPACE'
  | 'CANCELLED_BY_PEER'
  | 'UNSUPPORTED'
  | 'FILE_READ'
  | 'FILE_SAVE'
  | 'PROTOCOL';

export class TransferError extends Error {
  constructor(
    public readonly code: ErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

export const ERROR_COPY: Record<ErrorCode, { title: string; message: string }> = {
  INVALID_CODE: {
    title: 'Check the code',
    message: 'Sharing codes have 8 letters and numbers, like K7MP-Q2XD.',
  },
  ROOM_NOT_FOUND: {
    title: 'Transfer not found',
    message: 'No active transfer uses this code. Ask the sender to share a new one.',
  },
  ROOM_EXPIRED: {
    title: 'This code has expired',
    message: 'Sharing codes stay valid for 30 minutes. Ask the sender to create a new one.',
  },
  ROOM_FULL: {
    title: 'Already in use',
    message: 'Another device has already connected with this code.',
  },
  RATE_LIMITED: {
    title: 'Too many attempts',
    message: 'Please wait a few minutes and try again.',
  },
  SERVER_BUSY: {
    title: 'Service is busy',
    message: 'Please try again in a moment.',
  },
  PAUSED: {
    title: 'Sending is paused',
    message: 'The site admin has paused new transfers for now. Please try again later.',
  },
  SIGNALING_UNAVAILABLE: {
    title: "Can't reach the service",
    message: 'Check your internet connection and try again.',
  },
  SENDER_DISCONNECTED: {
    title: 'Sender disconnected',
    message: 'The sending device closed the page or lost its connection.',
  },
  RECEIVER_DISCONNECTED: {
    title: 'Receiver disconnected',
    message: 'The receiving device closed the page or lost its connection.',
  },
  WEBRTC_FAILED: {
    title: "Couldn't connect the devices",
    message:
      'A direct connection could not be established. Strict firewalls or some mobile networks block it — try another network.',
  },
  TURN_FAILED: {
    title: 'Relay connection failed',
    message: 'A direct connection was not possible and the relay server could not be reached.',
  },
  INTERRUPTED: {
    title: 'Transfer interrupted',
    message: 'The connection dropped before all files were transferred.',
  },
  REJECTED: {
    title: 'Transfer declined',
    message: 'The receiver declined the files.',
  },
  TOO_LARGE: {
    title: 'Too large for the receiver',
    message: "The selected files exceed the receiving device's size limit. Send fewer or smaller files.",
  },
  NO_SPACE: {
    title: 'Not enough space on the receiver',
    message: "The receiving device doesn't have enough free storage for these files.",
  },
  CANCELLED_BY_PEER: {
    title: 'Transfer cancelled',
    message: 'The other device cancelled the transfer.',
  },
  UNSUPPORTED: {
    title: 'Browser not supported',
    message: 'This browser does not support direct transfers. Use a recent version of Chrome, Edge, Firefox or Safari.',
  },
  FILE_READ: {
    title: "Couldn't read a file",
    message: 'A selected file could not be read. It may have been moved or deleted.',
  },
  FILE_SAVE: {
    title: "Couldn't save the files",
    message: 'This device ran out of space or blocked storage while receiving.',
  },
  PROTOCOL: {
    title: 'Something went wrong',
    message: 'The devices could not agree on the transfer. Try again.',
  },
};

export function toTransferError(err: unknown, fallback: ErrorCode = 'PROTOCOL'): TransferError {
  if (err instanceof TransferError) return err;
  return new TransferError(fallback, err instanceof Error ? err.message : String(err));
}
