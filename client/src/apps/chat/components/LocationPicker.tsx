import { Crosshair, ExternalLink, LoaderCircle, MapPin, Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { formatCoord, mapsLink, parseLocationInput } from '../lib/geo';
import { Field, Modal, inputClass } from '../../../ui/Modal';

/**
 * Share a location. The browser is asked for the current position only when
 * the user presses "Use my current location".
 */
export function LocationPicker({ onClose, onSend }: { onClose: () => void; onSend: (loc: { lat: number; lng: number; accuracy?: number; label?: string; current?: boolean }) => void }) {
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy?: number; current?: boolean } | null>(null);
  const [label, setLabel] = useState('');
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Browsers only allow location access on secure (HTTPS or localhost) pages.
  const canLocate = window.isSecureContext && !!navigator.geolocation;

  const locate = () => {
    setError('');
    if (!canLocate) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, current: true });
      },
      (err) => {
        setBusy(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was denied. Allow it in your browser settings, or pick a place on the map.'
            : "Your location couldn't be determined. Try again or pick a place on the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

  const applyManual = () => {
    const parsed = parseLocationInput(manual);
    if (!parsed) return setError('Enter coordinates like "48.8584, 2.2945" or paste a maps link.');
    setError('');
    setPos(parsed);
  };

  return (
    <Modal
      title="Share location"
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!pos} onClick={() => pos && onSend({ ...pos, label: label.trim() || undefined })}>
            <Send />
            Send location
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-4 sm:p-5">
        <Button variant="secondary" className="w-full" onClick={locate} disabled={busy || !canLocate}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Crosshair />}
          Use my current location
        </Button>
        <p className="text-[12px] leading-relaxed text-muted">
          {canLocate
            ? 'Your location is only read when you press this button, and only sent if you choose Send.'
            : "Your browser only allows location access on secure (HTTPS) pages. Enter coordinates or paste a link from your maps app instead."}
        </p>

        <div className="flex items-center gap-3 text-[12px] text-muted">
          <span className="h-px flex-1 bg-line" />
          or enter a place
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="flex gap-2">
          <input
            className={inputClass}
            value={manual}
            onChange={(ev) => setManual(ev.target.value)}
            onKeyDown={(ev) => ev.key === 'Enter' && applyManual()}
            placeholder="Coordinates or a link from your maps app"
            aria-label="Coordinates or maps link"
          />
          <Button variant="secondary" onClick={applyManual} className="shrink-0">
            Go
          </Button>
        </div>
        {error && <p className="text-[13px] text-danger">{error}</p>}

        {pos && (
          <div className="flex items-center gap-3 rounded-lg border border-line p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <MapPin className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{pos.current ? 'Your current location' : 'Selected place'}</p>
              <p className="text-[12.5px] text-muted tabular">
                {formatCoord(pos.lat, pos.lng)}
                {pos.accuracy ? ` · ±${Math.round(pos.accuracy)} m` : ''}
              </p>
            </div>
            <a href={mapsLink(pos.lat, pos.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-accent hover:underline">
              <ExternalLink className="size-3.5" />
              Check
            </a>
          </div>
        )}

        <Field label="Label (optional)">
          <input className={inputClass} value={label} onChange={(ev) => setLabel(ev.target.value)} maxLength={200} placeholder="e.g. Meet at the main entrance" />
        </Field>
      </div>
    </Modal>
  );
}
