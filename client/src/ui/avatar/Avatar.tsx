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
  className = '',
}: {
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
    inner = <img src={avatar} alt="" className="size-full object-cover" draggable={false} />;
  } else if (avatar && (avatar.startsWith('ill:') || avatar.startsWith('gen:'))) {
    inner = <AvatarArt refId={avatar} />;
  } else if (group && !name) {
    inner = (
      <span className="flex size-full items-center justify-center bg-slate-200 text-muted">
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
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={style}>
      <span className="block size-full overflow-hidden rounded-full bg-surface">{inner}</span>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-white ${online ? 'bg-success' : 'bg-slate-300'}`}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
          aria-label={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  );
}
