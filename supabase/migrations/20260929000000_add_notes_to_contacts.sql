-- Migration: Add a free-form notes field to contacts
-- Created: 2026-09-29
-- Description:
--   Adds a nullable notes TEXT column to contacts, used to record
--   context such as company name, designation, and sector for a contact.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS notes TEXT;
