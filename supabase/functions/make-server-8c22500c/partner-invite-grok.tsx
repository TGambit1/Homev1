/**
 * Partner-invite onboarding: web chat collects “8A” (relationship stage, couple goal, exciting upcoming),
 * then Grok-led follow-ups from curated question pools, then a draft SMS-style invite for Partner 2 including Homebase.
 * Isolated from main /chat (no calendar/finance inject).
 */
import * as db from "./db.tsx";
import { extractSmsTellUsAnswer } from "./grok-ai.tsx";
import { PARTNER_INVITE_DRAFT_CLOSING_LINE as CLOSING_LINE } from "./partner-invite-constants.tsx";

interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}

type InviteStage =
  | "8a_relationship"
  | "8a_goal"
  | "8a_exciting"
  | "deep"
  | "revision";

interface PartnerInvitePipeline {
  stage: InviteStage;
  /** User replies in the deep phase (after 8A); draft after this reaches MAX_DEEP_USER_TURNS. */
  deepUserTurns: number;
}

const MAX_DEEP_USER_TURNS = 3;

function pipelineFromContext(ctx: Record<string, unknown> | undefined): PartnerInvitePipeline {
  const p = ctx?.partnerInvitePipeline as PartnerInvitePipeline | undefined;
  if (p && typeof p.stage === "string") {
    return {
      stage: p.stage as InviteStage,
      deepUserTurns: typeof p.deepUserTurns === "number" ? p.deepUserTurns : 0,
    };
  }
  return { stage: "8a_relationship", deepUserTurns: 0 };
}

function stageDisplayRelationshipStage(stageKey: string): string {
  const m: Record<string, string> = {
    dating: "dating",
    living_together: "living together",
    engaged: "engaged",
    married: "married",
    married_with_kids: "married with kids",
    prefer_not_to_say: "prefer not to say",
    unknown: "unspecified",
  };
  return m[stageKey] || stageKey.replace(/_/g, " ");
}

function buildQuestionBankPrompt(): string {
  return `
QUESTION POOLS (use these ideas; paraphrase naturally; one question at a time; tie emotionally to what they said they’re excited about when you can)

Based on relationship stage:
- Dating: "What kind of couple do you want to be known as by the people around you?"
- Living together: "A year from now, what's one new tradition you'd love to have built together?"
- Engaged: "What's something you can't wait to do as a married couple that feels different from doing it now?"
- Married with kids: "What's one experience you want to give your family that you didn't have growing up?"

Based on financial / couple goals:
- "If money weren't a factor at all, what's the first thing you'd want to experience together?"
- "What's one experience you'd love to splurge on together in the next six months?"
- "What's one thing you'd love to check off together this year?"

Based on exciting upcoming:
- "What's coming up that you two can't stop talking about?"
- "What are you two counting down the days to?"

Based on recurring / mental load:
- "Which of these feels like it falls on your shoulders more than your partner's?"
- "What's the one thing that keeps slipping through the cracks?"
- "If you could permanently take one thing off your shared to-do list, what would it be?"

Principles: project them into the future, feeling, or hope—not a quiz. Conversational, not clinical. Aim for a tiny moment of "huh, no app has asked me that before."
`.trim();
}

