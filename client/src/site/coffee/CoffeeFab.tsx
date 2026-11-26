import { Coffee } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CoffeeDialog } from './CoffeeDialog';
import { fabHidden } from './config';

/**
 * Floating "Buy me a coffee" button in the bottom corner of every screen.
 * `offset` lifts it above an app's bottom bar (chat compose box, Mic controls).
 */
export function CoffeeFab({ offset = 'default' }: { offset?: 'default' | 'chat' | 'room' }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(fabHidden);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onChange = () => setHidden(fabHidden());
    window.addEventListener('urfree:coffee-open', onOpen);
    window.addEventListener('urfree:coffee', onChange);
    return () => {
      window.removeEventListener('urfree:coffee-open', onOpen);
      window.removeEventListener('urfree:coffee', onChange);
    };
  }, []);

  const position = { default: 'bottom-5 right-5', chat: 'bottom-[92px] right-4 md:right-6', room: 'bottom-[104px] right-4' }[offset];

  return (
    <>
      {!hidden && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`group fixed z-40 flex size-12 items-center justify-center rounded-full bg-[#FFDD00] text-black shadow-pop transition-transform hover:scale-105 ${position}`}
          aria-label="Buy me a coffee"
          title="Buy me a coffee"
        >
          <Coffee className="size-6" />
          <span className="pointer-events-none absolute right-full mr-2 hidden whitespace-nowrap rounded-md bg-inverse px-2.5 py-1 text-[12px] font-medium text-on-inverse shadow-pop group-hover:block">
            Buy me a coffee
          </span>
        </button>
      )}
      {open && <CoffeeDialog onClose={() => setOpen(false)} />}
    </>
  );
}
