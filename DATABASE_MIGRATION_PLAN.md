# Database Migration Plan: KV Store → Proper Database Tables

## Current State (KV Store)
- Single table: `kv_store_8c22500c` (key-value pairs)
- No indexes
- No relationships
- Hard to query efficiently
- Limited scalability

## Recommended Migration: Proper Database Tables

### Phase 1: Create New Tables (Run alongside existing system)

```sql
-- 1. Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_email TEXT UNIQUE NOT NULL,
  secondary_email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  person1_name TEXT DEFAULT 'Partner 1',
  person2_name TEXT DEFAULT 'Partner 2',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Email lookups (for fast login)
CREATE TABLE email_lookups (
  email TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Conversation memories
CREATE TABLE conversation_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL,
  user_context JSONB NOT NULL,
  session_started TIMESTAMPTZ NOT NULL,
  last_interaction TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Calendar tokens
CREATE TABLE calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Indexes for performance
CREATE INDEX idx_email_lookups_user_id ON email_lookups(user_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_conversation_memories_user_id ON conversation_memories(user_id);
CREATE INDEX idx_conversation_memories_conversation_id ON conversation_memories(conversation_id);
CREATE INDEX idx_conversation_memories_last_interaction ON conversation_memories(last_interaction);
CREATE INDEX idx_calendar_tokens_user_id ON calendar_tokens(user_id);

-- 7. Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_tokens ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies
CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

### Phase 2: Migration Script

```typescript
// Migration script to move from KV store to database
async function migrateFromKVStore() {
  // 1. Migrate users
  const allUserKeys = await kv.getByPrefix('user:');
  for (const userData of allUserKeys) {
    // Insert into users table
    await supabase.from('users').insert({
      id: userData.userId,
      primary_email: userData.primaryEmail || userData.email,
      secondary_email: userData.secondaryEmail,
      password_hash: userData.passwordHash,
      phone: userData.phone,
      person1_name: userData.person1Name,
      person2_name: userData.person2Name,
      created_at: userData.createdAt
    });
    
    // Create email lookups
    await supabase.from('email_lookups').insert([
      {
        email: userData.primaryEmail || userData.email,
        user_id: userData.userId,
        is_primary: true
      },
      {
        email: userData.secondaryEmail,
        user_id: userData.userId,
        is_primary: false
      }
    ]);
  }
  
  // 2. Migrate sessions (active ones only)
  const allSessions = await kv.getByPrefix('session:');
  for (const session of allSessions) {
    if (new Date(session.expiresAt) > new Date()) {
      await supabase.from('sessions').insert({
        user_id: session.userId,
        token: session.token,
        expires_at: session.expiresAt,
        created_at: session.createdAt
      });
    }
  }
  
  // 3. Migrate conversation memories
  const allMemories = await kv.getByPrefix('memory:');
  for (const memory of allMemories) {
    // Extract userId from conversationId if possible
    // Or create a mapping
    await supabase.from('conversation_memories').insert({
      conversation_id: memory.conversationId,
      messages: memory.messages,
      user_context: memory.userContext,
      session_started: memory.sessionStarted,
      last_interaction: memory.lastInteraction
    });
  }
  
  // 4. Migrate calendar tokens
  const allTokens = await kv.getByPrefix('google_calendar_tokens:');
  for (const tokenData of allTokens) {
    // Extract userId from key
    await supabase.from('calendar_tokens').insert({
      user_id: tokenData.userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
      scope: tokenData.scope
    });
  }
}
```

### Phase 3: Update Code to Use New Tables

Update all KV store calls to use Supabase client:

```typescript
// Instead of: await kv.get(`user:${userId}`)
// Use: await supabase.from('users').select('*').eq('id', userId).single()

// Instead of: await kv.set(`email:${email}`, { userId })
// Use: await supabase.from('email_lookups').upsert({ email, user_id: userId })
```

### Benefits of Migration

1. **Performance**
   - Indexed queries (10-100x faster)
   - Efficient joins
   - Query optimization

2. **Scalability**
   - Handles millions of records
   - Horizontal scaling
   - Connection pooling

3. **Data Integrity**
   - Foreign key constraints
   - Data validation
   - Referential integrity

4. **Features**
   - Complex queries
   - Aggregations
   - Full-text search
   - Relationships

5. **Maintenance**
   - Easier backups
   - Better monitoring
   - Query analysis

### Migration Timeline

- **Week 1**: Create new tables, test migration script
- **Week 2**: Run migration in staging, verify data
- **Week 3**: Update code to use new tables (dual-write)
- **Week 4**: Switch reads to new tables, monitor
- **Week 5**: Remove KV store writes, cleanup

### Rollback Plan

- Keep KV store data for 30 days
- Dual-write during transition
- Can rollback by switching reads back to KV store

## Recommendation

**For now**: The optimizations I've implemented (removing redundancy, cleanup endpoints) are sufficient for small-medium scale.

**When to migrate**: 
- When you have > 10,000 users
- When queries become slow
- When you need complex reporting
- When storage costs become a concern

The current KV store approach is fine for prototyping and early growth. Migrate when you hit performance or scale limits.