function buildDeepSystemPrompt(
  person1Name: string,
  person2Name: string,
  profile: { relationshipStage: string; goalSummary: string; excitingSummary: string },
  forceDraft: boolean,
): string {
  const a = person1Name || "Partner 1";
  const b = person2Name || "Partner 2";
  const rs = stageDisplayRelationshipStage(profile.relationshipStage);

  const draftBlock = forceDraft
    ? `
THIS TURN YOU MUST OUTPUT THE FINAL SMS DRAFT AS STRICT JSON (not a question).

CRITICAL FORMAT (machine-readability):
- Your entire reply must be ONLY valid JSON. No code fences. No leading/trailing text.
- JSON schema (exact keys):
  {"sms":"...","closing":"..."}
- "closing" MUST equal exactly: ${CLOSING_LINE}
- "sms" MUST be ONLY the SMS body ${b} receives on their phone. Do not include the closing line, and do not include any join link text.

SMS VOICE (non-negotiable — every word of sms must follow this):
- You are writing ONLY as ${a} texting ${b}. It must read exactly like ${a} typed it to ${b}: first person ("I", "we" for the two of you), and "you" must mean ${b} only.
- You are NOT an assistant talking to ${a}. Never coach, validate, or thank ${a}. Never address ${a} by name in the sms (${b} already knows who sent it).
- Forbidden in the sms: therapist/coach tone ("That makes sense", "I'm glad you've got…"), onboarding-host tone ("I'd love to help you", "let's get started", "bring this vision to life"), or describing Homebase as a product to a third party ("Homebase is a quiet space to…"). Instead: short, human lines about your shared life from 8A + this chat, then a natural nudge to try Homebase together ("Homebase" at most once).
- sms MUST start by greeting ${b} ("Hi ${b}" / "Hey ${b}" / similar), then 2–4 short sentences total.
- Never use placeholders like <partner>, <partner 2>, or [name].
`
    : `
You are still in the DEPTH phase: ask exactly ONE follow-up question (no bullet lists). Pull from the pools below or blend them; use what they’re excited about to make it land emotionally. Brief optional one-sentence reflection before the question is OK; no stacking two questions.
`;

  return `ROLE
You are helping ${a} during Homebase onboarding. You are warm, curious, unhurried—not salesy.
When producing the final SMS draft, you are only ghost-writing ${a}'s text to ${b}—not replying to ${a} as a chatbot.

CONTEXT YOU ALREADY HAVE (8A — do not re-ask these as form fields)
- Relationship stage (summary): ${rs} — in their words: ${profile.goalSummary ? "" : ""}${profile.relationshipStage}
- Something they’re working toward as a couple: ${profile.goalSummary}
- Something coming up they’re excited about: ${profile.excitingSummary}

${buildQuestionBankPrompt()}

${draftBlock}

TONE
Quiet, genuine. Never use: "great," "awesome," "absolutely," "certainly," "of course," "sure thing," "happy to help," or hollow praise.
`.trim();
}

function buildRevisionSystemPrompt(person1Name: string, person2Name: string): string {
  const a = person1Name || "Partner 1";
  const b = person2Name || "Partner 2";
  return `You are revising the SMS ${a} will send to ${b} on their phone. ${a} asked for edits ("shorter", "warmer", etc.).

CRITICAL FORMAT:
- Output ONLY valid JSON. No code fences. No leading/trailing text.
- JSON schema (exact keys):
  {"sms":"...","closing":"..."}
- "closing" MUST equal exactly: ${CLOSING_LINE}
- "sms" MUST be ONLY the revised SMS body. Do not include the closing line or any join link text.

Rules for sms:
- The sms must be ONLY ${a}'s voice texting ${b}: greet ${b}, use "I/we/you" where "you" is ${b}. Never address ${a} by name. Never sound like an assistant coaching ${a} (no "That makes sense", "I'm glad you've got", "I'd love to help you", "let's get started", "quiet space to…").
- Do NOT add preamble to ${a}. sms must begin immediately as the text to ${b}.
- Use ${b}'s real name naturally; never placeholders like <partner>, <partner 2>, or [name].
- "Homebase" at most once, human invitation—no pitch.

Same tone: calm, no filler affirmations.`.trim();
}

