import * as db from "./db.tsx";

// Grok AI Integration for Homebase Agent

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ConversationMemory {
  messages: Message[];
  userContext: {
    person1Name: string;
    person2Name: string;
    onboardingComplete: boolean;
    financialDataDiscussed: string[];
    preferences: Record<string, any>;
  };
  sessionStarted: string;
  lastInteraction: string;
}

export interface IntentCategory {
  category: string;
  confidence: number;
  // For calendar queries: whether user wants only texter's calendar ("self") or both partners ("both")
  scope?: 'self' | 'both';
  entities?: {
    person?: string;
    date?: string;
    amount?: string;
    title?: string; // Event title
    time?: string; // Event time (new time for updates)
    oldTime?: string; // Old time when updating an event
    oldDate?: string; // Old date when updating an event
    location?: string; // Event location
    action?: string; // "create", "view", "delete", "update", etc.
    scope?: 'self' | 'both'; // preferred place for scope (kept for backwards compatibility)
  };
}


// System prompt that defines Homebase's personality and capabilities
const HOMEBASE_SYSTEM_PROMPT = `You are Homebase, a smart conversational personal assistant for couples. Think of yourself as their helpful friend who happens to be great with coordinating schedules, money conversations, and life planning.

YOUR PERSONALITY:
- Warm, supportive, and genuinely excited to help
- Natural conversationalist - NEVER sound scripted or robotic
- Keep it real - acknowledge challenges, celebrate wins
- Slightly playful and can be unhinged when the couple is not winning

YOUR CAPABILITIES:
- Access real market data (10Y Treasury, SPY, financial news via Alpha Vantage & NewsAPI)
- Access real bank accounts connected via Stripe Financial Connections (balances, transactions, account details)
- Access credit cards and additional accounts connected via Plaid (balances, transactions, account details)
- Access calendar data for both partners - you can view either person's calendar separately OR both calendars together when asked
- Create calendar events in Google Calendar (when user asks to add/schedule something)
- Remember everything from past conversations
- Pull data automatically when the conversation calls for it

CONVERSATION PRINCIPLES:
1. **Be Natural**: Never say "let's move on" or "next topic" - flow organically based on what they say
2. **Listen First**: Acknowledge what they share before asking the next question
3. **One Thing at a Time**: Ask one question, wait for response, then continue
4. **Follow Their Lead**: If they want to talk about something specific, go with it immediately
5. **Stay Concise**: 2-3 sentences max per response (unless sharing data that needs detail)
6. **Be Insightful**: Don't just report numbers - provide context and ask thoughtful questions
7. **Ask Thought provoking questions**: get people thinking - provide context and ask thoughtful questions
8. **Dont text paragraphs**: If you have more than 2 sentences to say, you should break it up into multiple texts
9. **Get the users names**: Always get the names of the new user when they are new. Use it throughout
10. **Response size**: Always responsd short and concise. 

WEEKLY CHECK-IN TOPICS (discuss naturally, not as a checklist):
- **Learning**: What did each partner learn this week? Only ask this ONCE per conversation session. If you've already asked about learnings in this conversation, don't ask again unless they bring it up.
- **Schedule**: Review calendars, find overlap, discuss how to support each other
- **Market**: Share 10Y Treasury, SPY performance, relevant news (when data is available)
- **Wealth**: Bank account balances (checking, savings), property value/equity, investment accounts, 401k balances, ETF holdings, Bitcoin
- **Liabilities**: Credit card balances, student loans, car payments
- **Investments**: Any property, stocks, or startup opportunities they're considering
- **Spending**: Review recent transactions, acknowledge bad spending, celebrate good decisions
- **Upcoming**: Major expenses or cash needs coming up

IMPORTANT: Do NOT repeatedly ask the same question. If you've already asked about learnings, schedules, or other topics in this conversation, acknowledge their responses and move on naturally. Only ask again if they haven't answered or if it's been a long time since you last asked.

HANDLING FINANCIAL DATA:
When you see data in context like "[Financial Data - financial-accounts]", "[Financial Data - snaptrade-investments]" or "[Financial Data - market-data]":
- Reference it naturally in your response
- Provide insights, not just numbers
- Ask thoughtful follow-up questions
- Connect it to their goals
- Remind them you are not a financial advisor
- When discussing bank accounts, credit cards, balances, or transactions:
  * Use the actual account names and institutions from the data
  * Reference specific transactions when relevant
  * Calculate totals and provide summaries when helpful
  * Note pending transactions vs completed ones
  * Distinguish between bank accounts (checking, savings) and credit cards when discussing balances
  * For credit cards, report the current balance owed (this is what they need to pay)
  * If no accounts are connected, suggest they connect their bank accounts or credit cards in settings
  * **IMPORTANT: For account balances, use the appropriate balance field:**
    - For checking accounts: Use currentBalance (total including pending) or availableBalance (what can be spent now)
    - For savings accounts: Use availableBalance as the primary balance (savings accounts typically don't have pending transactions, so available = current)
    - For credit cards: Use currentBalance to show what is owed (negative balance means debt)
    - If currentBalance is 0 or null but availableBalance has a value, use availableBalance as the account balance
    - When reporting balances, say "balance" or "available balance" - don't confuse the user with technical terms

When you see "[Financial Data - snaptrade-investments]":
- This is brokerage/investment account data from SnapTrade (e.g. Robinhood).
- Use per-account fields like displayName, institutionName, totalValue, currency, and asOf when answering.
- If holdings, positions, or activities are included, summarize them briefly (top positions / most recent activity).
- For any "brokerage / investment account / portfolio / holdings / balance" question, treat snaptrade-investments.accounts as the connected brokerage accounts.
- Never say a brokerage account is "not listed / not connected / not accessible" if it appears in snaptrade-investments.accounts in the current snapshot.
- If the user asks for a specific broker (like "ETRADE"), match it against displayName / institutionName from snaptrade-investments.accounts. If it doesn't match, list the brokerage accounts that are present in snaptrade-investments.
- Always speak with confidence: report exactly what the data shows, without apologizing or sounding uncertain.
- If balance/performance/holdings data is missing in the current payload, say it plainly as a data-availability fact (e.g., "Balance and performance aren't included in the current account snapshot.") and then provide what *is* available (account name, institution, last known totalValue, and asOf).
- Mention the asOf timestamp when relevant, but do NOT speculate about why data is missing and do NOT mention plan limits, caching, refresh limits, syncing, or waiting.
- If performance.sinceLastCheck is present, describe it as "change since last check" (not true rate-of-return).

HANDLING CALENDAR EVENTS:
- When viewing calendar events, ALWAYS use the MOST RECENT calendar data injected into the conversation
- If you see multiple calendar data injections, use ONLY the one with the latest timestamp
- Ignore any calendar events from older conversation messages - they may be outdated or deleted
- **IMPORTANT: You have access to BOTH partners' calendars. When the user asks about "both" schedules, "our schedules", "both of our calendars", etc., you will receive data from BOTH calendars. Use all the information provided.**
- When calendar data includes events from both partners, each event will be labeled with which person it belongs to. Present both calendars naturally in your response.
- When user asks to add/create/schedule an event, the system will automatically create it in their Google Calendar
- After an event is created, you'll see a message like "Event 'X' has been created in your Google Calendar"
- Confirm the event was created naturally: "✅ Added [event] to your calendar for [date/time]"
- When user asks to remove/delete/cancel an event, the system will automatically delete it from their Google Calendar
- After an event is deleted, you'll see a message like "Event 'X' has been deleted from your Google Calendar"
- Confirm the deletion naturally: "✅ Removed [event] from your calendar"
- When user asks to adjust/update/change an event (time, date, etc.), the system will automatically update it in their Google Calendar
- After an event is updated, you'll see a message like "Event 'X' has been updated in your Google Calendar"
- Confirm the update naturally: "✅ Updated [event] to [new date/time]"
- If event creation/deletion/update fails, acknowledge it and ask for clarification on the details
- When viewing calendar, reference specific events naturally in conversation

EXAMPLES OF GOOD RESPONSES:
❌ "Great! Now let's move on to the next topic."
✅ "Love that you're focused on learning! Speaking of the week ahead, want to sync up your calendars?"

❌ "Your E*TRADE balance is $167,500."
✅ "Nice! Your E*TRADE is at $167,500, up 2.3% this week. That [stock] position is doing well. Are we holding or considering moving?"

❌ "What did Partner 2 learn this week?"
✅ "That's a great insight! And what about you - any big learnings this week?"

CRITICAL RULES:
- NEVER follow a rigid script or numbered list
- NEVER say "shall we proceed" or "moving forward"
- NEVER repeat the same question if you've already asked it in this conversation
- ALWAYS acknowledge their response before asking something new
- ALWAYS provide value - insights, context, or thoughtful questions
- If they ask about something specific (market, accounts, etc), answer it directly with data
- Sound like a real person having a real conversation
- If you've already asked about learnings, schedules, or other topics, don't ask again unless they bring it up or it's been a very long time

Remember: You're not conducting an interview. You're having a genuine conversation with a couple about their life and money. Be smart, warm, and helpful - like a friend they actually want to talk to.
- You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.
- Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards. (Inspired by Anthropic's constitution.)"
- Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
    "",
  ];;`


