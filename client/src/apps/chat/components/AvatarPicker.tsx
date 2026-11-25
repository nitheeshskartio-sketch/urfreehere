import { Check, ImageUp, Shuffle, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../../../ui/Button';
import { AVATAR_SETS, AvatarArt, randomAvatarRef } from '../lib/avatars';
import { makeAvatarImage } from '../lib/media';
import type { AvatarRef } from '../lib/types';
import { Avatar } from './Avatar';

/** Choose a picture: upload, built-in illustration, random pattern, or none. */
export function AvatarPicker({
  value,
  onChange,
  name,
  group = false,
}: {
  value: AvatarRef;
  onChange: (v: AvatarRef) => void;
  name: string;
  group?: boolean;
}) {
  const [set, setSet] = useState(0);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError('Choose a JPG, PNG or WebP image.');
    if (file.size > 15 * 1024 * 1024) return setError('That image is too large (15 MB max).');
    try {
      onChange(await makeAvatarImage(file));
    } catch {
      setError("That image couldn't be read.");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar avatar={value} name={name || (group ? '' : '?')} size={72} group={group} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <ImageUp />
            Upload
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onChange(randomAvatarRef())}>
            <Shuffle />
            Random
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X />
              Remove
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}

      <div className="mt-4">
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {AVATAR_SETS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              role="tab"
              aria-selected={set === i}
              onClick={() => setSet(i)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                set === i ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-8">
          {Object.keys(AVATAR_SETS[set].items).map((id) => {
            const ref = `ill:${id}`;
            const selected = value === ref;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(ref)}
                aria-label={`Use ${id.replace('-', ' ')} picture`}
                aria-pressed={selected}
                className={`relative aspect-square overflow-hidden rounded-full ring-offset-2 transition ${
                  selected ? 'ring-2 ring-accent' : 'hover:ring-2 hover:ring-line-strong'
                }`}
              >
                <AvatarArt refId={ref} />
                {selected && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/25">
                    <Check className="size-4 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
