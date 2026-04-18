import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { googleCalendarRoutes } from "./google-calendar.tsx";
import { fetchMarketData, fetchComprehensiveMarketUpdate } from "./market-data.tsx";
import { smsRoutes } from "./sms-handler.tsx";
import { twilioRoutes } from "./twilio-handler.tsx";
import { apiKeyRoutes } from "./api-keys.tsx";
import { webChatRoutes } from "./web-chat.tsx";
import { mealPlannerRoutes } from "./grocery-meal-planner.tsx";
import { travelAgentRoutes } from "./travel-agent.tsx";
import { homeAgentRoutes } from "./home-agent.tsx";
import { authRoutes } from "./auth.tsx";
import { onboardingRoutes } from "./onboarding.tsx";
import { partnerInviteRoutes } from "./partner-invite-routes.tsx";
import { getUserById, saveLinkedAccount, getLinkedAccounts, getLatestBalances, getLatestBalanceTimestamp, getTransactions, saveBalanceSnapshot, saveTransaction, getLinkedAccountByExternalId, updateLinkedAccountState } from "./db.tsx";
import { savePlaidAccessToken, saveSnapTradeUserSecret, getSnapTradeUserSecret, saveSnapTradeCallbackState, getSnapTradeCallbackState } from "./db.tsx";
import { saveFinancialLinkSession } from "./db.tsx";
import * as snaptrade from "./snaptrade.tsx";
// NOTE: getUserById() reads from the new accounts+profiles schema and returns a User object
// with person1_name, person2_name, etc. fields mapped from profiles, so existing code works.

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-8c22500c/health", (c) => {
  return c.json({ status: "ok" });
});