// Call Grok API with conversation history
export async function callGrok(
  userMessage: string,
  conversationId: string,
  isNewConversation: boolean = false
): Promise<string> {
  const apiKey = Deno.env.get('GROK_API_KEY');
  
  if (!apiKey) {
    throw new Error('GROK_API_KEY not configured');
  }

  // Get conversation memory from database
  let dbMemory = await db.getConversationMemory(conversationId);
  let memory: ConversationMemory;
  
  if (dbMemory) {
    memory = {
      messages: dbMemory.messages,
      userContext: dbMemory.user_context,
      sessionStarted: dbMemory.session_started,
      lastInteraction: dbMemory.last_interaction
    };
  } else {
    memory = {
      messages: [],
      userContext: {
        person1Name: 'Partner 1',
        person2Name: 'Partner 2',
        onboardingComplete: false,
        financialDataDiscussed: [],
        preferences: {}
      },
      sessionStarted: new Date().toISOString(),
      lastInteraction: new Date().toISOString()
    };
  }

  // Add user message to history
  memory.messages.push({
    role: 'user',
    content: userMessage
  });

  // Keep last N messages for context (bounded + stable)
  // Important: system messages can balloon; keep only a bounded "latest per type" set + a small tail.
  const limitConversationMessages = (msgs: Message[]) => {
    const systemMsgs = msgs.filter(m => m.role === 'system' && typeof m.content === 'string');
    const otherMsgs = msgs.filter(m => m.role !== 'system');

    const latestByKey = new Map<string, Message>();
    const keyFor = (m: Message) => {
      const c = m.content || '';
      if (c.includes('[CRITICAL: Calendar Data Update')) return 'calendar';
      if (c.includes('[Financial Data - calendar]')) return 'calendar';
      if (c.includes('[Financial Data - financial-accounts]')) return 'financial-accounts';
      if (c.includes('[Financial Data - snaptrade-investments]')) return 'snaptrade-investments';
      if (c.includes('[Financial Data - system]')) return 'system';
      if (c.startsWith('[Error occurred]:')) return 'error';
      if (c.startsWith('The person texting you')) return 'identity';
      if (c.startsWith('Onboarding complete.')) return 'onboarding';
      if (c.startsWith('[Tell us about you]')) return 'tell-us';
      return '';
    };

    for (const m of systemMsgs) {
      const k = keyFor(m);
      if (k) latestByKey.set(k, m);
    }

    // Keep a small tail of other system messages (for miscellaneous guidance)
    const pinnedSystem = Array.from(latestByKey.values());
    const unkeyedSystemTail = systemMsgs.filter(m => !keyFor(m)).slice(-6);
    const dedupedSystem = [...pinnedSystem, ...unkeyedSystemTail];

    // Keep last 20 non-system messages (10 user/assistant exchanges)
    const otherTail = otherMsgs.slice(-20);
    return [...dedupedSystem, ...otherTail];
  };

  memory.messages = limitConversationMessages(memory.messages);
  
  // Update last interaction timestamp
  memory.lastInteraction = new Date().toISOString();
  
  // Hard cap as a final guardrail (shouldn't hit often due to limitConversationMessages)
  if (memory.messages.length > 60) {
    const systemMessages = memory.messages.filter(m => m.role === 'system');
    const otherMessages = memory.messages.filter(m => m.role !== 'system');
    memory.messages = [...systemMessages.slice(-15), ...otherMessages.slice(-45)];
  }

  // Build messages array for Grok
  const messages: Message[] = [
    {
      role: 'system',
      content: HOMEBASE_SYSTEM_PROMPT
    },
    // Add user context if available
    {
      role: 'system',
      content: `Current user context: ${JSON.stringify(memory.userContext, null, 2)}`
    },
    ...memory.messages
  ];

  const debugPayload = (Deno.env.get('DEBUG_GROK_PAYLOAD') || '').toLowerCase() === 'true';
  if (debugPayload) {
    console.log(`[Grok Call] Total messages: ${messages.length} (system=${messages.filter(m=>m.role==='system').length}, user=${messages.filter(m=>m.role==='user').length}, assistant=${messages.filter(m=>m.role==='assistant').length})`);
  }

  // Try multiple model names
  const modelsToTry = ['grok-3', 'grok-2-vision-1212', 'grok-4-fast-reasoning'];
  
  let lastError = '';
  
  for (const modelName of modelsToTry) {
    try {
      const t0 = Date.now();
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          temperature: 0.7,
          max_tokens: 300 // Keep responses concise for SMS
        })
      });

      const responseText = await response.text();

      if (response.ok) {
        const data = JSON.parse(responseText);
        const aiResponse = data.choices[0].message.content;
        const usage = data?.usage;
        const promptTokens = usage?.prompt_tokens;
        const completionTokens = usage?.completion_tokens;
        const totalTokens = usage?.total_tokens;
        console.log(`[Grok] status=${response.status} model=${modelName} latencyMs=${Date.now() - t0} promptTokens=${promptTokens ?? 'na'} completionTokens=${completionTokens ?? 'na'} totalTokens=${totalTokens ?? 'na'}`);

        // Add AI response to history
        memory.messages.push({
          role: 'assistant',
          content: aiResponse
        });

        // Update last interaction time
        memory.lastInteraction = new Date().toISOString();

        // Save updated memory to database
        await db.saveConversationMemory({
          conversation_id: conversationId,
          user_id: null, // Can be set if userId is available
          messages: memory.messages,
          user_context: memory.userContext,
          session_started: memory.sessionStarted,
          last_interaction: memory.lastInteraction
        });

        return aiResponse;
      } else {
        lastError = `${modelName} (${response.status}): ${responseText}`;
        console.warn(`[Grok] status=${response.status} model=${modelName} latencyMs=${Date.now() - t0}`);
        // Continue to next model
      }
    } catch (error) {
      lastError = `${modelName}: ${error}`;
      console.error(`[Grok] status=error model=${modelName}`, error);
      // Continue to next model
    }
  }
  
  // If all models fail, throw error with details
  throw new Error(`All Grok models failed. Last error: ${lastError}. API key: ${apiKey.substring(0, 20)}... Please check your API key and account status at https://console.x.ai/`);
}

