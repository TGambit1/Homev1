import { Hono } from "npm:hono";
import { callGrok } from "./grok-ai.tsx";

const app = new Hono();

/**
 * Home sub-agent endpoint.
 *
 * Handles home value, equity, mortgage, and maintenance requests.
 * Currently falls back to Grok until Rentcast API is integrated.
 *
 * Skill definition: .agent/skills/home-agent/SKILL.md
 *
 * Memory rule (from Context Constitution):
 *   Never store property values in core memory — always fetch live.
 *   Store behavioral observations only (e.g., "asks about equity after market dips").
 */
app.post("/make-server-8c22500c/home/chat", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as any;
    const message: string = typeof body.message === "string" ? body.message.trim() : "";
    const sessionId: string = typeof body.sessionId === "string" ? body.sessionId : "default";

    if (!message) {
      return c.json({ success: false, error: "Missing message" }, 400);
    }

    console.log("[HomeAgent] Routing home request to Grok (Rentcast not yet integrated)");

    // Grok handles home queries directly until Rentcast is wired in
    const conversationId = `web:${sessionId}`;
    const response = await callGrok(message, conversationId, false);
    return c.json({ success: true, response });

  } catch (error) {
    console.error("[HomeAgent] Error:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export const homeAgentRoutes = app;
