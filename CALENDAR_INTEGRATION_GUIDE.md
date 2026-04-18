# Calendar Integration Guide

## Overview
Homebase now includes comprehensive calendar integration with support for multiple providers. Currently, Google Calendar is fully functional, with Apple Calendar (iCloud), Outlook, and Yahoo Calendar coming soon.

## Components Created

### 1. **CalendarIntegration** (`/src/app/components/CalendarIntegration.tsx`)
Full-featured calendar settings modal that allows users to:
- Connect/disconnect calendar providers
- View connection status
- Browse upcoming events
- Manage multiple calendar providers

### 2. **CalendarWidget** (`/src/app/components/CalendarWidget.tsx`)
Compact calendar widget that can be embedded anywhere:
- Shows upcoming events (configurable max)
- Auto-refreshes calendar data
- Compact or full display modes
- Only displays when calendar is connected

### 3. **OAuthCallback** (`/src/app/components/OAuthCallback.tsx`)
OAuth callback handler component for processing authorization codes.

## Backend Implementation

### Server Routes (`/supabase/functions/server/google-calendar.tsx`)

1. **GET `/make-server-8c22500c/auth/google-calendar`**
   - Initiates OAuth flow
   - Returns Google authorization URL

2. **POST `/make-server-8c22500c/auth/google-callback`**
   - Exchanges authorization code for access tokens
   - Stores tokens securely in Supabase KV

3. **GET `/make-server-8c22500c/auth/google-callback-redirect`**
   - OAuth redirect endpoint (Google sends users here)
   - Returns HTML page that closes popup and sends code to parent window

4. **GET `/make-server-8c22500c/calendar/events`**
   - Fetches upcoming calendar events (next 7 days)
   - Auto-refreshes expired access tokens

5. **GET `/make-server-8c22500c/calendar/status`**
   - Checks if calendar is connected

6. **DELETE `/make-server-8c22500c/calendar/disconnect`**
   - Disconnects calendar and removes tokens

## Usage

### Opening Calendar Settings
Click the floating **Settings** button (⚙️) in the top-right corner to open the calendar integration modal.

### Connecting Google Calendar

1. Click "Connect" next to Google Calendar
2. OAuth popup window opens
3. Sign in to Google and authorize Homebase
4. Popup automatically closes after authorization
5. Events are fetched immediately

### Viewing Events
Once connected:
- Click "View Events" to see upcoming calendar events
- Events show title, date/time, and location
- Click "Refresh Events" to update

### Disconnecting
Click "Disconnect" to remove calendar access and delete stored tokens.

## Environment Variables Required

You must configure these in Supabase:

- **GOOGLE_CLIENT_ID**: Your Google OAuth Client ID
- **GOOGLE_CLIENT_SECRET**: Your Google OAuth Client Secret  
- **GOOGLE_REDIRECT_URI**: Your OAuth redirect URI (optional, defaults to Supabase function URL)

## Setup Instructions

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Calendar API**
4. Go to **Credentials** → Create OAuth 2.0 Client ID
5. Set **Authorized redirect URIs** to:
   ```
   https://{your-project-id}.supabase.co/functions/v1/make-server-8c22500c/auth/google-callback-redirect
   ```
6. Copy **Client ID** and **Client Secret**

### 2. Add Environment Variables to Supabase

1. Go to Supabase Dashboard → Settings → Edge Functions
2. Add secrets:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (optional)

### 3. Test the Integration

1. Open the app
2. Click Settings button
3. Click "Connect" on Google Calendar
4. Authorize and verify events load

## Future Providers

### Coming Soon:
- **Apple Calendar (iCloud)** - OAuth via Sign in with Apple
- **Outlook Calendar** - OAuth via Microsoft Graph API
- **Yahoo Calendar** - OAuth via Yahoo API

## Features

✅ **Secure OAuth Flow** - Industry-standard OAuth 2.0  
✅ **Token Management** - Auto-refresh expired tokens  
✅ **Multi-Provider Ready** - Architecture supports multiple calendars  
✅ **Mobile-Friendly** - Responsive design works on all devices  
✅ **Error Handling** - Graceful error states and user feedback  
✅ **Privacy-First** - Calendar data stored securely, never shared  

## Integration with AI Agent

When users mention "calendar", "schedule", or "events" in conversation, the AI can:
- Detect calendar-related queries
- Pull real calendar data from connected accounts
- Provide intelligent scheduling suggestions
- Coordinate between partners' calendars

The calendar data is injected into the AI context automatically when relevant keywords are detected.
