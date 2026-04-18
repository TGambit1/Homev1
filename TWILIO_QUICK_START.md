# Twilio Quick Start (5 Minutes!)

## 🚀 Fastest Way to Get Homebase on SMS

### Step 1: Get Twilio Credentials (2 min)

1. Go to [console.twilio.com](https://console.twilio.com/)
2. Copy these from your dashboard:
   - **Account SID** (looks like: AC1234567890abcdef...)
   - **Auth Token** (click eye icon to reveal)
3. Go to **Phone Numbers** → copy your number (e.g., +12025551234)

### Step 2: Add to Supabase (1 min)

1. Go to [Supabase Edge Functions Settings](https://supabase.com/dashboard/project/wessxtqkavajveululmt/settings/functions)
2. Click **Add new variable**, add these 3:

```
Name: TWILIO_ACCOUNT_SID
Value: [paste your Account SID]

Name: TWILIO_AUTH_TOKEN  
Value: [paste your Auth Token]

Name: TWILIO_FROM_NUMBER
Value: [paste your phone number with +, e.g., +12025551234]
```

3. Click **Save**

### Step 3: Configure Twilio Webhook (1 min)

1. Go to [Twilio Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click your phone number
3. Scroll to **Messaging Configuration**
4. Under "A MESSAGE COMES IN":
   - **Webhook:** Paste this URL:
     ```
     https://wessxtqkavajveululmt.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/incoming
     ```
   - **HTTP Method:** Select `POST`
5. Click **Save**

### Step 4: Test! (1 min)

Text your Twilio number: **"Hello"**

You should get a response from Homebase! 🎉

---

## ⚠️ Important Note

If you get a **401 error**, Twilio doesn't support sending custom Authorization headers directly. Use this workaround:

### Quick Fix: Public Endpoint

I can make the Twilio endpoint publicly accessible (no auth required). This is safe because:
- Twilio validates requests come from their servers
- Only SMS webhook data is accepted
- No sensitive data is exposed

**Want me to enable public access?** Just say "make it public" and I'll update the code!

---

## 📱 Quick Test

Send these messages to test features:

1. **"Hello"** - Initial greeting
2. **"Sarah & Michael"** - Set your names  
3. **"What's our portfolio worth?"** - Financial data
4. **"What's on our calendar?"** - Calendar integration
5. **"Weekly check-in"** - Start full conversation

---

## 🆘 Troubleshooting

**No response?**
1. Check [Supabase Logs](https://supabase.com/dashboard/project/wessxtqkavajveululmt/logs/edge-functions)
2. Look for `[Twilio]` messages
3. Verify all 3 environment variables are set

**Test your config:**
Open this URL: `https://wessxtqkavajveululmt.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/test`

Should show:
```json
{
  "configured": true,
  "accountSidSet": true,
  "authTokenSet": true,
  "fromNumberSet": true,
  "fromNumber": "+12025551234"
}
```

---

That's it! You're done. 🚀