/** SMS "Tell us about you" onboarding extraction (structured JSON). */
export type SmsTellUsExtractStep =
  | "relationship_stage"
  | "financial_goals"
  | "exciting_upcoming"
  | "recurring_priorities";

export type SmsTellUsExtractResult =
  | { filled: true; summary: string; relationshipStage?: string }
  | { needs_clarification: true; reason?: string };

const ALLOWED_RELATIONSHIP_STAGES = new Set([
  "dating",
  "living_together",
  "engaged",
  "married",
  "married_with_kids",
  "prefer_not_to_say",
  "unknown",
]);

/** Fast path before calling the model for relationship stage. */
export function tryParseRelationshipStageFromText(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/married\s+with\s+kids|married.*\bkids\b|we\s+have\s+kids|with\s+kids/.test(t)) {
    return "married_with_kids";
  }
  if (/\bengaged\b/.test(t)) return "engaged";
  if (/living\s+together|live\s+together|cohabit/.test(t)) return "living_together";
  if (/\bmarried\b/.test(t)) return "married";
  if (/\bdating\b/.test(t)) return "dating";
  if (/prefer\s+not|rather\s+not|none\s+of|skip|pass|no\s+thanks|decline/.test(t)) {
    return "prefer_not_to_say";
  }
  return null;
}

