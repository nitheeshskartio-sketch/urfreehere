import { CameraOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { parseCode } from '../../../lib/format';
import { Button } from '../../../ui/Button';

interface DetectedBarcode {
  rawValue: string;
}
declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

/** Camera QR scanner using the native BarcodeDetector API (Chromium, Android). */
export default function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const detector = new BarcodeDetector({ formats: ['qr_code'] });

        const tick = async () => {
          if (stopped) return;
          try {
            const results = await detector.detect(video);
            for (const r of results) {
              const code = parseCode(r.rawValue);
              if (code) {
                stopped = true;
                onCode(code);
                return;
              }
              setHint("That QR code isn't a sharing code.");
            }
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch (err) {
        const name = (err as DOMException)?.name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow camera access in your browser settings, or type the code instead.'
            : 'The camera could not be started. Type the code instead.',
        );
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-4 py-8 text-center">
          <CameraOff className="size-6 text-muted" />
          <p className="mt-3 max-w-xs text-sm text-muted">{error}</p>
        </div>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} className="size-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-[15%] rounded-lg border-2 border-panel/80" />
        </div>
      )}
      <p className="text-center text-sm text-muted">{hint ?? 'Point the camera at the QR code on the sending device.'}</p>
      <Button variant="secondary" onClick={onClose} className="w-full">
        Enter code instead
      </Button>
    </div>
  );
}
