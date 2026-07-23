import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Rhyze Fitness, In Rhythm, We Rise';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '80px',
          background:
            'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 40%, rgba(240,90,60,0.25) 100%)',
          color: '#F5F1E8',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: '#F05A3C',
            marginBottom: 24,
          }}
        >
          Rhyze Fitness · Lafayette, NJ
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 140,
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: '0.02em',
          }}
        >
          <span>IN RHYTHM,</span>
          <span
            style={{
              background: 'linear-gradient(90deg,#F05A3C,#F7931E,#FFC72C)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            WE RISE
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 40,
            padding: '16px 28px',
            borderRadius: 9999,
            background: 'linear-gradient(90deg,#F05A3C,#F7931E,#FFC72C)',
            color: '#0A0A0A',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          Start your $7 trial →
        </div>
      </div>
    ),
    size,
  );
}
