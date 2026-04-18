import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { callGrok, updateUserContext, addSystemGuidance, injectFinancialData } from "./grok-ai.tsx";

const app = new Hono();

// Vonage SMS webhook endpoint
app.post("/make-server-8c22500c/sms/incoming", async (c) => {
  try {
    const body = await c.req.json();
    const { from, text, messageId, msisdn, to } = body;

    // Vonage sends 'msisdn' as the from number in some cases
    const fromNumber = from || msisdn;
    const messageText = text || '';

    console.log(`Received SMS from ${fromNumber}: ${messageText}`);
    console.log('Full webhook body:', JSON.stringify(body));

    if (!fromNumber) {
      console.error('No sender phone number found in webhook');
      return c.json({ success: false, error: 'Missing sender number' }, 400);
    }

    // Use phone number as conversation ID
    const conversationId = `sms:${fromNumber}`;

    // Get or create conversation state for this phone number
    const stateKey = `sms:state:${fromNumber}`;
    let conversationState = await kv.get(stateKey) || {
      isFirstMessage: true,
      person1Name: 'Partner 1',
      person2Name: 'Partner 2',
      onboardingComplete: false,
      lastMessageTime: new Date().toISOString()
    };

    // Process the message with Grok AI
    const response = await processMessageWithGrok(
      conversationId,
      fromNumber,
      messageText,
      conversationState
    );

    // Update conversation state
    conversationState.isFirstMessage = false;
    conversationState.lastMessageTime = new Date().toISOString();
    await kv.set(stateKey, conversationState);

    // Send SMS response via Vonage
    await sendSMS(fromNumber, response);

    return c.json({ success: true, message: 'SMS processed' });
  } catch (error) {
    console.error('Error processing incoming SMS:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Process incoming message with Grok AI
async function processMessageWithGrok(
  conversationId: string,
  fromNumber: string,
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
      'User is new. Start with a brief greeting and ask if they want to start onboarding or skip to weekly check-in. Keep it short and friendly.'
    );
  }

  // Detect if user is providing names (only during onboarding; require parens so " and " in normal chat doesn't misfire)
  if (
    !state.onboardingComplete &&
    (userInput.includes('&') || userInput.toLowerCase().includes(' and '))
  ) {
    const names = text.split(/&|and/i).map(n => n.trim());
    if (names.length >= 2) {
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

  // Call Grok AI with the user's message
  try {
    const aiResponse = await callGrok(userInput, conversationId, state.isFirstMessage);
    return aiResponse;
  } catch (error) {
    console.error('Grok AI error:', error);
    return "I'm having trouble connecting right now. Can you try again in a moment?";
  }
}

// Send SMS via Vonage
async function sendSMS(toNumber: string, message: string): Promise<void> {
  const apiKey = Deno.env.get('VONAGE_API_KEY');
  const apiSecret = Deno.env.get('VONAGE_API_SECRET');
  const fromNumber = Deno.env.get('VONAGE_FROM_NUMBER');

  if (!apiKey || !apiSecret || !fromNumber) {
    throw new Error('Vonage credentials not configured');
  }

  // Ensure phone number is properly formatted (remove any non-digit characters except +)
  const formattedToNumber = toNumber.replace(/[^\d+]/g, '');
  
  console.log(`Attempting to send SMS to: ${formattedToNumber} from: ${fromNumber}`);

  const payload = {
    api_key: apiKey,
    api_secret: apiSecret,
    from: fromNumber,
    to: formattedToNumber,
    text: message,
  };

  console.log('Vonage SMS payload:', JSON.stringify({ ...payload, api_key: '[REDACTED]', api_secret: '[REDACTED]' }));

  const response = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  
  console.log('Vonage response:', JSON.stringify(result));
  
  if (result.messages[0].status !== '0') {
    console.error('Failed to send SMS:', result);
    throw new Error(`SMS send failed: ${result.messages[0]['error-text']}`);
  }

  console.log(`SMS sent successfully to ${formattedToNumber}`);
}

export { app as smsRoutes };