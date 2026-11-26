import type { ChatEngine } from '../lib/engine';
import type { Conversation } from '../lib/types';

/** Confirmation text for "Delete chat". */
export function deleteChatPrompt(e: ChatEngine, conv: Conversation, title: string): string {
  const leaving = conv.type === 'group' && conv.groupId && e.isMember(conv.groupId) && !e.group(conv)?.deleted;
  return leaving
    ? `Delete "${title}"? You will leave the group and its messages will be removed from this device.`
    : `Delete the chat with ${title}? It will be removed from your list and its messages deleted from this device. It comes back if they message you again.`;
}
