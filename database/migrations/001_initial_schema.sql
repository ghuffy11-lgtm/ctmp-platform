-- =====================================================================
-- CTMP 001_initial_schema.sql
-- Initial production schema for the Corporate Tender Management Platform.
--
-- Source of truth: docs/specs/implementation-spec.md (sections 3, 5-15, 18).
-- Related decisions: docs/decisions/DECISION_LOG.md
--
-- Conventions
--   * Primary keys are UUID v4 (pgcrypto.gen_random_uuid()).
--   * Money columns are NUMERIC(15,2); currency is stored separately as
--     ISO-4217 3-letter code.
--   * Timestamps are TIMESTAMPTZ; application stores UTC.
--   * Fixed business states use PostgreSQL ENUM types. New values are
--     added via subsequent migrations (ALTER TYPE ... ADD VALUE).
--   * audit_logs is append-only: UPDATE/DELETE/TRUNCATE blocked by trigger.
--   * Vendor and technical/commercial envelope separation is preserved
--     (see decision: "Commercial Opening Does Not Mean Universal
--     Visibility").
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. ENUM TYPES
-- =====================================================================

CREATE TYPE tender_status AS ENUM (
    'DRAFT',
    'INTERNAL_REVIEW',
    'APPROVED',
    'PUBLISHED',
    'CLARIFICATION_PERIOD',
    'SUBMISSION_CLOSED',
    'TECHNICAL_OPENING',
    'TECHNICAL_EVALUATION',
    'COMMERCIAL_SEALED',
    'COMMITTEE_COMMERCIAL_OPENING',
    'COMMERCIAL_EVALUATION',
    'AWARD_RECOMMENDATION',
    'AWARDED',
    'TENDER_CLOSED',
    'CANCELLED',
    'SUSPENDED',
    'ARCHIVED'
);

CREATE TYPE tender_visibility AS ENUM ('PUBLIC', 'INVITATION_ONLY');

CREATE TYPE envelope_type AS ENUM ('TECHNICAL', 'COMMERCIAL');

CREATE TYPE envelope_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'SEALED',
    'OPENED',
    'LOCKED'
);

CREATE TYPE bid_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'LATE_SUBMITTED',
    'LATE_ACCEPTED',
    'WITHDRAWN',
    'DISQUALIFIED',
    'EVALUATED',
    'AWARDED',
    'NOT_AWARDED'
);

CREATE TYPE technical_result AS ENUM ('PENDING', 'PASS', 'FAIL');

CREATE TYPE user_auth_type AS ENUM ('AD', 'LOCAL');

CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

CREATE TYPE vendor_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
    'BLACKLISTED'
);

CREATE TYPE vendor_registration_status AS ENUM (
    'PENDING_VERIFICATION',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED'
);

CREATE TYPE late_exception_status AS ENUM (
    'PENDING_APPROVAL',
    'GRANTED',
    'REJECTED',
    'EXPIRED',
    'USED'
);

CREATE TYPE workflow_subject_type AS ENUM (
    'TENDER_CREATION',
    'TENDER_PUBLISH',
    'TENDER_CANCEL',
    'LATE_SUBMISSION_EXCEPTION',
    'TECHNICAL_FINALIZE',
    'AWARD_RECOMMENDATION',
    'AWARD_FINALIZE'
);

CREATE TYPE workflow_step_type AS ENUM ('SEQUENTIAL', 'PARALLEL');

CREATE TYPE workflow_instance_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);

CREATE TYPE workflow_task_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'SKIPPED',
    'EXPIRED'
);

