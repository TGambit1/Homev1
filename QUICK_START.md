# 🚀 Quick Start Guide

## ✅ What's Implemented

Your Homebase AI prototype now has **real Google Calendar integration** with secure OAuth! Here's what's ready:

### Security Features ✨
- ✅ OAuth Client Secret stored server-side (never exposed to users)
- ✅ Access tokens stored securely in Supabase KV store
- ✅ Automatic token refresh when expired
- ✅ Proper OAuth 2.0 flow with popup window

### Features Working Now 🎯
1. **Onboarding Flow** - Simple one-time setup for couples
2. **Real Google Calendar OAuth** - Connect with actual Google accounts
3. **Live Calendar Data** - Shows real upcoming events from Google Calendar
4. **Simulated Bank Connection** - Mock MX integration (ready for real implementation)
5. **Simulated Investment Connection** - Mock Fidelity integration (ready for real implementation)

## 🔧 Setup Required (One Time Only)

### Step 1: Configure Google Cloud Console

1. Go to https://console.cloud.google.com/apis/credentials
2. Find your OAuth Client ID: `742965909626-k91duhknbojqleb948iehuvgtpc8uf3o`
3. Click on it to edit
4. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:5173/auth-callback.html
   ```
   
   For production deployment, also add:
   ```
   https://YOUR_PRODUCTION_URL/auth-callback.html
   ```

5. Click **Save**

### Step 2: Set Redirect URI Environment Variable

You were prompted to enter `GOOGLE_REDIRECT_URI`. Enter:
```
http://localhost:5173/auth-callback.html
```

**IMPORTANT**: This MUST match exactly what you added to Google Cloud Console!

## 🎮 How to Use

### Testing Google Calendar Connection

1. **Start the onboarding** (or skip it by typing "skip")
2. **After onboarding**, type in the chat:
   ```
   /connect calendar
   ```
3. A Google OAuth popup will open
4. Sign in and grant calendar permissions
5. The popup will close automatically
6. You'll see your real calendar events in the chat!

### Available Commands

- `/connect calendar` - Connect Google Calendar (REAL)
- `/connect bank` - Connect bank account (simulated for now)
- `/connect investments` - Connect investments (simulated for now)
- Click "Disconnect" buttons to remove connections

## 📱 User Flow

```
User types: /connect calendar
   ↓
AI: "Initiating Google Calendar connection..."
   ↓
AI: "Opening Google sign-in popup..."
   ↓
[Google OAuth popup opens]
   ↓
User signs in & grants permissions
   ↓
[Popup closes automatically]
   ↓
AI: "✅ Google Calendar connected! 📅 Upcoming: Event1, Event2..."
   ↓
[Disconnect button appears]
```

## 🐛 Troubleshooting

### "redirect_uri_mismatch" Error
**Problem**: The redirect URI doesn't match between Google Cloud Console and your environment variable.

**Solution**: 
1. Make sure you added `http://localhost:5173/auth-callback.html` to Google Cloud Console
2. Make sure `GOOGLE_REDIRECT_URI` is set to `http://localhost:5173/auth-callback.html`
3. They must match EXACTLY (including the `/auth-callback.html` part)

### Popup Doesn't Open
**Problem**: Browser popup blocker is preventing the OAuth window.

**Solution**: Allow popups for this site in your browser settings.

### "No tokens found" Error
**Problem**: OAuth flow didn't complete successfully.

**Solution**: Try disconnecting and reconnecting. Check console for detailed errors.

### Events Don't Show
**Problem**: Calendar API call failed after successful OAuth.

**Solution**: 
1. Check that Calendar API is enabled in Google Cloud Console
2. Look at browser console for error details
3. Make sure your Google account has calendar events

## 🔒 Security Architecture

```
Frontend (React)
    ↓
    | Never sees Client Secret ✅
    | Tokens stored server-side ✅
    ↓
Backend (Supabase Edge Function)
    ↓
    | OAuth flow handled here
    | Tokens encrypted in KV store
    ↓
Google Calendar API
```

## 📊 What's Real vs. Simulated

| Feature | Status |
|---------|--------|
| Google Calendar | ✅ REAL - Full OAuth & live data |
| Bank Account (MX) | ⚠️ Simulated - Shows mock data |
| Investments | ⚠️ Simulated - Shows mock data |

## 🎯 Next Steps

Want to make the other integrations real too?

1. **MX Bank Integration** - You already have `MX_API_KEY` and `MX_ENV` set up!
2. **Investment Integration** - Similar OAuth pattern to Google Calendar
3. **User Authentication** - Add Supabase Auth for multi-user support
4. **Persistent Storage** - Store connection status per user

## 🎨 Design Notes

- iMessage-style interface with blue/green/gray bubbles
- Mobile-first iPhone layout (390x844px)
- Typing indicators for natural conversation flow
- Clean disconnect buttons that appear inline with services

## 💡 Pro Tips

1. **Reset Onboarding**: Clear your browser's localStorage to see onboarding again
2. **Test Different Accounts**: Try connecting different Google accounts
3. **View Logs**: Open browser console to see detailed OAuth flow logs
4. **Backend Logs**: Check Supabase Edge Function logs for server-side debugging

---

**Ready to connect your calendar?** Type `/connect calendar` in the chat! 🎉
