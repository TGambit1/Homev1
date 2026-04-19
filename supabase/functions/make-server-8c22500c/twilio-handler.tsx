import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import {
  callGrok,
  updateUserContext,
  addSystemGuidance,
  injectFinancialData,
  categorizeIntent,
  extractSmsTellUsAnswer,
} from "./grok-ai.tsx";
import { digestRecipeText, addPendingRecipe, generateMealPlan, formatPlanForSMS, addPantryItems } from "./grocery-meal-planner.tsx";
import * as db from "./db.tsx";
import { getCalendarImageUrl } from "./calendar-image.tsx";
import {
  listUserAccounts,
  getAccountBalances,
  getAccountHoldings,
  getAccountPositions,
  getAccountActivities,
} from "./snaptrade.tsx";

// NOTE: This file uses db.getUserByPhone() which reads from the new accounts+profiles schema.
// The returned User object has person1_phone, person2_phone, person1_name, person2_name fields
// that are mapped from the profiles table, so all existing code continues to work.

const app = new Hono();

// Construct function URL from SUPABASE_URL
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const FUNCTION_BASE_URL = `${SUPABASE_URL}/functions/v1`;
const PUBLIC_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SNAPTRADE_CLIENT_ID = Deno.env.get("SNAPTRADE_CLIENT_ID") || "";
const SNAPTRADE_CONSUMER_KEY = Deno.env.get("SNAPTRADE_CONSUMER_KEY") || "";

/** Public URL for the Homebase web app used in SMS replies. */
const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL") || "https://v0-homebase-app-clone.vercel.app/";

/** Set to true to send calendar as MMS image(s). When false, calendar is replied with text only. */
const SEND_CALENDAR_IMAGE_VIA_SMS = false;

const DEBUG_PROD_LOGS = (Deno.env.get('DEBUG_PROD_LOGS') || '').toLowerCase() === 'true';

