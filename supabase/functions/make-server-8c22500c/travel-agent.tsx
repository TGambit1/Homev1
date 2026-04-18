import { Hono } from "npm:hono";
import { callGrok } from "./grok-ai.tsx";

const app = new Hono();

/**
 * Travel sub-agent endpoint.
 *
 * Handles flight, hotel, and trip planning requests. Currently falls back to
 * Grok until a travel API (Amadeus, Skyscanner, etc.) is integrated.
 *
 * Skill definition: .agent/skills/travel-agent/SKILL.md
 */
app.post("/make-server-8c22500c/travel/chat", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as any;
    const message: string = typeof body.message === "string" ? body.message.trim() : "";
    const sessionId: string = typeof body.sessionId === "string" ? body.sessionId : "default";

    if (!message) {
      return c.json({ success: false, error: "Missing message" }, 400);
    }

    console.log("[TravelAgent] Routing travel request to Grok (travel API not yet integrated)");

    // Grok handles travel queries directly until a travel API is wired in
    const conversationId = `web:${sessionId}`;
    const response = await callGrok(message, conversationId, false);
    return c.json({ success: true, response });

  } catch (error) {
    console.error("[TravelAgent] Error:", error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export const travelAgentRoutes = app;