async function callGrokChat(system: string, thread: Msg[]): Promise<string> {
  const apiKey = Deno.env.get("GROK_API_KEY");
  if (!apiKey) throw new Error("GROK_API_KEY not configured");

  const payload: Msg[] = [{ role: "system", content: system }, ...thread];
  const modelsToTry = ["grok-3", "grok-2-vision-1212", "grok-4-fast-reasoning"];
  let lastError = "";

  for (const modelName of modelsToTry) {
    try {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: payload,
          temperature: 0.75,
          max_tokens: 600,
        }),
      });

      const responseText = await response.text();
      if (!response.ok) {
        lastError = `${modelName} (${response.status}): ${responseText}`;
        continue;
      }

      const data = JSON.parse(responseText);
      const text = data.choices[0]?.message?.content as string;
      if (!text?.trim()) {
        lastError = `${modelName}: empty content`;
        continue;
      }
      return text.trim();
    } catch (e) {
      lastError = String(e);
    }
  }

  throw new Error(`Partner invite Grok failed: ${lastError}`);
}

async function clarify8a(
  step: "relationship_stage" | "financial_goals" | "exciting_upcoming",
  person1Name: string,
  thread: Msg[],
): Promise<string> {
  const a = person1Name || "Partner 1";
  const hints: Record<typeof step, string> = {
    relationship_stage: `Their answer didn’t nail relationship stage. One short, friendly clarifying question. Offer these options if helpful: dating, living together, engaged, married, married with kids. Texter is ${a}.`,
    financial_goals: `Their answer wasn’t concrete enough for a couple goal. One gentle follow-up—money, life direction, or something they’re building together.`,
    exciting_upcoming: `Their answer wasn’t clear on what’s coming up they’re excited about. One short follow-up.`,
  };
  return await callGrokChat(
    `You are a warm onboarding assistant. ${hints[step]} One question only. No filler words.`,
    thread,
  );
}

type DraftJson = { sms: string; closing: string };

function safeParseDraftJson(raw: string): DraftJson | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t);
    if (!parsed || typeof parsed !== "object") return null;
    const sms = (parsed as any).sms;
    const closing = (parsed as any).closing;
    if (typeof sms !== "string" || typeof closing !== "string") return null;
    return { sms, closing };
  } catch {
    return null;
  }
}

function normalizeSmsBody(s: string): string {
  let t = String(s || "").replace(/\r\n/g, "\n").trim();
  // Remove accidental inclusion of the UI closing line or join-link stubs.
  if (t.includes(CLOSING_LINE)) {
    t = t.replaceAll(CLOSING_LINE, "").trim();
  }
  // If the model included "Join me here:" (or similar), drop that trailing section.
  t = t.replace(/\n{0,2}Join me here:\s*$/i, "").trim();
  return t;
}