function hashId(id: string | null | undefined): string {
  if (!id) return 'none';
  // Non-cryptographic, just for log correlation without exposing full IDs
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

// Twilio SMS webhook endpoint
app.post("/make-server-8c22500c/sms/twilio/incoming", async (c) => {
  const startTs = Date.now();
  const headers = c.req.header();
  const requestId =
    (headers && (headers['sb-request-id'] || headers['x-request-id'] || headers['cf-ray'] || headers['x-amzn-trace-id'])) ||
    'unknown';

  try {
    // Twilio sends data as URL-encoded form data
    const body = await c.req.parseBody();

    // Strip whatsapp: prefix so DB lookups work for both SMS and WhatsApp sandbox
    const rawFrom = (body.From as string) || "";
    const rawTo   = (body.To as string) || "";
    const isWhatsApp = rawFrom.toLowerCase().startsWith("whatsapp:");
    const fromNumber = rawFrom.replace(/^whatsapp:/i, "");  // clean number for DB
    const toNumber   = rawTo.replace(/^whatsapp:/i, "");
    // replyTo preserves the whatsapp: prefix so sendTwilioSMS knows which channel to use
    const replyTo = rawFrom;
    const messageText = (body.Body as string) || "";
    const messageSid = body.MessageSid as string;
    const numMedia = parseInt((body.NumMedia as string) || "0", 10);

    if (!fromNumber) {
      console.error('[Twilio] Missing required field: From');
      return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
        'Content-Type': 'text/xml'
      });
    }

    // ── MMS image handling ────────────────────────────────────────────────────
    // If the user sends a photo (grocery list, receipt, etc.), extract items
    // using Grok vision and save to the pantry before processing the text.
    if (numMedia > 0) {
      const mediaUrl  = body.MediaUrl0 as string;
      const mediaType = (body.MediaContentType0 as string) || "";

      if (mediaUrl && mediaType.startsWith("image/")) {
        console.log(`[Twilio] MMS image received from ${fromNumber}: ${mediaUrl}`);

        try {
          const apiKey = Deno.env.get("GROK_API_KEY");
          if (!apiKey) throw new Error("GROK_API_KEY not configured");

          // Always download the image using Twilio Basic Auth and encode as base64.
          // Grok's servers cannot authenticate with Twilio — never pass the raw media URL.
          const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || "";
          const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN') || "";
          const authHeader = `Basic ${btoa(`${accountSid}:${authToken}`)}`;

          console.log(`[Twilio] Downloading MMS image from Twilio with Basic Auth`);
          const imgRes = await fetch(mediaUrl, { headers: { Authorization: authHeader } });
          if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);

          const imgBuffer = await imgRes.arrayBuffer();
          const bytes     = new Uint8Array(imgBuffer);

          // Chunk-based base64 — avoids spread operator stack overflow on large images
          let base64 = "";
          const CHUNK = 8192;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            base64 += btoa(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
          }

          const imageContent: { type: string; image_url: { url: string } } = {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${base64}` },
          };
          console.log(`[Twilio] Image downloaded and base64-encoded (${bytes.length} bytes)`);

          // Call Grok vision
          const visionRes = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "grok-2-vision-1212",
              messages: [{
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Look at this image carefully. It may be a grocery receipt, handwritten grocery list, photo of food items, or pantry/fridge contents.
Extract every food item, grocery item, or product you can identify.
Return ONLY a JSON array of item names, nothing else.
Example: ["chicken breast", "olive oil", "pasta", "tomatoes"]
If you cannot identify any food items, return an empty array: []`,
                  },
                  imageContent,
                ],
              }],
              max_tokens: 500,
            }),
          });

          if (!visionRes.ok) {
            const errText = await visionRes.text();
            throw new Error(`Vision API failed: ${visionRes.status} — ${errText}`);
          }

          const visionData = await visionRes.json();
          const rawText    = visionData.choices?.[0]?.message?.content || "[]";
          const clean      = rawText.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
          const itemNames: string[] = JSON.parse(clean);

          if (itemNames.length > 0) {
            const pantryItems = itemNames.map((name: string) => ({
              name: name.trim(),
              added_at: new Date().toISOString(),
              source: "sms_image",
            }));
            await addPantryItems(pantryItems);

            console.log(`[Twilio] Extracted ${itemNames.length} items from image: ${itemNames.join(", ")}`);

            const itemPreview = itemNames.slice(0, 4).join(", ") + (itemNames.length > 4 ? ` +${itemNames.length - 4} more` : "");
            const replyText = `Got your list! I see ${itemNames.length} items: ${itemPreview}. Saved to your grocery queue — text "generate my grocery list" to build this week's plan. 🛒`;

            await sendTwilioSMS(replyTo, replyText);

            // If there's no text body, we're done
            if (!messageText.trim()) {
              return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
                'Content-Type': 'text/xml'
              });
            }
          } else {
            await sendTwilioSMS(replyTo, "I got your photo but couldn't make out any grocery items. Try a clearer shot or type the items out.");
            if (!messageText.trim()) {
              return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
                'Content-Type': 'text/xml'
              });
            }
          }
        } catch (imgErr) {
          console.error('[Twilio] MMS processing error:', imgErr);
          await sendTwilioSMS(replyTo, "Got your photo but had trouble reading it. You can also just type your grocery items and I'll save them.");
          if (!messageText.trim()) {
            return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
              'Content-Type': 'text/xml'
            });
          }
        }
      }
    }
    // ── End MMS handling ──────────────────────────────────────────────────────

    // If no text body at this point, nothing more to do
    if (!messageText.trim()) {
      return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
        'Content-Type': 'text/xml'
      });
    }

    // Look up user by phone number
    let user = await db.getUserByPhone(fromNumber);
    let userId: string | null = null;
    let conversationId: string;
    
    // Variables to track which person is texting
    let textingPerson: 'person1' | 'person2' | null = null;
    let textingPersonName: string | null = null;
    
    if (user) {
      userId = user.id;
      // Use same conversation ID format as web chat
      conversationId = `web:${userId}`;

      // Detect which person is texting based on phone number
      textingPerson = detectPersonFromPhoneNumber(fromNumber, user);
      textingPersonName = textingPerson === 'person1' 
        ? user.person1_name 
        : textingPerson === 'person2' 
          ? user.person2_name 
          : null;

      console.log(`[Twilio] request_start requestId=${requestId} conversationId=${conversationId} userId=${hashId(userId)} messageSid=${messageSid || 'unknown'}`);
      
      // Add who is texting as a single system guidance message (avoid spamming conversation memory).
      if (textingPersonName) {
        await addSystemGuidance(
          conversationId,
          `The person texting you right now is ${textingPersonName} (${textingPerson}). Address them directly by name in your response.`
        );
      }
    } else {
      // If this number isn't registered, send a helpful onboarding message and exit early
      console.warn(`[Twilio] request_start requestId=${requestId} conversationId=none userId=none messageSid=${messageSid || 'unknown'} (no_user)`);
      
      const signupMessage =
        "Hey! I'm Homebase, a shared assistant for couples.\n\n" +
        "To link your calendar and use texting, please sign up or log in here:\n" +
        `${APP_URL}\n\n` +
        "Once you've added your phone number in Calendar Settings → SMS Texting, text me again and I'll be ready to help.";
      
      await sendTwilioSMS(replyTo, signupMessage);
      
      // Twilio still expects a 200/TwiML response so it doesn't retry
      return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
        'Content-Type': 'text/xml'
      });
    }

    // Get or create conversation state
    const stateKey = `sms:state:${fromNumber}`;
    let conversationState = await kv.get(stateKey) || {
      isFirstMessage: true,
      person1Name: user?.person1_name || 'Partner 1',
      person2Name: user?.person2_name || 'Partner 2',
      onboardingComplete: false,
      lastMessageTime: new Date().toISOString()
    };

    if (DEBUG_PROD_LOGS) console.log(`[Twilio] state_loaded conversationId=${conversationId} isFirst=${!!conversationState.isFirstMessage} onboardingComplete=${!!conversationState.onboardingComplete}`);

    // Special-case simple keywords before full intent categorization
    const trimmedBody = messageText.trim().toLowerCase();

    // If the user clearly asks for the app/link/settings, send them straight there.
    const simpleAppKeywords = ['homebase', 'app', 'link', 'login', 'settings'];
    const linkPhrases = [
      'app link',
      'homebase link',
      'send link',
      'send me the link',
      'send me the app',
      'send app',
      'open app',
      'open homebase',
      'access app',
      'access homebase',
      'go to app',
      'go to homebase',
      'account settings',
      'update settings',
      'change settings'
    ];

    const isSimpleKeyword = simpleAppKeywords.includes(trimmedBody);
    const isLinkPhrase =
      trimmedBody.length <= 100 &&
      linkPhrases.some((phrase) => trimmedBody.includes(phrase));

    if (isSimpleKeyword || isLinkPhrase) {
      const linkMessage =
        "Here’s your Homebase link:\n" +
        `${APP_URL}\n\n` +
        "Open it to review or update your account, connections, and settings.";
      await sendTwilioSMS(replyTo, linkMessage);
      return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
        'Content-Type': 'text/xml'
      });
    }

    // SMS "Tell us about you" onboarding (shared per account; first message from a number starts intro)
    if (userId && user) {
      const tellUsReply = await tryHandleSmsTellUsOnboarding({
        accountId: userId,
        conversationId,
        fromNumber,
        messageText,
        conversationState,
        textingPersonName,
      });
      if (tellUsReply !== null) {
        let response = tellUsReply;
        const lowerResponse = response.toLowerCase();
        const mentionsAppOrSettings =
          lowerResponse.includes('settings') ||
          lowerResponse.includes('reconnect') ||
          lowerResponse.includes('connect it in settings') ||
          lowerResponse.includes('connect it in the app') ||
          lowerResponse.includes('open homebase') ||
          lowerResponse.includes('open the app') ||
          lowerResponse.includes('sign in') ||
          lowerResponse.includes('log in') ||
          lowerResponse.includes('login');
        if (mentionsAppOrSettings && !response.includes(APP_URL)) {
          response += `\n\nYou can open Homebase here: ${APP_URL}`;
        }
        conversationState.isFirstMessage = false;
        conversationState.lastMessageTime = new Date().toISOString();
        await kv.set(stateKey, conversationState);
        await sendTwilioSMS(replyTo, response);
        console.log(`[Twilio] request_end requestId=${requestId} conversationId=${conversationId} userId=${hashId(userId)} latencyMs=${Date.now()-startTs} (tell_us)`);
        return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
          'Content-Type': 'text/xml'
        });
      }
    }

    // Categorize intent first
    let intent;
    try {
      intent = await categorizeIntent(messageText);
    } catch (error) {
      console.error('[Twilio] Error categorizing intent:', error);
      intent = { category: 'general', confidence: 0.5, entities: {} };
    }

    // Handle calendar operations before processing with Grok (use DB names for labels and detection)
    const dbPerson1Name = user?.person1_name || 'Partner 1';
    const dbPerson2Name = user?.person2_name || 'Partner 2';
    const calendarTimeLabel = 'the week'; // matches range '1w'

    if (userId && intent.category === 'calendar' && intent.confidence >= 0.7) {
      const action = intent.entities?.action;

      const requestedFromMessage = detectPersonFromMessage(
        messageText,
        dbPerson1Name,
        dbPerson2Name
      );
      
      const intentScope = intent?.entities?.scope || intent?.scope;
      const defaultPartnerRole: 'person1' | 'person2' = (textingPerson === 'person2' ? 'person2' : 'person1');
      const requestedPerson = intentScope === 'both' ? 'both' : (requestedFromMessage || defaultPartnerRole);

      console.log(`[Twilio] routing requestId=${requestId} conversationId=${conversationId} userId=${hashId(userId)} intent=calendar confidence=${intent.confidence} scope=${intentScope === 'both' ? 'both' : 'self'} partnerRole=${requestedPerson === 'both' ? 'both' : requestedPerson}`);

      if (!action || action === 'view') {
        let calendarImageSent = false;
        if (SEND_CALENDAR_IMAGE_VIA_SMS && requestedPerson === 'both') {
          let sent1 = false;
          let sent2 = false;
          try {
            const url1 = await getCalendarImageUrl(userId, 'person1', { range: '1w', title: `${dbPerson1Name}'s Calendar` });
            await sendTwilioSMSWithMedia(replyTo, `This is your calendar for ${calendarTimeLabel}. ${dbPerson1Name}'s Calendar`, url1);
            sent1 = true;
          } catch (e1) {
            console.warn('[Twilio] Calendar image for person1 failed:', e1);
          }
          try {
            const url2 = await getCalendarImageUrl(userId, 'person2', { range: '1w', title: `${dbPerson2Name}'s Calendar` });
            await sendTwilioSMSWithMedia(replyTo, `This is your calendar for ${calendarTimeLabel}. ${dbPerson2Name}'s Calendar`, url2);
            sent2 = true;
          } catch (e2) {
            console.warn('[Twilio] Calendar image for person2 failed:', e2);
          }
          calendarImageSent = sent1 || sent2;
          if (!calendarImageSent) {
            await fetchAndInjectBothCalendars(userId, conversationId, dbPerson1Name, dbPerson2Name);
          }
        } else if (SEND_CALENDAR_IMAGE_VIA_SMS && requestedPerson !== 'both') {
          try {
            const partnerRole = requestedPerson || 'person1';
            const name = partnerRole === 'person1' ? dbPerson1Name : dbPerson2Name;
            const url = await getCalendarImageUrl(userId, partnerRole, { range: '1w', title: `${name}'s Calendar` });
            await sendTwilioSMSWithMedia(replyTo, `This is your calendar for ${calendarTimeLabel}. ${name}'s Calendar`, url);
            calendarImageSent = true;
          } catch (imgErr) {
            console.error('[Twilio] Calendar image failed, falling back to text:', imgErr);
            await fetchAndInjectCalendarEvents(userId, conversationId, requestedPerson || 'person1', dbPerson1Name, dbPerson2Name);
          }
        }
        if (!calendarImageSent) {
          if (requestedPerson === 'both') {
            await fetchAndInjectBothCalendars(userId, conversationId, dbPerson1Name, dbPerson2Name);
          } else {
            await fetchAndInjectCalendarEvents(userId, conversationId, requestedPerson || 'person1', dbPerson1Name, dbPerson2Name);
          }
        }
        if (calendarImageSent) {
          conversationState.isFirstMessage = false;
          conversationState.lastMessageTime = new Date().toISOString();
          await kv.set(stateKey, conversationState);
          return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, { 'Content-Type': 'text/xml' });
        }
      } else {
        // Handle create, delete, update operations
        // For operations, default to person1 if "both" is requested (can't create/delete/update on both at once)
        const operationRole = requestedPerson === 'both' ? 'person1' : (requestedPerson || 'person1');
        await handleCalendarOperations(intent, userId, conversationId, operationRole);
      }
    } else if (userId && intent.category === 'calendar' && intent.confidence < 0.7 && (intent.entities?.action === 'view' || !intent.entities?.action)) {
      const requestedFromMessage = detectPersonFromMessage(messageText, dbPerson1Name, dbPerson2Name);
      const intentScope = intent?.entities?.scope || intent?.scope;
      const defaultPartnerRole: 'person1' | 'person2' = (textingPerson === 'person2' ? 'person2' : 'person1');
      const requestedPerson = intentScope === 'both' ? 'both' : (requestedFromMessage || defaultPartnerRole);
      console.log(`[Twilio] routing requestId=${requestId} conversationId=${conversationId} userId=${hashId(userId)} intent=calendar confidence=${intent.confidence} scope=${intentScope === 'both' ? 'both' : 'self'} partnerRole=${requestedPerson === 'both' ? 'both' : requestedPerson} (low_confidence)`);
      let calendarImageSent = false;
      if (SEND_CALENDAR_IMAGE_VIA_SMS && requestedPerson === 'both') {
        let sent1 = false;
        let sent2 = false;
        try {
          const url1 = await getCalendarImageUrl(userId, 'person1', { range: '1w', title: `${dbPerson1Name}'s Calendar` });
          await sendTwilioSMSWithMedia(replyTo, `This is your calendar for ${calendarTimeLabel}. ${dbPerson1Name}'s Calendar`, url1);
          sent1 = true;
        } catch (e1) {
          console.warn('[Twilio] Calendar image for person1 failed:', e1);
        }
        try {
          const url2 = await getCalendarImageUrl(userId, 'person2', { range: '1w', title: `${dbPerson2Name}'s Calendar` });
          await sendTwilioSMSWithMedia(replyTo, `This is your calendar for ${calendarTimeLabel}. ${dbPerson2Name}'s Calendar`, url2);
          sent2 = true;
        } catch (e2) {
          console.warn('[Twilio] Calendar image for person2 failed:', e2);
        }
        calendarImageSent = sent1 || sent2;
        if (!calendarImageSent) {
          await fetchAndInjectBothCalendars(userId, conversationId, dbPerson1Name, dbPerson2Name);
        }
      } else if (SEND_CALENDAR_IMAGE_VIA_SMS && requestedPerson !== 'both') {
        try {
          const partnerRole = requestedPerson || 'person1';
          const name = partnerRole === 'person1' ? dbPerson1Name : dbPerson2Name;
          const url = await getCalendarImageUrl(userId, partnerRole, { range: '1w', title: `${name}'s Calendar` });
          await sendTwilioSMSWithMedia(replyTo, `This is your calendar for ${calendarTimeLabel}. ${name}'s Calendar`, url);
          calendarImageSent = true;
        } catch (imgErr) {
          console.error('[Twilio] Calendar image failed, falling back to text:', imgErr);
          await fetchAndInjectCalendarEvents(userId, conversationId, requestedPerson || 'person1', dbPerson1Name, dbPerson2Name);
        }
      }
      if (!calendarImageSent) {
        if (requestedPerson === 'both') {
          await fetchAndInjectBothCalendars(userId, conversationId, dbPerson1Name, dbPerson2Name);
        } else {
          await fetchAndInjectCalendarEvents(userId, conversationId, requestedPerson || 'person1', dbPerson1Name, dbPerson2Name);
        }
      }
      if (calendarImageSent) {
        conversationState.isFirstMessage = false;
        conversationState.lastMessageTime = new Date().toISOString();
        await kv.set(stateKey, conversationState);
        return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, { 'Content-Type': 'text/xml' });
      }
    }

    const wantsInvestmentsKeywords =
      /\b(robinhood|brokerage|investment|investments|portfolio|holdings|positions|stocks|etf|crypto|trades?|transactions?|activity|performance|returns?|roi)\b/i.test(
        messageText
      );

    // When intent is financial/spending OR user explicitly asks about investments, fetch and inject financial data.
    if (
      userId &&
      (((intent.category === 'financial' || intent.category === 'spending') && intent.confidence >= 0.5) ||
        wantsInvestmentsKeywords)
    ) {
      try {
        const accounts = await db.getLinkedAccounts(userId);
        if (!accounts || accounts.length === 0) {
          console.log('[Twilio] No linked accounts for financial/spending intent');
          await sendTwilioSMS(
            replyTo,
            "I don’t see any bank or card accounts connected yet.\n\n" +
              "Open Homebase, go to Settings → Connections, and link at least one account so I can talk about your spending and balances.\n\n" +
              `You can open the app here: ${APP_URL}`
          );
          conversationState.isFirstMessage = false;
          conversationState.lastMessageTime = new Date().toISOString();
          await kv.set(stateKey, conversationState);
          return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
            'Content-Type': 'text/xml'
          });
        }
        // Only refresh from Stripe when user has linked accounts and data is older than 15 min
        if (accounts.length > 0) {
          const latestTs = await db.getLatestBalanceTimestamp(userId);
          const maxAgeMs = 15 * 60 * 1000;
          const isStale = !latestTs || (Date.now() - new Date(latestTs).getTime() > maxAgeMs);
          if (isStale) {
            try {
              await fetch(`${FUNCTION_BASE_URL}/make-server-8c22500c/financial/sync-accounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PUBLIC_ANON_KEY}` },
                body: JSON.stringify({ userId }),
              });
            } catch (syncErr) {
              console.error('[Twilio] Balance sync failed:', syncErr);
            }
          }
        }
        const [balances, transactions] = await Promise.all([
          db.getLatestBalances(userId),
          db.getTransactions(userId, 20)
        ]);

        const financialData: {
          linkedAccounts: any[];
          balances: any[];
          recentTransactions: any[];
          summary: { totalBalance: number; accountCount: number; transactionCount: number };
        } = {
          linkedAccounts: accounts.map((acc: any) => ({
            id: acc.id,
            name: acc.display_name,
            institution: acc.institution_name,
            type: acc.category,
            subcategory: acc.subcategory,
            lastFour: acc.last_four_digits,
            partnerRole: acc.partner_role,
            connectionState: acc.connection_state
          })),
          balances: [],
          recentTransactions: transactions.map((txn: any) => {
            const account = txn.linked_accounts || {};
            return {
              id: txn.id,
              accountName: account.display_name || account.name,
              institution: account.institution_name || account.institution,
              amount: txn.amount_cents ? txn.amount_cents / 100 : 0,
              description: txn.description,
              merchant: txn.merchant_name,
              date: txn.transaction_date,
              isPending: txn.is_pending,
              category: txn.category_hierarchy || []
            };
          }),
          summary: { totalBalance: 0, accountCount: accounts.length, transactionCount: transactions.length }
        };

        for (const bal of balances) {
          const account = bal.linked_accounts || bal;
          const currentBalance = bal.current_balance_cents != null ? bal.current_balance_cents / 100 : 0;
          const availableBalance = bal.available_balance_cents != null ? bal.available_balance_cents / 100 : null;
          const accountType = account.subcategory || account.category || 'unknown';
          const isSavings = accountType.toLowerCase().includes('savings');
          const primaryBalance = (currentBalance > 0 && !isSavings) ? currentBalance : (availableBalance ?? currentBalance);
          if (primaryBalance > 0) financialData.summary.totalBalance += primaryBalance;
          financialData.balances.push({
            accountName: account.display_name || account.name,
            institution: account.institution_name || account.institution,
            accountType,
            isSavings,
            currentBalance,
            availableBalance,
            balance: primaryBalance,
            currency: bal.currency_code || 'USD',
            asOf: bal.as_of_timestamp || bal.created_at
          });
        }
        financialData.summary.totalBalance = Math.round(financialData.summary.totalBalance * 100) / 100;

        console.log(`[Twilio] Injecting financial data: ${financialData.linkedAccounts.length} accounts, ${financialData.balances.length} balances, ${financialData.recentTransactions.length} transactions`);
        await injectFinancialData(conversationId, 'financial-accounts', financialData);

        // Only fetch SnapTrade investment data when user explicitly asks about it.
        const wantsInvestments =
          wantsInvestmentsKeywords ||
          /\b(balance|value|worth|how much|up|down|how is it doing|how.*doing)\b/i.test(messageText);

        if (wantsInvestments && SNAPTRADE_CLIENT_ID && SNAPTRADE_CONSUMER_KEY) {
          const wantsBrokerageAccountInfo =
            /\b(brokerage account information|account information|account info)\b/i.test(messageText);
          const wantsBalance =
            wantsBrokerageAccountInfo || /\b(balance|value|worth|how much)\b/i.test(messageText);
          const wantsHoldings =
            /\b(holdings|positions|portfolio|what do i own)\b/i.test(messageText);
          const wantsTransactions =
            /\b(transactions?|activity|trades?)\b/i.test(messageText);
          const wantsPerformance =
            /\b(performance|returns?|roi|up|down|how is it doing|how.*doing)\b/i.test(messageText);

          try {
            const userSecret = await db.getSnapTradeUserSecret(userId);
            const snaptradeLinked = accounts.filter((acc: any) => acc.provider === 'snaptrade');
            if (!userSecret || snaptradeLinked.length === 0) return;

            // Fetch SnapTrade account list once (includes cached total balance + last sync).
            const snapUserId = `hb_${userId}`;
            const stAccounts = await listUserAccounts(
              SNAPTRADE_CLIENT_ID,
              SNAPTRADE_CONSUMER_KEY,
              snapUserId,
              userSecret
            );

            const byExternalId = new Map(stAccounts.map((a: any) => [a.id, a]));
            const payloadAccounts: any[] = [];

            for (const la of snaptradeLinked) {
              const st = byExternalId.get(la.external_account_id);
              if (!st) continue;

              const asOf =
                st?.sync_status?.holdings?.last_successful_sync ||
                st?.updated_date ||
                st?.created_date;

              const totalAmount = st?.balance?.total?.amount ?? null;
              const totalCurrency = st?.balance?.total?.currency ?? 'USD';

              const item: any = {
                linkedAccountId: la.id,
                externalAccountId: la.external_account_id,
                displayName: la.display_name,
                institutionName: la.institution_name,
                totalValue: totalAmount,
                currency: totalCurrency,
                asOf,
              };

              if (wantsBalance) {
                try {
                  item.balances = await getAccountBalances(
                    SNAPTRADE_CLIENT_ID,
                    SNAPTRADE_CONSUMER_KEY,
                    snapUserId,
                    userSecret,
                    la.external_account_id
                  );
                } catch (e) {
                  console.error('[Twilio] SnapTrade balances fetch failed', e);
                }
              }

              if (wantsHoldings) {
                try {
                  // Holdings is heavier; prefer it when explicitly asked.
                  item.holdings = await getAccountHoldings(
                    SNAPTRADE_CLIENT_ID,
                    SNAPTRADE_CONSUMER_KEY,
                    snapUserId,
                    userSecret,
                    la.external_account_id
                  );
                } catch (e) {
                  console.error('[Twilio] SnapTrade holdings fetch failed', e);
                  try {
                    item.positions = await getAccountPositions(
                      SNAPTRADE_CLIENT_ID,
                      SNAPTRADE_CONSUMER_KEY,
                      snapUserId,
                      userSecret,
                      la.external_account_id
                    );
                  } catch (e2) {
                    console.error('[Twilio] SnapTrade positions fetch failed', e2);
                  }
                }
              }

              if (wantsTransactions) {
                try {
                  item.activities = await getAccountActivities(
                    SNAPTRADE_CLIENT_ID,
                    SNAPTRADE_CONSUMER_KEY,
                    snapUserId,
                    userSecret,
                    la.external_account_id,
                    20,
                    0
                  );
                } catch (e) {
                  console.error('[Twilio] SnapTrade activities fetch failed', e);
                }
              }

              if (wantsPerformance) {
                // Free-plan fallback: delta vs last saved snapshot (store snapshot now).
                if (typeof totalAmount === 'number') {
                  try {
                    const currentCents = Math.round(totalAmount * 100);
                    const prev = await db.getRecentBalanceSnapshotsForLinkedAccount(la.id, 1);
                    await db.saveBalanceSnapshot({
                      linked_account_id: la.id,
                      current_balance_cents: currentCents,
                      currency_code: totalCurrency,
                    });
                    const prevCents = prev?.[0]?.current_balance_cents ?? null;
                    if (prevCents != null) {
                      const deltaCents = currentCents - prevCents;
                      item.performance = {
                        sinceLastCheck: {
                          delta: deltaCents / 100,
                          deltaPercent: prevCents !== 0 ? (deltaCents / prevCents) * 100 : null,
                        },
                      };
                    } else {
                      item.performance = {
                        sinceLastCheck: {
                          delta: null,
                          deltaPercent: null,
                          note: 'Saved your first snapshot. Ask again later to see changes since this check.',
                        },
                      };
                    }
                  } catch (e) {
                    console.error('[Twilio] SnapTrade snapshot/perf failed', e);
                  }
                }
              }

              payloadAccounts.push(item);
            }

            if (payloadAccounts.length > 0) {
              await injectFinancialData(conversationId, 'snaptrade-investments', {
                accounts: payloadAccounts,
                note: 'Use the fields present in this SnapTrade snapshot. asOf is provided per account.',
              });
            }
          } catch (snapErr) {
            console.error('[Twilio] Error during SnapTrade investment fetch:', snapErr);
          }
        }
      } catch (financialErr) {
        console.error('[Twilio] Error fetching/injecting financial data:', financialErr);
        // Continue without financial data so the AI can still respond
      }
    }

    // Pre-detect agent intent so onboarding prompts don't override grocery/travel/home texts
    const hasAgentIntent =
      /\b(generate|make|create|send|get).{0,20}(list|plan|groceries|grocery)|what'?s? for dinner|(this|next) week'?s? (meals?|dinners?|groceries|list)|grocery list|meal plan\b/i.test(messageText) ||
      /https?:\/\/[^\s]+/.test(messageText) ||
      /\b(recipe|add this|want to (try|make|cook)|here'?s? a recipe)\b/i.test(messageText) ||
      /\b(flight|hotel|passport|visa|itinerary|vacation|trip|travel)\b/i.test(messageText) ||
      /\b(home value|equity|mortgage|house worth|property value|maintenance|hvac|roof|gutter)\b/i.test(messageText);

    // Process the message with Grok AI
    let response = await processMessageWithGrok(
      conversationId,
      fromNumber,
      messageText,
      conversationState,
      userId,
      textingPersonName,  // Already detected above
      hasAgentIntent ? { skipFirstTimeGreeting: true, skipNameHeuristic: true } : undefined
    );

    // If Grok suggests using settings/app/reconnect, append the app link so user can act on it.
    const lowerResponse = response.toLowerCase();
    const mentionsAppOrSettings =
      lowerResponse.includes('settings') ||
      lowerResponse.includes('reconnect') ||
      lowerResponse.includes('connect it in settings') ||
      lowerResponse.includes('connect it in the app') ||
      lowerResponse.includes('open homebase') ||
      lowerResponse.includes('open the app') ||
      lowerResponse.includes('sign in') ||
      lowerResponse.includes('log in') ||
      lowerResponse.includes('login');

    if (mentionsAppOrSettings && !response.includes(APP_URL)) {
      response += `\n\nYou can open Homebase here: ${APP_URL}`;
    }

    // Update conversation state
    conversationState.isFirstMessage = false;
    conversationState.lastMessageTime = new Date().toISOString();
    await kv.set(stateKey, conversationState);

    // Send SMS response via Twilio
    await sendTwilioSMS(replyTo, response);
    console.log(`[Twilio] request_end requestId=${requestId} conversationId=${conversationId} userId=${hashId(userId)} latencyMs=${Date.now()-startTs}`);
    
    // Twilio expects TwiML response
    return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
      'Content-Type': 'text/xml'
    });
  } catch (error) {
    console.error(`[Twilio] request_end requestId=${requestId} conversationId=unknown userId=unknown latencyMs=${Date.now()-startTs} status=error`, error);
    
    // Still return 200 to Twilio so they don't retry
    return c.text('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200, {
      'Content-Type': 'text/xml'
    });
  }
});

