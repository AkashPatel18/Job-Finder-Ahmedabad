# Configuration Reference

Complete reference for all environment variables and configuration options.

---

## Environment Variables (.env)

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://jobbot:pass@localhost:5432/jobbot` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token | `7123456789:AAHfGxxx...` |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID | `987654321` |
| `AI_PROVIDER` | AI service to use | `groq`, `gemini`, or `openai` |
| `GROQ_API_KEY` | Groq API key (if using Groq) | `gsk_xxx...` |

### AI Provider Options

| Variable | Cost | Sign Up |
|----------|------|---------|
| `GROQ_API_KEY` | FREE | https://console.groq.com/ |
| `GEMINI_API_KEY` | FREE (1500/day) | https://aistudio.google.com/ |
| `OPENAI_API_KEY` | Paid (~$10-30/mo) | https://platform.openai.com/ |

### Platform Credentials (Optional)

| Variable | Platform | Risk Level |
|----------|----------|------------|
| `LINKEDIN_ENABLED` | Enable LinkedIn | Set to `true` to enable |
| `LINKEDIN_EMAIL` | LinkedIn email | High risk of blocking |
| `LINKEDIN_PASSWORD` | LinkedIn password | High risk of blocking |
| `NAUKRI_EMAIL` | Naukri.com email | Medium risk |
| `NAUKRI_PASSWORD` | Naukri.com password | Medium risk |
| `INDEED_EMAIL` | Indeed email | Low risk (optional) |
| `INDEED_PASSWORD` | Indeed password | Low risk (optional) |

### Free Job API Keys (Optional)

| Variable | API | Free Tier |
|----------|-----|-----------|
| `ADZUNA_APP_ID` | Adzuna | 250 requests/month |
| `ADZUNA_APP_KEY` | Adzuna | 250 requests/month |
| `RAPIDAPI_KEY` | JSearch | 500 requests/month |
| `FINDWORK_API_KEY` | FindWork | Free tier |

### Application Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_MATCH_THRESHOLD` | `0.7` | Minimum AI score to apply (0.0-1.0) |
| `MAX_DAILY_APPLICATIONS` | `50` | Max applications per day |
| `SCRAPE_INTERVAL_HOURS` | `4` | Hours between scraping cycles |
| `APPLICATION_DELAY_MS` | `30000` | Delay between applications (ms) |

### Other Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Logging level (debug/info/warn/error) |
| `PROXY_ENABLED` | `false` | Enable proxy for scraping |
| `PROXY_URL` | - | Proxy server URL |
| `TWO_CAPTCHA_API_KEY` | - | 2Captcha API key |

---

## Search Criteria Configuration

Edit `src/config/search-criteria.ts` to customize job search:

### Keywords (Job Titles)

```typescript
keywords: [
  'Full Stack Developer',
  'Backend Developer',
  'Node.js Developer',
  'React Developer',
  // Add more...
],
```

### Location Preferences

```typescript
locations: {
  preferred: [
    'Remote',
    'Work from Home',
    'Ahmedabad',
    'Gujarat',
    'Gandhinagar',
  ],
  exclude: [
    // Cities to skip
  ],
},
```

### Experience Level

```typescript
experience: {
  min: 3,  // Minimum years
  max: 6,  // Maximum years
},
```

### Skills

```typescript
// Required skills (job must have these)
mustHaveSkills: [
  'Node.js',
  'JavaScript',
  'TypeScript',
],

// Preferred skills (higher score if present)
preferredSkills: [
  'React',
  'PostgreSQL',
  'AWS',
  'Docker',
],
```

### Salary Expectations

```typescript
salaryExpectation: {
  min: 2000000,  // 20 LPA in INR
  currency: 'INR',
},
```

### Excluded Companies

```typescript
excludeCompanies: [
  'Current Employer',  // Don't apply here
  'Company XYZ',
],
```

### Excluded Keywords

```typescript
excludeKeywords: [
  'Internship',
  'Fresher',
  'Entry Level',
  'PHP Developer',
  '.NET Developer',
],
```

---

## User Profile Configuration

Edit `src/config/search-criteria.ts` to update your profile:

```typescript
export const userProfile = {
  name: 'Akash Patel',
  title: 'Full Stack Developer',
  yearsOfExperience: 4,
  location: 'Gandhinagar, Gujarat, India',
  email: 'akashpatel18041999@gmail.com',
  phone: '+91 8733999561',

  skills: {
    expert: ['JavaScript', 'TypeScript', 'Node.js', 'React.js'],
    proficient: ['Redis', 'AWS', 'Docker'],
    familiar: ['Python', 'React Native'],
  },

  achievements: [
    'Optimized scanning engine with 85% performance improvement',
    'Built data pipeline processing 150 million records',
    // Add your achievements...
  ],

  preferences: {
    remotePreferred: true,
    willingToRelocate: false,
    noticePeriod: '30 days',
  },
};
```

---

## Schedule Configuration

The bot runs on this schedule (IST timezone):

| Task | Schedule | Configurable |
|------|----------|--------------|
| FREE APIs fetch | Every 2 hours | No (hardcoded) |
| Naukri scrape | Every 4 hours | Via `SCRAPE_INTERVAL_HOURS` |
| LinkedIn scrape | Every 8 hours | Only if `LINKEDIN_ENABLED=true` |
| Daily summary | 9:00 PM | No (hardcoded) |
| Counter reset | 12:00 AM | No (hardcoded) |

---

## Database Schema

Tables created by Prisma:

| Table | Purpose |
|-------|---------|
| `jobs` | All discovered jobs |
| `applications` | Application tracking |
| `company_blacklist` | Blocked companies |
| `application_history` | Deduplication |
| `scraping_sessions` | Scrape logs |

View database:
```bash
npm run db:studio
```

---

## Logging Configuration

Logs are stored in:
- `logs/combined.log` - All logs
- `logs/error.log` - Errors only
- `logs/applications.log` - Application activity

Change log level in `.env`:
```env
LOG_LEVEL=debug  # debug, info, warn, error
```
