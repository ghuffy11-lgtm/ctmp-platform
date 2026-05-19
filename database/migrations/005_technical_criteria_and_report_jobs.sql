-- =============================================================================
-- Migration 005 — Technical evaluation criteria + report export jobs
-- =============================================================================
-- Adds two tables previously placeholdered in the API:
--   1. tender_technical_criteria — per-tender evaluation criteria + pass threshold
--   2. report_export_jobs        — async report export job persistence
-- Also adds optional name/category/read_only columns called out in Part 1 handover.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. tender_technical_criteria
-- -----------------------------------------------------------------------------
CREATE TABLE tender_technical_criteria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    max_score       NUMERIC(8, 2) NOT NULL CHECK (max_score > 0),
    weight          NUMERIC(5, 2),
    mandatory       BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tender_id, code)
);

CREATE INDEX idx_tender_technical_criteria_tender_id
    ON tender_technical_criteria(tender_id);

-- Pass threshold lives on the tender itself (total score required to PASS).
ALTER TABLE tenders
    ADD COLUMN technical_pass_threshold NUMERIC(8, 2);

COMMENT ON COLUMN tenders.technical_pass_threshold IS
    'Minimum aggregate technical score for PASS. NULL = use system default (70).';

-- -----------------------------------------------------------------------------
-- 2. report_export_jobs
-- -----------------------------------------------------------------------------
CREATE TYPE report_export_job_status AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE report_export_job_format AS ENUM ('XLSX', 'PDF');

CREATE TABLE report_export_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_code     VARCHAR(128) NOT NULL,
    report_name     VARCHAR(255),
    requested_by    UUID NOT NULL REFERENCES users(id),
    status          report_export_job_status NOT NULL DEFAULT 'QUEUED',
    format          report_export_job_format NOT NULL DEFAULT 'XLSX',
    filters         JSONB,
    enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    storage_key     TEXT,
    file_size       BIGINT,
    error_message   TEXT
);

CREATE INDEX idx_report_export_jobs_requested_by
    ON report_export_jobs(requested_by, enqueued_at DESC);

CREATE INDEX idx_report_export_jobs_status
    ON report_export_jobs(status) WHERE status IN ('QUEUED', 'RUNNING');

-- -----------------------------------------------------------------------------
-- 3. Optional column enhancements (Part 1 handover items)
-- -----------------------------------------------------------------------------

-- Permission display name (schema previously only had code).
ALTER TABLE permissions ADD COLUMN name VARCHAR(255);
UPDATE permissions SET name = code WHERE name IS NULL;
ALTER TABLE permissions ALTER COLUMN name SET NOT NULL;

-- Notification template display name (previously only code).
ALTER TABLE notification_templates ADD COLUMN name VARCHAR(255);
UPDATE notification_templates SET name = code WHERE name IS NULL;
ALTER TABLE notification_templates ALTER COLUMN name SET NOT NULL;

-- System setting category + read_only first-class columns.
ALTER TABLE system_settings ADD COLUMN category VARCHAR(64);
ALTER TABLE system_settings ADD COLUMN read_only BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE system_settings
    SET category = INITCAP(SPLIT_PART(key, '.', 1))
    WHERE category IS NULL;

COMMIT;