CREATE TYPE committee_session_status AS ENUM (
    'SCHEDULED',
    'IN_SESSION',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE audit_risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE notification_status AS ENUM (
    'QUEUED',
    'SENT',
    'FAILED',
    'BOUNCED'
);

CREATE TYPE captcha_result AS ENUM ('SUCCESS', 'FAILURE');

CREATE TYPE clarification_status AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- =====================================================================
-- 2. SHARED FUNCTIONS
-- =====================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_logs_block_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'audit_logs is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 3. ORGANIZATION
-- =====================================================================

CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(64)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    parent_id       UUID REFERENCES departments(id) ON DELETE SET NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_username     VARCHAR(255) UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    display_name    VARCHAR(255) NOT NULL,
    auth_type       user_auth_type NOT NULL DEFAULT 'AD',
    password_hash   TEXT,
    mfa_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
    status          user_status  NOT NULL DEFAULT 'ACTIVE',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT users_ad_or_local_credentials CHECK (
        (auth_type = 'AD'    AND ad_username IS NOT NULL)
     OR (auth_type = 'LOCAL' AND password_hash IS NOT NULL)
    )
);

CREATE TABLE user_departments (
    user_id         UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
    department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, department_id)
);

CREATE UNIQUE INDEX user_departments_one_primary_per_user
    ON user_departments (user_id)
    WHERE is_primary = TRUE;

-- =====================================================================
-- 4. RBAC
-- =====================================================================

CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(64)  NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    is_system       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(128) NOT NULL UNIQUE,
    category        VARCHAR(64)  NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id         UUID NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by      UUID REFERENCES users(id),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- =====================================================================
-- 5. CAPTCHA LOGS (independent of vendor; referenced by registration)
-- =====================================================================

CREATE TABLE captcha_verification_logs (
    id              BIGSERIAL PRIMARY KEY,
    target_action   VARCHAR(64) NOT NULL,
    provider        VARCHAR(64),
    ip_address      INET,
    user_agent      TEXT,
    result          captcha_result NOT NULL,
    score           NUMERIC(4,3),
    error_code      VARCHAR(128),
    verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX captcha_logs_ip_idx        ON captcha_verification_logs (ip_address, verified_at DESC);
CREATE INDEX captcha_logs_action_idx    ON captcha_verification_logs (target_action, verified_at DESC);

-- =====================================================================
-- 6. VENDORS
-- =====================================================================

CREATE TABLE vendors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name        VARCHAR(255) NOT NULL,
    registration_number VARCHAR(128),
    tax_number          VARCHAR(128),
    country             CHAR(2),
    address             TEXT,
    phone               VARCHAR(64),
    website             VARCHAR(255),
    status              vendor_status NOT NULL DEFAULT 'PENDING',
    blacklist_reason    TEXT,
    suspension_reason   TEXT,
    approved_by         UUID REFERENCES users(id),
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_name, registration_number)
);

CREATE TABLE vendor_users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    full_name           VARCHAR(255) NOT NULL,
    phone               VARCHAR(64),
    is_primary_contact  BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    status              user_status NOT NULL DEFAULT 'ACTIVE',
    email_verified_at   TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    failed_login_count  INT NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX vendor_users_one_primary_per_vendor
    ON vendor_users (vendor_id)
    WHERE is_primary_contact = TRUE;