// Helper function to detect which person is texting based on phone number
function detectPersonFromPhoneNumber(
  fromNumber: string,
  user: { person1_phone: string | null; person2_phone: string | null }
): 'person1' | 'person2' | null {
  // Normalize phone numbers for comparison
  const normalizePhone = (phone: string) => phone.replace(/[^\d+]/g, '');
  const normalizedFrom = normalizePhone(fromNumber);
  
  // Check person1_phone
  if (user.person1_phone) {
    const normalizedPerson1 = normalizePhone(user.person1_phone);
    if (normalizedFrom === normalizedPerson1 || 
        normalizedFrom === normalizedPerson1.replace(/^\+/, '') ||
        normalizedFrom.replace(/^\+/, '') === normalizedPerson1) {
      return 'person1';
    }
  }
  
  // Check person2_phone
  if (user.person2_phone) {
    const normalizedPerson2 = normalizePhone(user.person2_phone);
    if (normalizedFrom === normalizedPerson2 || 
        normalizedFrom === normalizedPerson2.replace(/^\+/, '') ||
        normalizedFrom.replace(/^\+/, '') === normalizedPerson2) {
      return 'person2';
    }
  }
  
  return null;
}

// Helper function to detect which person is mentioned in the message
function detectPersonFromMessage(
  messageText: string, 
  person1Name: string, 
  person2Name: string
): 'person1' | 'person2' | 'both' | null {
  const text = messageText.toLowerCase();
  const person1Lower = person1Name.toLowerCase();
  const person2Lower = person2Name.toLowerCase();
  
  // Check for "both" requests first
  const bothIndicators = ['both', 'both of', 'both of our', 'both of ours', 'our schedules', 'our schedule', 'our calendar', 'our calendars', 'we', 'us', 'me and', 'my and'];
  const hasBothIndicator = bothIndicators.some(indicator => {
    // Check if the indicator appears near calendar/schedule keywords
    const calendarKeywords = ['schedule', 'schedules', 'calendar', 'calendars', 'events', 'plans', 'plannings'];
    return calendarKeywords.some(keyword => {
      const indicatorIndex = text.indexOf(indicator);
      const keywordIndex = text.indexOf(keyword);
      // If both appear and are within reasonable distance (50 chars)
      return indicatorIndex !== -1 && keywordIndex !== -1 && Math.abs(indicatorIndex - keywordIndex) < 50;
    });
  });
  
  if (hasBothIndicator) {
    return 'both';
  }
  
  // Check for person2 first (in case person1's name is part of person2's name)
  if (text.includes(person2Lower)) {
    return 'person2';
  }
  if (text.includes(person1Lower)) {
    return 'person1';
  }
  
  return null; // Default to person1 if no specific person mentioned
}

