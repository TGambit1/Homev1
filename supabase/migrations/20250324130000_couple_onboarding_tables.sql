-- Couple SMS "Tell us about you" onboarding (one profile row + append-only goals/recurring)

CREATE TABLE IF NOT EXISTS couple_onboarding_profile (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  relationship_stage TEXT,
  exciting_upcoming TEXT,
  onboarding_version INT NOT NULL DEFAULT 1,
  sms_onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT couple_onboarding_profile_relationship_stage_check CHECK (
    relationship_stage IS NULL
    OR relationship_stage IN (
      'dating',
      'living_together',
      'engaged',
      'married',
      'married_with_kids',
      'prefer_not_to_say',
      'unknown'
    )
  )
);

CREATE INDEX IF NOT EXISTS couple_onboarding_profile_completed_at_idx
  ON couple_onboarding_profile (sms_onboarding_completed_at);

CREATE TABLE IF NOT EXISTS couple_financial_goal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'sms_onboarding'
    CHECK (source IN ('sms_onboarding', 'sms_chat', 'web', 'manual')),
  conversation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS couple_financial_goal_entries_account_created_idx
  ON couple_financial_goal_entries (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS couple_recurring_priority_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'sms_onboarding'
    CHECK (source IN ('sms_onboarding', 'sms_chat', 'web', 'manual')),
  conversation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS couple_recurring_priority_entries_account_created_idx
  ON couple_recurring_priority_entries (account_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_couple_onboarding_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS couple_onboarding_profile_updated_at ON couple_onboarding_profile;
CREATE TRIGGER couple_onboarding_profile_updated_at
  BEFORE UPDATE ON couple_onboarding_profile
  FOR EACH ROW
  EXECUTE FUNCTION set_couple_onboarding_profile_updated_at();