CREATE TABLE vendor_registration_requests (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id                   UUID REFERENCES vendors(id) ON DELETE SET NULL,
    company_name                VARCHAR(255) NOT NULL,
    registration_number         VARCHAR(128),
    contact_email               VARCHAR(255) NOT NULL,
    contact_name                VARCHAR(255),
    captcha_verification_id     BIGINT REFERENCES captcha_verification_logs(id),
    submitted_ip                INET,
    submitted_user_agent        TEXT,
    status                      vendor_registration_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
    rejection_reason            TEXT,
    reviewed_by                 UUID REFERENCES users(id),
    reviewed_at                 TIMESTAMPTZ,
    submitted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendor_email_verification_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_user_id  UUID NOT NULL REFERENCES vendor_users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendor_password_reset_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_user_id  UUID NOT NULL REFERENCES vendor_users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    request_ip      INET,
    request_user_agent TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendor_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    document_type       VARCHAR(64) NOT NULL,
    original_filename   VARCHAR(255) NOT NULL,
    storage_key         TEXT NOT NULL,
    mime_type           VARCHAR(128) NOT NULL,
    file_size           BIGINT NOT NULL CHECK (file_size >= 0),
    checksum_sha256     CHAR(64) NOT NULL,
    expiry_date         DATE,
    uploaded_by_vendor_user_id UUID REFERENCES vendor_users(id),
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendor_status_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    old_status      vendor_status,
    new_status      vendor_status NOT NULL,
    reason          TEXT,
    changed_by      UUID REFERENCES users(id),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 7. TENDERS
-- =====================================================================

CREATE TABLE tenders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               VARCHAR(64) NOT NULL UNIQUE,
    title                   VARCHAR(255) NOT NULL,
    summary                 TEXT,
    description             TEXT,
    department_id           UUID NOT NULL REFERENCES departments(id),
    category                VARCHAR(128),
    tender_type             VARCHAR(64),
    budget_estimate         NUMERIC(15,2),
    currency                CHAR(3),
    visibility              tender_visibility NOT NULL DEFAULT 'PUBLIC',
    status                  tender_status NOT NULL DEFAULT 'DRAFT',
    submission_open_at      TIMESTAMPTZ,
    submission_close_at     TIMESTAMPTZ,
    clarification_close_at  TIMESTAMPTZ,
    technical_opening_at    TIMESTAMPTZ,
    awarded_at              TIMESTAMPTZ,
    awarded_vendor_id       UUID REFERENCES vendors(id),
    awarded_amount          NUMERIC(15,2),
    current_version         INT  NOT NULL DEFAULT 1,
    created_by              UUID NOT NULL REFERENCES users(id),
    owning_user_id          UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tenders_close_after_open CHECK (
        submission_open_at IS NULL
     OR submission_close_at IS NULL
     OR submission_close_at >= submission_open_at
    )
);

CREATE TABLE tender_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    version_number  INT  NOT NULL,
    snapshot        JSONB NOT NULL,
    change_summary  TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tender_id, version_number)
);

CREATE TABLE tender_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id           UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    original_filename   VARCHAR(255) NOT NULL,
    storage_key         TEXT NOT NULL,
    mime_type           VARCHAR(128) NOT NULL,
    file_size           BIGINT NOT NULL CHECK (file_size >= 0),
    checksum_sha256     CHAR(64) NOT NULL,
    is_public           BOOLEAN NOT NULL DEFAULT TRUE,
    uploaded_by         UUID NOT NULL REFERENCES users(id),
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tender_vendors (
    tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    invited_by      UUID REFERENCES users(id),
    invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tender_id, vendor_id)
);

CREATE TABLE tender_clarifications (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id                   UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    vendor_id                   UUID REFERENCES vendors(id) ON DELETE SET NULL,
    asked_by_user_id            UUID REFERENCES users(id),
    asked_by_vendor_user_id     UUID REFERENCES vendor_users(id),
    question                    TEXT NOT NULL,
    is_public                   BOOLEAN NOT NULL DEFAULT FALSE,
    status                      clarification_status NOT NULL DEFAULT 'OPEN',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT clarification_asker_present CHECK (
        asked_by_user_id IS NOT NULL OR asked_by_vendor_user_id IS NOT NULL
    )
);

CREATE TABLE tender_clarification_replies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clarification_id    UUID NOT NULL REFERENCES tender_clarifications(id) ON DELETE CASCADE,
    replied_by_user_id  UUID NOT NULL REFERENCES users(id),
    answer              TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 8. WORKFLOW
-- =====================================================================

CREATE TABLE workflow_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    subject_type    workflow_subject_type NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_steps (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id                 UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    sequence                    INT NOT NULL,
    step_type                   workflow_step_type NOT NULL DEFAULT 'SEQUENTIAL',
    required_role_id            UUID REFERENCES roles(id),
    required_permission_code    VARCHAR(128),
    min_approvers               INT NOT NULL DEFAULT 1 CHECK (min_approvers > 0),
    requires_rejection_comment  BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (template_id, sequence)
);

CREATE TABLE workflow_instances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES workflow_templates(id),
    subject_type    workflow_subject_type NOT NULL,
    subject_id      UUID NOT NULL,
    status          workflow_instance_status NOT NULL DEFAULT 'PENDING',
    current_step    INT NOT NULL DEFAULT 1,
    initiated_by    UUID NOT NULL REFERENCES users(id),
    initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX workflow_instances_subject_idx
    ON workflow_instances (subject_type, subject_id);

