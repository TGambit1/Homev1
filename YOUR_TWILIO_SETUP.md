# Your Twilio Setup for (551) 210-8714

## ✅ Quick Setup Instructions

### Step 1: Add These Environment Variables to Supabase

Go to: [Supabase Edge Functions Settings](https://supabase.com/dashboard/project/wessxtqkavajveululmt/settings/functions)

Click **"Add new variable"** and add these 3:

```
Name: TWILIO_ACCOUNT_SID
Value: [Your Account SID from Twilio Console]

Name: TWILIO_AUTH_TOKEN
Value: [Your Auth Token from Twilio Console]

Name: TWILIO_FROM_NUMBER
Value: +15512108714
```

**Important:** 
- Get your Account SID and Auth Token from [console.twilio.com](https://console.twilio.com/)
- The phone number MUST be in format: **+15512108714** (with + and no spaces/dashes)

---

### Step 2: Configure Your Twilio Number Webhook

1. Go to: [Twilio Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)

2. Click on your number: **(551) 210-8714**

3. Scroll to **"Messaging Configuration"**

4. Under **"A MESSAGE COMES IN"**:
   - **Webhook URL:** 
     ```
     https://wessxtqkavajveululmt.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/incoming
     ```
   - **HTTP Method:** `POST`

5. Click **Save**

---

### Step 3: Test Your Setup

**Option A: Use the Debug Panel**
1. Open your Homebase app
2. Click the back arrow (←) in the chat header
3. Click "Send Test Request"
4. Check if it says "configured: true"

**Option B: Send a Real SMS**
1. Text **(551) 210-8714** from your phone
2. Send: "Hello"
3. You should get a response from Homebase!

---

## 🐛 If You Get a 401 Error

If the test shows `"status": 401`, it means Supabase is blocking the webhook because Twilio doesn't send an Authorization header.

**Tell me and I'll make the endpoint publicly accessible** (this is safe and standard for webhooks).

---

## 📊 Check Logs

If something isn't working, check the logs:
- [Supabase Edge Function Logs](https://supabase.com/dashboard/project/wessxtqkavajveululmt/logs/edge-functions)
- Look for entries starting with `[Twilio]`

---

## ✅ Final Checklist

- [ ] Added TWILIO_ACCOUNT_SID to Supabase
- [ ] Added TWILIO_AUTH_TOKEN to Supabase  
- [ ] Added TWILIO_FROM_NUMBER = +15512108714 to Supabase
- [ ] Configured webhook URL in Twilio
- [ ] Tested and received response

Once all checked, your Homebase will work via SMS at **(551) 210-8714**! 🎉
