# Homebase AI Agent — Memory System

## Overview

Homebase AI is a conversational agent powered by **Grok API** (xAI). Memory is stored in two layers:

| Layer | Table / Key | Purpose |
|-------|-------------|---------|
| **Persistent** | `conversation_memories` (Supabase SQL) | Full conversation history + user context |
| **Ephemeral state** | `kv_store_8c22500c` (Supabase KV) | Lightweight session flags |

All AI logic lives in `supabase/functions/server/grok-ai.tsx`. Database operations go through `supabase/functions/server/db.tsx`. The KV interface is in `supabase/functions/server/kv_store.tsx`.

---

## Conversation IDs

Every conversation is keyed by a unique `conversationId`:

| Channel | Pattern | Example |
|---------|---------|---------|
| Web | `web:{sessionId}` | `web:abc123-def456` |
| SMS | `sms:{phoneNumber}` | `sms:+16283028027` |

The same ID is used for both the `conversation_memories` row and the KV state entry.

---

## Persistent Memory — `conversation_memories`

### Schema

```typescript
interface ConversationMemory {        // db.tsx
  id: string;
  conversation_id: string;           // unique key
  user_id: string | null;            // optional link to accounts table
  messages: Message[];               // full bounded history
  user_context: UserContext;         // names, prefs, discussed topics
  session_started: string;           // ISO timestamp
  last_interaction: string;          // ISO timestamp (used for cleanup)
  created_at: string;
  updated_at: string;
}
```

### UserContext object

```typescript
{
  person1Name: string;               // defaults to 'Partner 1'
  person2Name: string;               // defaults to 'Partner 2'
  onboardingComplete: boolean;
  financialDataDiscussed: string[];  // e.g. ['market-data', 'financial-accounts']
  preferences: Record<string, any>;
}
```

### Message object

```typescript
{ role: 'system' | 'user' | 'assistant', content: string }
```

### DB functions (db.tsx)

| Function | Purpose |
|----------|---------|
| `getConversationMemory(conversationId)` | Load full memory; returns `null` if new |
| `saveConversationMemory(memory)` | Upsert on `conversation_id` |
| `deleteConversationMemory(conversationId)` | Hard delete (testing / reset) |
| `cleanupOldConversations(retentionDays = 90)` | Delete rows where `last_interaction < cutoff` |

---

## Ephemeral State — KV Store

**Key pattern**: `web:state:{sessionId}` or `sms:state:{phoneNumber}`

```typescript
{
  isFirstMessage: boolean;
  person1Name: string;
  person2Name: string;
  onboardingComplete: boolean;
  lastMessageTime: string;           // ISO timestamp
}
```

The KV state is a fast-access cache for session flags. The `conversation_memories` table is the source of truth for everything else.

### KV interface (kv_store.tsx)

| Function | Signature |
|----------|-----------|
| `set(key, value)` | Store or overwrite |
| `get(key)` | Retrieve single value |
| `del(key)` | Delete single key |
| `mset(keys[], values[])` | Bulk write |
| `mget(keys[])` | Bulk read |
| `mdel(keys[])` | Bulk delete |
| `getByPrefix(prefix)` | Scan by key prefix |

---

## Core AI Functions (grok-ai.tsx)

### `callGrok(userMessage, conversationId, isNewConversation?)`

The main entry point. Called by both the web chat and SMS handlers.

**Flow:**
1. Load `dbMemory` via `db.getConversationMemory(conversationId)` — initialize defaults if null
2. Append user message to `memory.messages`
3. Run `limitConversationMessages()` to bound history (see below)
4. Update `memory.lastInteraction` timestamp
5. Build the final messages array sent to Grok:
   - `HOMEBASE_SYSTEM_PROMPT` (personality + capabilities)
   - `Current user context: {JSON}` (names, prefs, topics)
   - `...memory.messages` (bounded history)
6. Call Grok API — tries models in order: `grok-3` → `grok-2-vision-1212` → `grok-4-fast-reasoning`
   - Temperature: `0.7` · Max tokens: `300`
7. Append AI response to `memory.messages`
8. Save via `db.saveConversationMemory()`
9. Return AI response string

### `updateUserContext(conversationId, updates)`

