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

/**
 * Full-screen virtual slap. The hand swings in with a shake, a "SLAP!" burst
 * and a dizzy face. Received slaps are interactive: tap the face to slap it
 * again, or "Slap back" to send one back.
 */
export function SlapOverlay({ from, incoming, onSlapBack, onClose }: { from: string; incoming: boolean; onSlapBack?: () => void; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLSpanElement>(null);
  const face = useRef<HTMLButtonElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const [faceEmoji, setFaceEmoji] = useState('😳');
  const [hits, setHits] = useState(0);
  const [sentBack, setSentBack] = useState(false);

  const slap = () => {
    const still = reduceMotion();
    const fromRight = Math.random() < 0.5 ? 1 : -1;
    setHits((n) => n + 1);
    if (still) {
      setFaceEmoji('😵‍💫');
      return;
    }
    hand.current?.animate(
      [
        { transform: `translate(${fromRight * 70}vw, -10vh) rotate(${fromRight * 40}deg) scale(1.4)`, opacity: 0 },
        { transform: `translate(${fromRight * 70}px, 0) rotate(${fromRight * -20}deg) scale(1.2)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${fromRight * 40}px, 10px) rotate(${fromRight * -35}deg) scale(1.1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${fromRight * -40}vw, 20vh) rotate(${fromRight * -70}deg) scale(1)`, opacity: 0 },
      ],
      { duration: 650, easing: 'cubic-bezier(.5,0,.2,1)' },
    );
    window.setTimeout(() => {
      setFaceEmoji(['😵', '😵‍💫', '🤕', '😖', '🫨'][Math.floor(Math.random() * 5)]);
      stage.current?.animate(
        [0, -22, 18, -14, 10, -6, 3, 0].map((x, i) => ({ transform: `translate(${x}px, ${i % 2 ? 6 : -6}px)` })),
        { duration: 450 },
      );
      face.current?.animate(
        [{ transform: 'scale(1) rotate(0deg)' }, { transform: `scale(0.85) rotate(${fromRight * -18}deg)` }, { transform: 'scale(1) rotate(0deg)' }],
        { duration: 500, easing: 'ease-out' },
      );
      word.current?.animate(
        [
          { transform: `scale(0.2) rotate(${fromRight * -12}deg)`, opacity: 0 },
          { transform: `scale(1.3) rotate(${fromRight * 6}deg)`, opacity: 1, offset: 0.3 },
          { transform: 'scale(1.1) rotate(0deg)', opacity: 1, offset: 0.7 },
          { transform: 'scale(1.6)', opacity: 0 },
        ],
        { duration: 900, easing: 'ease-out' },
      );
      // Impact stars and a red flash.
      const box = fx.current;
      if (!box) return;
      box.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 500 });
      for (let i = 0; i < 12; i++) {
        const s = document.createElement('span');
        s.textContent = ['💥', '⭐', '💫', '✨'][i % 4];
        s.className = 'absolute left-1/2 top-1/2 text-3xl';
        stage.current?.appendChild(s);
        const a = rand(0, Math.PI * 2);
        const d = rand(90, 220);
        s.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1.1) rotate(${rand(-90, 90)}deg)`, opacity: 0 },
          ],
          { duration: rand(500, 900), easing: 'cubic-bezier(.2,.7,.3,1)' },
        ).finished.then(() => s.remove(), () => s.remove());
      }
    }, 290);
  };

  useEffect(() => {
    slap();
    const t = incoming ? undefined : window.setTimeout(onClose, 2200);
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', esc);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const slapBack = () => {
    if (sentBack || !onSlapBack) return;
    setSentBack(true);
    slap();
    onSlapBack();
    window.setTimeout(onClose, 1300);
  };

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,rgb(251_191_36/0.35),rgb(239_68_68/0.35)_50%,rgb(0_0_0/0.6))] p-6"
      role="dialog"
      aria-modal="true"
      aria-label={incoming ? `${from} slapped you` : `You slapped ${from}`}
      onClick={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <div ref={fx} className="pointer-events-none absolute inset-0 bg-red-500 opacity-0" aria-hidden />
      <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full bg-black/30 p-2 text-white hover:bg-black/50" aria-label="Close">
        <X className="size-5" />
      </button>
      <div ref={stage} className="relative flex flex-col items-center text-center text-white">
        <button
          ref={face}
          type="button"
          onClick={() => incoming && slap()}
          className={`select-none text-[130px] leading-none drop-shadow-xl sm:text-[170px] ${incoming ? 'cursor-pointer' : 'cursor-default'}`}
          aria-label={incoming ? 'Tap to slap again' : 'Slap'}
        >
          {faceEmoji}
        </button>
        <span ref={hand} className="pointer-events-none absolute left-1/2 top-[18%] -ml-12 text-[110px] leading-none opacity-0 sm:text-[140px]" aria-hidden>
          🖐️
        </span>
        <span
          ref={word}
          className="pointer-events-none absolute -top-6 text-6xl font-black italic tracking-tight text-yellow-300 opacity-0 [text-shadow:0_4px_0_rgb(185_28_28),0_0_24px_rgb(0_0_0/0.4)] sm:text-7xl"
          aria-hidden
        >
          SLAP!
        </span>
        <p className="mt-4 text-2xl font-semibold drop-shadow">
          {incoming ? (sentBack ? `You slapped ${from} back` : `${from} slapped you!`) : `You slapped ${from}`}
          {hits > 1 && <span className="ml-2 text-yellow-200">×{hits}</span>}
        </p>
        {incoming && !sentBack && (
          <>
            <p className="mt-1 text-[15px] text-white/85">Tap the face to feel it again</p>
            <button type="button" onClick={slapBack} className="mt-5 rounded-full bg-white px-6 py-2.5 text-[15px] font-semibold text-red-600 shadow-lg hover:bg-red-50">
              Slap back 🖐️
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Three soft wooden knocks (Web Audio, no files). */
function knockSound() {
  try {
    const ctx = new AudioContext();
    [0, 0.22, 0.44].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(190, ctx.currentTime + t);
      o.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + t + 0.09);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.14);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* no audio */
  }
}

/**
 * Knock knock: a hand knocks three times on the screen, which gives a small
 * shake with each knock. Received knocks wait for the person (with "Knock back").
 */
export function KnockOverlay({ from, incoming, sound, onKnockBack, onClose }: { from: string; incoming: boolean; sound: boolean; onKnockBack?: () => void; onClose: () => void }) {
  const hand = useRef<HTMLSpanElement>(null);
  const [sentBack, setSentBack] = useState(false);

  const knock = () => {
    if (sound) knockSound();
    if (reduceMotion()) return;
    hand.current?.animate(
      [0, 1, 2].flatMap(() => [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'translate(-10px,6px) rotate(-14deg)' }, { transform: 'translate(0,0) rotate(0deg)' }]),
      { duration: 660, easing: 'ease-out' },
    );
    const root = document.getElementById('root');
    root?.animate(
      [0, 1, 2].flatMap(() => [{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(2px,-1px)' }, { transform: 'translate(0,0)' }]),
      { duration: 660, easing: 'linear' },
    );
  };

  useEffect(() => {
    knock();
    const again = incoming ? window.setTimeout(knock, 1500) : undefined;
    const t = incoming ? undefined : window.setTimeout(onClose, 2400);
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(again);
      window.removeEventListener('keydown', esc);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const knockBack = () => {
    if (sentBack || !onKnockBack) return;
    setSentBack(true);
    knock();
    onKnockBack();
    window.setTimeout(onClose, 1400);
  };

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-[radial-gradient(circle_at_center,rgb(var(--c-accent)/0.35),rgb(0_0_0/0.55))] p-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={incoming ? `${from} is knocking` : `You knocked on ${from}'s screen`}
      onClick={(ev) => ev.target === ev.currentTarget && onClose()}
    >
      <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/30 p-2 text-white hover:bg-black/50" aria-label="Close">
        <X className="size-5" />
      </button>
      <div className="relative flex flex-col items-center text-center text-white">
        <span className="relative select-none text-[120px] leading-none drop-shadow-xl sm:text-[150px]" aria-hidden>
          🚪
          <span ref={hand} className="absolute -right-10 top-1/3 origin-bottom-right text-[64px] sm:-right-12 sm:text-[80px]">
            🤜
          </span>
        </span>
        <p className="mt-6 text-2xl font-semibold drop-shadow">Knock knock!</p>
        <p className="mt-1 text-[15px] text-white/85">{incoming ? (sentBack ? `You knocked back on ${from}'s screen` : `${from} is knocking on your screen`) : `You knocked on ${from}'s screen`}</p>
        {incoming && !sentBack && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onClose} className="rounded-full bg-white px-6 py-2.5 text-[15px] font-semibold text-accent shadow-lg hover:bg-accent-soft">
              Who's there? 👋
            </button>
            {onKnockBack && (
              <button type="button" onClick={knockBack} className="rounded-full bg-white/20 px-6 py-2.5 text-[15px] font-semibold text-white ring-1 ring-white/50 hover:bg-white/30">
                Knock back 🚪
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
