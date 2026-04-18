---
name: travel-agent
version: 2026-04-18
triggers: ["flight", "hotel", "trip", "travel", "passport", "visa", "itinerary", "vacation", "destination", "book travel", "price drop", "watch flight", "family trip", "where should we fly"]
tools: [bash, http]
preconditions: []
constraints:
  - "Never book anything without explicit user confirmation"
  - "Always surface price, dates, and cancellation policy before recommending"
  - "If travel data is unavailable, say so — do not hallucinate itineraries"
category: lifestyle
---

# Travel Agent Skill

Routes travel planning requests to the travel sub-agent endpoint.
Handles flight search, hotel suggestions, trip planning, and itinerary
building for couples using Homebase.

## How it works

**Web / SMS path:**
```
User message → isTravelIntent regex fires in web-chat.tsx
  → POST /make-server-8c22500c/travel/chat
      → travel-agent.tsx
          → [travel API or LLM-based planning]
              → structured itinerary → user
```

## Intent regex (web-chat.tsx)
```ts
/\b(flight|hotel|trip|travel|passport|visa|itinerary|vacation|destination|book.*travel|travel.*book|price.*drop|watch.*flight|family.*trip|where.*fly|where.*go)\b/i
```

## Current status
Stub implemented — returns 501 until travel API integration is built.
To implement: wire `travel-agent.tsx` to a travel data source
(Google Flights API, Skyscanner, Amadeus, or LLM-based trip planning).

## Implementation path
1. Choose data source (Amadeus free tier recommended for initial build)
2. Add `TRAVEL_API_KEY` to Supabase secrets
3. Implement `travel-agent.tsx` with search + format flow
4. Add budget and travel preference fields to user context

## Self-rewrite hook
After 10 travel queries or any failed booking attempt:
1. Review what data the user was actually asking for vs. what was returned
2. Update the intent regex if queries are not being caught
3. Commit: `skill-update: travel-agent, <one-line reason>`