CREATE TABLE workflow_tasks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id         UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    step_id             UUID NOT NULL REFERENCES workflow_steps(id),
    assignee_user_id    UUID REFERENCES users(id),
    assignee_role_id    UUID REFERENCES roles(id),
    status              workflow_task_status NOT NULL DEFAULT 'PENDING',
    comments            TEXT,
    completed_by        UUID REFERENCES users(id),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE approval_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES workflow_tasks(id) ON DELETE CASCADE,
    actor_user_id   UUID NOT NULL REFERENCES users(id),
    action          VARCHAR(32) NOT NULL,
    comments        TEXT,
    action_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 9. LATE SUBMISSION EXCEPTIONS
-- =====================================================================

CREATE TABLE late_submission_exceptions (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id                       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    vendor_id                       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    granted_by                      UUID REFERENCES users(id),
    granted_at                      TIMESTAMPTZ,
    reason                          TEXT NOT NULL,
    expires_at                      TIMESTAMPTZ NOT NULL,
    status                          late_exception_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    approval_workflow_instance_id   UUID REFERENCES workflow_instances(id),
    audit_log_id                    BIGINT,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT late_exception_expiry_after_grant CHECK (
        granted_at IS NULL OR expires_at > granted_at
    )
);

CREATE UNIQUE INDEX late_exception_one_active_per_vendor_tender
    ON late_submission_exceptions (tender_id, vendor_id)
    WHERE status IN ('PENDING_APPROVAL', 'GRANTED');

-- =====================================================================
-- 10. COMMITTEE SESSIONS
-- =====================================================================

CREATE TABLE committee_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    location        VARCHAR(255),
    status          committee_session_status NOT NULL DEFAULT 'SCHEDULED',
    opened_by       UUID REFERENCES users(id),
    opened_at       TIMESTAMPTZ,
    minutes_text    TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE committee_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES committee_sessions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    role_in_committee VARCHAR(64),
    is_chair        BOOLEAN NOT NULL DEFAULT FALSE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, user_id)
);

CREATE UNIQUE INDEX committee_one_chair_per_session
    ON committee_members (session_id)
    WHERE is_chair = TRUE;

CREATE TABLE committee_attendance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES committee_sessions(id) ON DELETE CASCADE,
    member_id       UUID NOT NULL REFERENCES committee_members(id) ON DELETE CASCADE,
    present         BOOLEAN NOT NULL,
    remarks         TEXT,
    recorded_by     UUID NOT NULL REFERENCES users(id),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, member_id)
);

-- =====================================================================
-- 11. BIDS AND ENVELOPES
-- =====================================================================

CREATE TABLE bids (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id                   UUID NOT NULL REFERENCES tenders(id),
    vendor_id                   UUID NOT NULL REFERENCES vendors(id),
    status                      bid_status NOT NULL DEFAULT 'DRAFT',
    submitted_at                TIMESTAMPTZ,
    submitted_by_vendor_user_id UUID REFERENCES vendor_users(id),
    withdrawn_at                TIMESTAMPTZ,
    technical_result            technical_result NOT NULL DEFAULT 'PENDING',
    late_exception_id           UUID REFERENCES late_submission_exceptions(id),
    is_alternative              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tender_id, vendor_id, is_alternative)
);

CREATE TABLE bid_envelopes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id                  UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    envelope_type           envelope_type NOT NULL,
    status                  envelope_status NOT NULL DEFAULT 'DRAFT',
    submitted_at            TIMESTAMPTZ,
    opened_at               TIMESTAMPTZ,
    opened_by_user_id       UUID REFERENCES users(id),
    committee_session_id    UUID REFERENCES committee_sessions(id),
    hash_verified_at        TIMESTAMPTZ,
    locked_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bid_id, envelope_type),
    CONSTRAINT commercial_open_requires_session CHECK (
        envelope_type <> 'COMMERCIAL'
     OR status <> 'OPENED'
     OR committee_session_id IS NOT NULL
    )
);

