# Telegram Bot Setup Guide

Complete guide to create a Telegram bot for job notifications.

## Overview

The bot sends you:
- New job matches (80%+ score)
- Application status updates
- Daily summary at 9 PM IST
- Error alerts

---

## Step 1: Create the Bot

### 1.1 Open BotFather

1. Open **Telegram** (phone or desktop)
2. Search for **`@BotFather`**
3. Click on the verified BotFather (has blue checkmark)
4. Click **Start**

### 1.2 Create New Bot

Send this command:
```
/newbot
```

BotFather will ask:
```
Alright, a new bot. How are we going to call it?
Please choose a name for your bot.
```

Reply with a name:
```
Job Application Bot
```

BotFather will ask:
```
Good. Now let's choose a username for your bot.
It must end in `bot`. Like this, for example: TetrisBot or tetris_bot.
```

Reply with a username (must be unique):
```
akash_jobs_bot
```

### 1.3 Get Your Token

BotFather will respond:
```
Done! Congratulations on your new bot. You will find it at t.me/akash_jobs_bot.

Use this token to access the HTTP API:
7123456789:AAHfGxxxxxxxxxxxxxxxxxxxxxxxxxxx

Keep your token secure and store it safely.
```

**Copy this token** - You'll need it for `TELEGRAM_BOT_TOKEN`

---

## Step 2: Get Your Chat ID

### 2.1 Start Chat with Your Bot

1. Click the link BotFather gave you (t.me/your_bot_name)
   OR search for your bot username in Telegram
2. Click **Start** button
3. Send any message (like "hello")

### 2.2 Get the Chat ID

Open this URL in your browser (replace with your token):

```
https://api.telegram.org/bot7123456789:AAHfGxxxxxxxxxxxxxxxxxxxxxxxxxxx/getUpdates
```

You'll see JSON response:
```json
{
  "ok": true,
  "result": [
    {
      "update_id": 123456789,
      "message": {
        "message_id": 1,
        "from": {
          "id": 987654321,
          "first_name": "Akash",
          "username": "akashpatel"
        },
        "chat": {
          "id": 987654321,
          "first_name": "Akash",
          "type": "private"
        },
        "text": "hello"
      }
    }
  ]
}
```

Find `"chat": { "id": 987654321 }` - that number is your **Chat ID**

---

## Step 3: Test the Bot

Open this URL in browser (replace YOUR_TOKEN and YOUR_CHAT_ID):

```
https://api.telegram.org/botYOUR_TOKEN/sendMessage?chat_id=YOUR_CHAT_ID&text=Hello%20from%20Job%20Bot!
```

Example:
```
https://api.telegram.org/bot7123456789:AAHfGxxx/sendMessage?chat_id=987654321&text=Hello%20from%20Job%20Bot!
```

If successful, you'll receive the message in Telegram!

---

## Step 4: Add to .env

```env
TELEGRAM_BOT_TOKEN=7123456789:AAHfGxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=987654321
```

---

## Notification Examples

### New Job Match
```
🔥 New Job Match!

Title: Senior Full Stack Developer
Company: TechCorp
Location: Remote
Platform: REMOTIVE
Match Score: 92%

View Job: https://...
```

### Application Ready
```
✅ Successfully Applied

Title: Backend Developer
Company: StartupXYZ
Platform: REMOTEOK
Reason: Cover letter ready. Apply at: https://...
```

### Daily Summary
```
📊 Daily Summary - 19/02/2026

Scraping:
• Jobs Found: 47
• New Jobs: 12

Applications:
• Submitted: 8
• Failed: 1
• Success Rate: 89%

Top Matches:
1. Full Stack Developer @ Google (95%)
2. Backend Engineer @ Meta (91%)
3. Node.js Developer @ Stripe (88%)
```

---

## Troubleshooting

### "Chat not found" Error

**Cause:** You haven't started a chat with the bot yet.

**Fix:**
1. Search for your bot in Telegram
2. Click **Start**
3. Send any message
4. Try getting chat ID again

### Empty Response from getUpdates

**Cause:** No messages sent to bot yet.

**Fix:**
1. Send a message to your bot
2. Refresh the getUpdates URL

### Token Invalid

**Cause:** Token copied incorrectly.

**Fix:**
1. Go back to BotFather
2. Send `/mybots`
3. Select your bot
4. Click "API Token" to view again

---

## Optional: Bot Commands

You can add commands to your bot for future features:

1. Open BotFather
2. Send `/setcommands`
3. Select your bot
4. Send:
```
status - Check bot status
jobs - View recent jobs
summary - Get daily summary
```

---

## Security Tips

1. **Never share your bot token publicly**
2. **Don't commit .env to git** (it's in .gitignore)
3. **Regenerate token if compromised** - Use `/revoke` in BotFather