// Fetch and inject calendar events into conversation
async function fetchAndInjectCalendarEvents(
  userId: string, 
  conversationId: string, 
  partnerRole: 'person1' | 'person2' = 'person1',
  person1Name: string = 'Partner 1',
  person2Name: string = 'Partner 2'
): Promise<void> {
  try {
    // Add timestamp to ensure we get fresh data (no caching)
    const timestamp = Date.now();
    const t0 = Date.now();
    const eventsResponse = await fetch(
      `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events?userId=${userId}&partnerRole=${partnerRole}&_t=${timestamp}`,
      {
        headers: {
          'Authorization': `Bearer ${PUBLIC_ANON_KEY}`,
          'Cache-Control': 'no-cache'
        }
      }
    );
    
    const eventsData = await eventsResponse.json();
    console.log(`[Calendar] fetch status=${eventsResponse.status} partnerRole=${partnerRole} count=${Array.isArray(eventsData?.events) ? eventsData.events.length : 0} latencyMs=${Date.now()-t0}`);
    
    const personName = partnerRole === 'person1' ? person1Name : person2Name;
    
    if (eventsData.events && eventsData.events.length > 0) {
      // Inject events into conversation with clear instruction to use only this data
      // Extract event titles for explicit exclusion list
      const eventTitles = eventsData.events.map((e: any) => e.summary || '').filter((t: string) => t);
      
      await injectFinancialData(conversationId, 'calendar', {
        events: eventsData.events,
        message: `Here are ${personName}'s CURRENT calendar events (as of now). Use ONLY these events and ignore any older calendar data from previous messages.`,
        timestamp: new Date().toISOString(),
        validEventTitles: eventTitles // Add this for explicit exclusion
      });
    } else {
      await injectFinancialData(conversationId, 'calendar', {
        events: [],
        message: `${personName} doesn't have any upcoming calendar events in the next 7 days. Ignore any calendar events mentioned in previous conversation messages.`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[SMS] Error fetching calendar events:', error);
    await injectErrorMessage(conversationId, error, 'calendar view');
  }
}

// Fetch and inject both calendars into conversation
async function fetchAndInjectBothCalendars(
  userId: string, 
  conversationId: string, 
  person1Name: string = 'Partner 1',
  person2Name: string = 'Partner 2'
): Promise<void> {
  try {
    // Add timestamp to ensure we get fresh data (no caching)
    const timestamp = Date.now();
    const t0 = Date.now();
    
    // Fetch both calendars in parallel
    const [person1Response, person2Response] = await Promise.all([
      fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events?userId=${userId}&partnerRole=person1&_t=${timestamp}`,
        {
          headers: {
            'Authorization': `Bearer ${PUBLIC_ANON_KEY}`,
            'Cache-Control': 'no-cache'
          }
        }
      ),
      fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events?userId=${userId}&partnerRole=person2&_t=${timestamp}`,
        {
          headers: {
            'Authorization': `Bearer ${PUBLIC_ANON_KEY}`,
            'Cache-Control': 'no-cache'
          }
        }
      )
    ]);
    
    const person1Data = await person1Response.json();
    const person2Data = await person2Response.json();
    
    const person1Events = person1Data.events || [];
    const person2Events = person2Data.events || [];
    
    console.log(`[Calendar] fetch status1=${person1Response.status} status2=${person2Response.status} scope=both count1=${person1Events.length} count2=${person2Events.length} latencyMs=${Date.now()-t0}`);
    
    // Combine both calendars with clear labels
    const combinedEvents = [
      ...person1Events.map((e: any) => ({ ...e, person: person1Name })),
      ...person2Events.map((e: any) => ({ ...e, person: person2Name }))
    ];
    
    // Extract event titles for explicit exclusion list
    const eventTitles = combinedEvents.map((e: any) => e.summary || '').filter((t: string) => t);
    
    // Inject both calendars into conversation
    await injectFinancialData(conversationId, 'calendar', {
      events: combinedEvents,
      message: `Here are BOTH ${person1Name}'s and ${person2Name}'s CURRENT calendar events (as of now). You have access to both calendars. Use ONLY these events and ignore any older calendar data from previous messages.`,
      timestamp: new Date().toISOString(),
      validEventTitles: eventTitles,
      bothCalendars: true,
      person1Name,
      person2Name
    });
  } catch (error) {
    console.error('[SMS] Error fetching both calendars:', error);
    await injectErrorMessage(conversationId, error, 'calendar view');
  }
}

// Handle calendar operations (create, delete, update)
async function handleCalendarOperations(
  intent: { category: string; confidence: number; entities?: any },
  userId: string,
  conversationId: string,
  partnerRole: 'person1' | 'person2' = 'person1'
): Promise<void> {
  const { action, title, date, time, location, oldTime, oldDate } = intent.entities || {};

  // Handle event creation
  if (action === 'create' && title) {
    console.log('📅 [SMS] Creating calendar event:', { title, date, time, location });
    
    const startTime = parseDateTime(date, time);
    if (!startTime) {
      console.error('[SMS] Could not parse date/time for event creation');
      await injectErrorMessage(conversationId, 'Could not understand the date or time. Please try again with a clearer format (e.g., "tomorrow at 2pm" or "February 10th at 3:30pm").', 'calendar create');
      return;
    }
    
    // Default to 1 hour duration if no end time
    // Parse startTime components and add 1 hour, maintaining timezone
    const timezoneMatch = startTime.match(/([+-]\d{2}):(\d{2})$/);
    const timezoneOffset = timezoneMatch ? timezoneMatch[0] : '-05:00';
    
    // Extract date/time from startTime string
    const dateTimeMatch = startTime.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    let endTime: string;
    
    if (!dateTimeMatch) {
      // Fallback: use Date parsing
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const endYear = endDate.getUTCFullYear();
      const endMonth = String(endDate.getUTCMonth() + 1).padStart(2, '0');
      const endDay = String(endDate.getUTCDate()).padStart(2, '0');
      const endHour = String(endDate.getUTCHours()).padStart(2, '0');
      const endMinute = String(endDate.getUTCMinutes()).padStart(2, '0');
      endTime = `${endYear}-${endMonth}-${endDay}T${endHour}:${endMinute}:00${timezoneOffset}`;
    } else {
      // Parse components and add 1 hour
      let year = parseInt(dateTimeMatch[1]);
      let month = parseInt(dateTimeMatch[2]);
      let day = parseInt(dateTimeMatch[3]);
      let hour = parseInt(dateTimeMatch[4]);
      let minute = parseInt(dateTimeMatch[5]);
      
      // Add 1 hour
      hour += 1;
      if (hour >= 24) {
        hour = 0;
        day += 1;
        // Handle month/year rollover
        const daysInMonth = new Date(year, month, 0).getDate();
        if (day > daysInMonth) {
          day = 1;
          month += 1;
          if (month > 12) {
            month = 1;
            year += 1;
          }
        }
      }
      
      endTime = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${timezoneOffset}`;
    }
    
    try {
      const createResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PUBLIC_ANON_KEY}`
          },
          body: JSON.stringify({
            userId: userId,
            partnerRole: partnerRole,
            title: title,
            startTime: startTime,
            endTime: endTime,
            description: '',
            location: location || ''
          })
        }
      );
      
      const createData = await createResponse.json();
      
      if (createData.success) {
        console.log('✅ [SMS] Event created successfully:', createData.event);
        
        // Inject success message into conversation
        await injectFinancialData(conversationId, 'calendar', {
          eventCreated: true,
          event: createData.event,
          message: `Event "${title}" has been created in your Google Calendar.`
        });
      } else {
        console.error('[SMS] Failed to create event:', createData.error);
        await injectErrorMessage(conversationId, createData.error, 'calendar create');
      }
    } catch (error) {
      console.error('[SMS] Error creating calendar event:', error);
      await injectErrorMessage(conversationId, error, 'calendar create');
    }
    return;
  }
  
  // Handle event deletion
  if ((action === 'delete' || action === 'remove') && title) {
    console.log('🗑️ [SMS] Deleting calendar event:', { title });
    
    try {
      // First, search for the event by title
      const searchResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events/search?title=${encodeURIComponent(title)}&userId=${userId}&partnerRole=${partnerRole}`,
        {
          headers: {
            'Authorization': `Bearer ${PUBLIC_ANON_KEY}`
          }
        }
      );
      
      const searchData = await searchResponse.json();
      
      if (searchData.events && searchData.events.length > 0) {
        // Use the first matching event
        const eventToDelete = searchData.events[0];
        console.log('📅 [SMS] Found event to delete:', eventToDelete);
        
        // Delete the event
        const deleteResponse = await fetch(
          `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events/${eventToDelete.id}?userId=${userId}&partnerRole=${partnerRole}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${PUBLIC_ANON_KEY}`
            }
          }
        );
        
        const deleteData = await deleteResponse.json();
        
        if (deleteData.success) {
          console.log('✅ [SMS] Event deleted successfully:', eventToDelete.title);
          
          // Inject success message into conversation
          await injectFinancialData(conversationId, 'calendar', {
            eventDeleted: true,
            event: eventToDelete,
            message: `Event "${title}" has been deleted from your Google Calendar.`
          });
        } else {
          console.error('[SMS] Failed to delete event:', deleteData.error);
          await injectErrorMessage(conversationId, deleteData.error, 'calendar delete');
        }
      } else {
        console.log('[SMS] No matching event found to delete');
        // Still inject a message so the AI can respond
        await injectFinancialData(conversationId, 'calendar', {
          eventDeleted: false,
          message: `Could not find an event matching "${title}" in your calendar.`
        });
      }
    } catch (error) {
      console.error('[SMS] Error deleting calendar event:', error);
      await injectErrorMessage(conversationId, error, 'calendar delete');
    }
    return;
  }
  
  // Handle event updates/adjustments
  if ((action === 'update' || action === 'adjust') && title) {
    console.log('🔄 [SMS] Updating calendar event:', { title, date, time, oldTime, oldDate });
    
    try {
      // First, search for the event by title
      const searchResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events/search?title=${encodeURIComponent(title)}&userId=${userId}&partnerRole=${partnerRole}`,
        {
          headers: {
            'Authorization': `Bearer ${PUBLIC_ANON_KEY}`
          }
        }
      );
      
      const searchData = await searchResponse.json();
      
      if (searchData.events && searchData.events.length > 0) {
        // Use the first matching event
        const eventToUpdate = searchData.events[0];
        console.log('📅 [SMS] Found event to update:', eventToUpdate);
        
        // Parse the new date/time
        const existingStartDate = new Date(eventToUpdate.start);
        const existingEndDate = new Date(eventToUpdate.end);
        const duration = existingEndDate.getTime() - existingStartDate.getTime();
        
        let newStartTime = eventToUpdate.start; // Default to current start time
        let newEndTime = eventToUpdate.end; // Default to current end time
        
        // If both date and time are provided, parse them together
        if (date && time) {
          const parsedDateTime = parseDateTime(date, time);
          if (parsedDateTime) {
            newStartTime = parsedDateTime;
            newEndTime = new Date(new Date(parsedDateTime).getTime() + duration).toISOString();
          }
        } else if (time) {
          // Only time is being updated - preserve the existing date
          const timeStr = time;
          const timeLower = timeStr.toLowerCase().replace(/\s/g, '');
          let hours = 12;
          let minutes = 0;
          
          // Parse time (e.g., "11am", "2pm", "3:30pm")
          const pmMatch = timeLower.match(/(\d{1,2}):?(\d{2})?pm/);
          const amMatch = timeLower.match(/(\d{1,2}):?(\d{2})?am/);
          
          if (pmMatch) {
            hours = parseInt(pmMatch[1]);
            minutes = pmMatch[2] ? parseInt(pmMatch[2]) : 0;
            if (hours !== 12) hours += 12;
          } else if (amMatch) {
            hours = parseInt(amMatch[1]);
            minutes = amMatch[2] ? parseInt(amMatch[2]) : 0;
            if (hours === 12) hours = 0;
          }
          
          // Create new date with updated time but same date
          const updatedDate = new Date(existingStartDate);
          updatedDate.setHours(hours, minutes, 0, 0);
          newStartTime = updatedDate.toISOString();
          
          // Update end time to maintain duration
          const newEndDate = new Date(updatedDate.getTime() + duration);
          newEndTime = newEndDate.toISOString();
        } else if (date) {
          // Only date is being updated - preserve the existing time
          const parsedDate = parseDateTime(date, null);
          if (parsedDate) {
            // Extract time from existing event
            const existingHours = existingStartDate.getHours();
            const existingMinutes = existingStartDate.getMinutes();
            
            // Apply existing time to new date
            const newDate = new Date(parsedDate);
            newDate.setHours(existingHours, existingMinutes, 0, 0);
            newStartTime = newDate.toISOString();
            
            // Update end time to maintain duration
            const newEndDate = new Date(newDate.getTime() + duration);
            newEndTime = newEndDate.toISOString();
          }
        }
        
        // Update the event
            const updateResponse = await fetch(
              `${FUNCTION_BASE_URL}/make-server-8c22500c/calendar/events/${eventToUpdate.id}?partnerRole=${partnerRole}`,
              {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${PUBLIC_ANON_KEY}`
                },
                body: JSON.stringify({
                  userId: userId,
                  partnerRole: partnerRole,
                  startTime: newStartTime,
                  endTime: newEndTime
                })
              }
            );
        
        const updateData = await updateResponse.json();
        
        if (updateData.success) {
          console.log('✅ [SMS] Event updated successfully:', updateData.event);
          
          // Inject success message into conversation
          await injectFinancialData(conversationId, 'calendar', {
            eventUpdated: true,
            event: updateData.event,
            message: `Event "${title}" has been updated in your Google Calendar.`
          });
        } else {
          console.error('[SMS] Failed to update event:', updateData.error);
          await injectErrorMessage(conversationId, updateData.error, 'calendar update');
        }
      } else {
        console.log('[SMS] No matching event found to update');
        // Still inject a message so the AI can respond
        await injectFinancialData(conversationId, 'calendar', {
          eventUpdated: false,
          message: `Could not find an event matching "${title}" in your calendar.`
        });
      }
    } catch (error) {
      console.error('[SMS] Error updating calendar event:', error);
      await injectErrorMessage(conversationId, error, 'calendar update');
    }
    return;
  }
}

// Helper function to parse natural language date/time to ISO format
function parseDateTime(dateStr: string | null, timeStr: string | null): string | null {
  if (!dateStr) return null;
  
  try {
    const now = new Date();
    let targetDate = new Date(now);
    
    // Parse date
    const dateLower = dateStr.toLowerCase().trim();
    
    if (dateLower.includes('today')) {
      targetDate = new Date(now);
    } else if (dateLower.includes('tomorrow')) {
      targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (dateLower.includes('next week')) {
      targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + 7);
    } else if (dateLower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)) {
      // Handle "next Tuesday", "next Monday", etc.
      const dayMatch = dateLower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
      if (dayMatch) {
        const targetDayName = dayMatch[1];
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDayIndex = dayNames.indexOf(targetDayName);
        const currentDayIndex = now.getDay();
        
        let daysToAdd = targetDayIndex - currentDayIndex;
        if (daysToAdd <= 0) {
          daysToAdd += 7; // Next week
        }
        
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysToAdd);
      }
    } else {
      // Try to parse dates like "February 10th", "Feb 10th", "Feb. 10th", etc.
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                         'july', 'august', 'september', 'october', 'november', 'december'];
      const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                            'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      let month = -1;
      let day = -1;
      let year = now.getFullYear();
      
      // Remove day-of-week names that might interfere
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      let cleanedDate = dateLower;
      for (const dayName of dayNames) {
        cleanedDate = cleanedDate.replace(new RegExp(`\\b${dayName}\\b`, 'g'), '').trim();
      }
      
      // Find month name or abbreviation
      for (let i = 0; i < monthNames.length; i++) {
        const monthName = monthNames[i];
        const monthAbbrev = monthAbbrevs[i];
        if (cleanedDate.includes(monthName)) {
          month = i;
          break;
        }
        const abbrevPattern = new RegExp(`\\b${monthAbbrev}\\.?\\b`, 'i');
        if (abbrevPattern.test(cleanedDate)) {
          month = i;
          break;
        }
      }
      
      // Extract day number (handle "10th", "1st", "2nd", "3rd", etc.)
      const dayMatch = cleanedDate.match(/(\d{1,2})(?:st|nd|rd|th)?/);
      if (dayMatch) {
        day = parseInt(dayMatch[1]);
      }
      
      // Extract year if present
      const yearMatch = dateLower.match(/(\d{4})/);
      if (yearMatch) {
        year = parseInt(yearMatch[1]);
      }
      
      // If we found both month and day, create the date
      if (month !== -1 && day !== -1) {
        targetDate = new Date(year, month, day, 12, 0, 0);
        
        // Validate the date was created correctly
        if (targetDate.getMonth() !== month || targetDate.getDate() !== day) {
          console.error(`❌ Date creation failed! Expected: month ${month + 1}, day ${day}`);
          return null;
        }
        
        // If the date is in the past (for current year), assume next year
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const targetDateOnly = new Date(year, month, day);
        if (targetDateOnly < today && year === now.getFullYear()) {
          targetDate = new Date(year + 1, month, day, 12, 0, 0);
          year = year + 1;
        }
      } else {
        // Fallback: try JavaScript's Date parser
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          targetDate = parsed;
        } else {
          console.error('❌ Could not parse date:', dateStr);
          return null;
        }
      }
    }
    
    // Parse time
    let hours = 12; // Default to noon
    let minutes = 0;
    
    if (timeStr) {
      const timeLower = timeStr.toLowerCase().replace(/\s/g, '');
      
      // Parse formats like "2pm", "3:30pm", "14:00"
      const pmMatch = timeLower.match(/(\d{1,2}):?(\d{2})?pm/);
      const amMatch = timeLower.match(/(\d{1,2}):?(\d{2})?am/);
      const militaryMatch = timeLower.match(/(\d{1,2}):(\d{2})/);
      
      if (pmMatch) {
        hours = parseInt(pmMatch[1]);
        minutes = pmMatch[2] ? parseInt(pmMatch[2]) : 0;
        if (hours !== 12) hours += 12;
      } else if (amMatch) {
        hours = parseInt(amMatch[1]);
        minutes = amMatch[2] ? parseInt(amMatch[2]) : 0;
        if (hours === 12) hours = 0;
      } else if (militaryMatch) {
        hours = parseInt(militaryMatch[1]);
        minutes = parseInt(militaryMatch[2]);
      } else {
        // Try to extract just the number
        const numMatch = timeLower.match(/(\d{1,2})/);
        if (numMatch) {
          hours = parseInt(numMatch[1]);
          if (hours < 12 && !timeLower.includes('am')) {
            hours += 12; // Assume PM if no AM specified
          }
        }
      }
    }
    
    // Get date components (year, month, day) from targetDate
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const day = targetDate.getDate();
    
    // Format as ISO string with timezone offset
    // Default to America/New_York timezone (EST/EDT) which matches the Google Calendar API call
    // This ensures "2pm" is interpreted as 2pm EST, not 2pm UTC
    // The timezone offset is -5 for EST or -4 for EDT (we'll use -5 as default)
    const timezoneOffsetHours = -5; // EST (UTC-5)
    
    // Format date components
    const yearStr = String(year);
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const hourStr = String(hours).padStart(2, '0');
    const minuteStr = String(minutes).padStart(2, '0');
    
    // Format with timezone offset: YYYY-MM-DDTHH:mm:ss-HH:mm
    // The time is treated as local time in the specified timezone
    const offsetString = timezoneOffsetHours < 0 
      ? `-${String(Math.abs(timezoneOffsetHours)).padStart(2, '0')}:00`
      : `+${String(timezoneOffsetHours).padStart(2, '0')}:00`;
    
    return `${yearStr}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}:00${offsetString}`;
  } catch (error) {
    console.error('[SMS] Error parsing date/time:', error);
    return null;
  }
}

// Helper function to convert technical errors to natural language
function convertErrorToNaturalLanguage(error: any, context?: string): string {
  const errorMessage = error?.message || error?.error || String(error) || 'Unknown error';
  const errorString = errorMessage.toLowerCase();
  
  // Network/connection errors
  if (errorString.includes('failed to fetch') || errorString.includes('network') || errorString.includes('connection')) {
    return 'I\'m having trouble connecting to the service right now. Please check your internet connection and try again.';
  }
  
  // Authentication errors
  if (errorString.includes('unauthorized') || errorString.includes('401') || errorString.includes('authentication')) {
    return 'I need you to sign in again. Please refresh and log back in.';
  }
  
  // Permission errors
  if (errorString.includes('forbidden') || errorString.includes('403') || errorString.includes('permission')) {
    return 'I don\'t have permission to do that. Please check your account settings or try again.';
  }
  
  // Not found errors
  if (errorString.includes('not found') || errorString.includes('404')) {
    if (context?.includes('calendar')) {
      return 'I couldn\'t find that calendar event. It might have already been deleted or the name doesn\'t match exactly.';
    }
    return 'I couldn\'t find what you\'re looking for. Please check the details and try again.';
  }
  
  // Calendar-specific errors
  if (context?.includes('calendar')) {
    if (errorString.includes('token') || errorString.includes('oauth')) {
      return 'Your calendar connection needs to be refreshed. Please reconnect your Google Calendar in settings.';
    }
    if (errorString.includes('invalid') || errorString.includes('malformed')) {
      return 'There was an issue with the calendar details. Please check the date and time format and try again.';
    }
    if (errorString.includes('no tokens')) {
      return 'Your Google Calendar isn\'t connected yet. Please connect it in settings first.';
    }
  }
  
  // API/rate limit errors
  if (errorString.includes('rate limit') || errorString.includes('429') || errorString.includes('too many')) {
    return 'I\'m getting too many requests right now. Please wait a moment and try again.';
  }
  
  // Server errors
  if (errorString.includes('500') || errorString.includes('internal server')) {
    return 'Something went wrong on my end. Please try again in a moment.';
  }
  
  // Default friendly message
  return 'Something unexpected happened. Please try again, and if the problem continues, let me know what you were trying to do.';
}

// Helper function to inject error message into conversation for AI to respond naturally
async function injectErrorMessage(conversationId: string, error: any, context?: string) {
  const naturalError = convertErrorToNaturalLanguage(error, context);
  
  try {
    await injectFinancialData(conversationId, 'error', {
      error: true,
      message: naturalError,
      technicalDetails: error?.message || String(error)
    });
  } catch (injectError) {
    console.error('[SMS] Failed to inject error message:', injectError);
  }
}

type SmsTellUsPhase = "recurring";

const SMS_TELLUS_KV_PREFIX = "sms:tellus:";

async function getSmsTellUsPhase(accountId: string): Promise<SmsTellUsPhase | "inactive"> {
  const profile = await db.getCoupleOnboardingProfile(accountId);
  if (profile?.sms_onboarding_completed_at) return "inactive";

  const hasGoal = await db.hasFinancialGoalForAccount(accountId);
  const hasRec = await db.hasRecurringEntryForSource(accountId, "sms_onboarding");

  // Relationship stage, couple goal, and exciting upcoming are collected in web onboarding (partner-invite chat), not SMS.
  if (!profile?.relationship_stage || !hasGoal || !profile.exciting_upcoming) {
    return "inactive";
  }
  if (!hasRec) return "recurring";
  return "inactive";
}

async function saveSmsTellUsPhase(
  accountId: string,
  phase: SmsTellUsPhase | "done"
): Promise<void> {
  await kv.set(`${SMS_TELLUS_KV_PREFIX}${accountId}`, {
    phase,
    updatedAt: Date.now(),
  });
}

async function tryHandleSmsTellUsOnboarding(args: {
  accountId: string;
  conversationId: string;
  fromNumber: string;
  messageText: string;
  conversationState: { isFirstMessage?: boolean; onboardingComplete?: boolean; [key: string]: unknown };
  textingPersonName: string | null;
}): Promise<string | null> {
  const {
    accountId,
    conversationId,
    fromNumber,
    messageText,
    conversationState,
    textingPersonName,
  } = args;

  let phase = await getSmsTellUsPhase(accountId);
  if (phase === "inactive") return null;

  const tellUsGrokOpts = { skipFirstTimeGreeting: true, skipNameHeuristic: true };
  const userInput = messageText.trim();

  try {
    if (phase === "recurring") {
      const kvTell = (await kv.get(`${SMS_TELLUS_KV_PREFIX}${accountId}`)) as { recurringIntroSent?: boolean } | null;
      if (!kvTell?.recurringIntroSent) {
        await kv.set(`${SMS_TELLUS_KV_PREFIX}${accountId}`, {
          ...kvTell,
          phase: "recurring",
          recurringIntroSent: true,
          updatedAt: Date.now(),
        });
        await addSystemGuidance(
          conversationId,
          `[Tell us about you] This couple already shared relationship stage, a couple goal, and something they're excited about on the web. Ask ONE short question about recurring things to stay on top of (bills, routines, reminders, logistics). SMS length.`,
        );
      }
      const ex = await extractSmsTellUsAnswer("recurring_priorities", userInput);
      if (!("filled" in ex) || !ex.filled) {
        await addSystemGuidance(
          conversationId,
          `[Tell us about you] That answer was a bit unclear for recurring priorities. One quick follow-up.`
        );
        return await processMessageWithGrok(
          conversationId,
          fromNumber,
          messageText,
          conversationState,
          accountId,
          textingPersonName,
          tellUsGrokOpts
        );
      }
      await db.insertRecurringPriorityEntry(accountId, ex.summary, "sms_onboarding", conversationId);
      const completedAt = new Date().toISOString();
      await db.upsertCoupleOnboardingProfile(accountId, {
        sms_onboarding_completed_at: completedAt,
      });
      await saveSmsTellUsPhase(accountId, "done");
      await addSystemGuidance(
        conversationId,
        `[Tell us about you] Onboarding finished. Thank them briefly; let them know you're here for calendar, money, and planning questions.`
      );
      return await processMessageWithGrok(
        conversationId,
        fromNumber,
        messageText,
        conversationState,
        accountId,
        textingPersonName,
        tellUsGrokOpts
      );
    }
  } catch (e) {
    console.error("[Twilio] tryHandleSmsTellUsOnboarding:", e);
    return null;
  }

  return null;
}

