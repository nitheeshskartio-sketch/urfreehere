import type { ReactNode } from 'react';

export interface AppDefinition {
  id: string;
  name: string;
  /** One-line category, e.g. "File transfer". */
  category: string;
  tagline: string;
  description: string;
  /** Base path of the app, e.g. "/postman". */
  path: string;
  icon: (props: { className?: string }) => ReactNode;
  highlights: string[];
  /** Short "how it works" steps shown on the home page. */
  steps: string[];
  /** Optional second button on the home page card, e.g. "Sign in". */
  secondaryAction?: { label: string; href: string };
  /** Links shown in the header while inside the app. */
  nav: { label: string; href: string }[];
  /**
   * Only listed apps appear on the home page, in the footer and anywhere
   * else on the site. Add new apps with `listed: false` while they are in
   * development; they stay invisible until switched on.
   */
  listed: boolean;
}

export function PostmanIcon({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="rgb(var(--c-accent))" />
      <path
        d="M10 12h10.5l-3-3M22 20H11.5l3 3"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatIcon({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="rgb(var(--c-success))" />
      <path
        d="M9 10.5A2.5 2.5 0 0 1 11.5 8h9A2.5 2.5 0 0 1 23 10.5v6a2.5 2.5 0 0 1-2.5 2.5H15l-4.2 3.4c-.5.4-1.2 0-1.2-.6V19A2.5 2.5 0 0 1 9 16.5z"
        fill="#fff"
      />
    </svg>
  );
}

export const APPS: AppDefinition[] = [
  {
    id: 'postman',
    name: 'UR Postman',
    category: 'File transfer',
    tagline: 'Send files directly between your devices.',
    description:
      'Move photos, videos and documents from one device to another over an encrypted peer-to-peer connection. Nothing is uploaded to a server.',
    path: '/postman',
    icon: PostmanIcon,
    highlights: ['No uploads', 'End-to-end encrypted', 'Phone, tablet and desktop'],
    steps: [
      'Choose files on the sending device',
      'Scan the QR code or enter the code on the other device',
      'Accept, and the files transfer directly',
    ],
    nav: [
      { label: 'How it works', href: '/postman#how-it-works' },
      { label: 'Privacy', href: '/postman#privacy' },
    ],
    listed: true,
  },
  {
    id: 'chat',
    name: 'UR Chat',
    category: 'Messaging',
    tagline: 'Private messaging, device to device.',
    description:
      'Chat one-to-one or in small groups and share photos, documents and locations over direct peer-to-peer connections. No phone number or email: sign in on any device with your login code.',
    path: '/chat',
    icon: ChatIcon,
    secondaryAction: { label: 'Sign in', href: '/chat/login' },
    highlights: ['Sign in on any device', 'Peer-to-peer', 'Groups with invite links'],
    steps: ['Create a profile and save your login code', 'Share your chat ID, link or QR code', 'Chat directly when you are both online'],
    nav: [],
    listed: true,
  },
];

export const listedApps = APPS.filter((a) => a.listed);

export function appById(id: string): AppDefinition {
  const app = APPS.find((a) => a.id === id);
  if (!app) throw new Error(`Unknown app: ${id}`);
  return app;
}
