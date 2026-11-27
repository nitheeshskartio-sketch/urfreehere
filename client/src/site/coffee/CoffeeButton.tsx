import { Coffee } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CoffeeDialog } from './CoffeeDialog';

/** "Buy me a coffee" in the top bar, next to the light/dark switch. */
export function CoffeeButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('urfree:coffee-open', onOpen);
    return () => window.removeEventListener('urfree:coffee-open', onOpen);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`grid size-8 place-items-center rounded-md text-accent transition-colors hover:bg-accent-soft ${className}`}
        aria-label="Buy me a coffee"
        title="Buy me a coffee"
      >
        <Coffee className="size-[18px]" />
      </button>
      {open && <CoffeeDialog onClose={() => setOpen(false)} />}
    </>
  );
}