// Process incoming message with Grok AI
async function processMessageWithGrok(
  conversationId: string,
  fromNumber: string,
  text: string,
  state: any,
  userId: string | null,
  textingPersonName: string | null = null,
  opts?: { skipFirstTimeGreeting?: boolean; skipNameHeuristic?: boolean }
): Promise<string> {
  const userInput = text.trim();

  // Identity guidance is handled once at the Twilio entry handler (deduped/replaced there).

  // Debug (no secrets): confirm whether SnapTrade investments blob is present before calling Grok.
  try {
    const mem = await db.getConversationMemory(conversationId);
    const hasSnaptrade = !!mem?.messages?.some(
      (m: any) => m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('[Financial Data - snaptrade-investments]')
    );
    console.log(`[Twilio] Pre-Grok context has snaptrade-investments: ${hasSnaptrade}`);
  } catch (e) {
    console.warn('[Twilio] Pre-Grok context check failed:', e);
  }

  // Handle first-time greeting
  if (state.isFirstMessage) {
    await updateUserContext(conversationId, {
      person1Name: state.person1Name,
      person2Name: state.person2Name,
      onboardingComplete: false,
      financialDataDiscussed: [],
      preferences: {}
    });

    if (!opts?.skipFirstTimeGreeting) {
      const greetingGuidance = textingPersonName
        ? `This is the first SMS Homebase is sending in this thread. The texter is ${textingPersonName}. Reply in plain text: one short warm greeting using their name, one sentence on helping their household (calendar, money, planning), then offer this week's check-in or ask what they need. No bullet points; do not mention "onboarding" unless they do.`
        : `First SMS in this thread to Homebase. Reply in plain text: brief warm greeting, one sentence on helping couples with calendar and money, offer a weekly check-in or open question. No bullet points; do not push app setup unless they ask.`;

      await addSystemGuidance(conversationId, greetingGuidance);
    }
  }

  // Detect if user is providing names (only accept short, name-like parts to avoid e.g. "Can you check X and let me know" overwriting state)
  if (
    !opts?.skipNameHeuristic &&
    !state.onboardingComplete &&
    (userInput.includes('&') || userInput.toLowerCase().includes(' and '))
  ) {
    const names = text.split(/&| and /i).map((n: string) => n.trim()).filter(Boolean);
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
        `Onboarding complete. Names: ${names[0]} and ${names[1]}. Now begin the weekly check-in conversation naturally. You can ask about their week or what they learned, but only ask ONCE. Don't repeat the same question if you've already asked it.`
      );
    }
  }

  // Detect meal PLAN GENERATION intent (must check before recipe-add intent)
  const isPlanIntent = /\b(generate|make|create|send|get).{0,20}(list|plan|groceries|grocery)|what'?s? for dinner|(this|next) week'?s? (meals?|dinners?|groceries|list)|grocery list|meal plan\b/i.test(userInput);

  if (isPlanIntent) {
    // Extract recipe idea if the user mentioned one (e.g. "make a plan with salmon tacos")
    const recipeMatch = userInput.match(/(?:with|featuring|including|make|cook|try)\s+(.+?)(?:\s+this week)?$/i);
    const recipeIdea = recipeMatch ? recipeMatch[1] : "Chef's choice — something varied and delicious";

    // Reply immediately — generation takes 20-40s, Twilio would time out if we await
    (async () => {
      try {
        console.log(`[Twilio] Async meal plan generation started for ${fromNumber}`);
        const result = await generateMealPlan(recipeIdea);
        const smsText = formatPlanForSMS(result);
        await sendTwilioSMS(replyTo, smsText);
        console.log(`[Twilio] Meal plan sent to ${fromNumber}`);
      } catch (err) {
        console.error('[Twilio] Async plan generation failed:', err);
        try {
          await sendTwilioSMS(replyTo, "Sorry, had trouble generating your plan. Try again in a moment.");
        } catch { /* ignore secondary failure */ }
      }
    })();

    return "On it! Generating your weekly meal plan now — I'll text you back in about 30 seconds 🛒";
  }

  // Detect home intent — route to home sub-agent
  const isHomeIntent = /\b(home value|equity|mortgage|house worth|property value|maintenance|hvac|roof|gutter|home report)\b/i.test(userInput);

  if (isHomeIntent) {
    try {
      console.log('[Twilio] Routing to home sub-agent');
      const FUNCTION_BASE_URL = Deno.env.get("FUNCTION_BASE_URL") || "http://localhost:54321/functions/v1";
      const PUBLIC_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const homeResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/home/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PUBLIC_ANON_KEY}` },
          body: JSON.stringify({ message: userInput, sessionId: conversationId }),
        }
      );
      if (homeResponse.ok) {
        const data = await homeResponse.json();
        if (data.success && data.response) return data.response;
      }
    } catch (error) {
      console.error('[Twilio] Home sub-agent error:', error);
    }
  }

  // Detect travel intent — route to travel sub-agent
  const isTravelIntent = /\b(flight|hotel|passport|visa|itinerary|vacation|trip|travel|book.*travel|price.*drop|watch.*flight|family.*trip)\b/i.test(userInput);

  if (isTravelIntent) {
    try {
      console.log('[Twilio] Routing to travel sub-agent');
      const FUNCTION_BASE_URL = Deno.env.get("FUNCTION_BASE_URL") || "http://localhost:54321/functions/v1";
      const PUBLIC_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const travelResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/travel/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PUBLIC_ANON_KEY}` },
          body: JSON.stringify({ message: userInput, sessionId: conversationId }),
        }
      );
      if (travelResponse.ok) {
        const data = await travelResponse.json();
        if (data.success && data.response) return data.response;
      }
    } catch (error) {
      console.error('[Twilio] Travel sub-agent error:', error);
    }
  }

  // Detect grocery/recipe intent — route to meal planner sub-agent
  const hasUrl = /https?:\/\/[^\s]+/.test(userInput);
  const isRecipeIntent = hasUrl ||
    /\b(recipe|add this|want to (try|make|cook)|here'?s? a recipe)\b/i.test(userInput);

  if (isRecipeIntent) {
    try {
      console.log('[Twilio] Routing to meal planner sub-agent');
      const recipe = await digestRecipeText(userInput, `sms:${fromNumber}`);
      await addPendingRecipe(recipe);

      if (recipe.flagged) {
        return `Heads up — "${recipe.name}" contains ${recipe.flag_reason || "a restricted ingredient"}. I've saved it but flagged it so it won't appear in your grocery plan.`;
      }

      return `Added "${recipe.name}" to your recipe queue! It'll be included in your next Homebase grocery plan. 🛒`;
    } catch (error) {
      console.error('[Twilio] Meal planner error:', error);
      // Fall through to Grok for a graceful response
    }
  }

  // General grocery/household food questions → route to meals sub-agent so it has full household context
  const isGeneralGroceryQuestion = /\b(what do we (usually|normally|typically) (buy|get|order)|our grocery|our groceries|grocery context|grocery history|grocery list|our (usual|regular) (items|foods?|brands?|proteins?|staples?)|what('?s| is) on (our|the) (list|plan)|do we (have|buy|get)|pending recipes?|recipe queue|our meal|our (weekly|usual) meals?)\b/i.test(userInput);

  if (isGeneralGroceryQuestion) {
    try {
      console.log('[Twilio] Routing general grocery question to meal planner sub-agent');
      const FUNCTION_BASE_URL = Deno.env.get("FUNCTION_BASE_URL") || "http://localhost:54321/functions/v1";
      const PUBLIC_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const mealsResponse = await fetch(
        `${FUNCTION_BASE_URL}/make-server-8c22500c/meals/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PUBLIC_ANON_KEY}` },
          body: JSON.stringify({ message: userInput, sessionId: conversationId }),
        }
      );
      if (mealsResponse.ok) {
        const data = await mealsResponse.json();
        if (data.success && data.response) return data.response;
      }
    } catch (error) {
      console.error('[Twilio] Meal planner (general grocery) error:', error);
      // Fall through to Grok
    }
  }

  // Call Grok AI with the user's message
  try {
    const aiResponse = await callGrok(userInput, conversationId, state.isFirstMessage);
    return aiResponse;
  } catch (error) {
    console.error('[Twilio] Grok AI error:', error);
    return "I'm having trouble connecting right now. Can you try again in a moment?";
  }
}

