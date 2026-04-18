-- Add 'snaptrade' to allowed providers for SnapTrade brokerage connections
-- Run this migration in Supabase SQL Editor or via: supabase db push

-- Update financial_link_sessions provider constraint
ALTER TABLE financial_link_sessions
  DROP CONSTRAINT IF EXISTS financial_link_sessions_provider_valid;

ALTER TABLE financial_link_sessions
  ADD CONSTRAINT financial_link_sessions_provider_valid
  CHECK (provider IN ('stripe', 'plaid', 'mx', 'snaptrade'));

-- Update linked_accounts provider constraint
ALTER TABLE linked_accounts
  DROP CONSTRAINT IF EXISTS linked_accounts_provider_valid;

ALTER TABLE linked_accounts
  ADD CONSTRAINT linked_accounts_provider_valid
  CHECK (provider IN ('stripe', 'plaid', 'mx', 'snaptrade'));
