'use client';
/** Black on white at full contrast: it gets photographed off a projector from the back of a room. */
import { useEffect, useState } from 'react';

export function Qr({ url, size = 200 }: { url: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const QRCode = (await import('qrcode')).default;
      const data = await QRCode.toDataURL(url, { width: size * 2, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
      if (live) setSrc(data);
    })();
    return () => {
      live = false;
    };
  }, [url, size]);
  return (
    <div style={{ width: size, height: size, background: '#fff', borderRadius: 10, flex: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={`QR code for ${url}`} width={size} height={size} style={{ display: 'block', borderRadius: 10 }} /> : null}
    </div>
  );
}
