# SMS Testing Guide

## Overview

Homebase now supports full SMS functionality via Twilio. Users can interact with Homebase through text messages, with the same capabilities as the web app.

## Setup Steps

### 1. Add Your Phone Number

1. **Log in** to the web app
2. Click the **Settings** button (gear icon) in the top right
3. Scroll down to the **"SMS Texting"** section
4. Enter your phone number with country code (e.g., `+1234567890` for US)
5. Click **"Save Phone Number"**
6. You should see a confirmation message

**Note:** The phone number must include the country code (e.g., `+1` for US, `+44` for UK).

### 2. Connect Your Google Calendar (Required for Calendar Operations)

1. In the same Settings modal, connect your Google Calendar
2. Both partners can connect their calendars separately
3. Calendar operations via SMS require a connected calendar

### 3. Get Your Toll-Free Number

Your toll-free number should be configured in Twilio. Check your Twilio dashboard or ask your administrator for the number.

**Example:** `(555) 123-4567` or `+15551234567`

## Testing SMS Functionality

### For Registered Users (Recommended)

**Prerequisites:**
- ✅ Account created and logged in
- ✅ Phone number added in settings
- ✅ Google Calendar connected

**What Works:**
- ✅ All calendar operations (create, delete, update events)
- ✅ View calendar events
- ✅ Market data queries
- ✅ Financial questions
- ✅ Weekly check-ins
- ✅ Full conversation memory (shared with web app)

**Test Commands:**

```
Calendar Operations:
- "Add dentist appointment tomorrow at 2pm"
- "Remove dentist appointment"
- "Change team meeting to 3pm"
- "What's on my calendar this week?"

General:
- "What did I learn this week?"
- "How's the market doing?"
- "What's our net worth?"
```

### For Unregistered Users

**What Works:**
- ✅ Basic conversation with AI
- ✅ General questions
- ❌ Calendar operations (requires account + connected calendar)
- ❌ Financial data (requires account)

**Note:** Unregistered users will have a separate conversation thread (not shared with web app).

## How It Works

### User Identification

1. **Registered Users:**
   - System looks up your phone number in the database
   - Links SMS to your user account
   - Uses same conversation ID as web app (`web:${userId}`)
   - **Full feature access**

2. **Unregistered Users:**
   - System uses phone number as conversation ID (`sms:${phoneNumber}`)
   - Separate conversation thread
   - **Limited feature access**

### Calendar Operations Flow

1. User texts: "Add dentist appointment Tuesday at 2pm"
2. System categorizes intent (calendar + create action)
3. Extracts entities (title: "dentist appointment", date: "Tuesday", time: "2pm")
4. Parses natural language date/time to ISO format
5. Creates event in Google Calendar via API
6. Injects success message into conversation
7. AI responds naturally: "✅ Added dentist appointment to your calendar for Tuesday at 2pm"

### Error Handling

If something goes wrong:
- Technical errors are converted to user-friendly messages
- AI explains what happened and suggests next steps
- Example: "I couldn't find that calendar event. It might have already been deleted or the name doesn't match exactly."

## Testing Checklist

### Basic Functionality
- [ ] Text toll-free number and receive response
- [ ] Conversation flows naturally
- [ ] AI remembers context within conversation

### Calendar Operations
- [ ] Create event: "Add [event] [date] at [time]"
- [ ] Delete event: "Remove [event]" or "Delete [event]"
- [ ] Update event: "Change [event] to [new time]" or "Move [event] to [new date]"
- [ ] View calendar: "What's on my calendar?"

### Date/Time Parsing
- [ ] "tomorrow at 2pm" ✅
- [ ] "next Tuesday at 3:30pm" ✅
- [ ] "February 10th at 9am" ✅
- [ ] "next week Monday" ✅

### Error Scenarios
- [ ] Text without phone number in account → Should still work (unregistered mode)
- [ ] Text calendar command without connected calendar → Should get helpful error
- [ ] Text invalid date/time → Should get parsing error message

## Troubleshooting

### "I'm not receiving responses"
- Check Twilio webhook is configured correctly
- Verify toll-free number is active
- Check Supabase function logs for errors

### "Calendar operations not working"
- Verify Google Calendar is connected in web app settings
- Check phone number is saved in account
- Ensure you're logged in with the same account

### "Phone number not saving"
- Make sure you're logged in
- Check phone number format (must include country code)
- Check browser console for errors

## Webhook Configuration

The Twilio webhook URL should be:
```
https://[your-project-id].supabase.co/functions/v1/make-server-8c22500c/sms/twilio/incoming
```

Configure this in Twilio Console:
1. Go to Phone Numbers → Manage → Active Numbers
2. Click your toll-free number
3. Under "A MESSAGE COMES IN", enter the webhook URL
4. Save

## Next Steps

1. **Test with your own phone number** (add it in settings first)
2. **Test calendar operations** (create, delete, update events)
3. **Test error scenarios** (invalid commands, missing calendar connection)
4. **Share toll-free number** with beta testers
5. **Collect feedback** on SMS experience vs web app

## Support

If you encounter issues:
1. Check Supabase function logs
2. Check Twilio logs
3. Verify webhook is receiving messages
4. Test with registered vs unregistered users
