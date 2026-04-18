import { Hono } from "npm:hono";
import * as db from "./db.tsx";

const app = new Hono();

// Handle OPTIONS requests for CORS preflight (needed for PATCH requests)
app.options("*", async (c) => {
  return c.text("", 200, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
  });
});

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
// Construct the redirect URI - must match exactly what's in Google Cloud Console
const REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') || 'https://wessxtqkavajveululmt.supabase.co/functions/v1/make-server-8c22500c/auth/google-callback-redirect';

// Debug endpoint to check configuration
app.get('/make-server-8c22500c/calendar/debug-config', (c) => {
  return c.json({
    clientIdSet: !!GOOGLE_CLIENT_ID,
    clientSecretSet: !!GOOGLE_CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
  });
});

// Step 1: Initiate OAuth flow
app.get('/make-server-8c22500c/auth/google-calendar', async (c) => {
  const userId = c.req.query('userId') || 'default';
  const partnerRoleParam = c.req.query('partnerRole');
  const partnerRole: 'person1' | 'person2' = partnerRoleParam === 'person2' ? 'person2' : 'person1';
  
  // Generate a unique session ID for this OAuth flow
  const sessionId = `oauth_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  // Store the session ID with partnerRole (will be used to store the code later)
  await db.saveOAuthSession(sessionId, {
    userId,
    partnerRole,
    status: 'pending',
    createdAt: Date.now()
  });
  
  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes.join(' '))}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${sessionId}`; // Pass session ID as state parameter

  return c.json({ authUrl, sessionId });
});

// Step 2a: Poll for OAuth code (called by frontend)
app.get('/make-server-8c22500c/auth/google-callback-poll', async (c) => {
  const sessionId = c.req.query('sessionId');
  
  if (!sessionId) {
    return c.json({ error: 'Session ID required' }, 400);
  }
  
  const sessionData = await db.getOAuthSession(sessionId);
  
  if (!sessionData) {
    return c.json({ status: 'pending' });
  }
  
  if (sessionData.status === 'error') {
    // Clean up and return error
    await db.deleteOAuthSession(sessionId);
    return c.json({ status: 'error', error: sessionData.error });
  }
  
  if (sessionData.status === 'success' && sessionData.code) {
    // Clean up and return code
    const code = sessionData.code;
    await db.deleteOAuthSession(sessionId);
    return c.json({ status: 'success', code });
  }
  
  return c.json({ status: 'pending' });
});

// Step 2: Handle OAuth callback and exchange code for tokens
app.post('/make-server-8c22500c/auth/google-callback', async (c) => {
  try {
    const { code, userId, partnerRole } = await c.req.json();

    if (!code) {
      return c.json({ error: 'No authorization code provided' }, 400);
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange error:', tokens);
      return c.json({ error: 'Failed to exchange code for tokens', details: tokens }, 400);
    }

    // Store tokens securely in database
    const targetUserId = userId || 'default';
    const targetPartnerRole: 'person1' | 'person2' =
      partnerRole === 'person2' ? 'person2' : 'person1';
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000),
      scope: tokens.scope,
    };
    
    console.log(`Storing tokens for userId: ${targetUserId}`);
    console.log(`Token data (without access_token):`, {
      refresh_token: tokenData.refresh_token ? '***' : undefined,
      expires_at: tokenData.expires_at,
      scope: tokenData.scope
    });
    
    try {
      await db.saveCalendarTokens(targetUserId, targetPartnerRole, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        scope: tokenData.scope,
      });
      console.log('Token storage call completed');
    } catch (storageError) {
      console.error('Error storing tokens:', storageError);
      return c.json({ error: 'Failed to store tokens', details: storageError.message }, 500);
    }
    
    // Verify tokens were stored
    try {
      const verifyTokenData = await db.getCalendarTokens(targetUserId, targetPartnerRole);
      console.log(`Token storage verification:`, verifyTokenData ? 'SUCCESS' : 'FAILED');
      if (verifyTokenData) {
        console.log(`Verified token data has access_token:`, !!verifyTokenData.access_token);
      }
      
      if (!verifyTokenData) {
        console.error('Failed to verify token storage - tokens not found after storage');
        return c.json({ error: 'Failed to store tokens - verification failed' }, 500);
      }
    } catch (verifyError) {
      console.error('Error verifying token storage:', verifyError);
      return c.json({ error: 'Failed to verify token storage', details: verifyError.message }, 500);
    }

    return c.json({ success: true, message: 'Google Calendar connected!' });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.json({ error: 'Failed to complete OAuth flow', details: error.message }, 500);
  }
});