// Market data endpoint
app.get("/make-server-8c22500c/market-data", async (c) => {
  try {
    const marketData = await fetchMarketData();
    return c.json({ success: true, data: marketData });
  } catch (error) {
    console.error('Error fetching market data:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Comprehensive market update endpoint (includes news)
app.get("/make-server-8c22500c/comprehensive-market-update", async (c) => {
  try {
    const marketUpdate = await fetchComprehensiveMarketUpdate();
    return c.json({ success: true, data: marketUpdate });
  } catch (error) {
    console.error('Error fetching comprehensive market update:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Mount Google Calendar routes
app.route("/", googleCalendarRoutes);

// Mount SMS routes
app.route("/", smsRoutes);

// Mount Twilio routes
app.route("/", twilioRoutes);

// Mount API Key routes
app.route("/", apiKeyRoutes);

// Mount Web Chat routes
app.route("/", webChatRoutes);

// Mount Meal Planner sub-agent routes
app.route("/", mealPlannerRoutes);

// Mount Travel sub-agent routes
app.route("/", travelAgentRoutes);

// Mount Home sub-agent routes
app.route("/", homeAgentRoutes);
// Mount Auth routes
app.route("/", authRoutes);

// Mount Onboarding routes
app.route("/", onboardingRoutes);

// Partner invite message (onboarding) — isolated Grok thread
app.route("/", partnerInviteRoutes);

// Diagnostic endpoint to list available Grok models
app.get("/make-server-8c22500c/test-grok", async (c) => {
  const apiKey = Deno.env.get('GROK_API_KEY');
  
  if (!apiKey) {
    return c.json({ 
      success: false, 
      error: 'GROK_API_KEY not set in environment variables'
    });
  }

  console.log(`Testing Grok API with key: ${apiKey.substring(0, 15)}...`);

  try {
    // First, try to list available models
    const modelsResponse = await fetch('https://api.x.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const modelsText = await modelsResponse.text();
    console.log('Models API response:', modelsText);

    let availableModels = [];
    if (modelsResponse.ok) {
      const modelsData = JSON.parse(modelsText);
      availableModels = modelsData.data || modelsData;
    }

    // Then test each available model
    const testResults = [];
    const modelsToTest = availableModels.length > 0 
      ? availableModels.map((m: any) => m.id || m)
      : ['grok-3', 'grok-2-vision-1212', 'grok-4-fast-reasoning'];

    for (const model of modelsToTest.slice(0, 3)) { // Test first 3 models
      try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5
          })
        });

        const responseText = await response.text();
        testResults.push({
          model,
          status: response.status,
          works: response.ok,
          response: responseText.substring(0, 200)
        });

        if (response.ok) {
          break; // Found working model
        }
      } catch (error) {
        testResults.push({
          model,
          error: String(error)
        });
      }
    }

    return c.json({
      apiKeyPrefix: apiKey.substring(0, 15) + '...',
      modelsEndpointStatus: modelsResponse.status,
      availableModels,
      testResults
    });
  } catch (error) {
    return c.json({
      error: String(error)
    }, 500);
  }
});
app.get("/make-server-8c22500c/grok-account-info", async (c) => {
  const apiKey = Deno.env.get('GROK_API_KEY');
  
  if (!apiKey) {
    return c.json({ 
      success: false, 
      error: 'GROK_API_KEY not set in environment variables'
    });
  }

  try {
    // Try to get account/team information from X.AI API
    const accountInfo: any = {
      apiKeyPrefix: apiKey.substring(0, 20) + '...',
      teamId: '41e05143-cf37-4de8-86f3-67746dad3c9a', // From the error message
      consoleUrl: 'https://console.x.ai/team/41e05143-cf37-4de8-86f3-67746dad3c9a',
      note: 'Account info must be checked at the X.AI console URL above'
    };

    // Try to get usage/billing info (if available)
    try {
      const usageResponse = await fetch('https://api.x.ai/v1/usage', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (usageResponse.ok) {
        const usageData = await usageResponse.json();
        accountInfo.usage = usageData;
      } else {
        accountInfo.usageError = `Status: ${usageResponse.status}`;
      }
    } catch (error) {
      accountInfo.usageError = String(error);
    }

    return c.json({
      success: true,
      accountInfo
    });
  } catch (error) {
    return c.json({
      success: false,
      error: String(error),
      teamId: '41e05143-cf37-4de8-86f3-67746dad3c9a',
      consoleUrl: 'https://console.x.ai/team/41e05143-cf37-4de8-86f3-67746dad3c9a'
    }, 500);
  }
});
// Add this section to your existing index.tsx
// Place it after the other route imports and before Deno.serve

// ============ FINANCIAL CONNECTIONS ROUTES ============

// Note: Using actual secret names from Supabase (with spaces and different casing)
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_Live_Key');
const STRIPE_PUBLISHABLE_KEY = Deno.env.get('STRIPE_Publishable_Key');
const PLAID_CLIENT_ID = Deno.env.get('Plaid_Client_ID');
const PLAID_SECRET = Deno.env.get('Plaid_SandBox Secret');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox'; // Default to sandbox if not set

// Determine Plaid API base URL based on environment
const PLAID_BASE_URL = PLAID_ENV === 'production' 
  ? 'https://production.plaid.com'
  : 'https://sandbox.plaid.com';

// Diagnostic endpoint to see ALL environment variables (for debugging)
app.get('/make-server-8c22500c/financial/debug-env', (c) => {
  const allEnv = Deno.env.toObject();
  
  // Filter to only show keys that might be relevant (for security)
  const relevantKeys = Object.keys(allEnv).filter(key => 
    key.includes('STRIPE') || 
    key.includes('PLAID') || 
    key.includes('SUPABASE') ||
    key.includes('GROK')
  );
  
  const envInfo: Record<string, any> = {};
  for (const key of relevantKeys) {
    const value = allEnv[key];
    envInfo[key] = {
      exists: !!value,
      length: value?.length || 0,
    };
  }
  
  console.log('[Env Debug] All relevant env vars:', JSON.stringify(envInfo, null, 2));
  console.log('[Env Debug] Total env vars:', Object.keys(allEnv).length);
  
  return c.json({
    totalEnvVars: Object.keys(allEnv).length,
    relevantEnvVars: envInfo,
    specificChecks: {
      'STRIPE_Live_Key': {
        exists: !!Deno.env.get('STRIPE_Live_Key'),
        value: Deno.env.get('STRIPE_Live_Key') ? '***set***' : 'NOT SET'
      },
      'STRIPE_Publishable_Key': {
        exists: !!Deno.env.get('STRIPE_Publishable_Key'),
        value: Deno.env.get('STRIPE_Publishable_Key') ? '***set***' : 'NOT SET'
      },
      'Plaid_Client_ID': {
        exists: !!Deno.env.get('Plaid_Client_ID'),
        value: Deno.env.get('Plaid_Client_ID') ? '***set***' : 'NOT SET'
      },
      'Plaid_SandBox Secret': {
        exists: !!Deno.env.get('Plaid_SandBox Secret'),
        value: Deno.env.get('Plaid_SandBox Secret') ? '***set***' : 'NOT SET'
      }
    }
  });
});

// Debug configuration endpoint
app.get('/make-server-8c22500c/financial/debug-config', (c) => {
  const stripeSecretKey = Deno.env.get('STRIPE_Live_Key');
  const stripePublishableKey = Deno.env.get('STRIPE_Publishable_Key');
  const plaidClientId = Deno.env.get('Plaid_Client_ID');
  const plaidSecret = Deno.env.get('Plaid_SandBox Secret');
  
  // Log to console (visible in Supabase logs)
  console.log('[Financial Debug] STRIPE_Live_Key exists:', !!stripeSecretKey);
  console.log('[Financial Debug] STRIPE_Live_Key length:', stripeSecretKey?.length || 0);
  console.log('[Financial Debug] STRIPE_Live_Key prefix:', stripeSecretKey?.substring(0, 7) || 'not set');
  console.log('[Financial Debug] STRIPE_Publishable_Key exists:', !!stripePublishableKey);
  console.log('[Financial Debug] Plaid_Client_ID exists:', !!plaidClientId);
  console.log('[Financial Debug] Plaid_SandBox Secret exists:', !!plaidSecret);
  
  return c.json({
    stripeConfigured: !!stripeSecretKey,
    stripeKeyLength: stripeSecretKey?.length || 0,
    stripePublishableKeyConfigured: !!stripePublishableKey,
    plaidConfigured: !!(plaidClientId && plaidSecret),
    plaidClientIdLength: plaidClientId?.length || 0,
    plaidSecretLength: plaidSecret?.length || 0,
    snaptradeConfigured: !!(Deno.env.get('SNAPTRADE_CLIENT_ID') && Deno.env.get('SNAPTRADE_CONSUMER_KEY')),
    allEnvVars: {
      hasStripeSecretKey: !!stripeSecretKey,
      hasStripePublishableKey: !!stripePublishableKey,
      hasPlaidClientId: !!plaidClientId,
      hasPlaidSecret: !!plaidSecret,
      hasSnapTradeClientId: !!Deno.env.get('SNAPTRADE_CLIENT_ID'),
      hasSnapTradeConsumerKey: !!Deno.env.get('SNAPTRADE_CONSUMER_KEY'),
    }
  });
});

// Create Stripe session
app.post('/make-server-8c22500c/financial/stripe-create-session', async (c) => {
  try {
    const { userId, partnerRole } = await c.req.json();
    
    // Detailed validation with specific error messages
    if (!userId) {
      console.error('[Stripe Session] Missing userId');
      return c.json({ error: 'User ID is required', code: 'MISSING_USER_ID' }, 400);
    }
    
    if (!STRIPE_SECRET_KEY) {
      console.error('[Stripe Session] STRIPE_SECRET_KEY not configured');
      return c.json({ 
        error: 'Stripe secret key not configured', 
        code: 'STRIPE_NOT_CONFIGURED',
        hint: 'Check that STRIPE_Live_Key is set in Supabase Edge Function secrets'
      }, 400);
    }

    console.log('[Stripe Session] Looking up user:', userId);
    const user = await getUserById(userId);
    if (!user) {
      console.error('[Stripe Session] User not found:', userId);
      return c.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, 404);
    }

    const email =
      partnerRole === 'person2'
        ? (user.secondary_email?.trim() || user.primary_email)
        : user.primary_email;
    const name = partnerRole === 'person2' ? user.person2_name : user.person1_name;

    console.log('[Stripe Session] Creating Stripe customer for:', email);
    // Get or create Stripe customer
    const customerResponse = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ email, name, 'metadata[user_id]': userId }),
    });
    const customer = await customerResponse.json();

    if (!customerResponse.ok) {
      console.error('[Stripe Session] Customer creation failed:', customer);
      return c.json({ 
        error: 'Failed to create Stripe customer', 
        code: 'CUSTOMER_CREATION_FAILED',
        details: customer 
      }, 400);
    }

    console.log('[Stripe Session] Creating Financial Connections session for customer:', customer.id);
    // Create Financial Connections session
    const params = new URLSearchParams({
      'account_holder[type]': 'customer',
      'account_holder[customer]': customer.id,
      'filters[countries][]': 'US',
    });
    params.append('permissions[]', 'balances');
    params.append('permissions[]', 'transactions');
    
    const sessionResponse = await fetch('https://api.stripe.com/v1/financial_connections/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const session = await sessionResponse.json();

    if (!sessionResponse.ok) {
      console.error('[Stripe Session] Session creation failed:', session);
      return c.json({ 
        error: 'Session creation failed', 
        code: 'SESSION_CREATION_FAILED',
        details: session 
      }, 400);
    }

    console.log('[Stripe Session] Session created successfully:', session.id);
    return c.json({
      success: true,
      clientSecret: session.client_secret,
      sessionId: session.id,
      publishableKey: STRIPE_PUBLISHABLE_KEY, // Return publishable key for frontend
    });
  } catch (error) {
    console.error('[Stripe Session] Unexpected error:', error);
    return c.json({ 
      error: error.message || 'Internal server error',
      code: 'INTERNAL_ERROR'
    }, 500);
  }
});

// Map Stripe Financial Connections category to our database category
function mapStripeCategoryToDbCategory(stripeCategory: string): string {
  const categoryMap: Record<string, string> = {
    'cash': 'depository',
    'checking': 'depository',
    'savings': 'depository',
    'depository': 'depository',
    'credit': 'credit',
    'credit_card': 'credit',
    'investment': 'investment',
    'loan': 'loan',
    'mortgage': 'loan',
    'other': 'other',
  };
  
  // Default to 'other' if category not recognized
  return categoryMap[stripeCategory.toLowerCase()] || 'other';
}

// Save connected accounts
app.post('/make-server-8c22500c/financial/stripe-save-accounts', async (c) => {
  try {
    const { userId, partnerRole, accountIds } = await c.req.json();

    console.log('[Save Accounts] Request:', { userId, partnerRole, accountIds, accountCount: accountIds?.length });

    if (!userId || !accountIds || !Array.isArray(accountIds)) {
      return c.json({ error: 'Invalid request parameters' }, 400);
    }

    const savedAccounts = [];
    const errors = [];

    for (const accountId of accountIds) {
      try {
        console.log(`[Save Accounts] Fetching account ${accountId} from Stripe...`);
        const accountResponse = await fetch(
          `https://api.stripe.com/v1/financial_connections/accounts/${accountId}`,
          { headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` } }
        );

        const account = await accountResponse.json();

        if (!accountResponse.ok) {
          console.error(`[Save Accounts] Error fetching account ${accountId}:`, account);
          errors.push({ accountId, error: account.error || 'Failed to fetch from Stripe' });
          continue;
        }

        console.log(`[Save Accounts] Account data:`, {
          id: account.id,
          display_name: account.display_name,
          institution_name: account.institution_name,
          category: account.category
        });

        // Use DB function instead of direct insert
        try {
          const mappedCategory = mapStripeCategoryToDbCategory(account.category);
          const savedAccount = await saveLinkedAccount({
            user_id: userId,
            partner_role: partnerRole || 'person1',
            provider: 'stripe',
            external_account_id: account.id,
            display_name: account.display_name || account.institution_name,
            institution_name: account.institution_name,
            last_four_digits: account.last4,
            category: mappedCategory,
            subcategory: account.subcategory,
            connection_state: 'active',
            granted_permissions: account.permissions || [],
            supports_ach_payments: mappedCategory === 'depository',
          });

          console.log(`[Save Accounts] Successfully saved account ${account.id}`);
          savedAccounts.push(savedAccount);

          // Subscribe to balance updates and trigger refresh
          if (account.permissions?.includes('balances')) {
            await fetch(`https://api.stripe.com/v1/financial_connections/accounts/${accountId}/subscribe`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ 'features[]': 'balances' }),
            });

            // Trigger refresh to get initial balance (will arrive via webhook)
            try {
              const refreshResponse = await fetch(
                `https://api.stripe.com/v1/financial_connections/accounts/${accountId}/refresh`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({ 'features[]': 'balance' }), // Note: singular 'balance'
                }
              );
              
              const refreshData = await refreshResponse.json();
              
              if (refreshResponse.ok) {
                console.log(`[Save Accounts] Triggered balance refresh for ${accountId}. Balance will arrive via webhook.`);
                
                // Also save balance data directly from refresh response (as fallback)
                if (refreshData.balance && refreshData.balance.cash) {
                  try {
                    const balance = refreshData.balance.cash;
                    // Stripe's usd field is already in cents, not dollars
                    const availableCents = balance.available?.usd ? Math.round(balance.available.usd) : null;
                    const currentCents = balance.current?.usd ? Math.round(balance.current.usd) : null;
                    
                    if (availableCents !== null || currentCents !== null) {
                      await saveBalanceSnapshot({
                        linked_account_id: savedAccount.id,
                        current_balance_cents: currentCents ?? undefined,
                        available_balance_cents: availableCents ?? undefined,
                        credit_limit_cents: undefined,
                        currency_code: 'USD',
                      });
                      console.log(`[Save Accounts] Saved initial balance from refresh: current=$${(currentCents || 0) / 100}, available=$${(availableCents || 0) / 100}`);
                    }
                  } catch (balanceError) {
                    console.error(`[Save Accounts] Error saving balance from refresh:`, balanceError);
                  }
                }
              } else {
                console.error(`[Save Accounts] Balance refresh error:`, refreshData);
              }
            } catch (refreshError) {
              console.error(`[Save Accounts] Error triggering balance refresh:`, refreshError);
            }
          }

          // Subscribe to transaction updates and trigger refresh
          if (account.permissions?.includes('transactions')) {
            await fetch(`https://api.stripe.com/v1/financial_connections/accounts/${accountId}/subscribe`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ 'features[]': 'transactions' }),
            });

            // Trigger refresh to get initial transactions (will arrive via webhook)
            try {
              const refreshResponse = await fetch(
                `https://api.stripe.com/v1/financial_connections/accounts/${accountId}/refresh`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({ 'features[]': 'transactions' }),
                }
              );
              
              const refreshData = await refreshResponse.json();
              
              if (refreshResponse.ok) {
                console.log(`[Save Accounts] Triggered transaction refresh for ${accountId}. Transactions will arrive via webhook.`);
              } else {
                console.error(`[Save Accounts] Transaction refresh error:`, refreshData);
              }
            } catch (refreshError) {
              console.error(`[Save Accounts] Error triggering transaction refresh:`, refreshError);
            }
          }
        } catch (dbError: any) {
          console.error(`[Save Accounts] Database error for account ${account.id}:`, dbError);
          errors.push({ accountId: account.id, error: dbError.message || 'Database error' });
          continue;
        }
      } catch (accountError: any) {
        console.error(`[Save Accounts] Error processing account ${accountId}:`, accountError);
        errors.push({ accountId, error: accountError.message || 'Unknown error' });
      }
    }

    if (savedAccounts.length === 0 && errors.length > 0) {
      return c.json({ 
        error: 'Failed to save any accounts', 
        details: errors,
        message: errors[0]?.error || 'Unknown error'
      }, 500);
    }

    return c.json({
      success: true,
      accountsLinked: savedAccounts.length,
      accounts: savedAccounts,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[Save Accounts] Fatal error:', error);
    return c.json({ 
      error: 'Failed to save accounts', 
      details: error.message,
      stack: error.stack 
    }, 500);
  }
});

