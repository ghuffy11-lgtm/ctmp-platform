-- 056_normalise_tender_type.sql
--
-- `tenders.tender_type` is a free-text varchar(64). The application only ever
-- writes 'Open Tender', 'Restricted' or 'Single Source' — one shared list drives
-- both the create and edit forms — but the API's DTO advertised those three to
-- Swagger while validating only @IsString(). Anything was accepted.
--
-- Two dev rows reached the database as 'OPEN' through manual SQL rather than the
-- UI (TDR-2026-0015 in May, and TDR-2026-0028 written during the 2026-08-21
-- end-to-end test). Production has no such rows — it had zero tenders at the
-- time of writing — so this is a no-op there.
--
-- The DTO now carries @IsIn(PROCUREMENT_TYPES), which closes the door. This
-- migration cleans what already got through.
--
-- NULL is left alone: ten early tenders predate the field being required, and a
-- NULL there is honest — we do not know what they were. Publishing now demands
-- the field, so no new NULLs can reach a published tender.
--
-- Idempotent: re-running matches nothing.

UPDATE tenders SET tender_type = 'Open Tender'   WHERE tender_type = 'OPEN';
UPDATE tenders SET tender_type = 'Restricted'    WHERE tender_type = 'RESTRICTED';
UPDATE tenders SET tender_type = 'Single Source' WHERE tender_type IN ('SINGLE_SOURCE', 'SINGLE SOURCE');

COMMENT ON COLUMN tenders.tender_type IS
  'Procurement type. One of: Open Tender, Restricted, Single Source. Enforced by @IsIn in CreateTenderDto since 2026-08-21; NULL only on pre-enforcement rows. See migration 056.';
