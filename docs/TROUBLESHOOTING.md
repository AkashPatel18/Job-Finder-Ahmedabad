# Troubleshooting Guide

Common issues and solutions.

---

## Installation Issues

### npm install fails

**Error:** Network timeout or ETIMEDOUT

**Solutions:**
```bash
# Clear npm cache
npm cache clean --force

# Use different registry
npm install --registry https://registry.npmmirror.com

# Or try yarn
yarn install
```

### Playwright install fails

**Error:** Browser download failed

**Solutions:**
```bash
# Install with specific browser
npx playwright install chromium

# If permission issues on Mac
sudo npx playwright install-deps
```

---

## Database Issues

### Cannot connect to PostgreSQL

**Error:** `Connection refused` or `ECONNREFUSED`

**Solutions:**
```bash
# Check if Docker is running
docker ps

# Restart database containers
docker-compose down
docker-compose up -d postgres redis

# Check container logs
docker logs job-bot-db
```

### Prisma generate fails

**Error:** `Cannot find module '@prisma/client'`

**Solutions:**
```bash
# Regenerate Prisma client
npm run db:generate

# If that fails, reinstall
rm -rf node_modules
npm install
npm run db:generate
```

### Database migration issues

**Error:** `Migration failed`

**Solutions:**
```bash
# Reset database (WARNING: deletes all data)
npm run db:push -- --force-reset

# Or drop and recreate
docker-compose down -v
docker-compose up -d postgres redis
npm run db:push
```

---

## API Issues

### Groq API Error

**Error:** `401 Unauthorized` or `Invalid API key`

**Solutions:**
1. Check your API key is correct in `.env`
2. Regenerate key at https://console.groq.com/
3. Make sure no extra spaces in the key

**Error:** `429 Rate limit exceeded`

**Solutions:**
- Wait a few minutes and try again
- Groq has generous limits, this is rare

### Telegram Not Working

**Error:** `Chat not found` or `Bot not started`

**Solutions:**
1. Open Telegram and start chat with your bot
2. Send a message to the bot
3. Get chat ID again from getUpdates URL
4. Update `.env` with correct chat ID

**Error:** `401 Unauthorized`

**Solutions:**
1. Check bot token is correct
2. Get new token from BotFather

### Free APIs Return Empty

**Error:** No jobs fetched from Remotive/RemoteOK

**Solutions:**
1. Check internet connection
2. APIs might be temporarily down
3. Check logs for specific error messages
4. Try accessing API directly in browser:
   - https://remotive.com/api/remote-jobs
   - https://remoteok.com/api

---

## Scraping Issues

### Naukri Login Failed

**Error:** `Login failed` or `Security checkpoint`

**Solutions:**
1. Check credentials are correct
2. Login manually in browser first
3. Complete any security verification
4. Try again after a few hours
5. Use a fresh account

### LinkedIn Blocked

**Error:** `Account restricted` or `Security verification required`

**Solutions:**
1. **Stop using the bot with LinkedIn** (recommended)
2. Wait 24-72 hours for restriction to lift
3. Complete manual verification
4. Appeal through LinkedIn Help
5. Use a dedicated account in future

### Timeout Errors

**Error:** `Navigation timeout` or `Page load timeout`

**Solutions:**
```bash
# Increase timeout in scraper
# Edit src/scrapers/base.scraper.ts
await this.page.goto(url, {
  waitUntil: 'networkidle',
  timeout: 60000  // Increase to 60 seconds
});
```

---

## Runtime Issues

### Bot Crashes on Start

**Error:** `Invalid environment configuration`

**Solutions:**
1. Check all required variables in `.env`
2. Run validation:
```bash
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"
```

### Memory Issues

**Error:** `JavaScript heap out of memory`

**Solutions:**
```bash
# Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npm run dev

# Or add to package.json scripts
"dev": "NODE_OPTIONS='--max-old-space-size=4096' tsx watch src/index.ts"
```

### Too Many Open Files

**Error:** `EMFILE: too many open files`

**Solutions:**
```bash
# Mac/Linux: Increase file limit
ulimit -n 10000

# Make permanent (Mac)
sudo launchctl limit maxfiles 10000 200000
```

---

## Notification Issues

### Not Receiving Telegram Messages

**Checklist:**
1. Bot token correct?
2. Chat ID correct?
3. Started chat with bot?
4. Bot not blocked?

**Test manually:**
```bash
curl "https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=Test"
```

### Duplicate Notifications

**Cause:** Bot restarted and reprocessed same jobs

**Solution:** Jobs are deduplicated by external ID in database. If seeing duplicates:
```bash
# Check for duplicate jobs
npm run db:studio
# Look in jobs table for duplicates
```

---

## Performance Issues

### Slow Job Fetching

**Possible Causes:**
1. Network latency
2. Rate limiting
3. Too many API calls

**Solutions:**
1. Check network speed
2. Reduce number of keywords in search criteria
3. Increase delays between requests

### High CPU Usage

**Cause:** Playwright browser consuming resources

**Solutions:**
1. Use headless mode (default)
2. Close browser after scraping (automatic)
3. Reduce scraping frequency

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Database not running | `docker-compose up -d` |
| `Invalid API key` | Wrong key in .env | Check and update key |
| `Chat not found` | Bot not started | Start chat with bot in Telegram |
| `Login failed` | Wrong credentials | Verify credentials |
| `Rate limit` | Too many requests | Wait and retry |
| `Timeout` | Slow network/site | Increase timeout |

---

## Getting Help

### Collect Debug Info

Before asking for help, gather:

```bash
# Node version
node --version

# npm version
npm --version

# Docker status
docker ps

# Recent logs
tail -100 logs/error.log
```

### Log Locations

- `logs/combined.log` - All logs
- `logs/error.log` - Errors only
- `logs/applications.log` - Application activity

### Enable Debug Mode

```env
LOG_LEVEL=debug
```

Then check logs for detailed information.

---

## Reset Everything

If all else fails, start fresh:

```bash
# Stop everything
docker-compose down -v
rm -rf node_modules
rm -rf dist

# Reinstall
npm install
npx playwright install chromium

# Reset database
docker-compose up -d postgres redis
npm run db:generate
npm run db:push

# Start fresh
npm run dev
```