// ============ SNAPTRADE (Brokerage Accounts) ============

const SNAPTRADE_CLIENT_ID = Deno.env.get('SNAPTRADE_CLIENT_ID');
const SNAPTRADE_CONSUMER_KEY = Deno.env.get('SNAPTRADE_CONSUMER_KEY');
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || Deno.env.get('PUBLIC_APP_URL');

function withParams(base: string, params: Record<string, string>): string {
  const sep = base.includes('?') ? '&' : '?';
  const qs = new URLSearchParams(params).toString();
  return base + sep + qs;
}

// Create SnapTrade login link (step 1: register user + get Connection Portal URL)
app.post('/make-server-8c22500c/financial/snaptrade-create-login-link', async (c) => {
  try {
    const { userId, partnerRole, redirectUrl } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'User ID is required', code: 'MISSING_USER_ID' }, 400);
    }
    if (!SNAPTRADE_CLIENT_ID || !SNAPTRADE_CONSUMER_KEY) {
      return c.json({
        error: 'SnapTrade not configured',
        code: 'SNAPTRADE_NOT_CONFIGURED',
        hint: 'Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY in Supabase secrets',
      }, 400);
    }

    // Diagnostic: confirm secrets are loaded (never log actual values)
    console.log('[SnapTrade] Credentials loaded', {
      clientIdSet: !!SNAPTRADE_CLIENT_ID,
      clientIdLength: SNAPTRADE_CLIENT_ID?.length ?? 0,
      consumerKeySet: !!SNAPTRADE_CONSUMER_KEY,
      consumerKeyLength: SNAPTRADE_CONSUMER_KEY?.length ?? 0,
    });

    const user = await getUserById(userId);
    if (!user) {
      return c.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, 404);
    }

    // Use app userId as SnapTrade userId (immutable, unique)
    const snaptradeUserId = `hb_${userId}`; // prefix to avoid collisions

    let userSecret = await getSnapTradeUserSecret(userId);
    if (!userSecret) {
      try {
        const reg = await snaptrade.registerSnapTradeUser(
          SNAPTRADE_CLIENT_ID,
          SNAPTRADE_CONSUMER_KEY,
          snaptradeUserId
        );
        userSecret = reg.userSecret;
        await saveSnapTradeUserSecret(userId, userSecret);
      } catch (err: any) {
        console.error('[SnapTrade] Register failed:', err);
        return c.json({
          error: err.message || 'Failed to register SnapTrade user',
          code: 'SNAPTRADE_REGISTER_FAILED',
        }, 500);
      }
    }

    const state = crypto.randomUUID();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const callbackPath = `${supabaseUrl}/functions/v1/make-server-8c22500c/financial/snaptrade-callback`;
    const customRedirect = `${callbackPath}?state=${state}`;

    await saveSnapTradeCallbackState(state, {
      userId,
      partnerRole: partnerRole || 'person1',
      redirectUrl: redirectUrl || undefined,
    });

    const loginResult = await snaptrade.loginSnapTradeUser(
      SNAPTRADE_CLIENT_ID,
      SNAPTRADE_CONSUMER_KEY,
      snaptradeUserId,
      userSecret,
      { customRedirect, connectionType: 'read' }
    );

    return c.json({
      success: true,
      redirectURI: loginResult.redirectURI,
      sessionId: loginResult.sessionId,
    });
  } catch (error: any) {
    console.error('[SnapTrade] Create login link error:', error);
    return c.json({
      error: error.message || 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, 500);
  }
});