// Step 3: Refresh access token when expired
async function getValidAccessToken(
  userId: string = 'default',
  partnerRole: 'person1' | 'person2' = 'person1'
) {
  const debugCalendarApi = (Deno.env.get('DEBUG_CALENDAR_API') || '').toLowerCase() === 'true';
  if (debugCalendarApi) console.log(`Getting access token for userId: ${userId}, partnerRole: ${partnerRole}`);
  const tokenData = await db.getCalendarTokens(userId, partnerRole);
  if (debugCalendarApi) console.log(`Token data retrieved:`, tokenData ? 'YES' : 'NO');

  if (!tokenData) {
    console.error(`No tokens found for userId: ${userId}`);
    throw new Error('No tokens found. Please connect Google Calendar first.');
  }

  // Check if token is expired
  if (Date.now() >= tokenData.expires_at) {
    // Refresh the token
    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const newTokens = await refreshResponse.json();

    if (!refreshResponse.ok) {
      throw new Error(`Token refresh failed: ${newTokens.error_description || newTokens.error}`);
    }

    // Update stored tokens in database
    await db.saveCalendarTokens(userId, partnerRole, {
      access_token: newTokens.access_token,
      refresh_token: tokenData.refresh_token, // Keep existing refresh token
      expires_at: Date.now() + (newTokens.expires_in * 1000),
      scope: newTokens.scope,
    });

    return newTokens.access_token;
  }

  return tokenData.access_token;
}

// Supported calendar ranges: 1d, 3d, 1w, 2w, 1m (days from now)
function getTimeRangeForCalendar(rangeParam: string | null): { timeMin: string; timeMax: string } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let days = 7;
  if (rangeParam === '1d') days = 1;
  else if (rangeParam === '3d') days = 3;
  else if (rangeParam === '1w') days = 7;
  else if (rangeParam === '2w') days = 14;
  else if (rangeParam === '1m') days = 30;
  const timeMin = new Date(now).toISOString();
  const timeMax = new Date(now + days * dayMs).toISOString();
  return { timeMin, timeMax };
}