CREATE TABLE bid_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_envelope_id     UUID NOT NULL REFERENCES bid_envelopes(id) ON DELETE CASCADE,
    original_filename   VARCHAR(255) NOT NULL,
    storage_key         TEXT NOT NULL,
    mime_type           VARCHAR(128) NOT NULL,
    file_size           BIGINT NOT NULL CHECK (file_size >= 0),
    checksum_sha256     CHAR(64) NOT NULL,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at        TIMESTAMPTZ,
    locked_at           TIMESTAMPTZ
);

CREATE TABLE bid_submission_receipts (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id                          UUID NOT NULL UNIQUE REFERENCES bids(id) ON DELETE CASCADE,
    receipt_number                  VARCHAR(64) NOT NULL UNIQUE,
    generated_for_vendor_user_id    UUID REFERENCES vendor_users(id),
    receipt_hash                    CHAR(64) NOT NULL,
    snapshot                        JSONB NOT NULL,
    generated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 12. COMMITTEE OPENING RECORDS
-- =====================================================================

CREATE TABLE committee_opening_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id              UUID NOT NULL REFERENCES committee_sessions(id) ON DELETE CASCADE,
    bid_envelope_id         UUID NOT NULL REFERENCES bid_envelopes(id),
    checksum_verified       BOOLEAN NOT NULL,
    checksum_verified_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opening_remarks         TEXT,
    recorded_by             UUID NOT NULL REFERENCES users(id),
    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, bid_envelope_id)
);

-- =====================================================================
-- 13. EVALUATIONS
-- =====================================================================

CREATE TABLE technical_evaluations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id              UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    evaluator_user_id   UUID NOT NULL REFERENCES users(id),
    overall_score       NUMERIC(6,2),
    result              technical_result NOT NULL DEFAULT 'PENDING',
    comments            TEXT,
    finalized_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bid_id, evaluator_user_id)
);

CREATE TABLE technical_evaluation_scores (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    technical_evaluation_id     UUID NOT NULL REFERENCES technical_evaluations(id) ON DELETE CASCADE,
    criterion                   VARCHAR(255) NOT NULL,
    weight                      NUMERIC(6,2) NOT NULL,
    score                       NUMERIC(6,2) NOT NULL,
    comments                    TEXT
);

CREATE TABLE commercial_evaluations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bid_id              UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    evaluator_user_id   UUID NOT NULL REFERENCES users(id),
    total_price         NUMERIC(15,2),
    currency            CHAR(3),
    score               NUMERIC(6,2),
    comments            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bid_id, evaluator_user_id)
);