// SnapTrade OAuth callback: user lands here after connecting brokerage. Fetch accounts and save.
app.get('/make-server-8c22500c/financial/snaptrade-callback', async (c) => {
  try {
    const state = c.req.query('state');
    if (!state) {
      const base = APP_URL || '/';
      return c.redirect(withParams(base, { snaptrade: 'error', msg: 'missing_state' }));
    }

    const callbackData = await getSnapTradeCallbackState(state);
    if (!callbackData) {
      const base = APP_URL || '/';
      return c.redirect(withParams(base, { snaptrade: 'error', msg: 'expired_or_invalid' }));
    }

    const { userId, partnerRole, redirectUrl } = callbackData;
    const baseRedirect = redirectUrl || APP_URL || '/';
    const snaptradeUserId = `hb_${userId}`;
    const userSecret = await getSnapTradeUserSecret(userId);
    if (!userSecret) {
      return c.redirect(withParams(baseRedirect, { snaptrade: 'error', msg: 'no_secret' }));
    }

    if (!SNAPTRADE_CLIENT_ID || !SNAPTRADE_CONSUMER_KEY) {
      return c.redirect(withParams(baseRedirect, { snaptrade: 'error', msg: 'not_configured' }));
    }

    const accounts = await snaptrade.listSnapTradeAccounts(
      SNAPTRADE_CLIENT_ID,
      SNAPTRADE_CONSUMER_KEY,
      snaptradeUserId,
      userSecret
    );

    const savedAccounts = [];
    for (const acc of accounts) {
      try {
        // SnapTrade may return balance in meta, balance object, or total field
        const balance = acc.meta?.balance ?? acc.balance?.amount ?? acc.balance ?? 0;
        const currency = acc.meta?.currency || acc.balance?.currency || 'USD';
        const balanceCents = Math.round((typeof balance === 'number' ? balance : 0) * 100); // SnapTrade returns dollars

        const saved = await saveLinkedAccount({
          user_id: userId,
          partner_role: (partnerRole as 'person1' | 'person2') || 'person1',
          provider: 'snaptrade',
          external_account_id: acc.id,
          display_name: acc.name || acc.number || `Account ${acc.id}`,
          institution_name: acc.institution_name || 'Brokerage',
          last_four_digits: acc.number ? acc.number.slice(-4) : null,
          category: 'investment',
          connection_state: 'active',
          granted_permissions: ['balances', 'positions'],
          supports_ach_payments: false,
        });

        if (balanceCents !== 0) {
          await saveBalanceSnapshot({
            linked_account_id: saved.id,
            current_balance_cents: balanceCents,
            currency_code: currency,
          });
        }
        savedAccounts.push(saved);
      } catch (err: any) {
        console.error('[SnapTrade] Save account error:', err);
      }
    }

    return c.redirect(withParams(baseRedirect, { snaptrade: 'success', count: String(savedAccounts.length) }));
  } catch (error: any) {
    console.error('[SnapTrade] Callback error:', error);
    const base = APP_URL || '/';
    return c.redirect(withParams(base, { snaptrade: 'error', msg: 'internal' }));
  }
});

