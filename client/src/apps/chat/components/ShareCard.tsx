import { Download, Share2 } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { CopyButton } from '../../../ui/CopyButton';
import { QRCode } from '../../../ui/QRCode';
import { downloadQr } from '../lib/qr';

/** QR code + link with copy, share and download actions. */
export function ShareCard({ link, code, codeLabel, qrName, shareTitle }: { link: string; code?: string; codeLabel?: string; qrName: string; shareTitle: string }) {
  const canShare = typeof navigator.share === 'function';
  return (
    <div className="space-y-4">
      <div className="flex justify-center rounded-lg border border-line bg-white p-3">
        <QRCode value={link} className="aspect-square w-full max-w-[200px]" />
      </div>
      {code && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
          <div>
            <p className="text-[12px] text-muted">{codeLabel}</p>
            <p className="font-mono text-lg font-semibold tracking-[0.12em]">{code}</p>
          </div>
          <CopyButton text={code} size="sm" />
        </div>
      )}
      <div className="flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink-soft focus:outline-none" />
        <CopyButton text={link} className="h-10" />
      </div>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <Button variant="secondary" size="sm" onClick={() => navigator.share({ title: shareTitle, url: link }).catch(() => {})}>
            <Share2 />
            Share link
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => downloadQr(link, `${qrName}.png`, shareTitle)}>
          <Download />
          Download QR
        </Button>
      </div>
    </div>
  );
}
