# Twilio SMS Integration Setup Guide for Homebase

## 🎯 Overview
This guide will walk you through setting up Homebase to work with your Twilio phone number so users can text the AI agent via SMS.

---

## 📋 Prerequisites
- A Twilio account ([sign up here](https://www.twilio.com/try-twilio))
- A Twilio phone number (you can purchase one or use an existing number)
- Access to your Supabase project dashboard

---

## 🔧 Step-by-Step Setup

### **Step 1: Get Your Twilio Credentials**

1. **Log in to [Twilio Console](https://console.twilio.com/)**

2. **Find your Account SID and Auth Token:**
   - On the Twilio Console homepage, you'll see your **Account SID** and **Auth Token**
   - Click the eye icon to reveal your Auth Token
   - Copy both values - you'll need them later

3. **Get your Twilio Phone Number:**
   - Go to **Phone Numbers** → **Manage** → **Active Numbers**
   - Click on your phone number
   - Copy the phone number (format: +1234567890)
   - If you don't have a number yet:
     - Click **Buy a Number**
     - Search for a number (choose one with SMS capability)
     - Purchase it ($1-2/month typically)

---

### **Step 2: Configure Supabase Environment Variables**

1. **Go to Supabase Dashboard:**
   - Navigate to your project: `https://supabase.com/dashboard/project/wessxtqkavajveululmt`

2. **Add Environment Variables:**
   - Go to **Settings** → **Edge Functions** → **Environment Variables**
   - Add these three secrets:

   ```
   TWILIO_ACCOUNT_SID = your_account_sid_here
   TWILIO_AUTH_TOKEN = your_auth_token_here
   TWILIO_FROM_NUMBER = +1234567890  (your Twilio phone number)
   ```

   ⚠️ **Important:** The phone number MUST include the + and country code (e.g., +12025551234)

3. **Save the environment variables**

---

### **Step 3: Configure Twilio Webhook**

1. **Get your webhook URL:**
   ```
   https://wessxtqkavajveululmt.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/incoming
   ```

2. **Configure the webhook in Twilio:**
   - Go to Twilio Console → **Phone Numbers** → **Manage** → **Active Numbers**
   - Click on your phone number
   - Scroll down to **Messaging Configuration**
   - Under **A MESSAGE COMES IN**, configure:
     - **Webhook:** `https://wessxtqkavajveululmt.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/incoming`
     - **HTTP Method:** `POST`
   - Click **Save**

---

### **Step 4: Add Authorization Header (IMPORTANT!)**

Since Supabase Edge Functions require authentication, you need to add an Authorization header to your webhook:

1. **In the Twilio phone number configuration:**
   - Under **A MESSAGE COMES IN**, click **Show Additional Webhook Settings**
   - Scroll down to **Advanced Configuration**
   - Click **Configure Request Headers**
   
2. **Add this header:**
   ```
   Header Name: Authorization
   Header Value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3N4dHFrYXZhanZldWx1bG10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzI4NjAsImV4cCI6MjA4MjYwODg2MH0.OHKRziNsYsrXhrGzG3XkYUKpoiiTSpsSZQt2WXxvFf4
   ```

3. **Save the configuration**

⚠️ **Note:** If Twilio doesn't support custom headers in the UI, you have two options:

**Option A:** Use Twilio Functions (Recommended)
- Create a Twilio Function that adds the Authorization header and forwards to your webhook
- See "Alternative: Twilio Function Proxy" section below

**Option B:** Make the endpoint public (Less secure)
- We can modify the server to allow public access to this specific endpoint
- Not recommended for production

---

### **Step 5: Test Your Integration**

1. **Test the configuration endpoint:**
   - Open this URL in your browser:
     ```
     https://wessxtqkavajveululmt.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/test
     ```
   - You should see:
     ```json
     {
       "configured": true,
       "accountSidSet": true,
       "authTokenSet": true,
       "fromNumberSet": true,
       "fromNumber": "+1234567890"
     }
     ```

2. **Send a test SMS:**
   - Text your Twilio number from your phone
   - Send: "Hello"
   - You should receive an AI response from Homebase!

3. **Check logs for debugging:**
   - Go to Supabase Dashboard → **Edge Functions** → **Logs**
   - Look for `[Twilio]` prefixed log messages
   - Check for any errors

---

## 🔄 Alternative: Twilio Function Proxy (If Headers Don't Work)

If Twilio doesn't allow custom headers, create a Twilio Function as a proxy:

1. **Go to Twilio Console → Functions & Assets → Services**

2. **Create a new Service:** "Homebase Proxy"

3. **Add a new Function:** `/homebase-proxy`

4. **Paste this code:**
   ```javascript
   exports.handler = function(context, event, callback) {
     const axios = require('axios');
     
     // Forward the webhook to Supabase with Authorization header
     axios.post(
       'https://wessxtqkavajveululmt.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/incoming',
       event,
       {
         headers: {
           'Content-Type': 'application/x-www-form-urlencoded',
           'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3N4dHFrYXZhanZldWx1bG10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMzI4NjAsImV4cCI6MjA4MjYwODg2MH0.OHKRziNsYsrXhrGzG3XkYUKpoiiTSpsSZQt2WXxvFf4'
         }
       }
     )
     .then(() => {
       const twiml = new Twilio.twiml.MessagingResponse();
       callback(null, twiml);
     })
     .catch(err => {
       console.error('Error forwarding to Supabase:', err);
       const twiml = new Twilio.twiml.MessagingResponse();
       callback(null, twiml);
     });
   };
   ```

5. **Deploy the Function**

6. **Update your phone number webhook to use this Twilio Function URL instead**

---

## 📱 How It Works

1. **User sends SMS** → Twilio phone number
2. **Twilio webhook fires** → Calls your Supabase Edge Function
3. **Edge Function processes** → Extracts message, loads conversation state
4. **Grok AI responds** → Generates intelligent reply
5. **Reply sent via Twilio API** → User receives SMS

---

## 🎨 User Experience

**First Message:**
```
User: "Hello"
Homebase: "Hey! I'm Homebase, your personal assistant. 
Ready for a weekly check-in?"
```

**Onboarding:**
```
User: "Sarah & Michael"
Homebase: "Great to meet you Sarah and Michael! 
How was your week?"
```

**Natural Conversation:**
```
User: "What's our portfolio worth?"
Homebase: "Your total portfolio is $297,598. 
Bitcoin is up 3.2% today at $98,500! 
Want to dive into the details?"
```

---

## 🐛 Troubleshooting

### **Problem: No response when texting**
- ✅ Check Supabase Edge Function logs for errors
- ✅ Verify all 3 environment variables are set correctly
- ✅ Confirm webhook URL is correct (no typos)
- ✅ Check that Authorization header is being sent

### **Problem: "Twilio credentials not configured"**
- ✅ Make sure environment variable names are EXACT:
  - `TWILIO_ACCOUNT_SID` (not Account_SID or ACCOUNT_SID)
  - `TWILIO_AUTH_TOKEN` (not Auth_Token)
  - `TWILIO_FROM_NUMBER` (not From_Number)
- ✅ Redeploy Edge Functions after adding variables

### **Problem: 401 Unauthorized**
- ✅ Add Authorization header with your Supabase anon key
- ✅ Use the Twilio Function proxy method instead

### **Problem: SMS sends but Homebase doesn't reply**
- ✅ Check that GROK_API_KEY is set in Supabase environment variables
- ✅ Look for Grok API errors in logs
- ✅ Verify Twilio has permission to send SMS from your account

---

## 💰 Cost Estimate

- **Twilio Phone Number:** ~$1/month
- **Incoming SMS:** $0.0075 per message
- **Outgoing SMS:** $0.0079 per message
- **Typical monthly cost for 100 messages:** ~$1.50 + phone number fee

---

## 🔒 Security Notes

- ✅ Never commit your Twilio credentials to git
- ✅ Use Supabase environment variables (they're encrypted)
- ✅ The Authorization header keeps your webhook secure
- ✅ Twilio validates requests are coming from their servers

---

## ✅ Checklist

Before going live, verify:

- [ ] TWILIO_ACCOUNT_SID environment variable set
- [ ] TWILIO_AUTH_TOKEN environment variable set
- [ ] TWILIO_FROM_NUMBER environment variable set (with + prefix)
- [ ] Webhook URL configured in Twilio phone number settings
- [ ] Authorization header added (or Twilio Function proxy set up)
- [ ] Test message sent and received successfully
- [ ] Logs show successful processing

---

## 🎉 You're Done!

Your Homebase AI is now accessible via SMS! Users can text your Twilio number and have natural conversations about finances, schedules, and more.

**Next Steps:**
- Share your Twilio number with users
- Monitor usage in Twilio Console
- Check conversation logs in Supabase
- Customize AI responses in `/supabase/functions/server/grok-ai.tsx`

---

## 📞 Support

If you run into issues:
1. Check the Twilio Console logs
2. Check the Supabase Edge Function logs
3. Test the `/sms/twilio/test` endpoint to verify configuration
4. Review error messages - they're detailed and helpful!
