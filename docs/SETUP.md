# Setup Guide

Complete guide to install and run the Job Application Bot.

## Prerequisites

Before starting, make sure you have:

- **Node.js 20+** - [Download](https://nodejs.org/)
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/)
- **Git** (optional) - [Download](https://git-scm.com/)

### Check Prerequisites

```bash
node --version    # Should be v20.x.x or higher
docker --version  # Should be 20.x.x or higher
npm --version     # Should be 10.x.x or higher
```

---

## Step 1: Install Dependencies

```bash
cd /Users/akashpatel/Desktop/Projects/job-bot

# Install Node.js packages
npm install

# Install Playwright browser (for web scraping)
npx playwright install chromium
```

**Expected time:** 2-5 minutes

---

## Step 2: Start Database Services

```bash
# Start PostgreSQL and Redis in Docker
docker-compose up -d postgres redis

# Verify they're running
docker ps
```

You should see:
```
CONTAINER ID   IMAGE              STATUS         NAMES
xxxx           postgres:15        Up 10 secs     job-bot-db
xxxx           redis:7-alpine     Up 10 secs     job-bot-redis
```

---

## Step 3: Get API Keys

### 3.1 Groq API Key (FREE - Required)

1. Go to **https://console.groq.com/**
2. Sign up with Google or GitHub
3. Click **API Keys** in sidebar
4. Click **Create API Key**
5. Copy the key (starts with `gsk_`)

### 3.2 Telegram Bot (FREE - Required)

See [TELEGRAM_SETUP.md](TELEGRAM_SETUP.md) for detailed instructions.

Quick version:
1. Open Telegram → Search `@BotFather`
2. Send `/newbot` → Follow prompts
3. Copy the bot token
4. Start chat with your bot → Send a message
5. Get chat ID from: `https://api.telegram.org/bot<TOKEN>/getUpdates`

---

## Step 4: Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit with your values
nano .env   # or use any text editor
```

### Minimum .env Configuration

```env
# Database (keep as-is)
DATABASE_URL=postgresql://jobbot:jobbot_secure_pass@localhost:5432/jobbot
REDIS_URL=redis://localhost:6379

# Telegram (paste your values)
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=123456789

# AI Provider (Groq is FREE)
AI_PROVIDER=groq
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Basic settings
NODE_ENV=development
```

---

## Step 5: Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Create database tables
npm run db:push
```

---

## Step 6: Run the Bot

### Development Mode (Recommended for first run)

```bash
npm run dev
```

You should see:
```
[INFO] Starting Job Application Bot...
[INFO] ==================================================
[INFO] PRIORITY ORDER:
[INFO] 1. FREE APIs (Remotive, RemoteOK, Arbeitnow, etc.)
[INFO] 2. Indian Portals (Naukri, Indeed)
[INFO] 3. International (LinkedIn - only if enabled)
[INFO] ==================================================
[INFO] Database connected successfully
[INFO] AI Provider: groq
[INFO] Enabled FREE APIs: { remotive: true, remoteok: true, arbeitnow: true }
[INFO] Job Application Bot started successfully
```

### Production Mode

```bash
# Build TypeScript
npm run build

# Run compiled code
npm start
```

---

## Step 7: Verify It's Working

1. **Check Telegram** - You should receive a "Job Bot Started" message
2. **Check Logs** - Look for "Fetched X jobs from APIs"
3. **Check Database** - Run `npm run db:studio` to view data

---

## Running as Background Service

### Option 1: PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start dist/index.js --name job-bot

# View logs
pm2 logs job-bot

# Auto-start on reboot
pm2 startup
pm2 save
```

### Option 2: Docker (Full containerization)

```bash
# Build and run everything in Docker
docker-compose up -d

# View logs
docker-compose logs -f app
```

---

## Daily Operation

The bot runs automatically with this schedule:

| Task | Frequency | Time (IST) |
|------|-----------|------------|
| Fetch from FREE APIs | Every 2 hours | All day |
| Scrape Naukri | Every 4 hours | All day |
| Scrape LinkedIn | Every 8 hours | Only if enabled |
| Daily Summary | Once | 9:00 PM |
| Reset Counters | Once | 12:00 AM |

---

## Stopping the Bot

```bash
# If running in terminal
Ctrl + C

# If running with PM2
pm2 stop job-bot

# If running with Docker
docker-compose down
```

---

## Next Steps

1. **Customize search criteria** - Edit `src/config/search-criteria.ts`
2. **Add more job sources** - See [JOB_SOURCES.md](JOB_SOURCES.md)
3. **Configure Naukri** - Add credentials to `.env` for Indian jobs
4. **Troubleshooting** - See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
