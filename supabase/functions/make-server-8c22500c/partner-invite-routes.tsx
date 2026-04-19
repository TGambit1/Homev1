import { Hono } from "npm:hono";
import * as db from "./db.tsx";
import { callPartnerInviteGrok } from "./partner-invite-grok.tsx";
import { extractPartnerInviteSmsBody } from "./partner-invite-constants.tsx";
import { sendTwilioSMS } from "./twilio-handler.tsx";

const app = new Hono();

const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL") || "https://v0-homebase-app-clone.vercel.app/";

function getBearerToken(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const header = c.req.header("Authorization") || "";
  if (!header) return null;
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

/** Partner invite message onboarding — isolated from main /chat (no calendar/finance inject). */
app.post("/make-server-8c22500c/onboarding/partner-invite/message", async (c) => {
  try {
    const token = getBearerToken(c);
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    const session = await db.getSessionByToken(token);
    if (!session || new Date(session.expires_at) < new Date()) {
      return c.json({ error: "Session expired" }, 401);
    }

    const userId = session.user_id;
    const body = (await c.req.json().catch(() => ({}))) as {
      message?: string;
      threadId?: string;
      start?: boolean;
    };

    const threadId =
      typeof body.threadId === "string" && body.threadId.trim().length > 0
        ? body.threadId.trim().slice(0, 128)
        : "default";
    const conversationId = `partner-invite:${userId}:${threadId}`;

    const user = await db.getUserById(userId);
    if (!user) return c.json({ error: "User not found" }, 404);

    const raw = typeof body.message === "string" ? body.message : "";
    const isStart = body.start === true;

    if (!isStart && !raw.trim()) {
      return c.json({ error: "Message is required" }, 400);
    }

    const reply = await callPartnerInviteGrok(conversationId, raw.trim(), {
      person1Name: user.person1_name,
      person2Name: user.person2_name,
      isStart,
      userId,
      accountId: user.id,
    });

    return c.json({
      success: true,
      reply: reply.replyText,
      ...(reply.draftSms ? { draftSms: reply.draftSms } : {}),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[partner-invite/message]", error);
    return c.json({ success: false, error: msg }, 500);
  }
});

export const partnerInviteRoutes = app;

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-\(\)]/g, "");
  const withPlus = cleaned && !cleaned.startsWith("+") ? `+${cleaned}` : cleaned;
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!withPlus || !phoneRegex.test(withPlus)) return null;
  return withPlus;
}

/** Sends the drafted invite SMS to Partner 2 and stores their phone on the profile. */
app.post("/make-server-8c22500c/onboarding/partner-invite/send", async (c) => {
  try {
    const token = getBearerToken(c);
    if (!token) return c.json({ error: "Not authenticated" }, 401);

    const session = await db.getSessionByToken(token);
    if (!session || new Date(session.expires_at) < new Date()) {
      return c.json({ error: "Session expired" }, 401);
    }

    const userId = session.user_id;
    const body = (await c.req.json().catch(() => ({}))) as {
      toPhone?: string;
      message?: string;
      draftSms?: string;
      threadId?: string;
    };

    const user = await db.getUserById(userId);
    if (!user) return c.json({ error: "User not found" }, 404);

    const toPhone = typeof body.toPhone === "string" ? body.toPhone.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const draftSms = typeof body.draftSms === "string" ? body.draftSms.trim() : "";

    if (!toPhone || (!draftSms && !message)) {
      return c.json({ error: "toPhone and draftSms (or message) are required" }, 400);
    }

    const normalizedToPhone = normalizePhone(toPhone);
    if (!normalizedToPhone) return c.json({ error: "Invalid phone number" }, 400);

    // Store typed Partner 2 phone (do not overwrite Person 1 phone).
    await db.updateUserPhones(userId, user.person1_phone ?? null, normalizedToPhone);

    const inviteToken = await db.createPartnerInviteToken(userId, { expiresInMinutes: 60 * 24 * 7 });
    const joinLink = `${APP_URL}?partnerInviteToken=${encodeURIComponent(inviteToken)}`;
    // Prefer structured draftSms from the server-backed Grok flow. Fallback to legacy `message` stripping.
    const smsInviteBody = draftSms
      ? draftSms
      : extractPartnerInviteSmsBody(
          message,
          user.person2_name || "Partner 2",
          user.person1_name || undefined,
        );
    if (!smsInviteBody.trim()) {
      return c.json({ error: "Invite message is empty after processing" }, 400);
    }
    const finalBody = `${smsInviteBody}\n\nJoin me here: ${joinLink}`;

    await sendTwilioSMS(normalizedToPhone, finalBody);

    return c.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[partner-invite/send]", error);
    return c.json({ success: false, error: msg }, 500);
  }
});