function validateDraftSmsOrThrow(sms: string, person2Name: string): string {
  const t = normalizeSmsBody(sms);
  if (!t) throw new Error("Draft SMS is empty");
  if (t.length > 900) throw new Error("Draft SMS is too long");

  // Must start like a text to partner2.
  const b = (person2Name || "Partner 2").trim();
  const startRe =
    b && b !== "Partner 2"
      ? new RegExp(`^(Hi|Hey)\\s+[\\s,]*${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
      : /^(Hi|Hey)\b/i;
  if (!startRe.test(t)) {
    throw new Error("Draft SMS must start with a greeting to your partner (Hi/Hey + their name)");
  }

  // Guard against assistant coaching leakage.
  if (/(?:^|\b)let'?s draft\b/i.test(t)) throw new Error("Draft SMS contains assistant preamble");
  if (/(?:^|\b)let'?s (?:write|create)\b/i.test(t)) throw new Error("Draft SMS contains assistant preamble");
  if (/\bAs an (assistant|AI)\b/i.test(t)) throw new Error("Draft SMS contains assistant phrasing");

  // "Homebase" at most once.
  const homebaseCount = (t.match(/\bhomebase\b/gi) || []).length;
  if (homebaseCount > 1) throw new Error('Draft SMS mentions "Homebase" more than once');

  return t;
}

export type PartnerInviteReply =
  | { replyText: string; draftSms?: undefined }
  | { replyText: string; draftSms: string };

export async function callPartnerInviteGrok(
  conversationId: string,
  rawUserText: string,
  opts: {
    person1Name: string;
    person2Name: string;
    isStart: boolean;
    userId: string;
    accountId: string;
  },
): Promise<PartnerInviteReply> {
  const person1Name = opts.person1Name || "Partner 1";
  const person2Name = opts.person2Name || "Partner 2";
  const accountId = opts.accountId;

  let dbMemory = await db.getConversationMemory(conversationId);
  const sessionStarted = dbMemory?.session_started ?? new Date().toISOString();
  let messages: Msg[] = (dbMemory?.messages as Msg[]) ?? [];
  let userContext = {
    person1Name,
    person2Name,
    onboardingComplete: false,
    financialDataDiscussed: [] as string[],
    preferences: {} as Record<string, unknown>,
    ...(dbMemory?.user_context && typeof dbMemory.user_context === "object"
      ? dbMemory.user_context
      : {}),
  };

  // Idempotent start: same thread, duplicate start request
  if (opts.isStart && messages.length > 0) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.content) return { replyText: lastAssistant.content };
  }

  let pipeline = pipelineFromContext(userContext as Record<string, unknown>);

  const persist = async (assistantReply: string, patch: Partial<{ pipeline: PartnerInvitePipeline; messages: Msg[] }>) => {
    const nextPipeline = patch.pipeline ?? pipeline;
    const nextMessages = patch.messages ?? messages;
    (userContext as Record<string, unknown>).partnerInvitePipeline = nextPipeline;
    nextMessages.push({ role: "assistant", content: assistantReply });
    await db.saveConversationMemory({
      conversation_id: conversationId,
      user_id: opts.userId,
      messages: nextMessages,
      user_context: userContext,
      session_started: sessionStarted,
      last_interaction: new Date().toISOString(),
    });
  };

  /** Load 8A summaries for prompts (from DB + optional in-memory extraction). */
  const loadProfileForPrompt = (goalSummary: string, excitingSummary: string, rs: string) => ({
    relationshipStage: rs,
    goalSummary,
    excitingSummary,
  });

  if (opts.isStart) {
    pipeline = { stage: "8a_relationship", deepUserTurns: 0 };
    (userContext as Record<string, unknown>).partnerInvitePipeline = pipeline;

    const opening =
      `Hi ${person1Name}—a few quick questions so we can draft something real for ${person2Name}. ` +
      `First: where are you two right now—dating, living together, engaged, married, or married with kids?`;

    const nextMessages = [...messages, { role: "assistant", content: opening } satisfies Msg];
    messages = nextMessages;
    await db.saveConversationMemory({
      conversation_id: conversationId,
      user_id: opts.userId,
      messages,
      user_context: userContext,
      session_started: sessionStarted,
      last_interaction: new Date().toISOString(),
    });
    return { replyText: opening };
  }

  const userText = rawUserText.trim();
  if (!userText) throw new Error("Empty message");

  messages.push({ role: "user", content: userText });

  if (pipeline.stage === "revision") {
    const thread = messages.filter((m) => m.role !== "system");
    const raw = await callGrokChat(buildRevisionSystemPrompt(person1Name, person2Name), thread);
    const parsed = safeParseDraftJson(raw);
    if (!parsed) throw new Error("Draft revision JSON parse failed");
    if (parsed.closing.trim() !== CLOSING_LINE) throw new Error("Draft revision JSON closing mismatch");
    const draftSms = validateDraftSmsOrThrow(parsed.sms, person2Name);
    const replyText = `${draftSms}\n\n${CLOSING_LINE}`;
    await persist(replyText, { pipeline, messages });
    return { replyText, draftSms };
  }

  if (pipeline.stage === "8a_relationship") {
    const ex = await extractSmsTellUsAnswer("relationship_stage", userText);
    const thread = messages.filter((m) => m.role !== "system");
    if (!("filled" in ex) || !ex.filled) {
      const reply = await clarify8a("relationship_stage", person1Name, thread);
      await persist(reply, { pipeline, messages });
      return { replyText: reply };
    }
    const stage = ex.relationshipStage || "unknown";
    await db.upsertCoupleOnboardingProfile(accountId, { relationship_stage: stage });

    pipeline = { stage: "8a_goal", deepUserTurns: 0 };
    const reply =
      `Thanks—that helps. What’s a goal you’re working toward as a couple lately—money, life, or anything you’re both trying to move forward on?`;
    await persist(reply, { pipeline, messages });
    return { replyText: reply };
  }

  if (pipeline.stage === "8a_goal") {
    const ex = await extractSmsTellUsAnswer("financial_goals", userText);
    const thread = messages.filter((m) => m.role !== "system");
    if (!("filled" in ex) || !ex.filled) {
      const reply = await clarify8a("financial_goals", person1Name, thread);
      await persist(reply, { pipeline, messages });
      return { replyText: reply };
    }
    await db.insertFinancialGoalEntry(accountId, ex.summary, "web", conversationId);

    pipeline = { stage: "8a_exciting", deepUserTurns: 0 };
    const reply = `Got it. What’s something coming up that you two are excited about?`;
    await persist(reply, { pipeline, messages });
    return { replyText: reply };
  }

  if (pipeline.stage === "8a_exciting") {
    const ex = await extractSmsTellUsAnswer("exciting_upcoming", userText);
    const thread = messages.filter((m) => m.role !== "system");
    if (!("filled" in ex) || !ex.filled) {
      const reply = await clarify8a("exciting_upcoming", person1Name, thread);
      await persist(reply, { pipeline, messages });
      return { replyText: reply };
    }
    await db.upsertCoupleOnboardingProfile(accountId, { exciting_upcoming: ex.summary });

    pipeline = { stage: "deep", deepUserTurns: 0 };
    const prof = await db.getCoupleOnboardingProfile(accountId);
    const goalRow = await db.getLatestFinancialGoalSummary(accountId);
    const rs = prof?.relationship_stage || "unknown";
    const promptCtx = loadProfileForPrompt(goalRow, ex.summary, rs);
    const deepSystem = buildDeepSystemPrompt(person1Name, person2Name, promptCtx, false);
    const reply = await callGrokChat(deepSystem, thread);
    await persist(reply, { pipeline, messages });
    return { replyText: reply };
  }

  if (pipeline.stage === "deep") {
    pipeline = { ...pipeline, deepUserTurns: pipeline.deepUserTurns + 1 };
    const prof = await db.getCoupleOnboardingProfile(accountId);
    const goalSummary = await db.getLatestFinancialGoalSummary(accountId);
    const rs = prof?.relationship_stage || "unknown";
    const exciting = prof?.exciting_upcoming || "";
    const promptCtx = loadProfileForPrompt(goalSummary, exciting, rs);
    const forceDraft = pipeline.deepUserTurns >= MAX_DEEP_USER_TURNS;
    const thread = messages.filter((m) => m.role !== "system");
    const deepSystem = buildDeepSystemPrompt(person1Name, person2Name, promptCtx, forceDraft);
    const raw = await callGrokChat(deepSystem, thread);

    if (forceDraft) {
      const parsed = safeParseDraftJson(raw);
      if (!parsed) throw new Error("Draft JSON parse failed");
      if (parsed.closing.trim() !== CLOSING_LINE) throw new Error("Draft JSON closing mismatch");
      const draftSms = validateDraftSmsOrThrow(parsed.sms, person2Name);
      const replyText = `${draftSms}\n\n${CLOSING_LINE}`;
      pipeline = { stage: "revision", deepUserTurns: pipeline.deepUserTurns };
      await persist(replyText, { pipeline, messages });
      return { replyText, draftSms };
    }

    await persist(raw, { pipeline, messages });
    return { replyText: raw };
  }

  throw new Error("Invalid partner invite pipeline state");
}
