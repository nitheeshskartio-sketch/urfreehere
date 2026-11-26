import { CameraOff, ImageUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { decodeQr } from '../../../lib/qr';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { normalizeRoomCode } from '../lib/signaling';

/** Scans a Mic room QR code with the camera (or from a photo) and returns the room code. */
export function QrScanDialog({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camError, setCamError] = useState('');
  const [hint, setHint] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;
    const handle = (raw: string | null) => {
      if (!raw) return false;
      const code = normalizeRoomCode(raw);
      if (!code) {
        setHint("That QR code isn't a Mic room.");
        return false;
      }
      stopped = true;
      onCode(code);
      return true;
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setCamError('Camera scanning needs a secure (HTTPS) page. You can scan a photo of the QR code instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = stream;
        await video.current!.play();
        const tick = async () => {
          if (stopped) return;
          if (handle(await decodeQr(video.current!).catch(() => null))) return;
          timer = window.setTimeout(tick, 300);
        };
        void tick();
      } catch (err) {
        setCamError(
          (err as DOMException).name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings, or scan a photo of the QR code.'
            : 'No camera available. You can scan a photo of the QR code instead.',
        );
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  const fromImage = async (file?: File) => {
    if (!file) return;
    try {
      const raw = await decodeQr(await createImageBitmap(file));
      const code = raw ? normalizeRoomCode(raw) : null;
      if (code) onCode(code);
      else setHint(raw ? "That QR code isn't a Mic room." : 'No QR code found in that image.');
    } catch {
      setHint("That image couldn't be read.");
    }
  };

  return (
    <Modal title="Scan a room QR code" onClose={onClose}>
      <div className="space-y-4 p-4 sm:p-5">
        {camError ? (
          <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-4 py-8 text-center">
            <CameraOff className="size-6 text-muted" />
            <p className="mt-3 max-w-xs text-sm text-muted">{camError}</p>
          </div>
        ) : (
          <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-xl bg-black">
            <video ref={video} className="size-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-[14%] rounded-xl border-2 border-panel/80" />
          </div>
        )}
        <p className="text-center text-sm text-muted">{hint || 'Point the camera at the QR code on the host’s screen.'}</p>
        <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
          <ImageUp />
          Scan from a photo
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void fromImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </Modal>
  );
}
