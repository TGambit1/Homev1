---
name: home-agent
version: 2026-04-18
triggers: ["home value", "equity", "mortgage", "house worth", "property value", "maintenance", "hvac", "roof", "gutter", "repair", "home report", "home update", "rentcast"]
tools: [bash, http]
preconditions: []
constraints:
  - "Never state a home value as fact without a live Rentcast or Zillow lookup"
  - "Maintenance reminders are advisory only — always recommend a licensed contractor"
  - "Do not store home value in core memory — always fetch live"
category: financial
---

# Home Agent Skill

Routes home equity, property value, and maintenance requests to the
home sub-agent endpoint. Integrates with Rentcast (or equivalent) for
live property valuations.

## How it works

**Web / SMS path:**
```
User message → isHomeIntent regex fires in web-chat.tsx
  → POST /make-server-8c22500c/home/chat
      → home-agent.tsx
          → Rentcast API (property valuation)
          → maintenance schedule logic
              → home report → user
```

## Intent regex (web-chat.tsx)
```ts
/\b(home value|equity|mortgage|house worth|property value|maintenance|hvac|roof|gutter|repair|home report|home update|rentcast)\b/i
```

## Current status
Stub implemented — returns 501 until Rentcast integration is built.

## Implementation path
1. Sign up for Rentcast API (free tier: 50 calls/month)
2. Add `RENTCAST_API_KEY` to Supabase secrets
3. Implement `home-agent.tsx`:
   - GET /properties?address=... for valuation
   - Calculate equity = estimated_value - mortgage_balance
   - Generate seasonal maintenance reminders
4. Add home address + mortgage balance to user onboarding

## Memory rule
Home value changes constantly. Per the Context Constitution:
> Account balances — Never store. Always fetch live.
The same applies to property values. Never write a dollar amount to core memory.
Store behavioral data only: "they ask about home equity after market dips."

## Self-rewrite hook
After any Rentcast API error or 3 consecutive failed home queries:
1. Check if API key is still valid
2. Verify the address format being sent matches Rentcast's expected format
3. Update this skill with the correct address normalization pattern
