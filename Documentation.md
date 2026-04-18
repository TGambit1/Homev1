# Homebase UX v1.2 — Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Getting Started](#getting-started)
4. [Project Structure](#project-structure)
5. [Architecture](#architecture)
6. [Pages & Navigation](#pages--navigation)
7. [AI Chat System](#ai-chat-system)
8. [Authentication](#authentication)
9. [Integrations](#integrations)
   - [Google Calendar](#google-calendar)
   - [Bank Accounts (Stripe)](#bank-accounts-stripe)
   - [Credit Cards (Plaid)](#credit-cards-plaid)
   - [Brokerage Accounts (SnapTrade)](#brokerage-accounts-snaptrade)
   - [SMS (Vonage)](#sms-vonage)
10. [Memory System](#memory-system)
11. [API Reference](#api-reference)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)

---

## Project Overview

Homebase is a mobile-first AI assistant built for couples. It helps partners coordinate schedules, track finances, and run structured weekly check-ins — all through a conversational chat interface.

The app is designed around an iMessage-style UI (390×844px / iPhone layout) and uses Grok AI to power natural, context-aware conversations that persist across sessions.

**What it does:**
- Weekly AI-guided check-ins covering schedules, finances, goals, and upcoming events
- Real-time Google Calendar integration for both partners
- Bank, credit card, and brokerage account linking
- SMS conversations via Vonage (same AI, accessible from any phone)
- Personalized responses using persistent conversation memory

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v4 |
| UI components | Radix UI / shadcn-style |
| Animations | Motion (Framer Motion) |
| Backend | Supabase Edge Functions |
| Database / KV | Supabase (Postgres + KV store) |
| AI | Grok API |
| Calendar | Google Calendar OAuth 2.0 |
| Banking | Stripe Financial Connections |
| Cards | Plaid Link |
| Brokerage | SnapTrade |
| SMS | Vonage |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Install & Run

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

### Build for Production

```bash
npm run build
```

### One-Time Setup: Google Calendar

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Find OAuth Client ID: `742965909626-k91duhknbojqleb948iehuvgtpc8uf3o`
3. Add authorized redirect URI:
   - Dev: `http://localhost:5173/auth-callback.html`
   - Prod: `https://YOUR_DOMAIN/auth-callback.html`
4. Set the `GOOGLE_REDIRECT_URI` environment variable to match.

---

## Project Structure

```
Homebaseuxv12-main/
├── src/
│   ├── main.tsx                    # Entry point
│   ├── app/
│   │   ├── App.tsx                 # Root component, auth & routing
│   │   ├── components/
│   │   │   ├── Login.tsx           # Login / sign-up form
│   │   │   ├── ResetPassword.tsx   # Password reset (token from email)
│   │   │   ├── OnboardingMessage.tsx  # First-run couple setup
│   │   │   ├── ChatBubble.tsx      # Individual message bubble
│   │   │   ├── TypingIndicator.tsx # Animated "..." indicator
│   │   │   ├── CalendarIntegration.tsx  # Calendar OAuth UI
│   │   │   ├── CalendarWidget.tsx  # Calendar display widget
│   │   │   ├── OptionC.tsx         # Main home/dashboard view
│   │   │   ├── SettingsPage.tsx    # Settings
│   │   │   ├── AccountPage.tsx     # Account management
│   │   │   ├── ConnectionsPage.tsx # All integrations manager
│   │   │   ├── AppearancePage.tsx  # Theme & accent color
│   │   │   ├── TwilioDebug.tsx     # SMS debug panel
│   │   │   └── ui/                 # Reusable shadcn-style components
│   │   └── hooks/
│   │       ├── useFinancialConnections.ts  # Bank/card/brokerage state
│   │       └── useCalendarConnections.ts   # Calendar OAuth state
│   └── styles/
│       ├── index.css
│       ├── tailwind.css
│       ├── theme.css
│       └── fonts.css
├── utils/
│   └── supabase/
│       └── info.tsx                # projectId + publicAnonKey
├── public/
│   └── auth-callback.html          # OAuth popup receiver
├── supabase/
│   └── migrations/                 # DB migration files
└── vite.config.ts
```

---

## Architecture

```
Browser (React SPA)
      │
      │  HTTPS
      ▼
Supabase Edge Functions  (/make-server-8c22500c/*)
      │
      ├── Auth       → Supabase Postgres (users, sessions)
      ├── KV store   → AI conversation memory
      ├── Chat       → Grok API
      ├── Calendar   → Google Calendar API (tokens stored server-side)
      └── Financial  → Stripe / Plaid / SnapTrade
```

The frontend never sees OAuth client secrets or financial API keys — all sensitive operations go through Supabase Edge Functions.

---

## Pages & Navigation

The app uses client-side page state (not URL routing) managed in `App.tsx`.

| Page key | Component | Description |
|----------|-----------|-------------|
| `home` | `OptionC` | Dashboard / landing after login |
| `chat` | Inline in `App.tsx` | AI chat interface |
| `settings` | `SettingsPage` | App settings |
| `account` | `AccountPage` | Profile and account details |
| `connections` | `ConnectionsPage` | Manage all integrations |
| `appearance` | `AppearancePage` | Theme (light/dark/auto) and accent color |

**Dev shortcut:** append `?devChat=1` to the URL to jump straight to the chat view after login.

---

## AI Chat System

### How It Works

1. User types a message in the chat input.
2. The app `POST`s to `/make-server-8c22500c/chat` with the message and `sessionId`.
3. The Edge Function loads the last 20 messages from the KV store.
4. The full history + user context is sent to Grok API.
5. Grok's response is saved back to the KV store and returned to the client.
6. A typing indicator (`TypingIndicator`) is shown while waiting.

### Session IDs

Each browser session generates a unique ID on mount:

```typescript
const [sessionId] = useState(() => `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
```

SMS sessions use the phone number as the ID (e.g. `sms:+16283028027`).

### Initial Greeting

On first load after authentication, the app sends a system prompt to Grok asking for a warm 2-sentence greeting. If the API call fails, a fallback message is shown.

### Weekly Check-In Structure

The AI follows this sequence when running a weekly check-in:

1. Learning & Growth
2. Schedule Sync
3. Market Updates
4. Wealth Review
5. Liabilities
6. Investment Opportunities
7. Expense Planning
8. Upcoming Events

---

## Authentication

Authentication is custom-built on top of Supabase, handled by the Edge Function.

### Flow

1. User submits email + password on `Login.tsx`.
2. Frontend `POST`s credentials to `/auth/...`.
3. On success, `sessionToken` and `userId` are stored in `localStorage`.
4. On every page load, `App.tsx` calls `/auth/verify` to confirm the session is still valid.
5. If the session is invalid or expired, `localStorage` is cleared and the user is returned to login.

### Password Reset

When a user clicks the reset link from their email, the URL will contain a `?token=` parameter. `App.tsx` detects this and renders `ResetPassword` instead of the main app.

### User Object

```typescript
{
  userId: string,
  person1Name: string,
  person2Name: string,
  primaryEmail: string,
  secondaryEmail: string,
  person1Phone: string | null,
  person2Phone: string | null,
}
```

---

## Integrations

### Google Calendar

**Status:** Fully implemented with real OAuth.

**How to connect:**
1. In the app, navigate to Connections → Calendar & Email.
2. Click "Connect" next to a partner's calendar row.
3. A Google OAuth popup opens.
4. After sign-in, the popup closes and events appear in chat.

**Security model:**
- OAuth client secret lives only in the Edge Function environment.
- Access tokens are stored encrypted in Supabase KV store, never in the browser.
- Tokens auto-refresh when expired.

**In-chat command:**
```
/connect calendar
```

**Callback page:** `public/auth-callback.html` receives the OAuth redirect and passes the code back to the opener window, then closes itself.

---

### Bank Accounts (Stripe)

**Status:** Implemented via Stripe Financial Connections.

Connect from: Connections → Bank Accounts → "Connect Bank Account (Stripe)"

Requires the user to be authenticated (non-default `userId`). Connected accounts display institution name, last 4 digits, and current balance.

---

### Credit Cards (Plaid)

**Status:** Implemented via Plaid Link.

Connect from: Connections → Bank Accounts → "Connect Credit Card (Plaid)"

Uses `react-plaid-link`. A Plaid Link token is fetched from the Edge Function before opening the Plaid modal.

---

### Brokerage Accounts (SnapTrade)

**Status:** Implemented via SnapTrade SDK.

Connect from: Connections → Brokerage Accounts → "Connect Brokerage (SnapTrade)"

Investment accounts are displayed with a "via SnapTrade" badge and are categorized separately from bank accounts based on the `category` or `provider` fields returned by the API.

---

### SMS (Vonage)

**Status:** Implemented. Vonage webhook handles incoming messages.

The SMS conversation uses the same Grok AI backend and memory system as the web chat. The conversation ID is the user's phone number (e.g. `sms:+16283028027`).

**Webhook endpoint:**
```
POST /make-server-8c22500c/sms/incoming
```

Phone numbers are stored per-user via Connections → Phone & SMS. Format: `+1234567890`.

---

## Memory System

Conversation memory is stored in Supabase KV (`kv_store_8c22500c`) under two key types:

| Key | Content |
|-----|---------|
| `memory:{conversationId}` | Full message history + user context |
| `{platform}:state:{userId}` | Current session state (names, onboarding status) |

### Conversation Memory Schema

```typescript
{
  messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>,
  userContext: {
    person1Name: string,
    person2Name: string,
    onboardingComplete: boolean,
    financialDataDiscussed: string[],
    preferences: {
      reminderDay?: string,
      preferredTimeZone?: string
    }
  },
  sessionStarted: string,   // ISO timestamp
  lastInteraction: string   // ISO timestamp
}
```

### Retention

- Message history is capped at **20 messages** (10 exchanges) to stay within token limits.
- User names, preferences, and discussed topics persist indefinitely.
- Financial data topics are tracked in `financialDataDiscussed[]` to prevent redundant API calls.

### Debugging

View memory for a session:
```typescript
import { getConversationMemory } from './grok-ai.tsx';
const memory = await getConversationMemory('sms:+16283028027');
```

Clear memory (testing):
```typescript
import { clearConversationMemory } from './grok-ai.tsx';
await clearConversationMemory('sms:+16283028027');
```

---

## API Reference

All endpoints live under the Supabase Edge Function base URL:
```
https://{projectId}.supabase.co/functions/v1/make-server-8c22500c
```

### Chat

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | Send a message, get AI response |
| `POST` | `/chat/context` | Update user context (names) |
| `POST` | `/chat/inject-data` | Inject financial data into memory |

**POST /chat**
```json
{
  "message": "How's the market today?",
  "sessionId": "web-1234567890-abc"
}
```
Response:
```json
{ "success": true, "response": "SPY is up 0.8% today..." }
```

**POST /chat/context**
```json
{
  "sessionId": "web-1234567890-abc",
  "person1Name": "Alex",
  "person2Name": "Jordan"
}
```

**POST /chat/inject-data**
```json
{
  "sessionId": "web-1234567890-abc",
  "dataType": "market-data",
  "data": { "spy": { "price": 585.32, "change": "+0.8%" } }
}
```

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/verify` | Verify session token |
| `POST` | `/auth/add-phone` | Save phone numbers for partners |

**GET /auth/verify** — requires `Authorization: Bearer {sessionToken}` header.

**POST /auth/add-phone**
```json
{
  "person1Phone": "+12025550100",
  "person2Phone": "+12025550101"
}
```

### Financial

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/financial/accounts?userId={id}` | Fetch linked accounts |
| `GET` | `/financial/balances?userId={id}` | Fetch account balances |

### SMS

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sms/incoming` | Vonage webhook for inbound SMS |

---

## Configuration

### Environment Variables (Edge Function)

| Variable | Description |
|----------|-------------|
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (must match Google Cloud Console) |
| `MX_API_KEY` | MX banking API key (set up, not yet used in UI) |
| `MX_ENV` | MX environment (`sandbox` or `production`) |

### Frontend Constants

`utils/supabase/info.tsx` is auto-generated and contains:
- `projectId` — Supabase project ID
- `publicAnonKey` — Supabase anonymous key (safe for browser use)

### App-Level Flags

In `App.tsx`:
```typescript
const USE_CALENDAR_IMAGE = false;
// Set to true to show calendar images in chat instead of text
```

---

## Troubleshooting

### `redirect_uri_mismatch` (Google OAuth)

The redirect URI in your Google Cloud Console must exactly match `GOOGLE_REDIRECT_URI`.
Both must be: `http://localhost:5173/auth-callback.html` (dev) or your production URL.

### OAuth popup doesn't open

Browser popup blockers are the usual cause. Allow popups for `localhost:5173` in your browser settings.

### "No tokens found" after OAuth

The OAuth flow didn't complete successfully. Disconnect and try again. Check the browser console for details.

### Calendar events don't appear

1. Confirm the Google Calendar API is enabled in Google Cloud Console.
2. Verify the connected account actually has calendar events.
3. Check browser console and Supabase Edge Function logs for errors.

### Chat shows fallback greeting

The Edge Function call failed. Check:
- Supabase project is live
- `projectId` and `publicAnonKey` in `utils/supabase/info.tsx` are correct
- Grok API key is set in the Edge Function environment

### Financial connections disabled (greyed out)

Buttons are disabled when `userId` is `null` or `'default'`. The user must be fully authenticated before linking financial accounts.

### SMS not receiving messages

Confirm the Vonage webhook is pointed at:
```
https://{projectId}.supabase.co/functions/v1/make-server-8c22500c/sms/incoming