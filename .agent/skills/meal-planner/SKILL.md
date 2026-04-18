---
name: meal-planner
version: 2026-04-18
triggers: ["grocery", "groceries", "meal plan", "shopping list", "dinner ideas", "what's for dinner", "weekly meals", "recipe queue", "plan the week"]
tools: [bash, http]
preconditions: ["GROCERY_AGENT_URL env var set OR ~/grocery-agent/orchestrator.py exists"]
constraints:
  - "Never fabricate a grocery list — always route to the agent or fall back gracefully"
  - "Return raw_text from GroceryList as the user-facing response"
  - "If agent is unavailable, say so clearly and offer to try again"
category: lifestyle
---

# Meal Planner Skill

Routes meal planning and grocery requests to the GroceryOrchestrator
(Planner → Generator → Evaluator pipeline). Returns a categorized,
priced shopping list grounded in family recipes and pantry state.

## How it works

**Web / SMS path (production):**
```
User message → isGroceryIntent regex fires in web-chat.tsx
  → POST /make-server-8c22500c/meals/chat
      → grocery-meal-planner.tsx
          → POST $GROCERY_AGENT_URL/run { request: message }
              → GroceryOrchestrator().run(request)
                  → GroceryList.raw_text → user
```

**Local development path:**
```bash
cd ~/grocery-agent
python cli.py "Plan meals for the week, budget $150"
```

## Intent regex (web-chat.tsx)
```ts
/\b(grocery|groceries|meal plan|shopping list|dinner (ideas|plan)|what('s| is) for dinner|weekly meals|generate.*plan|plan.*week|recipe queue|pending recipes)\b/i
```

## Deploying the agent
1. Add `api.py` to `~/grocery-agent/` (FastAPI wrapper around GroceryOrchestrator)
2. Deploy to Fly.io or Railway: `fly deploy` from `~/grocery-agent/`
3. Set secret: `supabase secrets set GROCERY_AGENT_URL=https://your-agent.fly.dev`
4. The Deno bridge in `grocery-meal-planner.tsx` picks it up automatically

## Graceful fallback
If `GROCERY_AGENT_URL` is not set or the agent returns non-200, `grocery-meal-planner.tsx`
falls through to `callGrok()` so the user still gets a response.

## Data files (~/grocery-agent/data/)
- `recipes.json` — family recipe book; authoritative, never overwritten by generic lookups
- `pantry.json` — owned staples; evaluator skips items already in stock
- `context.json` — household preferences, dietary notes, typical budget

## Adding a family recipe
```json
// data/recipes.json, under "recipes" key:
"chicken tacos": {
  "source": "family",
  "default_servings": 4,
  "ingredients": [
    { "item": "chicken thighs", "quantity": "1.5 lbs" },
    { "item": "tortillas", "quantity": "12 count" },
    { "item": "lime", "quantity": "2" }
  ]
}
```

## Self-rewrite hook
After any failed grocery run (agent error, empty list, score < 5):
1. Read the run's `meta.json` and `qa_*.json` from `~/grocery-agent/runs/<run_id>/`
2. Identify which evaluator criterion failed (budget / nutrition / completeness / efficiency)
3. Update `data/context.json` with any new constraints the user expressed
4. If the same criterion fails 3 runs in a row, open an issue in this skill's DECISIONS.md
