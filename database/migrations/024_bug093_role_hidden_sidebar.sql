-- BUG-093 (2026-06-02) — per-role sidebar hide list.
--
-- Owner directive: "i just want to remove menues not the permission". The
-- existing sidebar gates every entry by a data permission (`tender:view`,
-- `comparison:technical:view`, etc.). Removing the perm hides the menu but
-- also breaks any other surface that uses the same endpoint — e.g. removing
-- `comparison:technical:view` from EXECUTIVE hides the Technical Comparison
-- sidebar entry AND breaks the Technical tab inside Awarded Tenders.
--
-- Fix: separate "menu visibility" from "data access". Each role gets its own
-- list of sidebar entries to hide. Sidebar filters out hidden entries for the
-- caller. Data permissions stay untouched so cross-page reuse still works.
--
-- Stored as a Postgres TEXT[] of sidebar `href` values (e.g. '/technical-
-- comparison'). NULL/empty array means "hide nothing" — current behaviour.

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS hidden_sidebar_items TEXT[] NOT NULL DEFAULT '{}';
