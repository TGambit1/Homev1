import { Hono } from "npm:hono";
import { callGrok } from "./grok-ai.tsx";

const app = new Hono();

const GROCERY_AGENT_URL = Deno.env.get("GROCERY_AGENT_URL");

/**
 * Meal planner sub-agent endpoint.
 *
 * Routes grocery / meal planning requests to the Python GroceryOrchestrator
 * (Planner → Generator → Evaluator pipeline). Falls back to Grok if the
 * agent is not deployed yet.
 *
 * Skill definition: .agent/skills/meal-planner/SKILL.md
 */
app.post("/make-server-8c22500c/meals/chat", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as any;
    const message: string = typeof body.message === "string" ? body.message.trim() : "";
    const sessionId: string = typeof body.sessionId === "string" ? body.sessionId : "default";

    if (!message) {
      return c.json({ success: false, error: "Missing message" }, 400);
    }

    // Route to deployed Python agent if available
    if (GROCERY_AGENT_URL) {
      try {
        console.log(`[MealPlanner] Routing to grocery agent: ${GROCERY_AGENT_URL}`);
        const res = await fetch(`${GROCERY_AGENT_URL}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: message }),
          signal: AbortSignal.timeout(30_000), // agent takes time — 30s budget
        });

        if (res.ok) {
          const data = await res.json();
          console.log(`[MealPlanner] Agent responded. run_id=${data.run_id} total=$${data.total_estimate}`);
          return c.json({ success: true, response: data.raw_text });
        }

        console.warn(`[MealPlanner] Agent returned ${res.status} — falling back to Grok`);
      } catch (agentErr) {
        console.warn(`[MealPlanner] Agent unreachable: ${agentErr} — falling back to Grok`);
      }
    } else {
      console.log("[MealPlanner] GROCERY_AGENT_URL not set — using Grok fallback");
    }

    // Fallback: Grok answers directly
    const conversationId = `web:${sessionId}`;
    const fallback = await callGrok(message, conversationId, false);
    return c.json({ success: true, response: fallback });

  } catch (error) {
    console.error("[MealPlanner] Unhandled error:", error);
    // Return failure — web-chat.tsx will fall through to Grok
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export const mealPlannerRoutes = app;
