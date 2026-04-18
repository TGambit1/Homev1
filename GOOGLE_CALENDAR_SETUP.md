# Google Calendar OAuth Setup Guide

## ✅ What's Already Done

1. ✅ Backend OAuth routes created in `/supabase/functions/server/google-calendar.tsx`
2. ✅ Frontend integration added to handle OAuth flow
3. ✅ Secure token storage using Supabase KV store
4. ✅ OAuth callback page created at `/public/auth-callback.html`
5. ✅ Google Client ID and Secret stored as environment variables

## 🔧 Required Configuration Steps

### Step 1: Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your project (with Client ID: `742965909626-k91duhknbojqleb948iehuvgtpc8uf3o`)
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, add these URLs:
   - For local development: `http://localhost:5173/auth-callback.html`
   - For production: `https://YOUR_DEPLOYMENT_URL/auth-callback.html`
   
   **IMPORTANT**: The redirect URI MUST match exactly what you set in the environment variable!

### Step 2: Set the Redirect URI Environment Variable

You've already been prompted to enter the `GOOGLE_REDIRECT_URI`. Enter one of these values depending on your environment:

- **Local development**: `http://localhost:5173/auth-callback.html`
- **Production**: `https://YOUR_DEPLOYMENT_URL/auth-callback.html`

### Step 3: Test the Integration

1. Complete the onboarding flow (or skip it)
2. In the chat, type: `/connect calendar`
3. A Google OAuth popup should open
4. Sign in with your Google account and grant calendar permissions
5. The popup will close automatically and you should see your calendar events in the chat!

## 🔒 Security Features

- ✅ Client Secret stored server-side only (never exposed to frontend)
- ✅ OAuth tokens stored securely in Supabase KV store
- ✅ Automatic token refresh when expired
- ✅ Proper CORS configuration
- ✅ Authorization headers for all API calls

## 📋 Available Commands

Once connected, you can use these chat commands:

- `/connect calendar` - Connect Google Calendar
- Disconnect button - Appears in the chat when calendar is connected

## 🛠️ API Endpoints

The backend provides these endpoints:

1. `GET /make-server-8c22500c/auth/google-calendar` - Get OAuth URL
2. `POST /make-server-8c22500c/auth/google-callback` - Exchange code for tokens
3. `GET /make-server-8c22500c/calendar/events` - Fetch calendar events
4. `GET /make-server-8c22500c/calendar/status` - Check connection status
5. `DELETE /make-server-8c22500c/calendar/disconnect` - Remove tokens

## 🐛 Troubleshooting

### "redirect_uri_mismatch" error
- Make sure the redirect URI in Google Cloud Console EXACTLY matches the `GOOGLE_REDIRECT_URI` environment variable
- Common issue: Missing `/auth-callback.html` at the end

### Popup doesn't close after authorization
- Check browser console for postMessage errors
- Ensure popup blockers are disabled

### "No tokens found" error
- The OAuth flow wasn't completed successfully
- Try disconnecting and reconnecting

## 📱 User Experience

1. User types `/connect calendar`
2. AI sends "Initiating Google Calendar connection..."
3. OAuth popup opens automatically
4. User signs in and grants permissions
5. Popup closes, AI fetches calendar events
6. AI shows: "✅ Google Calendar connected! 📅 Upcoming: [events]"
7. Disconnect button appears in the chat

## 🚀 Next Steps

After Google Calendar is working, you can:
- Implement MX bank account integration (similar OAuth pattern)
- Add Fidelity/E*TRADE investment account integration
- Store user-specific tokens (currently using 'default' userId)
- Add more calendar features (create events, update events, etc.)