// Shared sync logic: refresh Stripe FC accounts for a user and save balance snapshots.
async function runStripeSyncForUser(userId: string): Promise<{ syncedCount: number; errors: any[] }> {
  const accounts = await getLinkedAccounts(userId);
  let syncedCount = 0;
  const errors: any[] = [];
  if (!STRIPE_SECRET_KEY) return { syncedCount: 0, errors: [{ error: 'STRIPE_SECRET_KEY not configured' }] };
  if (accounts.length === 0) return { syncedCount: 0, errors: [] };

  for (const account of accounts) {
    try {
      if (!account.granted_permissions?.includes('balances') && !account.granted_permissions?.includes('transactions')) {
        syncedCount++;
        continue;
      }
      const features: string[] = [];
      if (account.granted_permissions?.includes('balances')) features.push('balance');
      if (account.granted_permissions?.includes('transactions')) features.push('transactions');
      const params = new URLSearchParams();
      features.forEach(f => params.append('features[]', f));
      const refreshResponse = await fetch(
        `https://api.stripe.com/v1/financial_connections/accounts/${account.external_account_id}/refresh`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params,
        }
      );
      const refreshData = await refreshResponse.json();
      if (!refreshResponse.ok) {
        errors.push({ accountId: account.external_account_id, type: 'refresh', error: refreshData.error || 'Unknown error' });
        continue;
      }
      if (refreshData.balance?.cash) {
        const balance = refreshData.balance.cash;
        const availableCents = balance.available?.usd != null ? Math.round(balance.available.usd) : null;
        const currentCents = balance.current?.usd != null ? Math.round(balance.current.usd) : null;
        if (availableCents !== null || currentCents !== null) {
          await saveBalanceSnapshot({
            linked_account_id: account.id,
            current_balance_cents: currentCents ?? undefined,
            available_balance_cents: availableCents ?? undefined,
            credit_limit_cents: undefined,
            currency_code: 'USD',
          });
        }
      }
      syncedCount++;
    } catch (err: any) {
      errors.push({ accountId: account.external_account_id, error: err.message });
    }
  }
  return { syncedCount, errors };
}

