import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Small dropdown menu anchored to a trigger button. */
export function Menu({
  trigger,
  items,
  align = 'right',
  label,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          // Open upwards when there isn't room below (e.g. the attach button in the composer).
          const rect = ref.current?.getBoundingClientRect();
          const needed = 48 + items.filter((i) => !i.hidden).length * 38;
          setUp(!!rect && window.innerHeight - rect.bottom < needed && rect.top > window.innerHeight - rect.bottom);
          setOpen((o) => !o);
        }}
        className="flex items-center justify-center rounded-md p-2 text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-40 min-w-[200px] ${up ? 'bottom-full mb-1' : 'top-full mt-1'} overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-pop ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items
            .filter((i) => !i.hidden)
            .map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface ${item.danger ? 'text-danger' : 'text-ink'}`}
              >
                {item.icon && <item.icon className={`size-4 ${item.danger ? '' : 'text-muted'}`} />}
                {item.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
