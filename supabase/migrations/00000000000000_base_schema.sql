-- Base schema for Homev1
-- All tables that incremental migrations assume already exist.
-- Run order: this file must execute first (filename sorts before all others).

-- ============================================================
-- accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  password_hash TEXT       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- profiles  (email was initially NOT NULL; migration 20250324120000 drops that)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email             TEXT,
  name              TEXT,
  phone             TEXT,
  relationship_name TEXT,
  role              TEXT        NOT NULL DEFAULT 'person1',
  -- Added by migration 20260330000000 — included here so ADD COLUMN IF NOT EXISTS is a no-op
  avatar_url        TEXT,
  date_of_birth     TEXT,
  location          TEXT,
  -- Added by migration 20260330120000 — same reason
  password_hash     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_account_id_idx ON public.profiles (account_id);

-- ============================================================
-- sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_token_idx   ON public.sessions (token);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions (user_id);

-- ============================================================
-- conversation_memories
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversation_memories (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  TEXT        NOT NULL UNIQUE,
  user_id          UUID,
  messages         JSONB       NOT NULL DEFAULT '[]',
  user_context     JSONB       NOT NULL DEFAULT '{}',
  session_started  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_interaction TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_memories_user_id_idx ON public.conversation_memories (user_id);

-- ============================================================
-- calendar_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  expires_at    BIGINT      NOT NULL,
  scope         TEXT,
  partner_role  TEXT        NOT NULL CHECK (partner_role IN ('person1', 'person2')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- financial_link_sessions
-- provider constraint will be dropped+replaced by migration 20250301000000
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financial_link_sessions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL,
  partner_role           TEXT        NOT NULL CHECK (partner_role IN ('person1', 'person2')),
  provider               TEXT        NOT NULL,
  CONSTRAINT financial_link_sessions_provider_valid
    CHECK (provider IN ('stripe', 'plaid')),
  provider_session_token TEXT,
  requested_permissions  TEXT[]      NOT NULL DEFAULT '{}',
  state                  TEXT        NOT NULL DEFAULT 'pending',
  linked_account_count   INT         NOT NULL DEFAULT 0,
  failure_reason         TEXT,
  expires_at             TIMESTAMPTZ NOT NULL,
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financial_link_sessions_user_id_idx ON public.financial_link_sessions (user_id);

-- ============================================================
-- linked_accounts
-- provider constraint will be dropped+replaced by migration 20250301000000
-- ============================================================
CREATE TABLE IF NOT EXISTS public.linked_accounts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL,
  partner_role         TEXT        NOT NULL CHECK (partner_role IN ('person1', 'person2')),
  provider             TEXT        NOT NULL,
  CONSTRAINT linked_accounts_provider_valid
    CHECK (provider IN ('stripe', 'plaid')),
  external_account_id  TEXT        NOT NULL,
  external_item_id     TEXT,
  display_name         TEXT        NOT NULL,
  institution_name     TEXT        NOT NULL,
  last_four_digits     TEXT,
  category             TEXT        NOT NULL,
  subcategory          TEXT,
  connection_state     TEXT        NOT NULL DEFAULT 'active',
  granted_permissions  TEXT[]      NOT NULL DEFAULT '{}',
  supports_ach_payments BOOL       NOT NULL DEFAULT false,
  last_synced_at       TIMESTAMPTZ,
  disconnected_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS linked_accounts_user_id_idx ON public.linked_accounts (user_id);

-- ============================================================
-- balance_snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS public.balance_snapshots (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_account_id       UUID        NOT NULL REFERENCES public.linked_accounts(id) ON DELETE CASCADE,
  available_balance_cents INT,
  current_balance_cents   INT,
  credit_limit_cents      INT,
  currency_code           TEXT        NOT NULL DEFAULT 'USD',
  as_of_timestamp         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balance_snapshots_linked_account_idx
  ON public.balance_snapshots (linked_account_id, as_of_timestamp DESC);

-- ============================================================
-- transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_account_id       UUID        NOT NULL REFERENCES public.linked_accounts(id) ON DELETE CASCADE,
  provider                TEXT        NOT NULL,
  external_transaction_id TEXT        NOT NULL,
  amount_cents            INT         NOT NULL,
  currency_code           TEXT        NOT NULL DEFAULT 'USD',
  description             TEXT        NOT NULL,
  merchant_name           TEXT,
  category_hierarchy      TEXT[],
  is_pending              BOOL        NOT NULL DEFAULT false,
  transaction_date        DATE        NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_transaction_id)
);

CREATE INDEX IF NOT EXISTS transactions_linked_account_date_idx
  ON public.transactions (linked_account_id, transaction_date DESC);

-- ============================================================
-- provider_webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_webhooks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT        NOT NULL,
  external_event_id TEXT        NOT NULL,
  event_type        TEXT        NOT NULL,
  payload           JSONB       NOT NULL,
  processed         BOOL        NOT NULL DEFAULT false,
  processed_at      TIMESTAMPTZ,
  linked_account_id UUID        REFERENCES public.linked_accounts(id) ON DELETE SET NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- kv_store_8c22500c
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kv_store_8c22500c (
  key   TEXT  NOT NULL PRIMARY KEY,
  value JSONB NOT NULL
);
