import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../../ui/avatar/Avatar';
import { AvatarPicker } from '../../../ui/avatar/AvatarPicker';
import { Field, inputClass } from '../../../ui/Modal';
import type { Profile } from '../lib/room';

/** Display name + optional picture, used before entering a room. */
export function ProfileFields({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="space-y-4">
      <Field label="Your name">
        <input
          className={inputClass}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          maxLength={40}
          placeholder="How others will see you"
          autoComplete="nickname"
        />
      </Field>
      <div>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left hover:bg-surface"
          aria-expanded={picking}
        >
          <Avatar avatar={value.avatar} name={value.name || '?'} size={36} />
          <span className="flex-1 text-sm">
            <span className="block font-medium text-ink">Profile picture</span>
            <span className="block text-[12.5px] text-muted">{value.avatar ? 'Change' : 'Optional: upload, pick an illustration, or use initials'}</span>
          </span>
          <ChevronDown className={`size-4 text-muted transition-transform ${picking ? 'rotate-180' : ''}`} />
        </button>
        {picking && (
          <div className="mt-3 rounded-lg border border-line p-3">
            <AvatarPicker value={value.avatar} onChange={(avatar) => onChange({ ...value, avatar })} name={value.name} />
          </div>
        )}
      </div>
    </div>
  );
}