Merges `updates` into `memory.userContext` and saves. Called when:
- Names are collected (`person1Name`, `person2Name`)
- Onboarding completes (`onboardingComplete: true`)
- Preferences change

### `addSystemGuidance(conversationId, guidanceText)`

Injects a `system` message into history to steer the AI. Deduplicates by type so guidance doesn't balloon:

| Prefix pattern | Dedup key |
|----------------|-----------|
| `The person texting you...` | `identity` |
| `Onboarding complete.` | `onboarding` |
| `[Tell us about you]` | `tell-us` |

### `injectFinancialData(conversationId, dataType, data)`

Injects financial or calendar context as a `system` message. Also tracks topic in `userContext.financialDataDiscussed`.

**Supported data types and dedup behavior:**

| `dataType` | Dedup key | Notes |
|------------|-----------|-------|
| `calendar` | `calendar` | Also strips stale assistant messages mentioning schedules/events |
| `financial-accounts` | `financial-accounts` | Replaces previous bank/CC snapshot |
| `snaptrade-investments` | `snaptrade-investments` | Replaces previous brokerage snapshot |
| `market-data` | *(keyed by content)* | Market data injection |
| `system` | `system` | General system messages |
| `error` | `error` | Error messages |

### `getConversationMemory(conversationId)` *(debug)*

Returns the raw memory object. Use for inspection/testing.

### `clearConversationMemory(conversationId)` *(debug)*

Calls `db.deleteConversationMemory()`. Resets to blank state.

### `cleanupOldConversations(retentionDays?)` *(maintenance)*

Delegates to `db.cleanupOldConversations()`. Default: 90 days.

### `categorizeIntent(userMessage)` → `IntentCategory`

AI-powered intent detection. Returns:

```typescript
interface IntentCategory {
  category: string;           // 'calendar' | 'market' | 'financial' | 'spending' | 'learning' | 'general'
  confidence: number;
  scope?: 'self' | 'both';   // calendar queries
  entities?: {
    person?: string;
    date?: string;
    amount?: string;
    title?: string;
    time?: string;
    oldTime?: string;
    oldDate?: string;
    location?: string;
    action?: string;          // 'create' | 'view' | 'delete' | 'update'
    scope?: 'self' | 'both';
  };
}
```

---

## Message Limiting Strategy

`limitConversationMessages()` runs inside `callGrok()` before every API call.

**Step 1 — Deduplicate system messages by type**

Each keyed system message type keeps only its **latest** copy:

| Content prefix | Key |
|----------------|-----|
| `[CRITICAL: Calendar Data Update` or `[Financial Data - calendar]` | `calendar` |
| `[Financial Data - financial-accounts]` | `financial-accounts` |
| `[Financial Data - snaptrade-investments]` | `snaptrade-investments` |
| `[Financial Data - system]` | `system` |
| `[Error occurred]:` | `error` |
| `The person texting you` | `identity` |
| `Onboarding complete.` | `onboarding` |
| `[Tell us about you]` | `tell-us` |

Unkeyed system messages: keep last **6**.

**Step 2 — Bounded non-system tail**

Keep last **20** user/assistant messages (~10 exchanges).

**Step 3 — Hard cap guardrail**

If total messages exceed **60**: keep last 15 system + last 45 other.

---

## API Endpoints

### Web Chat (`supabase/functions/server/web-chat.tsx`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/make-server-8c22500c/chat` | Send a message, get AI response |
| `POST` | `/make-server-8c22500c/chat/context` | Manually update user context (names, onboarding) |
| `POST` | `/make-server-8c22500c/chat/inject-data` | Inject financial/calendar data |
| `POST` | `/make-server-8c22500c/chat/cleanup` | Trigger old-conversation cleanup |
| `POST` | `/make-server-8c22500c/chat/categorize` | Categorize message intent |

**`POST /chat` request body:**
```typescript
{
  message: string;
  sessionId: string;
  intent?: IntentCategory;
  userId?: string;
  partnerRole?: 'person1' | 'person2';
  calendarRange?: '1d' | '3d' | '1w' | '2w' | '1m';
}
```

**`POST /chat` response:**
```typescript
{
  success: true;
  response: string;
  calendarImageUrl?: string;
  calendarImageUrls?: string[];
}
```