// Sync balances and transactions for existing accounts
app.post('/make-server-8c22500c/financial/sync-accounts', async (c) => {
  try {
    const { userId } = await c.req.json();
    if (!userId || !STRIPE_SECRET_KEY) {
      return c.json({ error: 'Invalid request' }, 400);
    }
    console.log(`[Sync Accounts] Starting sync for userId: ${userId}`);
    const accounts = await getLinkedAccounts(userId);
    if (accounts.length === 0) {
      return c.json({ success: true, message: 'No accounts to sync', syncedAccounts: 0 });
    }
    const { syncedCount, errors } = await runStripeSyncForUser(userId);
    return c.json({
      success: true,
      message: `Triggered refresh for ${syncedCount} account(s).`,
      syncedAccounts: syncedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('[Sync Accounts] Fatal error:', error);
    return c.json({ error: 'Failed to sync accounts', details: error.message }, 500);
  }
});

// Get linked accounts
app.get('/make-server-8c22500c/financial/accounts', async (c) => {
  try {
    const userId = c.req.query('userId');
    if (!userId) {
      return c.json({ error: 'User ID required' }, 400);
    }

    const accounts = await getLinkedAccounts(userId);

    return c.json({ success: true, accounts });
  } catch (error: any) {
    console.error('Error fetching accounts:', error);
    // If table doesn't exist, return empty array instead of error
    if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.message?.includes('table')) {
      console.log('Financial tables not yet created, returning empty array');
      return c.json({ success: true, accounts: [] });
    }
    return c.json({ error: error.message || 'Failed to fetch accounts' }, 500);
  }
});
// Get balances. Optional refreshIfOlderThanMinutes: if set, refresh from Stripe when latest snapshot is older than N minutes.
app.get('/make-server-8c22500c/financial/balances', async (c) => {
  try {
    const userId = c.req.query('userId');
    const refreshIfOlderThanMinutes = c.req.query('refreshIfOlderThanMinutes');
    if (!userId) {
      return c.json({ error: 'User ID required' }, 400);
    }

    const maxAgeMinutes = refreshIfOlderThanMinutes ? parseInt(refreshIfOlderThanMinutes, 10) : 0;
    if (maxAgeMinutes > 0) {
      const accounts = await getLinkedAccounts(userId);
      if (accounts.length > 0) {
        const latestTs = await getLatestBalanceTimestamp(userId);
        const now = Date.now();
        const latestMs = latestTs ? new Date(latestTs).getTime() : 0;
        const maxAgeMs = maxAgeMinutes * 60 * 1000;
        if (!latestTs || now - latestMs > maxAgeMs) {
          console.log(`[Balances] Refreshing Stripe data for userId ${userId} (stale or none)`);
          await runStripeSyncForUser(userId);
        }
      }
    }

    const balances = await getLatestBalances(userId);
    return c.json({ success: true, balances });
  } catch (error: any) {
    console.error('Error fetching balances:', error);
    if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.message?.includes('table')) {
      return c.json({ success: true, balances: [] });
    }
    return c.json({ error: error.message || 'Failed to fetch balances' }, 500);
  }
});
// Get transactions
app.get('/make-server-8c22500c/financial/transactions', async (c) => {
  try {
    const userId = c.req.query('userId');
    const limit = parseInt(c.req.query('limit') || '50');
    
    if (!userId) {
      return c.json({ error: 'User ID required' }, 400);
    }

    const transactions = await getTransactions(userId, limit);

    return c.json({ success: true, transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Disconnect an account (mark as disconnected in linked_accounts)
app.post('/make-server-8c22500c/financial/disconnect-account', async (c) => {
  try {
    const { accountId } = await c.req.json();

    if (!accountId) {
      return c.json({ error: 'Account ID required' }, 400);
    }

    await updateLinkedAccountState(accountId, 'disconnected');

    return c.json({
      success: true,
      message: 'Account disconnected',
    });
  } catch (error: any) {
    console.error('Error disconnecting account:', error);
    return c.json(
      {
        error: 'Failed to disconnect account',
        details: error.message,
      },
      500,
    );
  }
});
// Stripe webhook
app.post('/make-server-8c22500c/financial/stripe-webhook', async (c) => {
  try {
    const body = await c.req.text();
    const event = JSON.parse(body);

    console.log(`[Webhook] Received event: ${event.type}`, event.id);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Store webhook
    await supabase.from('provider_webhooks').insert({
      provider: 'stripe',
      external_event_id: event.id,
      event_type: event.type,
      payload: event.data.object,
    });

    // Handle events
    if (event.type === 'financial_connections.account.disconnected') {
      await supabase
        .from('linked_accounts')
        .update({ 
          connection_state: 'disconnected',
          disconnected_at: new Date().toISOString()
        })
        .eq('external_account_id', event.data.object.id);
      console.log(`[Webhook] Marked account ${event.data.object.id} as disconnected`);
    }

    // Handle balance updates
    if (event.type === 'financial_connections.account.refreshed_balance') {
      const account = event.data.object;
      console.log(`[Webhook] Processing balance refresh for account ${account.id}:`, JSON.stringify(account.balance, null, 2));
      
      const linkedAccount = await getLinkedAccountByExternalId('stripe', account.id);
      
      if (linkedAccount) {
        const balance = account.balance || {};
        const cash = balance.cash || {};
        
        // Stripe's usd field is already in cents, not dollars
        const availableCents = cash.available?.usd ? Math.round(cash.available.usd) : null;
        const currentCents = cash.current?.usd ? Math.round(cash.current.usd) : null;
        const creditLimitCents = balance.credit?.limit?.usd ? Math.round(balance.credit.limit.usd) : null;
        
        // Determine currency from the balance structure (usd key means USD)
        const currency = cash.available?.usd !== undefined ? 'USD' : 
                        cash.current?.usd !== undefined ? 'USD' : 'USD';
        
        if (currentCents !== null || availableCents !== null) {
          await saveBalanceSnapshot({
            linked_account_id: linkedAccount.id,
            current_balance_cents: currentCents ?? undefined,
            available_balance_cents: availableCents ?? undefined,
            credit_limit_cents: creditLimitCents ?? undefined,
            currency_code: currency,
          });
          console.log(`[Webhook] Saved balance for account ${account.id}: current=$${(currentCents || 0) / 100}, available=$${(availableCents || 0) / 100}`);
        } else {
          console.log(`[Webhook] No balance data found in webhook for account ${account.id}`);
        }
      } else {
        console.log(`[Webhook] No linked account found for ${account.id}`);
      }
    }

    // Handle transaction updates
    if (event.type === 'financial_connections.transaction.created' || 
        event.type === 'financial_connections.transaction.updated') {
      const transaction = event.data.object;
      const linkedAccount = await getLinkedAccountByExternalId('stripe', transaction.account);
      
      if (linkedAccount) {
        await saveTransaction({
          linked_account_id: linkedAccount.id,
          provider: 'stripe',
          external_transaction_id: transaction.id,
          amount_cents: transaction.amount,
          currency_code: transaction.currency || 'USD',
          description: transaction.description || 'Transaction',
          merchant_name: transaction.merchant || null,
          category_hierarchy: transaction.category ? [transaction.category] : null,
          is_pending: transaction.status === 'pending',
          transaction_date: new Date(transaction.transacted_at * 1000).toISOString().split('T')[0],
        });
        console.log(`[Webhook] Saved transaction ${transaction.id}`);
      } else {
        console.log(`[Webhook] No linked account found for transaction account ${transaction.account}`);
      }
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: error.message }, 400);
  }
});
// ============ PLAID ROUTES ============

// Helper function to get Plaid API headers
function getPlaidHeaders() {
  return {
    'Content-Type': 'application/json',
    'PLAID-CLIENT-ID': PLAID_CLIENT_ID!,
    'PLAID-SECRET': PLAID_SECRET!,
  };
}

// Create Plaid Link token
app.post('/make-server-8c22500c/financial/plaid-create-token', async (c) => {
  try {
    const { userId, partnerRole } = await c.req.json();
    
    if (!userId || userId === 'default') {
      return c.json({ error: 'User ID required' }, 400);
    }

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      return c.json({ error: 'Plaid not configured' }, 500);
    }

    // Get user info for Plaid
    const user = await getUserById(userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get Supabase URL for webhook
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const webhookUrl = `${supabaseUrl}/functions/v1/make-server-8c22500c/financial/plaid-webhook`;

    // Create Link token with requested products
    const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
      method: 'POST',
      headers: getPlaidHeaders(),
      body: JSON.stringify({
        client_name: 'Homebase',
        user: {
          client_user_id: userId,
        },
        products: ['transactions', 'auth'], // Request transactions and auth (balances)
        country_codes: ['US'],
        language: 'en',
        webhook: webhookUrl, // Configure webhook for TRANSACTIONS and ITEM events
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Plaid] Token creation error:', data);
      return c.json({ 
        error: 'Failed to create Plaid Link token',
        details: data.error_message || data.error?.message 
      }, 400);
    }

    // Save session for tracking
    await saveFinancialLinkSession({
      user_id: userId,
      partner_role: partnerRole || 'person1',
      provider: 'plaid',
      provider_session_token: data.link_token,
      requested_permissions: ['transactions', 'auth'],
    });

    return c.json({
      success: true,
      link_token: data.link_token,
      expiration: data.expiration,
    });
  } catch (error: any) {
    console.error('[Plaid] Error creating token:', error);
    return c.json({ 
      error: 'Failed to create Plaid Link token',
      details: error.message 
    }, 500);
  }
});

// Exchange public token for access token and save accounts
app.post('/make-server-8c22500c/financial/plaid-exchange-token', async (c) => {
  try {
    const { userId, partnerRole, publicToken } = await c.req.json();
    
    if (!userId || userId === 'default') {
      return c.json({ error: 'User ID required' }, 400);
    }

    if (!publicToken) {
      return c.json({ error: 'Public token required' }, 400);
    }

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      return c.json({ error: 'Plaid not configured' }, 500);
    }

    // Exchange public token for access token
    const exchangeResponse = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
      method: 'POST',
      headers: getPlaidHeaders(),
      body: JSON.stringify({
        public_token: publicToken,
      }),
    });

    const exchangeData = await exchangeResponse.json();

    if (!exchangeResponse.ok) {
      console.error('[Plaid] Exchange error:', exchangeData);
      return c.json({ 
        error: 'Failed to exchange token',
        details: exchangeData.error_message || exchangeData.error?.message 
      }, 400);
    }

    const accessToken = exchangeData.access_token;
    const itemId = exchangeData.item_id;

    // Save access token
    await savePlaidAccessToken(userId, itemId, accessToken);

    // Get accounts
    const accountsResponse = await fetch(`${PLAID_BASE_URL}/accounts/get`, {
      method: 'POST',
      headers: getPlaidHeaders(),
      body: JSON.stringify({
        access_token: accessToken,
      }),
    });

    const accountsData = await accountsResponse.json();

    if (!accountsResponse.ok) {
      console.error('[Plaid] Accounts error:', accountsData);
      return c.json({ 
        error: 'Failed to fetch accounts',
        details: accountsData.error_message || accountsData.error?.message 
      }, 400);
    }

    // Map Plaid account types to your database categories
    function mapPlaidTypeToCategory(type: string, subtype: string | null): string {
      const typeLower = type.toLowerCase();
      const subtypeLower = subtype?.toLowerCase() || '';
      
      if (typeLower === 'depository') {
        if (subtypeLower.includes('checking')) return 'depository';
        if (subtypeLower.includes('savings')) return 'depository';
        return 'depository';
      }
      if (typeLower === 'credit') return 'credit';
      if (typeLower === 'investment') return 'investment';
      if (typeLower === 'loan') return 'loan';
      return 'other';
    }

    // Save each account
    const savedAccounts = [];
    for (const account of accountsData.accounts) {
      const category = mapPlaidTypeToCategory(account.type, account.subtype);
      
      const savedAccount = await saveLinkedAccount({
        user_id: userId,
        partner_role: partnerRole || 'person1',
        provider: 'plaid',
        external_account_id: account.account_id,
        external_item_id: itemId,
        display_name: account.name,
        institution_name: accountsData.item?.institution_id || 'Unknown',
        last_four_digits: account.mask || null,
        category: category,
        subcategory: account.subtype || account.type,
        connection_state: 'active',
        granted_permissions: ['transactions', 'auth'],
        supports_ach_payments: category === 'depository',
      });

      savedAccounts.push(savedAccount);

      // Fetch and save initial balance if available
      if (account.balances?.available !== null || account.balances?.current !== null) {
        await saveBalanceSnapshot({
          linked_account_id: savedAccount.id,
          current_balance_cents: account.balances.current ? Math.round(account.balances.current * 100) : undefined,
          available_balance_cents: account.balances.available ? Math.round(account.balances.available * 100) : undefined,
          credit_limit_cents: account.balances.limit ? Math.round(account.balances.limit * 100) : undefined,
          currency_code: account.balances.iso_currency_code || 'USD',
        });
      }
    }

    // Fetch initial transactions (last 30 days)
    try {
      const transactionsResponse = await fetch(`${PLAID_BASE_URL}/transactions/get`, {
        method: 'POST',
        headers: getPlaidHeaders(),
        body: JSON.stringify({
          access_token: accessToken,
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
        }),
      });

      const transactionsData = await transactionsResponse.json();

      if (transactionsResponse.ok && transactionsData.transactions) {
        for (const transaction of transactionsData.transactions) {
          const linkedAccount = await getLinkedAccountByExternalId('plaid', transaction.account_id);
          if (linkedAccount) {
            await saveTransaction({
              linked_account_id: linkedAccount.id,
              provider: 'plaid',
              external_transaction_id: transaction.transaction_id,
              amount_cents: Math.round(transaction.amount * 100),
              currency_code: transaction.iso_currency_code || 'USD',
              description: transaction.name || 'Transaction',
              merchant_name: transaction.merchant_name || null,
              category_hierarchy: transaction.category ? transaction.category : null,
              is_pending: transaction.pending,
              transaction_date: transaction.date,
            });
          }
        }
      }
    } catch (txnError) {
      console.error('[Plaid] Error fetching initial transactions:', txnError);
      // Don't fail the whole flow if transactions fail
    }

    return c.json({
      success: true,
      accounts: savedAccounts,
      item_id: itemId,
    });
  } catch (error: any) {
    console.error('[Plaid] Error exchanging token:', error);
    return c.json({ 
      error: 'Failed to exchange token',
      details: error.message 
    }, 500);
  }
});

// Plaid webhook handler
app.post('/make-server-8c22500c/financial/plaid-webhook', async (c) => {
  try {
    const body = await c.req.json();
    const webhook = body;

    console.log(`[Plaid Webhook] Received event: ${webhook.webhook_type}`, webhook.webhook_code);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Store webhook
    await supabase.from('provider_webhooks').insert({
      provider: 'plaid',
      external_event_id: webhook.webhook_id || `plaid_${Date.now()}`,
      event_type: `${webhook.webhook_type}.${webhook.webhook_code}`,
      payload: webhook,
    });

    // Handle different webhook types
    if (webhook.webhook_type === 'TRANSACTIONS') {
      if (webhook.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
        // Fetch updated transactions
        const itemId = webhook.item_id;
        // You'll need to get access token from KV store using itemId
        // For now, we'll trigger a manual sync
        console.log(`[Plaid Webhook] Transactions sync available for item ${itemId}`);
      }
    }

    if (webhook.webhook_type === 'ITEM') {
      if (webhook.webhook_code === 'ERROR') {
        // Mark account as error state
        const itemId = webhook.item_id;
        await supabase
          .from('linked_accounts')
          .update({ 
            connection_state: 'error',
          })
          .eq('external_item_id', itemId);
        console.log(`[Plaid Webhook] Item error for ${itemId}`);
      }
    }

    return c.json({ received: true });
  } catch (error: any) {
    console.error('[Plaid Webhook] Error:', error);
    return c.json({ error: error.message }, 400);
  }
});
// ============ END FINANCIAL CONNECTIONS ROUTES ============

Deno.serve(app.fetch);