// Send SMS via Twilio (also handles WhatsApp when toNumber starts with "whatsapp:")
export async function sendTwilioSMS(toNumber: string, message: string): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const smsFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !smsFromNumber) {
    console.error('[Twilio] Missing credentials');
    throw new Error('Twilio credentials not configured');
  }

  const isWhatsAppTo = toNumber.toLowerCase().startsWith("whatsapp:");
  const cleanTo = toNumber.replace(/^whatsapp:/i, "");
  const formattedCleanTo = cleanTo.startsWith('+') ? cleanTo : `+${cleanTo.replace(/[^\d]/g, '')}`;

  // WhatsApp sandbox From must be whatsapp:+14155238886; SMS uses TWILIO_FROM_NUMBER
  const From = isWhatsAppTo ? "whatsapp:+14155238886" : smsFromNumber;
  const To   = isWhatsAppTo ? `whatsapp:${formattedCleanTo}` : formattedCleanTo;

  // Twilio API uses Basic Auth
  const authHeader = `Basic ${btoa(`${accountSid}:${authToken}`)}`;

  const payload = new URLSearchParams({ From, To, Body: message });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    }
  );

  const result = await response.json();
 
  if (!response.ok) {
    console.error('[Twilio] Failed to send SMS:', result);
    throw new Error(`Twilio SMS send failed: ${result.message || result.error_message}`);
  }

  console.log(`[Twilio] twilio_send status=${response.status} sid=${result.sid}`);
}

