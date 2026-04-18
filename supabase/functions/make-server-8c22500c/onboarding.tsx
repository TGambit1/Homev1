import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import * as db from "./db.tsx";
import { sendTwilioSMS } from "./twilio-handler.tsx";
import { getSessionPartnerRole } from "./session-role.tsx";

const app = new Hono();

function getBearerToken(c: any): string | null {
  const header = c.req.header("Authorization") || "";
  if (!header) return null;
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

async function authenticateSession(c: any): Promise<{ userId: string } | null> {
  const token = getBearerToken(c);
  if (!token) return null;

  const session = await db.getSessionByToken(token);
  if (!session || new Date(session.expires_at) < new Date()) return null;

  return { userId: session.user_id };
}

app.post("/make-server-8c22500c/onboarding/initialize", async (c) => {
  try {
    const token = getBearerToken(c);
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    const session = await db.getSessionByToken(token);
    if (!session || new Date(session.expires_at) < new Date()) {
      return c.json({ error: "Session expired" }, 401);
    }

    const userId = session.user_id;
    const completionKey = `onboarding:completed:${userId}`;
    const completion = await kv.get(completionKey);
    if (completion?.completed) {
      return c.json({ success: true, alreadyComplete: true });
    }

    const user = await db.getUserById(userId);
    if (!user) return c.json({ error: "User not found" }, 404);

    const body = await c.req.json().catch(() => ({})) as any;
    const person1Name = body?.person1Name || user.person1_name || "Partner 1";
    const person2Name = body?.person2Name || user.person2_name || "Partner 2";

    return c.json({
      success: true,
      alreadyComplete: false,
      person1Name,
      person2Name,
      relationshipName: user.relationship_name,
    });
  } catch (error: any) {
    console.error("[Onboarding:init] error:", error);
    return c.json({ error: "Failed to initialize onboarding", details: error?.message || String(error) }, 500);
  }
});

app.post("/make-server-8c22500c/onboarding/preferences", async (c) => {
  try {
    const auth = await authenticateSession(c);
    if (!auth) return c.json({ error: "Not authenticated" }, 401);

    const body = (await c.req.json().catch(() => ({}))) as any;
    const relationshipName = typeof body.relationshipName === "string" ? body.relationshipName.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const accentColor = typeof body.accentColor === "string" ? body.accentColor.trim() : "";
    const uiTheme = typeof body.uiTheme === "string" ? body.uiTheme.trim() : "";

    const relationshipValue = relationshipName || null;
    await db.updateAccountRelationshipName(auth.userId, relationshipValue);

    const key = `onboarding:preferences:${auth.userId}`;
    await kv.set(key, {
      relationshipName: relationshipValue,
      location: location || null,
      accentColor: accentColor || null,
      uiTheme: uiTheme || null,
      updatedAt: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error("[Onboarding:preferences] error:", error);
    return c.json({ error: "Failed to save onboarding preferences", details: error?.message || String(error) }, 500);
  }
});

/** Person 1 sets how their partner should be named in invite copy and profile (person2 profile row). */
app.post("/make-server-8c22500c/onboarding/partner-display-name", async (c) => {
  try {
    const auth = await authenticateSession(c);
    if (!auth) return c.json({ error: "Not authenticated" }, 401);

    const body = (await c.req.json().catch(() => ({}))) as { person2DisplayName?: string };
    const raw = typeof body.person2DisplayName === "string" ? body.person2DisplayName.trim() : "";
    if (!raw || raw.length > 80) {
      return c.json({ error: "Partner name is required (max 80 characters)" }, 400);
    }

    await db.updatePerson2DisplayName(auth.userId, raw);
    return c.json({ success: true });
  } catch (error: any) {
    console.error("[Onboarding:partner-display-name] error:", error);
    return c.json(
      { error: "Failed to save partner name", details: error?.message || String(error) },
      500,
    );
  }
});

app.post("/make-server-8c22500c/onboarding/send-otp", async (c) => {
  try {
    const auth = await authenticateSession(c);
    if (!auth) return c.json({ error: "Not authenticated" }, 401);

    const body = (await c.req.json().catch(() => ({}))) as any;
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const normalized = rawPhone.replace(/[\s\-\(\)]/g, "");
    const finalPhone = normalized && !normalized.startsWith("+") ? `+${normalized}` : normalized;
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;

    if (!finalPhone || !phoneRegex.test(finalPhone)) {
      return c.json({ error: "Invalid phone number format" }, 400);
    }

    const code = `${Math.floor(100000 + Math.random() * 900000)}`;
    const key = `onboarding:otp:${auth.userId}:${finalPhone}`;
    await kv.set(key, {
      code,
      phone: finalPhone,
      expiresAt: Date.now() + 10 * 60 * 1000,
      createdAt: Date.now(),
    });

    try {
      await sendTwilioSMS(finalPhone, `Your Homebase verification code is ${code}. It expires in 10 minutes.`);
    } catch (smsError) {
      console.warn("[Onboarding:send-otp] Twilio send failed, code retained for local testing:", smsError);
    }

    return c.json({ success: true, phone: finalPhone });
  } catch (error: any) {
    console.error("[Onboarding:send-otp] error:", error);
    return c.json({ error: "Failed to send OTP", details: error?.message || String(error) }, 500);
  }
});

app.post("/make-server-8c22500c/onboarding/verify-otp", async (c) => {
  try {
    const auth = await authenticateSession(c);
    if (!auth) return c.json({ error: "Not authenticated" }, 401);

    const body = (await c.req.json().catch(() => ({}))) as any;
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const providedCode = typeof body.code === "string" ? body.code.trim() : "";
    const normalized = rawPhone.replace(/[\s\-\(\)]/g, "");
    const finalPhone = normalized && !normalized.startsWith("+") ? `+${normalized}` : normalized;

    if (!finalPhone || !providedCode) {
      return c.json({ error: "Phone and code are required" }, 400);
    }

    const key = `onboarding:otp:${auth.userId}:${finalPhone}`;
    const record = await kv.get(key);
    if (!record) return c.json({ error: "No OTP found for this number" }, 400);
    if (Date.now() > Number(record.expiresAt || 0)) return c.json({ error: "OTP expired. Please request a new code." }, 400);
    if (String(record.code) !== providedCode) return c.json({ error: "Invalid OTP code" }, 400);

    const verifiedKey = `onboarding:otp:verified:${auth.userId}`;
    const existing = (await kv.get(verifiedKey)) || { phones: [] as string[] };
    const phones = Array.isArray(existing.phones) ? existing.phones : [];
    if (!phones.includes(finalPhone)) phones.push(finalPhone);
    await kv.set(verifiedKey, { phones, updatedAt: Date.now() });
    await kv.del(key);

    return c.json({ success: true, phone: finalPhone });
  } catch (error: any) {
    console.error("[Onboarding:verify-otp] error:", error);
    return c.json({ error: "Failed to verify OTP", details: error?.message || String(error) }, 500);
  }
});

app.post("/make-server-8c22500c/onboarding/complete", async (c) => {
  try {
    const token = getBearerToken(c);
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    const session = await db.getSessionByToken(token);
    if (!session || new Date(session.expires_at) < new Date()) {
      return c.json({ error: "Session expired" }, 401);
    }

    const userId = session.user_id;
    const role = await getSessionPartnerRole(token);
    const roleKey = `onboarding:completed:${userId}:${role}`;
    const payload = {
      completed: true,
      completedAt: new Date().toISOString(),
    };
    await kv.set(roleKey, payload);
    if (role === "person1") {
      await kv.set(`onboarding:completed:${userId}`, payload);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error("[Onboarding:complete] error:", error);
    return c.json({ error: "Failed to complete onboarding", details: error?.message || String(error) }, 500);
  }
});

export const onboardingRoutes = app;

