-- Partner 2 auth + invite tokens
-- - Allow partner2 to set their own password (stored on person2 profile)
-- - Allow secure invite links (token table, expiring)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Optional: ensure (account_id, role) is unique if not already enforced.
-- Many parts of the app assume exactly one profile per role.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'profiles_account_id_role_unique'
  ) THEN
    CREATE UNIQUE INDEX profiles_account_id_role_unique
      ON public.profiles (account_id, role);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.partner_invite_tokens (
  token TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'person2',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_invite_tokens_account_expires_idx
  ON public.partner_invite_tokens (account_id, expires_at DESC);

