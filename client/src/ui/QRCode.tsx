import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** Renders a QR code as a single crisp SVG path. */
export function QRCode({ value, className = '' }: { value: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const margin = 2;
    let d = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
      }
    }
    return { path: d, size: count + margin * 2 };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for the sharing link"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#172033" />
    </svg>
  );
}
