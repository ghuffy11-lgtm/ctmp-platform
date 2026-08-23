-- 057 (2026-08-24): invite a prospective supplier to join the vendor registry.
--
-- Until now the only route onto the platform was unsolicited self-registration:
-- a company had to find the vendor portal by itself. Procurement had no way to
-- reach out to a supplier they already knew. tender_vendors cannot express this
-- -- its vendor_id is NOT NULL REFERENCES vendors(id) -- so an invitee with no
-- vendor record has nowhere to live. Hence a table of its own.
--
-- This is a REGISTRY invitation, deliberately not tied to any tender. It carries
-- no tender reference and the email template has no tender variable, so it
-- cannot leak one.
--
-- An invitation is a convenience, never a bypass: hCaptcha, email verification
-- and admin approval all still apply to an invited registrant.
--
-- Idempotent; safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Status enum.
--
-- There is deliberately no EXPIRED value. Expiry is DERIVED
-- (status = 'PENDING' AND expires_at < now()), the same way
-- vendor_email_verification_tokens does it. A stored EXPIRED would need a
-- sweeper -- and this platform has no scheduler -- so it would drift out of
-- sync with the clock and lie.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vendor_invitation_status') THEN
    CREATE TYPE vendor_invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_invitations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Stored trimmed + lowercased. CITEXT is NOT used: it is not enabled on this
    -- database (only pgcrypto is, 001_initial_schema.sql:23) and every other
    -- email column here is plain VARCHAR(255). The CHECK below enforces the
    -- normalisation the service performs.
    email                   VARCHAR(255) NOT NULL,

    -- Greeting label only ("Dear ACME Trading Team"). Creates no vendor record
    -- and is never matched against vendors.company_name.
    company_name            VARCHAR(255) NOT NULL,

    -- SHA-256 hex of the raw token. The raw token exists only in the email --
    -- same discipline as vendor_email_verification_tokens.
    token_hash              CHAR(64) NOT NULL,

    status                  vendor_invitation_status NOT NULL DEFAULT 'PENDING',
    expires_at              TIMESTAMPTZ NOT NULL,

    invited_by              UUID NOT NULL REFERENCES users(id),
    invited_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    send_count              INTEGER NOT NULL DEFAULT 1 CHECK (send_count > 0),

    -- Conversion. ON DELETE SET NULL rather than CASCADE: purging a vendor must
    -- never destroy the record that they were invited.
    accepted_at             TIMESTAMPTZ,
    accepted_vendor_id      UUID REFERENCES vendors(id)      ON DELETE SET NULL,
    accepted_vendor_user_id UUID REFERENCES vendor_users(id) ON DELETE SET NULL,

    revoked_at              TIMESTAMPTZ,
    revoked_by              UUID REFERENCES users(id),
    revoke_reason           TEXT,

    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT vendor_invitations_email_lowercase
        CHECK (email = lower(email)),
    CONSTRAINT vendor_invitations_accepted_coherent
        CHECK ((status = 'ACCEPTED') = (accepted_at IS NOT NULL)),
    CONSTRAINT vendor_invitations_revoked_coherent
        CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_invitations_token_hash
    ON vendor_invitations (token_hash);

-- At most ONE live invitation per address. The duplicate rule lives in the DB,
-- not only in the service, so a race cannot produce two live links to one inbox.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_invitations_pending_email
    ON vendor_invitations (email) WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_vendor_invitations_status_expiry
    ON vendor_invitations (status, expires_at);

-- Serves the per-sender 24h cap query.
CREATE INDEX IF NOT EXISTS idx_vendor_invitations_sender_recent
    ON vendor_invitations (invited_by, invited_at DESC);

COMMENT ON TABLE vendor_invitations IS
  'Registry invitations to prospective suppliers who have no vendor record yet. Not tender-scoped. Retention: revoked and long-expired rows are purged by scripts/purge_vendor_invitations.sh; ACCEPTED rows are kept as business records. See migration 057.';

-- ---------------------------------------------------------------------------
-- Permission. A new code is required rather than reusing tender:edit, because
-- SYSTEM_ADMIN does not hold tender:edit and the owner wants it able to invite.
-- ---------------------------------------------------------------------------
INSERT INTO permissions (code, name, category, description)
VALUES ('vendor:invite', 'Invite Supplier', 'vendor',
        'Invite a prospective supplier to register on the vendor portal.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'vendor:invite'
WHERE r.code IN ('SYSTEM_ADMIN', 'PROCUREMENT_ADMIN', 'PROCUREMENT_OFFICER')
ON CONFLICT DO NOTHING;



-- ---------------------------------------------------------------------------
-- Email template.
--
-- INNER HTML ONLY -- brandShell() in notifications.service.ts supplies <html>,
-- the header bar, the CID logo, the accent strip, the footer and the
-- "do not reply" line. Dollar-quoting so the markup needs no escaping.
--
-- Copy deliberately echoes the public landing page
-- (apps/web-vendor/src/components/landing/content.ts) -- "free to register",
-- sealed bids, timestamped receipt, and the real document list -- so a
-- recipient who clicks through hears the same voice on arrival.
--
-- NO TENDER VARIABLE EXISTS HERE. This is a registry invitation; it cannot
-- mention a tender even by mistake.
--
-- companyName and email are HTML-escaped by renderHtml(), so a company name
-- containing < or & is safe.
-- ---------------------------------------------------------------------------
INSERT INTO notification_templates (code, name, subject_template, body_template, channel, locale, is_active)
VALUES (
  'VENDOR_REGISTRY_INVITATION',
  'Vendor registry invitation - prospective supplier',
  $t$[{{systemName}}] Invitation to register as a supplier$t$,
  $b$<p style="margin:0 0 14px;">Dear {{companyName}} Team,</p>
<p style="margin:0 0 14px;">{{inviterName}} has invited you to register as a supplier on {{systemName}}, the portal our procurement department uses to publish tenders and receive bids.</p>
<p style="margin:0 0 6px;font-weight:600;">Why register</p>
<ul style="margin:0 0 14px;padding-left:20px;">
  <li>See every open tender as soon as it is published.</li>
  <li>Submit sealed technical and commercial bids online, with a timestamped receipt.</li>
  <li>Free &mdash; no charge to register, to browse, or to bid.</li>
</ul>
<p style="margin:0 0 18px;"><a href="{{registerUrl}}" style="display:inline-block;padding:11px 22px;background:#1d6fa5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Register your company</a></p>
<p style="margin:0 0 6px;font-weight:600;">What you&rsquo;ll need</p>
<ul style="margin:0 0 14px;padding-left:20px;">
  <li>Your commercial licence as a PDF, up to 10 MB.</li>
  <li>Company contact details, and the email address you want to sign in with.</li>
</ul>
<div style="margin:0 0 16px;padding:12px 14px;background:#eef6fb;border-left:4px solid #1d6fa5;border-radius:4px;">Our procurement team reviews every registration before it is activated, and we will email you once yours is approved. There is no cost to register, and registering does not commit you to bid.</div>
<p style="margin:0 0 6px;color:#6b7280;font-size:13px;">This invitation was sent to {{recipientEmail}} and is valid until {{expiresOn}}. If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 18px;word-break:break-all;font-size:13px;"><a href="{{registerUrl}}" style="color:#1d6fa5;">{{registerUrl}}</a></p>
<p style="margin:0;">Kind regards,<br><strong>Procurement Team</strong></p>$b$,
  'EMAIL', 'en', TRUE
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
