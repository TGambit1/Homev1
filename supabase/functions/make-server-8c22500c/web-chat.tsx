import { Hono } from "npm:hono";
import { callGrok, updateUserContext, addSystemGuidance, injectFinancialData, categorizeIntent } from "./grok-ai.tsx";
import * as kv from "./kv_store.tsx";
import * as db from "./db.tsx";
import { getCalendarImageUrl, type CalendarRange } from "./calendar-image.tsx";

const FUNCTION_BASE_URL = Deno.env.get("FUNCTION_BASE_URL") || "http://localhost:54321/functions/v1";
const PUBLIC_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const app = new Hono();

/** Set to true to attach calendar image URL(s) to chat response. When false, calendar is words-only. */
const USE_CALENDAR_IMAGE = false;

// Detect which person is mentioned in the message (parity with Twilio)
function detectPersonFromMessage(
  messageText: string,
  person1Name: string,
  person2Name: string
): 'person1' | 'person2' | 'both' | null {
  const text = messageText.toLowerCase();
  const person1Lower = person1Name.toLowerCase();
  const person2Lower = person2Name.toLowerCase();
  const bothIndicators = ['both', 'both of', 'both of our', 'both of ours', 'our schedules', 'our calendar', 'our calendars', 'we', 'us'];
  const hasBothIndicator = bothIndicators.some(indicator => {
    const calendarKeywords = ['schedule', 'schedules', 'calendar', 'calendars', 'events', 'plans', 'plannings'];
    return calendarKeywords.some(keyword => {
      const indicatorIndex = text.indexOf(indicator);
      const keywordIndex = text.indexOf(keyword);
      return indicatorIndex !== -1 && keywordIndex !== -1 && Math.abs(indicatorIndex - keywordIndex) < 50;
    });
  });
  if (hasBothIndicator) return 'both';
  if (text.includes(person2Lower)) return 'person2';
  if (text.includes(person1Lower)) return 'person1';
  return null;
}

// Handle OPTIONS requests for CORS preflight
app.options("*", async (c) => {
  return c.text("", 200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
  });
});


// Categorization endpoint
app.post("/make-server-8c22500c/chat/categorize", async (c) => {
  try {
    const body = await c.req.json();
    const { message } = body;

    if (!message) {
      return c.json({ success: false, error: 'Missing message' }, 400);
    }

    console.log(`Categorizing intent for message: ${message}`);

    const intent = await categorizeIntent(message);

    return c.json({ 
      success: true, 
      intent: intent 
    });
  } catch (error) {
    console.error('Error categorizing intent:', error);
    return c.json({ 
      success: false, 
      error: String(error),
      intent: { category: 'general', confidence: 0.5, entities: {} }
    }, 500);
  }
});

