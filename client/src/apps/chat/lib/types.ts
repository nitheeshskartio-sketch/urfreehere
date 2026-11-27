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
  /** "Delete chat": hidden from the list until a new message arrives. */
  hidden?: boolean;
  joining?: JoiningInfo;
}

/**
 * skip: stands in for a message that was never delivered and was purged (keeps the sequence gap-free).
 * hug / slap: full-screen gestures. meter: like/dislike totals. promise / promise-reply: a promise request and its Yes / No / cancel answer.
 */
export type EventKind = 'text' | 'image' | 'file' | 'location' | 'gif' | 'op' | 'react' | 'delete' | 'mood' | 'skip' | 'hug' | 'slap' | 'promise' | 'promise-reply' | 'meter';

/** Full-screen gestures between two people. */
export type Gesture = 'hug' | 'slap';

/** Like / dislike totals one person gave the other (running totals, latest wins). */
export interface Meter {
  likes: number;
  dislikes: number;
}

export type PromiseAnswer = 'yes' | 'no' | 'cancel';
export interface PromiseStatus {
  status: 'pending' | 'yes' | 'no' | 'cancel';
  by?: UserId;
  ts?: number;
}

/**
 * Emoji each person sets for a direct chat. The other person sees it on your
 * profile picture. Any single emoji is accepted; these are offered first.
 */
export const MOODS = ['😍', '❤️', '🥰', '😊', '🤩', '🥺', '🤝', '😂', '😎', '🤗', '😐', '😴', '😔', '😢', '😡', '💔', '🥶', '🔥', '🙏', '🤔'];

/** Message reactions: one per person per message. */
export type Reaction = 'love' | 'broken' | 'slap';
export const REACTIONS: { id: Reaction; emoji: string; label: string }[] = [
  { id: 'love', emoji: '❤️', label: 'Love' },
  { id: 'broken', emoji: '💔', label: 'Broken heart' },
  { id: 'slap', emoji: '🖐️', label: 'Slap' },
];

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
    /** Deleted for everyone by its author (shows "This message was deleted"). */
    revoked?: boolean;
    /** A view-once message that was opened (receiver) or opened by everyone (sender): content removed. */
    opened?: boolean;
    /** Handed to at least one peer's data channel. */
    sent?: boolean;
    /** A received hug whose animation has been shown. */
    played?: boolean;
    /** Older than the 3-day limit: content removed, kept only so the sequence stays gap-free. */
    expired?: boolean;
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

/** How a message is sent: normally, masked until clicked, or viewable only once. */
export type SendMode = 'normal' | 'secret' | 'once';

export interface Settings {
  enterToSend: boolean;
  /** Desktop notifications for new messages (needs browser permission). */
  desktopNotifications: boolean;
  /** Show the message text in notifications. */
  notificationPreview: boolean;
  /** Play a short sound for new messages. */
  notificationSound: boolean;
  /** Message text size. */
  textSize: 'sm' | 'md' | 'lg' | 'xl';
  /** Space between and inside messages. */
  density: 'comfortable' | 'compact';
  /** Clock style for message times. */
  clock: 'auto' | '12h' | '24h';
  /** Blur the app behind a lock after 20 seconds without activity. */
  idleLock: boolean;
}

export type FileTransferState =
  | { status: 'missing' }
  | { status: 'downloading'; received: number; total: number }
  | { status: 'done' }
  | { status: 'failed'; reason: string }
  | { status: 'cancelled' };

/** "unreachable": online, but repeated attempts to connect failed (usually a strict network with no TURN relay). */
export type PeerStatus = 'offline' | 'online' | 'connecting' | 'connected' | 'unreachable';
