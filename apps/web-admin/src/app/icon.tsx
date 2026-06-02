// BUG-089 (2026-06-02): supplies a favicon so /favicon.ico stops 404-ing.
// Next.js 15's app/icon.tsx convention auto-generates the icon at build time
// and emits the correct <link rel="icon"> tag. Image is a simple accent-tone
// background with a white "C" — placeholder until BUG-090 System Settings
// lets the owner upload their own logo.

import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          background: '#0066cc',
          color: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          letterSpacing: '-1px',
          fontFamily: 'sans-serif',
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
