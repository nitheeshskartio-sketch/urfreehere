import { Heart, Smartphone } from 'lucide-react';
import { QRCode } from '../../ui/QRCode';
import { useState } from 'react';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { SITE } from '../config';
import { UPI, addCoffee, hideFabForDays, upiLink } from './config';
import { CoffeeCup } from './CoffeeCup';

/**
 * "Buy me a coffee": a virtual coffee as a thank-you, plus a UPI QR for donations.
 * Opening the popup pours a coffee; any payment happens in the visitor's UPI app.
 */
export function CoffeeDialog({ onClose }: { onClose: () => void }) {
  const [pours, setPours] = useState(1);
  const [count, setCount] = useState(() => addCoffee());

  const another = () => {
    setPours((p) => p + 1);
    setCount(addCoffee());
  };

  return (
    <Modal title="Buy me a coffee" onClose={onClose}>
      <div className="px-5 pb-6 pt-3 text-center sm:px-6">
        <CoffeeCup className="mx-auto size-36" pour pourKey={pours} />
        <h2 className="mt-2 text-xl font-bold tracking-tight">Here's your coffee ☕</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
          Thank you for buying me a coffee! It means a lot and keeps {SITE.name} going, free and ad-free for everyone.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#FFDD00]/15 px-3 py-1 text-[13px] font-medium text-ink-soft">
          <Heart className="size-3.5 fill-danger text-danger" />
          {count === 1 ? 'Your first coffee for me' : `You've bought me ${count} coffees`}
        </p>
        <div className="mx-auto mt-5 max-w-xs rounded-xl border border-line p-4">
          <p className="text-[15px] font-semibold leading-snug">
            {UPI.heading}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {UPI.tagline}
          </p>
          <QRCode value={upiLink()} label="UPI QR code: scan with any UPI app" className="mx-auto mt-3 size-44 rounded-lg" />
          <p className="mt-2 text-[12px] text-muted">Scan with GPay, PhonePe, Paytm or any UPI app</p>
          {/* On phones, open a UPI app directly. */}
          <a
            href={upiLink()}
            className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line px-4 text-[13px] font-semibold hover:bg-surface sm:hidden"
          >
            <Smartphone className="size-4" />
            Pay with UPI app
          </a>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <button
            type="button"
            onClick={another}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#FFDD00] px-5 text-sm font-bold text-black transition-[filter] hover:brightness-95"
          >
            ☕ Buy another coffee
          </button>
        </div>
        <button type="button" onClick={() => (hideFabForDays(7), onClose())} className="mt-4 text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline">
          Hide the coffee button for 7 days
        </button>
      </div>
    </Modal>
  );
}