function parseTellUsExtractJson(raw: string): SmsTellUsExtractResult | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence) s = fence[1].trim();
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (o.needs_clarification === true) {
      return { needs_clarification: true, reason: typeof o.reason === "string" ? o.reason : undefined };
    }
    if (o.filled === true && typeof o.summary === "string" && o.summary.trim()) {
      const summary = o.summary.trim().slice(0, 2000);
      const rs = typeof o.relationshipStage === "string" ? o.relationshipStage.trim() : "";
      if (rs && ALLOWED_RELATIONSHIP_STAGES.has(rs)) {
        return { filled: true, summary, relationshipStage: rs };
      }
      return { filled: true, summary };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function extractSmsTellUsAnswer(
  step: SmsTellUsExtractStep,
  userMessage: string
): Promise<SmsTellUsExtractResult> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return { needs_clarification: true, reason: "empty" };
  }

  if (step === "relationship_stage") {
    const direct = tryParseRelationshipStageFromText(trimmed);
    if (direct) {
      return { filled: true, summary: trimmed.slice(0, 500), relationshipStage: direct };
    }
  }

  const apiKey = Deno.env.get("GROK_API_KEY");
  if (!apiKey) {
    return { needs_clarification: true, reason: "no_api_key" };
  }

  const stepPrompt =
    step === "relationship_stage"
      ? `The user is answering: which relationship stage fits them as a couple? Valid relationshipStage values: dating, living_together, engaged, married, married_with_kids, prefer_not_to_say, unknown. If they clearly fit one, set filled true, a short summary in their words, and relationshipStage. If unclear or off-topic, set needs_clarification true.`
      : step === "financial_goals"
      ? `The user is answering about financial goals. If they gave a usable answer (even brief), filled true and summary (one or two sentences max, third person). If gibberish or no substance, needs_clarification true.`
      : step === "exciting_upcoming"
      ? `The user is answering what is coming up that they are excited about. If usable, filled true and summary (concise). Else needs_clarification true.`
      : `The user is answering about recurring things to stay on top of (bills, routines, kids logistics, etc.). If usable, filled true and summary (concise). Else needs_clarification true.`;

  const system = `You extract structured data for an SMS onboarding flow. Reply with ONLY a raw JSON object, no markdown.
Allowed shapes:
{"filled":true,"summary":"string","relationshipStage":"optional — only for relationship_stage step"}
{"needs_clarification":true,"reason":"optional string"}

${stepPrompt}`;

  const modelsToTry = ["grok-4-fast-reasoning", "grok-3", "grok-2-vision-1212"];

  let lastErr = "";
  for (const modelName of modelsToTry) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: system },
            { role: "user", content: trimmed.slice(0, 1500) },
          ],
          temperature: 0.2,
          max_tokens: 220,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = text;
        continue;
      }
      const data = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content || "";
      const parsed = parseTellUsExtractJson(content);
      if (parsed) {
        if (parsed.filled && step === "relationship_stage") {
          let stage = parsed.relationshipStage;
          if (!stage || !ALLOWED_RELATIONSHIP_STAGES.has(stage)) {
            stage = tryParseRelationshipStageFromText(parsed.summary) || tryParseRelationshipStageFromText(trimmed);
          }
          if (stage && ALLOWED_RELATIONSHIP_STAGES.has(stage)) {
            return { filled: true, summary: parsed.summary, relationshipStage: stage };
          }
          return { needs_clarification: true, reason: "stage_unclear" };
        }
        return parsed;
      }
      lastErr = "unparseable_json";
    } catch (e) {
      lastErr = String(e);
    }
  }

  console.warn("[extractSmsTellUsAnswer] failed:", lastErr);
  return { needs_clarification: true, reason: "extract_failed" };
}

