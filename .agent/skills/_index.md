# Skill Registry

Read this file first. Full `SKILL.md` contents load only when a skill's
triggers match the current task. Machine-readable equivalent:
`skills/_manifest.jsonl`.

## skillforge
Creates new skills from observed patterns and recurring tasks.
Triggers: "create skill", "new skill", "I keep doing this manually"

## memory-manager
Reads, scores, and consolidates memory. Runs reflection cycles.
Triggers: "reflect", "what did I learn", "compress memory"

## git-proxy
All git operations with safety constraints.
Triggers: "commit", "push", "branch", "merge", "rebase"
Constraints: never force push to main; run tests before push.

## debug-investigator
Systematic debugging: reproduce, isolate, hypothesize, verify.
Triggers: "debug", "why is this failing", "investigate"

## deploy-checklist
Pre-deployment verification against a structured checklist.
Triggers: "deploy", "ship", "release", "go live"
Constraints: all tests passing, no unresolved TODOs in diff,
requires human approval for production.

## meal-planner
Routes grocery and meal planning requests to the GroceryOrchestrator
(Planner → Generator → Evaluator pipeline). Returns categorized, priced
shopping list grounded in family recipes and pantry state.
Triggers: "grocery", "meal plan", "shopping list", "dinner ideas", "plan the week"
Preconditions: GROCERY_AGENT_URL set OR ~/grocery-agent/orchestrator.py exists.

## travel-agent
Routes flight, hotel, and trip planning requests to a travel sub-agent.
Returns itineraries and price data. Never books without confirmation.
Triggers: "flight", "hotel", "trip", "vacation", "itinerary", "price drop"
Status: stub until Amadeus/Skyscanner integration is built.

## home-agent
Routes home value, equity, and maintenance queries to Rentcast API.
Never stores property values in memory — always fetches live.
Triggers: "home value", "equity", "mortgage", "maintenance", "rentcast"
Status: stub until Rentcast integration is built.
