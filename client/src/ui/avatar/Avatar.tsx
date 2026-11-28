import { Users } from 'lucide-react';
import { AvatarArt, initials, initialsColor } from './avatars';
import type { AvatarRef } from './avatars';

/** Profile or group picture: uploaded image, illustration, generated pattern, or initials. */
export function Avatar({
  avatar,
  name,
  seed,
  size = 40,
  group = false,
  online,
  ring,
  className = '',
}: {
  /** Like / dislike meter drawn as the picture's border: green share for likes, red for dislikes. */
  ring?: { likes: number; dislikes: number } | null;
  avatar: AvatarRef | undefined;
  name: string;
  seed?: string;
  size?: number;
  group?: boolean;
  online?: boolean;
  className?: string;
}) {
  const style = { width: size, height: size };
  let inner;
  if (avatar && avatar.startsWith('data:image/')) {
    // Painted as a background, not an <img>: no "Save image", "Open image in new
    // tab", drag-out or long-press save. (A screenshot can't be prevented.)
    inner = (
      <span
        className="block size-full select-none bg-cover bg-center [-webkit-touch-callout:none]"
        style={{ backgroundImage: `url("${avatar.replace(/["\\\n]/g, '')}")` }}
        onContextMenu={(ev) => ev.preventDefault()}
        onDragStart={(ev) => ev.preventDefault()}
        role="img"
        aria-label={name}
      />
    );
  } else if (avatar && (avatar.startsWith('ill:') || avatar.startsWith('gen:'))) {
    inner = <AvatarArt refId={avatar} />;
  } else if (group && !name) {
    inner = (
      <span className="flex size-full items-center justify-center bg-subtle text-muted">
        <Users style={{ width: size * 0.45, height: size * 0.45 }} />
      </span>
    );
  } else {
    inner = (
      <span
        className="flex size-full select-none items-center justify-center font-semibold text-white"
        style={{ background: initialsColor(seed ?? name), fontSize: Math.max(11, size * 0.38) }}
      >
        {initials(name)}
      </span>
    );
  }
  const total = ring ? ring.likes + ring.dislikes : 0;
  const pct = total ? (ring!.likes / total) * 100 : 0;
  const width = Math.max(2, Math.round(size / 14));
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={style}>
      <span className="block size-full overflow-hidden rounded-full bg-surface">{inner}</span>
      {total > 0 && (
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: -(width + 1),
            padding: width,
            background: `conic-gradient(rgb(var(--c-success)) 0 ${pct}%, rgb(var(--c-danger)) ${pct}% 100%)`,
            // Keep only the ring: cut the middle out.
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            maskComposite: 'exclude',
          }}
          title={`👍 ${ring!.likes} · 👎 ${ring!.dislikes}`}
          aria-label={`${ring!.likes} likes, ${ring!.dislikes} dislikes`}
          role="img"
        />
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-panel ${online ? 'bg-success' : 'bg-line-strong'}`}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
          aria-label={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  );
}