// Step 4: Fetch calendar events
app.get('/make-server-8c22500c/calendar/events', async (c) => {
  try {
    const userId = c.req.query('userId') || 'default';
    const partnerRoleParam = c.req.query('partnerRole');
    const partnerRole: 'person1' | 'person2' =
      partnerRoleParam === 'person2' ? 'person2' : 'person1';
    const rangeParam = c.req.query('range') || null; // 1d | 3d | 1w | 2w | 1m
    const accessToken = await getValidAccessToken(userId, partnerRole);

    const { timeMin, timeMax } = getTimeRangeForCalendar(rangeParam);

    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax)}&` +
      `singleEvents=true&` +
      `orderBy=startTime&` +
      `maxResults=10&` +
      `showDeleted=false`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const eventsData = await eventsResponse.json();

    if (!eventsResponse.ok) {
      console.error('Calendar API error:', eventsData);
      return c.json({ error: 'Failed to fetch calendar events', details: eventsData }, 400);
    }

    // Format events for display
    // Filter out cancelled/deleted events and only include confirmed events
    const debugCalendarApi = (Deno.env.get('DEBUG_CALENDAR_API') || '').toLowerCase() === 'true';
    if (debugCalendarApi) console.log(`[Calendar] Total events from API: ${eventsData.items?.length || 0}`);
    
    // Log all event statuses for debugging
    if (debugCalendarApi) {
      eventsData.items?.forEach((event: any) => {
        console.log(`[Calendar] Event: "${event.summary}" - status: ${event.status || 'undefined'}, id: ${event.id}`);
      });
    }
    
    const events = eventsData.items
      ?.filter((event: any) => {
        // Exclude cancelled events
        if (event.status === 'cancelled') {
          if (debugCalendarApi) console.log(`[Calendar] Filtering out cancelled event: ${event.summary} (status: ${event.status})`);
          return false;
        }
        
        // Also check if event has been deleted (some APIs return deleted events differently)
        // Google Calendar might return events with empty summary or missing required fields
        if (!event.summary || !event.start) {
          if (debugCalendarApi) console.log(`[Calendar] Filtering out invalid event: missing summary or start time`);
          return false;
        }
        
        // Only include confirmed events (exclude tentative, etc. if needed)
        // For now, we'll include all non-cancelled events
        return true;
      })
      .map((event: any) => ({
      summary: event.summary || 'No title',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
        id: event.id, // Include ID for reference
    })) || [];
    
    if (debugCalendarApi) {
      console.log(`[Calendar] Events after filtering: ${events.length}`);
      console.log(`[Calendar] Event summaries: ${events.map((e: any) => e.summary).join(', ')}`);
    }

    return c.json({ events });
  } catch (error) {
    console.error('Fetch events error:', error);
    return c.json({ error: 'Failed to fetch calendar events', details: error.message }, 500);
  }
});

// Step 5: Check connection status
app.get('/make-server-8c22500c/calendar/status', async (c) => {
  try {
    const userId = c.req.query('userId') || 'default';
    const partnerRoleParam = c.req.query('partnerRole');
    const partnerRole: 'person1' | 'person2' =
      partnerRoleParam === 'person2' ? 'person2' : 'person1';
    console.log(`Checking calendar status for userId: ${userId}, partnerRole: ${partnerRole}`);
    const tokenData = await db.getCalendarTokens(userId, partnerRole);
    console.log(`Token data found:`, tokenData ? 'YES' : 'NO');

    return c.json({ connected: !!tokenData });
  } catch (error) {
    console.error('Error checking calendar status:', error);
    return c.json({ connected: false });
  }
});

// Step 6: Disconnect (remove tokens)
app.delete('/make-server-8c22500c/calendar/disconnect', async (c) => {
  try {
    const userId = c.req.query('userId') || 'default';
    const partnerRoleParam = c.req.query('partnerRole');
    const partnerRole: 'person1' | 'person2' | undefined =
      partnerRoleParam === 'person2' ? 'person2' : 'person1';
    await db.deleteCalendarTokens(userId, partnerRole);

    return c.json({ success: true, message: 'Google Calendar disconnected' });
  } catch (error) {
    console.error('Disconnect error:', error);
    return c.json({ error: 'Failed to disconnect', details: error.message }, 500);
  }
});

// OAuth redirect handler - Google sends code here.
// We return plain text so the page works under Supabase's strict CSP/sandbox (no inline styles or scripts).
app.get('/make-server-8c22500c/auth/google-callback-redirect', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  const sessionId = c.req.query('state'); // This is our session ID

  // Always return plain text to avoid CSP/sandbox errors (Supabase can serve this in a strict frame)
  c.header('Content-Type', 'text/plain; charset=utf-8');

  if (error) {
    if (sessionId) {
      await db.saveOAuthSession(sessionId, {
        status: 'error',
        error: error,
        updatedAt: Date.now()
      });
    }
    return c.body(`Authorization Failed\n\n${error}\n\nYou can close this window.`);
  }

  if (code && sessionId) {
    await db.saveOAuthSession(sessionId, {
      status: 'success',
      code: code,
      updatedAt: Date.now()
    });
    return c.body('Authorization successful. Completing connection. You can close this window.');
  }

  return c.body('Error: No code or session ID received. Please try again.');
});

// Add event to Google Calendar
app.post('/make-server-8c22500c/calendar/events/create', async (c) => {
  try {
    const { userId, partnerRole, title, startTime, endTime, description, location } = await c.req.json();
    
    if (!title || !startTime) {
      return c.json({ error: 'Title and start time are required' }, 400);
    }

    const accessToken = await getValidAccessToken(
      userId || 'default',
      partnerRole === 'person2' ? 'person2' : 'person1'
    );

    const event = {
      summary: title,
      start: {
        dateTime: startTime, // ISO 8601 format (e.g., "2026-01-15T14:00:00-05:00")
        timeZone: 'America/New_York', // or user's timezone
      },
      end: {
        dateTime: endTime || startTime, // Default to same as start if not provided
        timeZone: 'America/New_York',
      },
      description: description || '',
      location: location || '',
    };

    const createResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    const eventData = await createResponse.json();

    if (!createResponse.ok) {
      console.error('Calendar API error:', eventData);
      return c.json({ error: 'Failed to create event', details: eventData }, 400);
    }

    console.log(`Event created: ${eventData.id}, title: ${title}`);

    return c.json({ 
      success: true, 
      event: {
        id: eventData.id,
        summary: eventData.summary,
        start: eventData.start?.dateTime,
        htmlLink: eventData.htmlLink, // Link to view in Google Calendar
      }
    });
  } catch (error) {
    console.error('Create event error:', error);
    return c.json({ error: 'Failed to create event', details: error.message }, 500);
  }
});

// Delete event from Google Calendar
app.delete('/make-server-8c22500c/calendar/events/:eventId', async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const userId = c.req.query('userId') || 'default';
    const partnerRoleParam = c.req.query('partnerRole');
    const partnerRole: 'person1' | 'person2' =
      partnerRoleParam === 'person2' ? 'person2' : 'person1';
    
    if (!eventId) {
      return c.json({ error: 'Event ID is required' }, 400);
    }

    const accessToken = await getValidAccessToken(userId, partnerRole);

    const deleteResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json();
      console.error('Calendar API error:', errorData);
      return c.json({ error: 'Failed to delete event', details: errorData }, 400);
    }

    console.log(`Event deleted: ${eventId}`);

    return c.json({ 
      success: true, 
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Delete event error:', error);
    return c.json({ error: 'Failed to delete event', details: error.message }, 500);
  }
});

// Search for events by title (to find event ID for deletion)
app.get('/make-server-8c22500c/calendar/events/search', async (c) => {
  try {
    const userId = c.req.query('userId') || 'default';
    const partnerRoleParam = c.req.query('partnerRole');
    const partnerRole: 'person1' | 'person2' =
      partnerRoleParam === 'person2' ? 'person2' : 'person1';
    const title = c.req.query('title');
    
    if (!title) {
      return c.json({ error: 'Event title is required' }, 400);
    }

    const accessToken = await getValidAccessToken(userId, partnerRole);

    // Get events from the next 30 days to search
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax)}&` +
      `singleEvents=true&` +
      `orderBy=startTime&` +
      `maxResults=50`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const eventsData = await eventsResponse.json();

    if (!eventsResponse.ok) {
      console.error('Calendar API error:', eventsData);
      return c.json({ error: 'Failed to search events', details: eventsData }, 400);
    }

    // Search for events matching the title (case-insensitive, partial match)
    const searchTerm = title.toLowerCase();
    const matchingEvents = eventsData.items?.filter((event: any) => {
      const eventTitle = (event.summary || '').toLowerCase();
      return eventTitle.includes(searchTerm);
    }) || [];

    // Format matching events
    const results = matchingEvents.map((event: any) => ({
      id: event.id,
      title: event.summary || 'No title',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
    }));

    return c.json({ events: results });
  } catch (error) {
    console.error('Search events error:', error);
    return c.json({ error: 'Failed to search events', details: error.message }, 500);
  }
});

