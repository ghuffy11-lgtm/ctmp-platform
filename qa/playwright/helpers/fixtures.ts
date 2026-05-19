/**
 * Small fixed-content text buffers used as bid documents. Real procurement docs
 * would be PDFs/DOCX — the upload endpoint stores the bytes verbatim and computes
 * SHA-256 over them, so any non-empty buffer exercises the same code path.
 */

export const TECHNICAL_FIXTURE = Buffer.from(
  [
    'CTMP QA Technical Envelope',
    '',
    'This is a fixture document for end-to-end testing.',
    'Real procurement would supply a technical proposal here.',
  ].join('\n'),
  'utf-8',
);

export const COMMERCIAL_FIXTURE = Buffer.from(
  [
    'CTMP QA Commercial Envelope',
    '',
    'Pricing schedule fixture for end-to-end testing.',
    'Total bid amount: 100,000 USD (fixture-only — not parsed by server).',
  ].join('\n'),
  'utf-8',
);
