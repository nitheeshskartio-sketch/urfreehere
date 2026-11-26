import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { vibeOf, type Motion } from '../lib/vibes';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Keyframes for one particle, by motion. Coordinates are px from the screen centre. */
function particleFrames(motion: Motion, w: number, h: number): Keyframe[] {
  switch (motion) {
    case 'rise': {
      const x = rand(-w / 2, w / 2);
      const sway = rand(-80, 80);
      return [
        { transform: `translate(${x}px, ${h / 2 + 40}px) scale(0.6)`, opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(${x + sway}px, ${rand(-h / 4, 0)}px) scale(1.1) rotate(${rand(-20, 20)}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${x - sway}px, ${-h / 2 - 60}px) scale(0.9)`, opacity: 0 },
      ];
    }
    case 'fall':
    case 'snow': {
      const x = rand(-w / 2, w / 2);
      const drift = motion === 'snow' ? rand(-120, 120) : rand(-20, 20);
      return [
        { transform: `translate(${x}px, ${-h / 2 - 40}px) rotate(0deg)`, opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { transform: `translate(${x + drift}px, ${h / 2 + 40}px) rotate(${motion === 'snow' ? rand(-180, 180) : 0}deg)`, opacity: 0.9 },
      ];
    }
    case 'drift': {
      const x = rand(-w / 3, w / 3);
      const y = rand(-h / 4, h / 4);
      return [
        { transform: `translate(${x}px, ${y + 40}px) scale(0.5)`, opacity: 0 },
        { transform: `translate(${x + rand(-30, 30)}px, ${y - 10}px) scale(1)`, opacity: 0.9, offset: 0.4 },
        { transform: `translate(${x + rand(-60, 60)}px, ${y - 90}px) scale(1.1)`, opacity: 0 },
      ];
    }
    case 'break': {
      const side = Math.random() < 0.5 ? -1 : 1;
      return [
        { transform: 'translate(0px, 0px) scale(0.4)', opacity: 0 },
        { transform: `translate(${side * rand(30, 90)}px, ${rand(-60, -10)}px) scale(1) rotate(${side * 20}deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${side * rand(60, 200)}px, ${h / 2 + 60}px) rotate(${side * rand(60, 160)}deg)`, opacity: 0 },
      ];
    }
    default: {
      // burst / shake: explode outward from the centre
      const angle = rand(0, Math.PI * 2);
      const dist = rand(Math.min(w, h) * 0.25, Math.min(w, h) * 0.65);
      return [
        { transform: 'translate(0px, 0px) scale(0.3)', opacity: 0 },
        { transform: `translate(${Math.cos(angle) * dist * 0.6}px, ${Math.sin(angle) * dist * 0.6}px) scale(1.2)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 80}px) scale(0.8) rotate(${rand(-90, 90)}deg)`, opacity: 0 },
      ];
    }
  }
}

/** One full-screen emoji blast. Not interactive: clicks pass through. */
function Blast({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const vibe = vibeOf(emoji);

  useLayoutEffect(() => {
    const el = root.current!;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const anims: Animation[] = [];
    const center = el.querySelector<HTMLElement>('[data-center]')!;
    const ring = el.querySelector<HTMLElement>('[data-ring]')!;
    const tint = el.querySelector<HTMLElement>('[data-tint]')!;
    if (reduceMotion()) {
      anims.push(center.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1400 }));
    } else {
      anims.push(tint.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 2200, easing: 'ease-out' }));
      const centreFrames: Keyframe[] =
        vibe.motion === 'break'
          ? [
              { transform: 'scale(0)', opacity: 0 },
              { transform: 'scale(1.6)', opacity: 1, offset: 0.25 },
              { transform: 'scale(1.4) rotate(-8deg)', offset: 0.45 },
              { transform: 'scale(1.4) rotate(8deg)', offset: 0.55 },
              { transform: 'translateY(60vh) rotate(30deg) scale(1)', opacity: 0 },
            ]
          : [
              { transform: 'scale(0) rotate(-20deg)', opacity: 0 },
              { transform: 'scale(1.9) rotate(6deg)', opacity: 1, offset: 0.2 },
              { transform: 'scale(1.3) rotate(0deg)', opacity: 1, offset: 0.35 },
              { transform: 'scale(1.4)', opacity: 1, offset: 0.75 },
              { transform: 'scale(2.2)', opacity: 0 },
            ];
      anims.push(center.animate(centreFrames, { duration: 2200, easing: 'cubic-bezier(.2,.9,.3,1.2)' }));
      anims.push(ring.animate([{ transform: 'scale(0)', opacity: 0.9 }, { transform: 'scale(9)', opacity: 0 }], { duration: 900, easing: 'ease-out' }));
      if (vibe.motion === 'shake') {
        anims.push(
          el.animate(
            [0, -14, 12, -10, 8, -6, 4, 0].map((x, i) => ({ transform: `translate(${x}px, ${i % 2 ? 4 : -4}px)` })),
            { duration: 600, delay: 250 },
          ),
        );
      }
      el.querySelectorAll<HTMLElement>('[data-p]').forEach((p) => {
        const slow = vibe.motion === 'snow' || vibe.motion === 'drift';
        anims.push(
          p.animate(particleFrames(vibe.motion, w, h), {
            duration: rand(slow ? 2200 : 1300, slow ? 3200 : 2300),
            delay: rand(0, vibe.motion === 'burst' || vibe.motion === 'shake' || vibe.motion === 'break' ? 220 : 700),
            easing: vibe.motion === 'fall' ? 'cubic-bezier(.5,0,.9,.6)' : 'cubic-bezier(.2,.7,.3,1)',
            fill: 'both',
          }),
        );
      });
    }
    void Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(onDone);
    return () => anims.forEach((a) => a.cancel());
  }, [emoji]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-[90] grid place-items-center overflow-hidden" aria-hidden>
      <div data-tint className="absolute inset-0 opacity-0" style={{ background: `radial-gradient(circle at center, rgb(${vibe.tint} / 0.35), rgb(${vibe.tint} / 0.08) 55%, transparent 75%)` }} />
      <span data-ring className="absolute size-16 rounded-full border-4 opacity-0" style={{ borderColor: `rgb(${vibe.tint} / 0.8)` }} />
      {Array.from({ length: reduceMotion() ? 0 : vibe.count }, (_, i) => (
        <span key={i} data-p className="absolute text-3xl opacity-0 sm:text-4xl" style={{ fontSize: `${rand(22, 44)}px` }}>
          {vibe.particles[i % vibe.particles.length]}
        </span>
      ))}
      <span data-center className="relative text-[96px] leading-none opacity-0 drop-shadow-lg sm:text-[128px]">
        {emoji}
      </span>
    </div>
  );
}

/** Plays emoji blasts dispatched as `urchat:blast` events, one after another. */
export function BlastHost() {
  const [queue, setQueue] = useState<{ id: number; emoji: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (ev: Event) => setQueue((q) => [...q, { id: ++n, emoji: String((ev as CustomEvent).detail) }].slice(-3));
    window.addEventListener('urchat:blast', on);
    return () => window.removeEventListener('urchat:blast', on);
  }, []);
  const current = queue[0];
  return current ? <Blast key={current.id} emoji={current.emoji} onDone={() => setQueue((q) => q.slice(1))} /> : null;
}

/**
 * Full-screen virtual hug. Received hugs are interactive: press and hold the
 * hug to squeeze it, and let go (or tap "Hug back") to send one back.
 */
export function HugOverlay({ from, incoming, onHugBack, onClose }: { from: string; incoming: boolean; onHugBack?: () => void; onClose: () => void }) {
  const hearts = useRef<HTMLDivElement>(null);
  const hugEl = useRef<HTMLButtonElement>(null);
  const [holding, setHolding] = useState(false);
  const [sentBack, setSentBack] = useState(false);
  const holdStart = useRef(0);
  const spawnTimer = useRef<number>();

  const spawn = (n: number, spread = 1) => {
    const box = hearts.current;
    if (!box || reduceMotion()) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.textContent = ['💛', '💕', '💖', '🫶', '✨', '🤗'][Math.floor(Math.random() * 6)];
      s.className = 'absolute left-1/2 top-1/2 text-3xl';
      box.appendChild(s);
      const angle = rand(-Math.PI, 0);
      const dist = rand(120, 320) * spread;
      s.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: `translate(calc(-50% + ${Math.cos(angle) * dist * 0.5}px), calc(-50% + ${Math.sin(angle) * dist * 0.5}px)) scale(1.2)`, opacity: 1, offset: 0.3 },
          { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist - 120}px)) scale(0.8)`, opacity: 0 },
        ],
        { duration: rand(1200, 2000), easing: 'cubic-bezier(.2,.7,.3,1)' },
      ).finished.then(() => s.remove(), () => s.remove());
    }
  };

  useEffect(() => {
    spawn(incoming ? 26 : 18);
    const arms = hugEl.current?.animate(
      [{ transform: 'scale(0.2) rotate(-12deg)' }, { transform: 'scale(1.15) rotate(4deg)', offset: 0.6 }, { transform: 'scale(1) rotate(0deg)' }],
      { duration: 900, easing: 'cubic-bezier(.2,.9,.3,1.3)' },
    );
    // A sent hug closes by itself; a received one waits for the person.
    const t = incoming ? undefined : window.setTimeout(onClose, 2600);
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      arms?.cancel();
      window.clearTimeout(t);
      window.removeEventListener('keydown', esc);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hugBack = () => {
    if (sentBack || !onHugBack) return;
    setSentBack(true);
    spawn(40, 1.4);
    onHugBack();
    window.setTimeout(onClose, 1600);
  };

  const press = () => {
    if (!incoming || sentBack) return;
    setHolding(true);
    holdStart.current = Date.now();
    spawnTimer.current = window.setInterval(() => spawn(3, 0.7), 140);
  };
  const release = () => {
    if (!holding) return;
    setHolding(false);
    window.clearInterval(spawnTimer.current);
    if (Date.now() - holdStart.current > 600) hugBack();
  };
  useEffect(() => () => window.clearInterval(spawnTimer.current), []);

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-[radial-gradient(circle_at_center,rgb(251_146_60/0.45),rgb(236_72_153/0.35)_45%,rgb(0_0_0/0.55))] p-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={incoming ? `${from} sent you a hug` : `Hug sent to ${from}`}
      onClick={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div ref={hearts} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
      <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/30 p-2 text-white hover:bg-black/50" aria-label="Close">
        <X className="size-5" />
      </button>
      <div className="relative flex flex-col items-center text-center text-white">
        <button
          ref={hugEl}
          type="button"
          onPointerDown={press}
          onPointerUp={release}
          onPointerLeave={release}
          onContextMenu={(ev) => ev.preventDefault()}
          className={`select-none text-[140px] leading-none drop-shadow-xl transition-transform duration-300 sm:text-[180px] ${holding ? 'scale-90' : 'scale-100'} ${incoming && !sentBack ? 'cursor-pointer' : 'cursor-default'}`}
          aria-label={incoming ? 'Press and hold to hug back' : 'Hug'}
        >
          🤗
        </button>
        <p className="mt-4 text-2xl font-semibold drop-shadow">{incoming ? (sentBack ? `You hugged ${from} back` : `${from} sent you a hug`) : `Hug sent to ${from}`}</p>
        {incoming && !sentBack && (
          <>
            <p className="mt-1 text-[15px] text-white/85">Press and hold the hug to squeeze it</p>
            <button type="button" onClick={hugBack} className="mt-5 rounded-full bg-white px-6 py-2.5 text-[15px] font-semibold text-pink-600 shadow-lg hover:bg-pink-50">
              Hug back 🤗
            </button>
          </>
        )}
      </div>
    </div>
  );
}