// Update event in Google Calendar
app.patch('/make-server-8c22500c/calendar/events/:eventId', async (c) => {
  try {
    const eventId = c.req.param('eventId');
    const { userId, partnerRole, title, startTime, endTime, description, location } = await c.req.json();
    
    if (!eventId) {
      return c.json({ error: 'Event ID is required' }, 400);
    }

    const accessToken = await getValidAccessToken(
      userId || 'default',
      partnerRole === 'person2' ? 'person2' : 'person1'
    );

    // First, get the existing event to preserve fields we're not updating
    const getEventResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!getEventResponse.ok) {
      const errorData = await getEventResponse.json();
      console.error('Calendar API error (get event):', errorData);
      return c.json({ error: 'Failed to fetch event', details: errorData }, 400);
    }

    const existingEvent = await getEventResponse.json();

    // Build update object - only update fields that are provided
    const updatedEvent: any = {
      summary: title || existingEvent.summary,
      start: startTime ? {
        dateTime: startTime,
        timeZone: existingEvent.start?.timeZone || 'America/New_York',
      } : existingEvent.start,
      end: endTime ? {
        dateTime: endTime,
        timeZone: existingEvent.end?.timeZone || 'America/New_York',
      } : existingEvent.end,
      description: description !== undefined ? description : existingEvent.description,
      location: location !== undefined ? location : existingEvent.location,
    };

    const updateResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedEvent),
      }
    );

    const eventData = await updateResponse.json();

    if (!updateResponse.ok) {
      console.error('Calendar API error:', eventData);
      return c.json({ error: 'Failed to update event', details: eventData }, 400);
    }

    console.log(`Event updated: ${eventId}, title: ${updatedEvent.summary}`);

    return c.json({ 
      success: true, 
      event: {
        id: eventData.id,
        summary: eventData.summary,
        start: eventData.start?.dateTime,
        end: eventData.end?.dateTime,
        htmlLink: eventData.htmlLink,
      }
    });
  } catch (error) {
    console.error('Update event error:', error);
    return c.json({ error: 'Failed to update event', details: error.message }, 500);
  }
});

export const googleCalendarRoutes = app;