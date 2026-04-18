-- Fix calendar_tokens table to allow NULL user_id for backward compatibility
-- This allows the 'default' userId to work with the new database structure

-- Step 1: Make user_id nullable (if it's not already)
ALTER TABLE calendar_tokens 
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Add a unique constraint on user_id for non-NULL values
-- This ensures only one token per user_id (for valid UUIDs)
-- Note: PostgreSQL unique constraints allow multiple NULLs, which is fine
-- We handle NULL user_id separately in application code (only one NULL allowed)
DO $$
BEGIN
  -- Try to add unique constraint (may fail if duplicates exist)
  ALTER TABLE calendar_tokens 
    ADD CONSTRAINT calendar_tokens_user_id_unique 
    UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_table THEN
    -- Constraint already exists, that's fine
    NULL;
  WHEN others THEN
    -- If it fails due to existing duplicates, clean them up first
    -- Keep only the most recent token per user_id
    DELETE FROM calendar_tokens a
    USING calendar_tokens b
    WHERE a.user_id = b.user_id 
      AND a.user_id IS NOT NULL
      AND a.created_at < b.created_at;
    
    -- Now try again
    ALTER TABLE calendar_tokens 
      ADD CONSTRAINT calendar_tokens_user_id_unique 
      UNIQUE (user_id);
END $$;