CREATE TABLE commercial_comparisons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    snapshot        JSONB NOT NULL,
    generated_by    UUID NOT NULL REFERENCES users(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 14. FILE INTEGRITY CHECKS
-- =====================================================================

CREATE TABLE file_integrity_checks (
    id                  BIGSERIAL PRIMARY KEY,
    bid_document_id     UUID REFERENCES bid_documents(id) ON DELETE CASCADE,
    expected_checksum   CHAR(64) NOT NULL,
    actual_checksum     CHAR(64) NOT NULL,
    success             BOOLEAN NOT NULL,
    verified_by_user_id UUID REFERENCES users(id),
    context             VARCHAR(64),
    notes               TEXT,
    verified_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 15. AUDIT LOG (APPEND-ONLY) AND SECURITY ALERTS
-- =====================================================================

CREATE TABLE audit_logs (
    id                          BIGSERIAL PRIMARY KEY,
    event_type                  VARCHAR(128) NOT NULL,
    actor_user_id               UUID REFERENCES users(id),
    actor_vendor_user_id        UUID REFERENCES vendor_users(id),
    actor_role_code             VARCHAR(64),
    entity_type                 VARCHAR(64) NOT NULL,
    entity_id                   UUID,
    tender_id                   UUID REFERENCES tenders(id),
    vendor_id                   UUID REFERENCES vendors(id),
    bid_id                      UUID REFERENCES bids(id),
    ip_address                  INET,
    user_agent                  TEXT,
    before_value                JSONB,
    after_value                 JSONB,
    reason                      TEXT,
    metadata                    JSONB,
    risk_level                  audit_risk_level NOT NULL DEFAULT 'LOW',
    prev_hash_chain_value       CHAR(64),
    hash_chain_value            CHAR(64) NOT NULL,
    event_time                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_block_modifications();

CREATE TRIGGER audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION audit_logs_block_modifications();

CREATE TRIGGER audit_logs_no_truncate
    BEFORE TRUNCATE ON audit_logs
    EXECUTE FUNCTION audit_logs_block_modifications();

CREATE TABLE security_alerts (
    id                      BIGSERIAL PRIMARY KEY,
    alert_type              VARCHAR(64) NOT NULL,
    severity                audit_risk_level NOT NULL DEFAULT 'MEDIUM',
    source_ip               INET,
    target_entity_type      VARCHAR(64),
    target_entity_id        UUID,
    message                 TEXT NOT NULL,
    metadata                JSONB,
    acknowledged_by         UUID REFERENCES users(id),
    acknowledged_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 16. NOTIFICATIONS
-- =====================================================================

CREATE TABLE notification_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(64) NOT NULL UNIQUE,
    subject_template    TEXT NOT NULL,
    body_template       TEXT NOT NULL,
    channel             VARCHAR(32) NOT NULL DEFAULT 'EMAIL',
    locale              VARCHAR(8)  NOT NULL DEFAULT 'en',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_logs (
    id                          BIGSERIAL PRIMARY KEY,
    template_code               VARCHAR(64) NOT NULL,
    subject                     TEXT NOT NULL,
    recipient_email             VARCHAR(255) NOT NULL,
    recipient_user_id           UUID REFERENCES users(id),
    recipient_vendor_user_id    UUID REFERENCES vendor_users(id),
    tender_id                   UUID REFERENCES tenders(id),
    status                      notification_status NOT NULL DEFAULT 'QUEUED',
    error                       TEXT,
    sent_at                     TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 17. SYSTEM SETTINGS
-- =====================================================================

CREATE TABLE system_settings (
    key             VARCHAR(128) PRIMARY KEY,
    value           TEXT,
    value_type      VARCHAR(32) NOT NULL DEFAULT 'string',
    description     TEXT,
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 18. INDEXES
-- =====================================================================

-- Tenders
CREATE INDEX tenders_status_idx              ON tenders (status);
CREATE INDEX tenders_department_idx          ON tenders (department_id);
CREATE INDEX tenders_submission_close_idx    ON tenders (submission_close_at);

-- Bids
CREATE INDEX bids_tender_idx                 ON bids (tender_id);
CREATE INDEX bids_vendor_idx                 ON bids (vendor_id);
CREATE INDEX bids_status_idx                 ON bids (status);
CREATE INDEX bids_late_exception_idx         ON bids (late_exception_id)
    WHERE late_exception_id IS NOT NULL;

-- Envelopes / documents
CREATE INDEX bid_envelopes_bid_idx           ON bid_envelopes (bid_id);
CREATE INDEX bid_envelopes_status_idx        ON bid_envelopes (envelope_type, status);
CREATE INDEX bid_documents_envelope_idx      ON bid_documents (bid_envelope_id);

-- Vendors
CREATE INDEX vendors_status_idx              ON vendors (status);
CREATE INDEX vendor_users_vendor_idx         ON vendor_users (vendor_id);
CREATE INDEX vendor_documents_vendor_idx     ON vendor_documents (vendor_id);
CREATE INDEX vendor_status_history_vendor_idx ON vendor_status_history (vendor_id, changed_at DESC);

-- Clarifications
CREATE INDEX clarifications_tender_idx       ON tender_clarifications (tender_id);
CREATE INDEX clarifications_vendor_idx       ON tender_clarifications (vendor_id);

-- Workflow
CREATE INDEX workflow_tasks_instance_idx     ON workflow_tasks (instance_id);
CREATE INDEX workflow_tasks_assignee_idx     ON workflow_tasks (assignee_user_id)
    WHERE assignee_user_id IS NOT NULL;

-- Committee
CREATE INDEX committee_sessions_tender_idx   ON committee_sessions (tender_id);
CREATE INDEX committee_opening_session_idx   ON committee_opening_records (session_id);

-- Late exceptions
CREATE INDEX late_exception_tender_idx       ON late_submission_exceptions (tender_id);
CREATE INDEX late_exception_vendor_idx       ON late_submission_exceptions (vendor_id);
CREATE INDEX late_exception_status_idx       ON late_submission_exceptions (status);

-- Evaluations
CREATE INDEX technical_eval_bid_idx          ON technical_evaluations (bid_id);
CREATE INDEX commercial_eval_bid_idx         ON commercial_evaluations (bid_id);

-- Audit
CREATE INDEX audit_logs_event_time_idx       ON audit_logs (event_time DESC);
CREATE INDEX audit_logs_actor_user_idx       ON audit_logs (actor_user_id)
    WHERE actor_user_id IS NOT NULL;
CREATE INDEX audit_logs_tender_idx           ON audit_logs (tender_id)
    WHERE tender_id IS NOT NULL;
CREATE INDEX audit_logs_vendor_idx           ON audit_logs (vendor_id)
    WHERE vendor_id IS NOT NULL;
CREATE INDEX audit_logs_event_type_idx       ON audit_logs (event_type);

-- File integrity
CREATE INDEX file_integrity_doc_idx          ON file_integrity_checks (bid_document_id);

-- Notifications
CREATE INDEX notification_logs_recipient_idx ON notification_logs (recipient_email);
CREATE INDEX notification_logs_status_idx    ON notification_logs (status);

-- =====================================================================
-- 19. UPDATED_AT TRIGGERS
-- =====================================================================

CREATE TRIGGER departments_set_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER vendors_set_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER vendor_users_set_updated_at
    BEFORE UPDATE ON vendor_users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tenders_set_updated_at
    BEFORE UPDATE ON tenders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER workflow_templates_set_updated_at
    BEFORE UPDATE ON workflow_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER late_exception_set_updated_at
    BEFORE UPDATE ON late_submission_exceptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER committee_sessions_set_updated_at
    BEFORE UPDATE ON committee_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bids_set_updated_at
    BEFORE UPDATE ON bids
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bid_envelopes_set_updated_at
    BEFORE UPDATE ON bid_envelopes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER technical_evaluations_set_updated_at
    BEFORE UPDATE ON technical_evaluations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER commercial_evaluations_set_updated_at
    BEFORE UPDATE ON commercial_evaluations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER notification_templates_set_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 20. TABLE COMMENTS (encode non-obvious business rules)
-- =====================================================================

COMMENT ON TABLE audit_logs IS
    'Append-only audit trail. UPDATE/DELETE/TRUNCATE blocked by trigger. '
    'hash_chain_value is computed application-side as SHA-256 over the '
    'previous row''s hash plus a canonical projection of this row.';

COMMENT ON TABLE bid_envelopes IS
    'Technical and commercial envelopes are separate rows. Commercial '
    'envelope opening requires a committee_session_id (enforced by '
    'check constraint commercial_open_requires_session).';

COMMENT ON COLUMN bid_envelopes.status IS
    'DRAFT before submit; SUBMITTED at submit; SEALED for commercial '
    'before committee opening; OPENED after authorised opening; LOCKED '
    'after evaluation finalised.';

COMMENT ON TABLE late_submission_exceptions IS
    'Vendor-specific and tender-specific. Unique partial index limits '
    'one active (PENDING_APPROVAL or GRANTED) exception per vendor per '
    'tender. audit_log_id is intentionally NOT a strict FK so audit '
    'logs cannot be cascade-deleted by exception cleanup.';

COMMENT ON TABLE bid_documents IS
    'Every submitted document carries a SHA-256 checksum. locked_at '
    'is set when the bid is submitted; immutable thereafter.';

COMMENT ON COLUMN bids.is_alternative IS
    'FALSE for the primary bid; TRUE for alternative bids when '
    'explicitly enabled per tender. UNIQUE (tender_id, vendor_id, '
    'is_alternative) so a vendor can have at most one primary and one '
    'alternative per tender.';

COMMIT;
