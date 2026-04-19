import { Hono } from "npm:hono";
import { callGrok } from "./grok-ai.tsx";
import * as kv from "./kv_store.tsx";

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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingRecipe {
  name: string;
  ingredients?: string[];
  flagged: boolean;
  flag_reason?: string;
  source?: string;
  added_at: string;
}

export interface PantryItem {
  name: string;
  added_at: string;
  source?: string;
}

export interface MealPlanResult {
  run_id: string;
  raw_text: string;
  total_estimate: number;
  meal_plan: string[];
  items: Array<{ name: string; quantity: string; category: string; estimated_price: number }>;
}

// ─── KV helpers ──────────────────────────────────────────────────────────────

const PENDING_RECIPES_KEY = "meal_planner:pending_recipes";
const PANTRY_ITEMS_KEY    = "meal_planner:pantry_items";

/**
 * Use Grok to extract a structured recipe from free text or a URL.
 * Returns a PendingRecipe ready to store.
 */
export async function digestRecipeText(
  text: string,
  conversationId: string,
): Promise<PendingRecipe> {
  const prompt = `Extract a recipe from the following input and respond ONLY with a JSON object matching this shape:
{
  "name": "<recipe name>",
  "ingredients": ["<ingredient 1>", "<ingredient 2>", ...],
  "flagged": false,
  "flag_reason": null
}
If the recipe contains alcohol, shellfish that might affect dietary restrictions, or any heavily processed ingredients, set flagged to true and fill in flag_reason.
Input: ${text}`;

  const raw = await callGrok(prompt, conversationId, false);
  try {
    const clean = raw.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);
    return {
      name: parsed.name || "Unnamed recipe",
      ingredients: parsed.ingredients || [],
      flagged: !!parsed.flagged,
      flag_reason: parsed.flag_reason || undefined,
      source: "sms",
      added_at: new Date().toISOString(),
    };
  } catch {
    // If Grok didn't return clean JSON, store the raw text as a recipe
    return {
      name: text.slice(0, 60),
      flagged: false,
      source: "sms",
      added_at: new Date().toISOString(),
    };
  }
}

/** Append a recipe to the household pending-recipes queue in KV. */
export async function addPendingRecipe(recipe: PendingRecipe): Promise<void> {
  const existing: PendingRecipe[] = (await kv.get(PENDING_RECIPES_KEY)) || [];
  existing.push(recipe);
  await kv.set(PENDING_RECIPES_KEY, existing);
}

/** Append pantry items to the household pantry list in KV. */
export async function addPantryItems(items: PantryItem[]): Promise<void> {
  const existing: PantryItem[] = (await kv.get(PANTRY_ITEMS_KEY)) || [];
  existing.push(...items);
  await kv.set(PANTRY_ITEMS_KEY, existing);
}

/**
 * Generate a weekly meal plan. Calls the Python agent if GROCERY_AGENT_URL is set,
 * otherwise falls back to Grok.
 */
export async function generateMealPlan(recipeIdea: string): Promise<MealPlanResult> {
  const agentUrl = Deno.env.get("GROCERY_AGENT_URL");

  if (agentUrl) {
    try {
      const res = await fetch(`${agentUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: `Weekly meal plan. Feature: ${recipeIdea}` }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.ok) {
        const data = await res.json();
        return data as MealPlanResult;
      }
    } catch {
      // fall through to Grok
    }
  }

  // Grok fallback
  const prompt = `Create a 7-day meal plan featuring "${recipeIdea}". Include a grocery list with estimated prices. Respond in plain text suitable for SMS.`;
  const raw = await callGrok(prompt, "meal_plan_generation", false);
  return {
    run_id: `grok-${Date.now()}`,
    raw_text: raw,
    total_estimate: 0,
    meal_plan: [],
    items: [],
  };
}

/** Format a MealPlanResult as a concise SMS message. */
export function formatPlanForSMS(result: MealPlanResult): string {
  if (result.raw_text) {
    // Trim to fit SMS limits (concatenated messages ~1500 chars)
    return result.raw_text.slice(0, 1500);
  }
  const days = result.meal_plan.slice(0, 7);
  const lines = days.map((d, i) => `Day ${i + 1}: ${d}`);
  const total = result.total_estimate ? `\nEst. cost: $${result.total_estimate.toFixed(2)}` : "";
  return lines.join("\n") + total;
}