// Send MMS via Twilio (SMS with image/media). Also handles WhatsApp channel.
export async function sendTwilioSMSWithMedia(toNumber: string, body: string | null, mediaUrl: string): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const smsFromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !smsFromNumber) {
    console.error('[Twilio] Missing credentials');
    throw new Error('Twilio credentials not configured');
  }

  const isWhatsAppTo = toNumber.toLowerCase().startsWith("whatsapp:");
  const cleanTo = toNumber.replace(/^whatsapp:/i, "");
  const formattedCleanTo = cleanTo.startsWith('+') ? cleanTo : `+${cleanTo.replace(/[^\d]/g, '')}`;

  const From = isWhatsAppTo ? "whatsapp:+14155238886" : smsFromNumber;
  const To   = isWhatsAppTo ? `whatsapp:${formattedCleanTo}` : formattedCleanTo;

  const authHeader = `Basic ${btoa(`${accountSid}:${authToken}`)}`;
  const payload = new URLSearchParams({ From, To, MediaUrl: mediaUrl });
  if (body != null && body !== '') {
    payload.set('Body', body);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    }
  );

  const result = await response.json();
  if (!response.ok) {
    console.error('[Twilio] Failed to send MMS:', result);
    throw new Error(`Twilio MMS send failed: ${result.message || result.error_message}`);
  }
  console.log(`[Twilio] twilio_send status=${response.status} sid=${result.sid} (mms)`);
}

// Debug endpoint to test Twilio configuration
app.get("/make-server-8c22500c/sms/twilio/test", async (c) => {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

  return c.json({
    configured: !!(accountSid && authToken && fromNumber),
    accountSidSet: !!accountSid,
    authTokenSet: !!authToken,
    fromNumberSet: !!fromNumber,
  });
});

export { app as twilioRoutes };