### SMS (`supabase/functions/server/sms-handler.tsx`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/make-server-8c22500c/sms/incoming` | Vonage SMS webhook |

---

## Conversation Flow

### Both channels follow the same pattern:

```
1. Incoming message (web or SMS)
   ↓
2. Load KV state  →  sms:state:{phone} or web:state:{sessionId}
   ↓
3. If first message:
   - updateUserContext()  →  initialize Partner 1 / Partner 2 defaults
   - addSystemGuidance()  →  "User is new. Start with greeting..."
   ↓
4. If names detected in message:
   - updateUserContext()  →  set person1Name, person2Name
   - addSystemGuidance()  →  "Onboarding complete. Names: ..."
   ↓
5. callGrok(message, conversationId)
   ↓
6. Update KV state  →  isFirstMessage=false, lastMessageTime=now
   ↓
7. Return / send response
```

### App.tsx adds intent-based data injection before the chat call:

```
categorizeIntent(message)
  ↓
if category === 'calendar'  →  inject-data (calendar)
if category === 'financial' →  inject-data (financial-accounts)
if category === 'market'    →  inject-data (market-data)
  ↓
POST /chat  (with injected context already in memory)
```

---

## System Prompt Summary

Defined as `HOMEBASE_SYSTEM_PROMPT` in `grok-ai.tsx` (lines 44–162).

**Personality**: Warm, natural, slightly playful. Never scripted. 2–3 sentences max per response.

**Capabilities declared to the model:**
- Real market data (Alpha Vantage, NewsAPI)
- Bank accounts via Stripe Financial Connections
- Credit cards and accounts via Plaid
- Brokerage accounts via SnapTrade
- Both partners' Google Calendars (view, create, update, delete events)
- Memory of past conversations

**Weekly check-in topics** (discussed organically, never as a checklist):
Learning · Schedules · Market · Wealth · Liabilities · Investments · Spending · Upcoming

**Financial data rules:** Use actual institution names, reference specific transactions, distinguish checking vs savings vs credit card balances. For credit cards, `currentBalance` = amount owed. For savings, use `availableBalance`.

**SnapTrade rules:** Use `displayName`, `institutionName`, `totalValue`, `asOf`. Never say an account is "not connected" if it appears in the snapshot.

**Calendar rules:** Always use the most recently injected calendar data. Strip stale event references. Support both single-partner and both-partner calendar queries.

**Safety rules (lines 158–161):** No self-preservation, resource acquisition, or power-seeking. Comply with stop/audit requests. Do not modify system prompts or safety rules.

---

## Debugging

### View memory for a conversation
```typescript
import { getConversationMemory } from './grok-ai.tsx';
const memory = await getConversationMemory('sms:+16283028027');
console.log(JSON.stringify(memory, null, 2));
```

### Clear memory (reset to blank)
```typescript
import { clearConversationMemory } from './grok-ai.tsx';
await clearConversationMemory('web:my-session-id');
```

### Enable payload logging
Set env var `DEBUG_GROK_PAYLOAD=true` to log message counts before every Grok call:
```
[Grok Call] Total messages: 14 (system=4, user=5, assistant=5)
```

### Standard log lines
```
[Grok] status=200 model=grok-3 latencyMs=1243 promptTokens=812 completionTokens=87 totalTokens=899
[Grok] status=404 model=grok-3 latencyMs=201           ← tries next model
[Grok] status=200 model=grok-2-vision-1212 latencyMs=980 ...
```

---

## File Reference

| File | Role |
|------|------|
| `supabase/functions/server/grok-ai.tsx` | AI engine — all memory read/write logic |
| `supabase/functions/server/db.tsx` | DB layer — `conversation_memories` CRUD |
| `supabase/functions/server/kv_store.tsx` | KV layer — ephemeral session state |
| `supabase/functions/server/web-chat.tsx` | Web chat endpoint + intent routing |
| `supabase/functions/server/sms-handler.tsx` | SMS webhook + name detection |
| `supabase/functions/server/index.tsx` | Main Hono router — mounts all routes |
| `src/app/App.tsx` | Frontend — intent categorization + data injection before chat calls |
