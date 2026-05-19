const MAILHOG_URL = process.env.QA_MAILHOG_URL ?? 'http://localhost:8025';

export interface MailHogMessage {
  ID: string;
  From: { Mailbox: string; Domain: string };
  To: Array<{ Mailbox: string; Domain: string }>;
  Content: {
    Headers: Record<string, string[]>;
    Body: string;
  };
  Raw: { From: string; To: string[]; Data: string };
}

/**
 * Wait until at least one message addressed to `email` appears in MailHog
 * within `timeoutMs`. Returns the most recent matching message. Throws if
 * none arrive in the timeout window.
 */
export async function waitForEmail(email: string, timeoutMs = 15_000): Promise<MailHogMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(email)}`);
    if (res.ok) {
      const data = (await res.json()) as { total: number; items: MailHogMessage[] };
      if (data.total > 0 && data.items.length > 0) {
        return data.items[0];
      }
    }
    await sleep(500);
  }
  throw new Error(`No MailHog message for ${email} within ${timeoutMs}ms`);
}

/**
 * Extract the first verification token from the message body. Tokens are
 * 32-byte hex (64 chars) per `vendor_email_verification_tokens` schema.
 */
export function extractVerificationToken(msg: MailHogMessage): string {
  const body = decodeBody(msg);
  const tokenMatch = body.match(/[a-f0-9]{64}/);
  if (!tokenMatch) {
    throw new Error('No 64-char hex token found in email body');
  }
  return tokenMatch[0];
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILHOG_URL}/api/v1/messages`, { method: 'DELETE' });
}

function decodeBody(msg: MailHogMessage): string {
  // MailHog may quoted-printable-encode. Decode the common cases.
  const raw = msg.Content.Body;
  return raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
