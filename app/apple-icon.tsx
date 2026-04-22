import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0A',
          color: '#F5F1E8',
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 32,
            background: 'linear-gradient(135deg,#F05A3C,#F7931E 55%,#FFC72C)',
            color: '#0A0A0A',
            fontSize: 110,
            fontWeight: 900,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          R
        </div>
      </div>
    ),
    size,
  );
}
