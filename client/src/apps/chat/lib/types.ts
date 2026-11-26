export type UserId = string;
export type ConvId = string;

export interface PublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

import type { AvatarRef } from '../../../ui/avatar/avatars';
export type { AvatarRef };

export interface Profile {
  name: string;
  status: string;
  avatar: AvatarRef;
  updatedAt: number;
}

export type ContactState = 'contact' | 'request' | 'blocked';

export interface Contact {
  userId: UserId;
  pub?: PublicJwk;
  profile?: Profile;
  state: ContactState;
  addedAt: number;
}

export interface JoiningInfo {
  token: string;
  /** My signed join operation, re-sent until a member adds me. */
  joinEventId?: string;
  requestId?: string;
  requestedAt: number;
  preview: { name: string; description: string; image: string | null; memberCount: number };
  status: 'pending' | 'rejected';
  reason?: string;
}

export interface Conversation {
  id: ConvId;
  type: 'dm' | 'group';
  peerId?: UserId;
  groupId?: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  unread: number;
  lastTs: number;
  createdAt: number;
  /** Messages at or before this time were cleared locally ("Delete chat history"). */
  clearedBefore?: number;
  joining?: JoiningInfo;
}

export type EventKind = 'text' | 'image' | 'file' | 'location' | 'gif' | 'op';

export interface ChatEvent {
  v: 1;
  id: string;
  conv: ConvId;
  author: UserId;
  /** Per author, per conversation, starting at 1. Used for gap-free sync. */
  seq: number;
  ts: number;
  kind: EventKind;
  body: Record<string, unknown>;
  replyTo: string | null;
  sig: string;
}

export type ReceiptStatus = 'delivered' | 'read';

export interface StoredEvent extends ChatEvent {
  local: {
    receipts: Record<UserId, ReceiptStatus>;
    deleted?: boolean;
    /** Handed to at least one peer's data channel. */
    sent?: boolean;
  };
}

export interface TextBody {
  text: string;
}

export interface FileBody {
  fileId: string;
  name: string;
  size: number;
  type: string;
  sha256: string;
  width?: number;
  height?: number;
  /** Tiny inline preview for images (data URL), shown before the full image arrives. */
  thumb?: string;
  caption?: string;
}

export interface LocationBody {
  lat: number;
  lng: number;
  accuracy?: number;
  label?: string;
  current?: boolean;
}

/** A GIF or sticker from GIPHY; the media loads from GIPHY's servers. */
export interface GifBody {
  id: string;
  url: string;
  width: number;
  height: number;
  title?: string;
  sticker?: boolean;
}

export interface Settings {
  enterToSend: boolean;
}

export type FileTransferState =
  | { status: 'missing' }
  | { status: 'downloading'; received: number; total: number }
  | { status: 'done' }
  | { status: 'failed'; reason: string }
  | { status: 'cancelled' };

export type PeerStatus = 'offline' | 'online' | 'connecting' | 'connected';