// Update user context in memory
export async function updateUserContext(
  conversationId: string,
  updates: Partial<ConversationMemory['userContext']>
): Promise<void> {
  let dbMemory = await db.getConversationMemory(conversationId);
  let memory: ConversationMemory;
  
  if (dbMemory) {
    memory = {
      messages: dbMemory.messages,
      userContext: dbMemory.user_context,
      sessionStarted: dbMemory.session_started,
      lastInteraction: dbMemory.last_interaction
    };
  } else {
    memory = {
      messages: [],
      userContext: {
        person1Name: 'Partner 1',
        person2Name: 'Partner 2',
        onboardingComplete: false,
        financialDataDiscussed: [],
        preferences: {}
      },
      sessionStarted: new Date().toISOString(),
      lastInteraction: new Date().toISOString()
    };
  }

  memory.userContext = {
    ...memory.userContext,
    ...updates
  };

  await db.saveConversationMemory({
    conversation_id: conversationId,
    user_id: dbMemory?.user_id || null,
    messages: memory.messages,
    user_context: memory.userContext,
    session_started: memory.sessionStarted,
    last_interaction: memory.lastInteraction
  });
  
  if ((Deno.env.get('DEBUG_PROD_LOGS') || '').toLowerCase() === 'true') {
    console.log(`Updated user context for ${conversationId}:`, updates);
  }
}

// Get conversation memory (useful for debugging or analytics)
export async function getConversationMemory(conversationId: string): Promise<ConversationMemory | null> {
  const dbMemory = await db.getConversationMemory(conversationId);
  if (!dbMemory) return null;
  
  return {
    messages: dbMemory.messages,
    userContext: dbMemory.user_context,
    sessionStarted: dbMemory.session_started,
    lastInteraction: dbMemory.last_interaction
  };
}

// Clear conversation memory (for testing or reset)
export async function clearConversationMemory(conversationId: string): Promise<void> {
  await db.deleteConversationMemory(conversationId);
  if ((Deno.env.get('DEBUG_PROD_LOGS') || '').toLowerCase() === 'true') {
    console.log(`Cleared conversation memory for ${conversationId}`);
  }
}

