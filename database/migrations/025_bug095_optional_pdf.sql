-- BUG-095 (2026-06-02) — PDF justification is now optional on overrides.
--
-- Owner directive: "Please remove mandatory pdf upload, just keep it optional
-- same as in commercial also." The original Phase D constraint required BOTH
-- text + PDF when is_lowest=FALSE; the new rule is text-only is sufficient.
-- PDF stays as an attached supporting document when provided.

ALTER TABLE awards DROP CONSTRAINT IF EXISTS awards_override_requires_justification;
ALTER TABLE awards
  ADD CONSTRAINT awards_override_requires_justification CHECK (
    is_lowest = TRUE OR justification_text IS NOT NULL
  );
