import { Check, CheckCheck, Clock } from 'lucide-react';

/** Delivery indicator for my own messages. */
export function Ticks({ status, className = '' }: { status: 'waiting' | 'sent' | 'delivered' | 'read'; className?: string }) {
  if (status === 'waiting')
    return <Clock className={`size-3.5 text-muted ${className}`} aria-label="Waiting for the recipient to come online" />;
  if (status === 'sent') return <Check className={`size-4 text-muted ${className}`} aria-label="Sent" />;
  return (
    <CheckCheck
      className={`size-4 ${status === 'read' ? 'text-accent' : 'text-muted'} ${className}`}
      aria-label={status === 'read' ? 'Read' : 'Delivered'}
    />
  );
}