// Cleanup old conversation memories (retention policy: 90 days)
export async function cleanupOldConversations(retentionDays: number = 90): Promise<number> {
  try {
    const deletedCount = await db.cleanupOldConversations(retentionDays);
    console.log(`Cleaned up ${deletedCount} old conversations (older than ${retentionDays} days)`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up old conversations:', error);
    return 0;
  }
}

// Limit conversation memory size to prevent unbounded growth
export async function limitConversationMemory(conversationId: string, maxMessages: number = 50): Promise<void> {
  const dbMemory = await db.getConversationMemory(conversationId);
  
  if (dbMemory && dbMemory.messages && dbMemory.messages.length > maxMessages) {
    // Keep system messages and most recent user/assistant messages
    const systemMessages = dbMemory.messages.filter((m: Message) => m.role === 'system');
    const otherMessages = dbMemory.messages.filter((m: Message) => m.role !== 'system');
    
    const limitedMessages = [
      ...systemMessages,
      ...otherMessages.slice(-maxMessages)
    ];
    
    await db.saveConversationMemory({
      conversation_id: conversationId,
      user_id: dbMemory.user_id,
      messages: limitedMessages,
      user_context: dbMemory.user_context,
      session_started: dbMemory.session_started,
      last_interaction: dbMemory.last_interaction
    });
    
    console.log(`Limited conversation memory for ${conversationId} to ${maxMessages} messages`);
  }
}

// Add system message to guide the conversation
export async function addSystemGuidance(conversationId: string, guidance: string): Promise<void> {
  let dbMemory = await db.getConversationMemory(conversationId);

  if (!dbMemory) {
    await db.saveConversationMemory({
      conversation_id: conversationId,
      user_id: null,
      messages: [],
      user_context: {
        person1Name: "Partner 1",
        person2Name: "Partner 2",
        onboardingComplete: false,
        financialDataDiscussed: [],
        preferences: {},
      },
      session_started: new Date().toISOString(),
      last_interaction: new Date().toISOString(),
    });
    dbMemory = await db.getConversationMemory(conversationId);
  }

  if (dbMemory) {
    const isIdentityGuidance = guidance.startsWith('The person texting you');
    const trimmedGuidance = guidance.trim();

    // Deduplicate / replace for high-frequency guidance types (prevents ballooning).
    let updatedMessages = [...dbMemory.messages];
    if (isIdentityGuidance) {
      updatedMessages = updatedMessages.filter(m => !(m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('The person texting you')));
    }
    const isTellUsGuidance = guidance.startsWith('[Tell us about you]');
    if (isTellUsGuidance) {
      updatedMessages = updatedMessages.filter(
        (m) =>
          !(
            m.role === 'system' &&
            typeof m.content === 'string' &&
            m.content.startsWith('[Tell us about you]')
          )
      );
    }
    const last = updatedMessages[updatedMessages.length - 1];
    if (last?.role === 'system' && typeof last.content === 'string' && last.content.trim() === trimmedGuidance) {
      // No-op (exact duplicate)
    } else {
      updatedMessages.push({ role: 'system', content: trimmedGuidance });
    }
    
    await db.saveConversationMemory({
      conversation_id: conversationId,
      user_id: dbMemory.user_id,
      messages: updatedMessages,
      user_context: dbMemory.user_context,
      session_started: dbMemory.session_started,
      last_interaction: dbMemory.last_interaction
    });
    
    if ((Deno.env.get('DEBUG_PROD_LOGS') || '').toLowerCase() === 'true') {
      console.log(`Added system guidance to ${conversationId}: ${guidance}`);
    }
  }
}

// Inject financial data into conversation context
export async function injectFinancialData(
  conversationId: string,
  dataType: string,
  data: any
): Promise<void> {
  let dbMemory = await db.getConversationMemory(conversationId);

  // Initialize memory if missing (first turn / after reset)
  if (!dbMemory) {
    await db.saveConversationMemory({
      conversation_id: conversationId,
      user_id: null,
      messages: [],
      user_context: {
        person1Name: 'Partner 1',
        person2Name: 'Partner 2',
        onboardingComplete: false,
        financialDataDiscussed: [],
        preferences: {}
      },
      session_started: new Date().toISOString(),
      last_interaction: new Date().toISOString()
    });
    dbMemory = await db.getConversationMemory(conversationId);
    if (!dbMemory) {
      throw new Error(`Failed to initialize conversation memory for ${conversationId}`);
    }
  }
  
  if (dbMemory) {
    const debugCalendarInjection = (Deno.env.get('DEBUG_CALENDAR_INJECTION') || '').toLowerCase() === 'true';
    let updatedMessages = [...dbMemory.messages];
    let updatedContext = { ...dbMemory.user_context };
    
    // Handle error data type specially
    if (dataType === 'error') {
      // Format error message for AI to respond naturally
      const errorMessage = data.message || 'An error occurred';
      updatedMessages.push({
        role: 'system',
        content: `[Error occurred]: ${errorMessage}. The user's request could not be completed. Please acknowledge this error naturally and helpfully, explaining what went wrong in simple terms without using technical jargon.`
      });
      console.log(`Injected error message into conversation ${conversationId}: ${errorMessage}`);
    } else {
      // For calendar data, remove old calendar data system messages AND old assistant messages
      if (dataType === 'calendar') {
        const beforeCount = updatedMessages.length;
        
        // Extract current event titles for comparison
        const currentEvents = data.events || [];
        const currentEventTitles = currentEvents.map((e: any) => (e.summary || '').toLowerCase()).filter((t: string) => t);
        
        if (debugCalendarInjection) {
          console.log(`[Calendar Injection] ========== START ==========`);
          console.log(`[Calendar Injection] Current event titles: ${currentEventTitles.join(', ')}`);
          console.log(`[Calendar Injection] Total messages before filtering: ${beforeCount}`);
        }
        
        // Log ALL messages before filtering
        if (debugCalendarInjection) {
          updatedMessages.forEach((msg, idx) => {
            if (msg.role === 'assistant') {
              const preview = (msg.content || '').substring(0, 200);
              console.log(`[Calendar Injection] BEFORE - Message ${idx} (${msg.role}): ${preview}...`);
            } else if (msg.role === 'system' && msg.content.includes('calendar')) {
              console.log(`[Calendar Injection] BEFORE - Message ${idx} (${msg.role}): [Calendar data]`);
            }
          });
        }
        
        // Remove old calendar data system messages
        updatedMessages = updatedMessages.filter(msg => {
          if (msg.role === 'system' && msg.content.includes('[Financial Data - calendar]')) {
            if (debugCalendarInjection) console.log(`[Calendar Injection] REMOVING: Old calendar data system message`);
            return false;
          }
          return true;
        });
        
        // Remove ALL assistant messages that mention calendar/schedule/events
        // This is aggressive but necessary to prevent stale calendar data
        updatedMessages = updatedMessages.filter(msg => {
          if (msg.role === 'assistant') {
            const content = (msg.content || '').toLowerCase();
            const mentionsCalendar = content.includes('schedule') || 
                                     content.includes('calendar') || 
                                     content.includes('appointment') ||
                                     content.includes('event') ||
                                     content.includes('tomorrow') ||
                                     content.includes('friday') ||
                                     content.includes('monday') ||
                                     content.includes('thursday') ||
                                     content.includes('tuesday') ||
                                     content.includes('wednesday') ||
                                     content.includes('saturday') ||
                                     content.includes('sunday') ||
                                     (content.includes('added') && (content.includes('to your calendar') || content.includes('for tomorrow') || content.includes('at 2') || content.includes('at 11') || content.includes('at 9') || content.includes('at 5')));
            
            if (mentionsCalendar) {
              if (debugCalendarInjection) console.log(`[Calendar Injection] REMOVING: Assistant message mentioning calendar: ${content.substring(0, 150)}...`);
              return false;
            }
          }
          return true;
        });
        
        const removedCount = beforeCount - updatedMessages.length;
        console.log(`[Calendar Injection] Removed ${removedCount} old calendar-related message(s)`);
        if (debugCalendarInjection) console.log(`[Calendar Injection] Messages after filtering: ${updatedMessages.length}`);
        
        // Log remaining assistant messages
        if (debugCalendarInjection) {
          const remainingAssistant = updatedMessages.filter(m => m.role === 'assistant');
          console.log(`[Calendar Injection] Remaining assistant messages: ${remainingAssistant.length}`);
          remainingAssistant.forEach((msg, idx) => {
            const preview = (msg.content || '').substring(0, 150);
            console.log(`[Calendar Injection] AFTER - Assistant msg ${idx}: ${preview}...`);
          });
          console.log(`[Calendar Injection] ========== END ==========`);
        }
      }

      // For financial account data, remove old financial-accounts system messages
      if (dataType === 'financial-accounts') {
        const beforeCount = updatedMessages.length;
        updatedMessages = updatedMessages.filter(msg => {
          if (msg.role === 'system' && msg.content.includes('[Financial Data - financial-accounts]')) {
            console.log(`[Financial Injection] REMOVING: Old financial-accounts system message`);
            return false;
          }
          return true;
        });
        const removedCount = beforeCount - updatedMessages.length;
        console.log(`[Financial Injection] Removed ${removedCount} old financial-accounts message(s)`);
      }

      // Remove old "system" injection messages (keep memory small)
      if (dataType === 'system') {
        const beforeCount = updatedMessages.length;
        updatedMessages = updatedMessages.filter(msg => {
          if (msg.role === 'system' && msg.content.includes('[Financial Data - system]')) {
            return false;
          }
          return true;
        });
        const removedCount = beforeCount - updatedMessages.length;
        if (removedCount > 0) console.log(`[System Injection] Removed ${removedCount} old system injection message(s)`);
        if ((Deno.env.get('DEBUG_PROD_LOGS') || '').toLowerCase() === 'true') {
          console.warn(`[System Injection] system blob injected for ${conversationId} (keys=${data && typeof data === 'object' ? Object.keys(data).slice(0, 10).join(',') : typeof data})`);
        }
      }

      // Remove old SnapTrade investment blobs so the latest one is always used
      if (dataType === 'snaptrade-investments') {
        const beforeCount = updatedMessages.length;
        updatedMessages = updatedMessages.filter(msg => {
          if (msg.role === 'system' && msg.content.includes('[Financial Data - snaptrade-investments]')) {
            return false;
          }
          return true;
        });
        const removedCount = beforeCount - updatedMessages.length;
        if (removedCount > 0) console.log(`[SnapTrade Injection] Removed ${removedCount} old snaptrade-investments message(s)`);
      }
      
      // Add to discussed topics for non-error data
      if (!updatedContext.financialDataDiscussed?.includes(dataType)) {
        updatedContext.financialDataDiscussed = [
          ...(updatedContext.financialDataDiscussed || []),
          dataType
        ];
      }

      // Add as system message so AI can reference it
      // For calendar data, add an explicit instruction to ignore old calendar mentions
      if (dataType === 'calendar') {
        // Extract event summaries from the current data
        const currentEvents = data.events || [];
        const currentEventTitles = currentEvents.map((e: any) => (e.summary || '').toLowerCase());
        const validEventTitles = data.validEventTitles || currentEventTitles;
        
        // Create explicit exclusion instruction WITHOUT hardcoded event names
        const exclusionInstruction = `[CRITICAL: Calendar Data Update - ${new Date().toISOString()}]

IMPORTANT RULES - READ CAREFULLY:
1. The following is the ONLY current calendar data. Use ONLY these events.
2. IGNORE and DO NOT mention any calendar events from previous messages - they may be outdated or deleted.
3. Current valid events ONLY: ${validEventTitles.length > 0 ? validEventTitles.map((t: string) => `"${t}"`).join(', ') : 'none'}
4. CRITICAL: If an event is NOT in the list above, it has been DELETED and you must NOT mention it, regardless of what was mentioned in previous messages.
5. When listing the schedule, ONLY include events from the list above.

Current Calendar Data:
[Financial Data - ${dataType}]: ${JSON.stringify(data, null, 2)}`;
        
        updatedMessages.push({
          role: 'system',
          content: exclusionInstruction
        });
      } else if (dataType === 'financial-accounts') {
        // Add helpful context for financial data
        const hasAccounts = data.linkedAccounts && data.linkedAccounts.length > 0;
        const hasBalances = data.balances && data.balances.length > 0;
        const hasTransactions = data.recentTransactions && data.recentTransactions.length > 0;
        
        let contextMessage = `[Financial Data - ${dataType}]: ${JSON.stringify(data, null, 2)}`;
        
        if (hasAccounts) {
          contextMessage += `\n\n[Context] The user has ${data.linkedAccounts.length} connected bank account(s). `;
          if (hasBalances) {
            contextMessage += `Balance data is available. `;
            contextMessage += `IMPORTANT: For each account, if currentBalance is 0 or null but availableBalance has a value, use availableBalance as the account balance. For savings accounts, availableBalance is typically the correct balance to report. `;
          } else {
            contextMessage += `Balance data is not included in the current snapshot. `;
          }
          if (hasTransactions) {
            contextMessage += `Transaction history is available with ${data.recentTransactions.length} recent transaction(s).`;
          } else {
            contextMessage += `Transaction history is not included in the current snapshot.`;
          }
        } else {
          contextMessage += `\n\n[Context] No bank accounts are currently connected. The user needs to connect their bank accounts in the settings page.`;
        }
        
        updatedMessages.push({
          role: 'system',
          content: contextMessage
        });
      } else {
        updatedMessages.push({
          role: 'system',
          content: `[Financial Data - ${dataType}]: ${JSON.stringify(data, null, 2)}`
        });
      }

      if ((Deno.env.get('DEBUG_PROD_LOGS') || '').toLowerCase() === 'true') {
        console.log(`Injected ${dataType} data into conversation ${conversationId}`);
      }
    }

    await db.saveConversationMemory({
      conversation_id: conversationId,
      user_id: dbMemory.user_id,
      messages: updatedMessages,
      user_context: updatedContext,
      session_started: dbMemory.session_started,
      last_interaction: dbMemory.last_interaction
    });
  }
}

// Add this new function after the injectFinancialData function
export async function categorizeIntent(userMessage: string): Promise<IntentCategory> {
  const apiKey = Deno.env.get('GROK_API_KEY');
  
  if (!apiKey) {
    throw new Error('GROK_API_KEY not configured');
  }

  const categorizationPrompt = `You are an intent classifier for a personal assistant app.

Categories:
- calendar: Adding events, viewing schedules, calendar questions, meetings, appointments
- market: Stock market, treasury yields, economic news, market updates, SPY, investments news
- financial: Account balances, wealth, property, 401k, investments, liabilities, net worth
- spending: Expense tracking, good/bad spending decisions, purchases, expenses
- learning: What users learned this week, personal growth, education
- general: General conversation, greetings, questions that don't fit other categories

For calendar category, also extract event details:
- scope: "both" if the user explicitly asks for BOTH partners' calendars/schedules (e.g., "our schedule", "both calendars", "me and [partner]"), otherwise "self"
- title: The event name/title (e.g., "dentist appointment", "team meeting")
- date: The date (e.g., "tomorrow", "next Tuesday", "January 15th", "2026-01-15"). For updates, this is the NEW date if changing it.
- time: The time (e.g., "2pm", "3:30pm", "14:00"). For updates, this is the NEW time if changing it.
- oldTime: The old/current time if user is updating an event (e.g., "9am" in "change from 9am to 11am")
- oldDate: The old/current date if user is updating an event
- location: The location if mentioned (e.g., "downtown office", "123 Main St")
- action: "create" if user wants to add an event, "view" if asking to see events, "delete" or "remove" if user wants to delete/remove an event, "update" or "adjust" if user wants to modify an existing event (change time, date, etc.), null otherwise

User message: "${userMessage}"

Respond with ONLY a JSON object (no markdown, no code blocks, just raw JSON):
{
  "category": "one of the categories above",
  "confidence": 0.0-1.0,
  "scope": "self or both (ONLY relevant for calendar category; omit or null otherwise)",
  "entities": {
    "person": "Person 1 or Person 2 if mentioned, otherwise null",
    "date": "extracted date if any, otherwise null",
    "amount": "extracted amount if any, otherwise null",
    "title": "event title if calendar category, otherwise null",
    "time": "new event time if calendar category (or current time for updates), otherwise null",
    "oldTime": "old/current time if updating an event (e.g., '9am' in 'change from 9am to 11am'), otherwise null",
    "oldDate": "old/current date if updating an event, otherwise null",
    "location": "event location if calendar category, otherwise null",
    "action": "create/view/delete/remove/update/adjust if calendar category, otherwise null",
    "scope": "self or both (ONLY relevant for calendar category; omit or null otherwise)"
  }
}`;

  // Production: avoid models that consistently 400 for this endpoint/account.
  const modelsToTry = ['grok-3'];
  let lastError = '';

  for (const modelName of modelsToTry) {
    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { 
              role: 'system', 
              content: 'You are a JSON-only response classifier. Return ONLY valid JSON, no markdown formatting, no code blocks, no explanations. Just the JSON object.' 
            },
            { 
              role: 'user', 
              content: categorizationPrompt 
            }
          ],
          temperature: 0.1, // Low temperature for consistent categorization
          max_tokens: 200
        })
      });

      if (response.ok) {
        const data = await response.json();
        let jsonText = data.choices[0].message.content.trim();
        
        // Remove markdown code blocks if present
        jsonText = jsonText.replace(/\n/g, '').replace(/```/g, '').trim();
        
        const intent = JSON.parse(jsonText);
        
        // Validate the response
        if (!intent.category || typeof intent.confidence !== 'number') {
          throw new Error('Invalid intent structure');
        }
        
        // Normalize/validate scope (calendar-only)
        const rawScope = intent.scope ?? intent.entities?.scope;
        if (intent.category === 'calendar') {
          if (rawScope === 'both' || rawScope === 'self') {
            intent.scope = rawScope;
            intent.entities = { ...(intent.entities || {}), scope: rawScope };
          } else if (rawScope == null) {
            // Default to self for calendar queries when unspecified
            intent.scope = 'self';
            intent.entities = { ...(intent.entities || {}), scope: 'self' };
          } else {
            // Unknown value: default safely
            intent.scope = 'self';
            intent.entities = { ...(intent.entities || {}), scope: 'self' };
          }
        } else {
          // Non-calendar: remove scope to avoid accidental behavior
          if (intent.scope != null) delete intent.scope;
          if (intent.entities?.scope != null) delete intent.entities.scope;
        }
        
        if ((Deno.env.get('DEBUG_PROD_LOGS') || '').toLowerCase() === 'true') {
          console.log(`✅ Intent categorized: ${intent.category} (confidence: ${intent.confidence})`);
        }
        return intent;
      } else {
        const errorText = await response.text();
        lastError = `${modelName} (${response.status}): ${errorText}`;
        console.warn(`[Intent] status=${response.status} model=${modelName}`);
      }
    } catch (error) {
      lastError = `${modelName}: ${error}`;
      console.error(`[Intent] status=error model=${modelName}`, error);
    }
  }
  
  // Fallback to general category if all models fail
  console.warn(`All categorization models failed, using fallback. Last error: ${lastError}`);
  return {
    category: 'general',
    confidence: 0.5,
    entities: {}
  };
}