// Web chat endpoint for frontend
app.post("/make-server-8c22500c/chat", async (c) => {
  try {
    const body = await c.req.json();
    const { message, sessionId, intent: intentFromBody, userId, partnerRole, calendarRange } = body;

    if (!message || !sessionId) {
      return c.json({ success: false, error: 'Missing message or sessionId' }, 400);
    }

    console.log(`Received web chat message from session ${sessionId}: ${message}`);
    if (intentFromBody) {
      console.log(`Intent: ${intentFromBody.category} (confidence: ${intentFromBody.confidence})`);
    }

    // Use session ID as conversation ID
    const conversationId = `web:${sessionId}`;

    // Get or create conversation state
    const stateKey = `web:state:${sessionId}`;
    let conversationState = await kv.get(stateKey) || {
      isFirstMessage: true,
      person1Name: 'Partner 1',
      person2Name: 'Partner 2',
      onboardingComplete: false,
      lastMessageTime: new Date().toISOString()
    };

    // Load user for DB names and calendar "both" / person detection (parity with Twilio)
    let user: { person1_name?: string; person2_name?: string } | null = null;
    if (userId && userId !== 'default') {
      try {
        user = await db.getUserById(userId);
      } catch (_) {
        // ignore
      }
    }
    const dbPerson1Name = user?.person1_name || 'Partner 1';
    const dbPerson2Name = user?.person2_name || 'Partner 2';

    // If calendar view intent and userId present, optionally attach calendar image URL(s) (when USE_CALENDAR_IMAGE is true)
    let calendarImageUrl: string | undefined;
    let calendarImageUrls: string[] | undefined;
    if (USE_CALENDAR_IMAGE && userId) {
      const intent = intentFromBody ?? await categorizeIntent(message).catch(() => ({ category: 'general', confidence: 0, entities: {} }));
      const action = intent.entities?.action;
      const isCalendarView = intent.category === 'calendar' && (!action || action === 'view');
      if (isCalendarView && (intent.confidence >= 0.5)) {
        const range = (calendarRange === '1d' || calendarRange === '3d' || calendarRange === '1w' || calendarRange === '2w' || calendarRange === '1m')
          ? calendarRange as CalendarRange
          : '1w';
        const requestedPerson = detectPersonFromMessage(message, dbPerson1Name, dbPerson2Name);
        if (requestedPerson === 'both') {
          const urls: string[] = [];
          try {
            const url1 = await getCalendarImageUrl(userId, 'person1', { range, title: `${dbPerson1Name}'s Calendar` });
            urls.push(url1);
          } catch (e1) {
            console.warn('[Web chat] Calendar image for person1 failed:', e1);
          }
          try {
            const url2 = await getCalendarImageUrl(userId, 'person2', { range, title: `${dbPerson2Name}'s Calendar` });
            urls.push(url2);
          } catch (e2) {
            console.warn('[Web chat] Calendar image for person2 failed:', e2);
          }
          if (urls.length > 0) {
            calendarImageUrls = urls;
            calendarImageUrl = urls[0];
          }
        } else {
          const partnerRoleToUse = requestedPerson || (partnerRole === 'person2' ? 'person2' : 'person1');
          const name = partnerRoleToUse === 'person1' ? dbPerson1Name : dbPerson2Name;
          try {
            calendarImageUrl = await getCalendarImageUrl(userId, partnerRoleToUse, {
              range,
              title: `${name}'s Calendar`,
            });
          } catch (imgErr) {
            console.error('[Web chat] Calendar image failed:', imgErr);
          }
        }
      }
    }

    // Process the message with Grok AI
    const response = await processWebMessage(
      conversationId,
      sessionId,
      message,
      conversationState
    );

    // Update conversation state
    conversationState.isFirstMessage = false;
    conversationState.lastMessageTime = new Date().toISOString();
    await kv.set(stateKey, conversationState);

    const payload: { success: true; response: string; calendarImageUrl?: string; calendarImageUrls?: string[] } = { success: true, response };
    if (USE_CALENDAR_IMAGE && calendarImageUrl) payload.calendarImageUrl = calendarImageUrl;
    if (USE_CALENDAR_IMAGE && calendarImageUrls && calendarImageUrls.length > 1) payload.calendarImageUrls = calendarImageUrls;
    return c.json(payload);
  } catch (error) {
    console.error('Error processing web chat message:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Process web chat message with Grok AI
async function processWebMessage(
  conversationId: string,
  sessionId: string,
  text: string,
  state: any
): Promise<string> {
  const userInput = text.trim();

  // Handle first-time greeting
  if (state.isFirstMessage) {
    await updateUserContext(conversationId, {
      person1Name: state.person1Name,
      person2Name: state.person2Name,
      onboardingComplete: false,
      financialDataDiscussed: [],
      preferences: {}
    });
    
    // Provide system guidance for onboarding
    await addSystemGuidance(
      conversationId,
      'User is new. Start with a brief greeting and ask if they want to start onboarding or skip to weekly check-in. Keep it friendly and conversational.'
    );
  }

  // Detect if user is providing names (relaxed: only accept short, name-like parts – parity with Twilio)
  if (!state.onboardingComplete && (userInput.includes('&') || userInput.toLowerCase().includes(' and '))) {
    const names = text.split(/&|\s+and\s+/i).map((n: string) => n.trim()).filter(Boolean);
    const looksLikeName = (s: string) => {
      if (s.length > 30) return false;
      const words = s.split(/\s+/);
      if (words.length > 3) return false;
      if (/[?!.]/.test(s)) return false;
      if (/^(can you|please|let me|i want|check on|what is)/i.test(s)) return false;
      return true;
    };
    if (names.length >= 2 && looksLikeName(names[0]) && looksLikeName(names[1])) {
      state.person1Name = names[0];
      state.person2Name = names[1];
      state.onboardingComplete = true;

      await updateUserContext(conversationId, {
        person1Name: names[0],
        person2Name: names[1],
        onboardingComplete: true
      });

      await addSystemGuidance(
        conversationId,
        `Onboarding complete. Names: ${names[0]} and ${names[1]}. Now begin the weekly check-in conversation naturally. Start by asking about their week or what they learned.`
      );
    }
  }

  // Detect home intent — route to home sub-agent
  const isHomeIntent = /\b(home value|equity|mortgage|house worth|property value|maintenance|hvac|roof|gutter|repair|home report|home update|rentcast)\b/i.test(userInput);

  if (isHomeIntent) {
    try {
      console.log('[WebChat] Routing to home sub-agent');
      const homeResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/home/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PUBLIC_ANON_KEY}` },
          body: JSON.stringify({ message: userInput, sessionId }),
        }
      );
      if (homeResponse.ok) {
        const data = await homeResponse.json();
        if (data.success) return data.response;
      }
    } catch (error) {
      console.error('[WebChat] Home sub-agent error:', error);
    }
  }

  // Detect travel intent — route to travel sub-agent
  const isTravelIntent = /\b(flight|hotel|trip|travel|passport|visa|itinerary|vacation|destination|book.*travel|travel.*book|price.*drop|watch.*flight|family.*trip|where.*fly|where.*go)\b/i.test(userInput);

  if (isTravelIntent) {
    try {
      console.log('[WebChat] Routing to travel sub-agent');
      const travelResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/travel/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PUBLIC_ANON_KEY}` },
          body: JSON.stringify({ message: userInput, sessionId }),
        }
      );
      if (travelResponse.ok) {
        const data = await travelResponse.json();
        if (data.success) return data.response;
      }
    } catch (error) {
      console.error('[WebChat] Travel sub-agent error:', error);
    }
  }

  // Detect grocery/meal planning intent — route to meal planner sub-agent
  const isGroceryIntent = /\b(grocery|groceries|meal plan|shopping list|dinner (ideas|plan)|what('s| is) for dinner|weekly meals|generate.*plan|plan.*week|recipe queue|pending recipes)\b/i.test(userInput);

  if (isGroceryIntent) {
    try {
      console.log('[WebChat] Routing to meal planner sub-agent');
      const mealsResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/meals/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PUBLIC_ANON_KEY}`,
          },
          body: JSON.stringify({ message: userInput, sessionId }),
        }
      );
      if (mealsResponse.ok) {
        const data = await mealsResponse.json();
        if (data.success) return data.response;
      }
    } catch (error) {
      console.error('[WebChat] Meal planner sub-agent error:', error);
      // Fall through to Grok
    }
  }

  // Call Grok AI with the user's message
  try {
    const aiResponse = await callGrok(userInput, conversationId, state.isFirstMessage);
    return aiResponse;
  } catch (error) {
    console.error('Grok AI error:', error);
    
    // Check for specific error types
    const errorMessage = String(error);
    
    if (errorMessage.includes('credits') || errorMessage.includes('403')) {
      return "⚠️ The Grok API needs credits to work. Please add credits at https://console.x.ai/team/41e05143-cf37-4de8-86f3-67746dad3c9a\n\nOnce you add credits, I'll be fully operational!";
    }
    
    if (errorMessage.includes('GROK_API_KEY not configured')) {
      return "⚠️ Grok API key is not configured. Please check your environment variables.";
    }
    
    return `I'm having trouble connecting right now. Error: ${errorMessage.substring(0, 100)}... Can you try again in a moment?`;
  }
}

// Endpoint to update user context manually (for when web app collects names via form)
app.post("/make-server-8c22500c/chat/context", async (c) => {
  try {
    const body = await c.req.json();
    const { sessionId, person1Name, person2Name } = body;

    if (!sessionId) {
      return c.json({ success: false, error: 'Missing sessionId' }, 400);
    }

    const conversationId = `web:${sessionId}`;
    
    await updateUserContext(conversationId, {
      person1Name: person1Name || 'Partner 1',
      person2Name: person2Name || 'Partner 2',
      onboardingComplete: true,
      financialDataDiscussed: [],
      preferences: {}
    });

    // Update state
    const stateKey = `web:state:${sessionId}`;
    await kv.set(stateKey, {
      isFirstMessage: false,
      person1Name: person1Name || 'Partner 1',
      person2Name: person2Name || 'Partner 2',
      onboardingComplete: true,
      lastMessageTime: new Date().toISOString()
    });

    return c.json({ success: true, message: 'Context updated' });
  } catch (error) {
    console.error('Error updating context:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Endpoint to inject financial data into conversation
app.post("/make-server-8c22500c/chat/inject-data", async (c) => {
  try {
    const body = await c.req.json();
    const { sessionId, dataType, data } = body;

    if (!sessionId || !dataType || !data) {
      return c.json({ success: false, error: 'Missing required fields' }, 400);
    }

    const conversationId = `web:${sessionId}`;
    await injectFinancialData(conversationId, dataType, data);

    return c.json({ success: true, message: 'Data injected' });
  } catch (error) {
    console.error('Error injecting data:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Cleanup endpoint for old conversations and expired sessions
app.post("/make-server-8c22500c/chat/cleanup", async (c) => {
  try {
    const { retentionDays = 90 } = await c.req.json();
    
    // Import cleanup functions
    const { cleanupOldConversations } = await import("./grok-ai.tsx");
    
    const deletedConversations = await cleanupOldConversations(retentionDays);
    
    // Note: Session cleanup happens automatically during verify
    // But we could add explicit cleanup here if needed
    
    return c.json({ 
      success: true, 
      message: 'Cleanup completed',
      deletedConversations,
      retentionDays
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export { app as webChatRoutes };