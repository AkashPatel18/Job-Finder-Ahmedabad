# Job Sources

All supported job platforms and APIs.

---

## Priority Levels

| Priority | Type | Risk | Frequency |
|----------|------|------|-----------|
| 1 | FREE APIs | None | Every 2 hours |
| 2 | Indian Portals | Medium | Every 4 hours |
| 3 | International | High | Every 8 hours |

---

## Priority 1: FREE APIs (Always Enabled)

These APIs require **NO authentication** and have **NO blocking risk**.

### Remotive
- **URL:** https://remotive.com
- **API Key:** Not required
- **Cost:** 100% FREE
- **Best For:** Remote tech/developer jobs
- **Coverage:** Global remote positions
- **Job Types:** Software, DevOps, Data, Design

### RemoteOK
- **URL:** https://remoteok.com
- **API Key:** Not required
- **Cost:** 100% FREE
- **Best For:** Remote jobs worldwide
- **Coverage:** Tech, marketing, design, sales
- **Job Types:** All remote positions

### Arbeitnow
- **URL:** https://arbeitnow.com
- **API Key:** Not required
- **Cost:** 100% FREE
- **Best For:** European + Remote jobs
- **Coverage:** Europe, Remote worldwide
- **Job Types:** Tech, engineering, design

---

## Priority 1: FREE APIs (Optional - Need Registration)

These have FREE tiers but require registration.

### Adzuna
- **URL:** https://developer.adzuna.com/
- **Free Tier:** 250 requests/month
- **Best For:** India-specific jobs
- **Coverage:** India, UK, US, Australia
- **Sign Up:** https://developer.adzuna.com/signup

```env
ADZUNA_APP_ID=your_app_id
ADZUNA_APP_KEY=your_app_key
```

### JSearch (RapidAPI)
- **URL:** https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
- **Free Tier:** 500 requests/month
- **Best For:** Aggregated job listings
- **Coverage:** LinkedIn, Indeed, Glassdoor data
- **Sign Up:** https://rapidapi.com/

```env
RAPIDAPI_KEY=your_rapidapi_key
```

### FindWork
- **URL:** https://findwork.dev
- **Free Tier:** Available
- **Best For:** Developer jobs
- **Coverage:** Global tech jobs
- **Sign Up:** https://findwork.dev/developers/

```env
FINDWORK_API_KEY=your_findwork_key
```

---

## Priority 2: Indian Job Portals

### Naukri.com
- **URL:** https://www.naukri.com
- **Auth Required:** Yes
- **Risk Level:** Medium
- **Best For:** Largest Indian job portal
- **Coverage:** All of India

```env
NAUKRI_EMAIL=your@email.com
NAUKRI_PASSWORD=your_password
```

**Tips:**
- Use a dedicated account
- Don't scrape too aggressively
- Account may get temporarily limited

### Indeed India
- **URL:** https://in.indeed.com
- **Auth Required:** No (basic), Yes (apply)
- **Risk Level:** Low
- **Best For:** High volume job listings
- **Coverage:** India, Global

```env
INDEED_EMAIL=your@email.com      # Optional
INDEED_PASSWORD=your_password    # Optional
```

---

## Priority 3: International Platforms

### LinkedIn (RISKY - Disabled by Default)
- **URL:** https://www.linkedin.com
- **Auth Required:** Yes
- **Risk Level:** HIGH
- **Best For:** Professional networking, remote jobs
- **Coverage:** Global

**WARNING:** LinkedIn actively detects and blocks automation.

```env
LINKEDIN_ENABLED=true            # Must explicitly enable
LINKEDIN_EMAIL=your@email.com
LINKEDIN_PASSWORD=your_password
```

**Recommendations:**
- Use a dedicated/secondary account
- Keep disabled unless necessary
- Consider using LinkedIn manually instead

---

## Comparison Table

| Source | Cost | Auth | Risk | Jobs/Day | India Jobs |
|--------|------|------|------|----------|------------|
| Remotive | FREE | No | None | 50-100 | Few |
| RemoteOK | FREE | No | None | 100-200 | Some |
| Arbeitnow | FREE | No | None | 50-100 | Few |
| Adzuna | FREE | Key | None | 100-200 | Many |
| JSearch | FREE | Key | None | 200-500 | Many |
| FindWork | FREE | Key | None | 50-100 | Some |
| Naukri | FREE | Login | Medium | 500+ | All |
| Indeed | FREE | Optional | Low | 300+ | Many |
| LinkedIn | FREE | Login | HIGH | 200+ | Many |

---

## Adding New Sources

To add a new job source:

### For API Sources

Edit `src/services/job-api.service.ts`:

```typescript
async fetchNewSourceJobs(): Promise<APIJob[]> {
  const jobs: APIJob[] = [];

  try {
    const response = await fetch('https://api.newsource.com/jobs');
    const data = await response.json();

    for (const job of data.jobs) {
      jobs.push({
        externalId: `newsource_${job.id}`,
        title: job.title,
        companyName: job.company,
        location: job.location,
        description: job.description,
        url: job.url,
        source: 'NEWSOURCE',
        remote: job.remote,
      });
    }
  } catch (error) {
    this.apiLogger.error('NewSource API error:', error);
  }

  return jobs;
}
```

### For Scraping Sources

Create `src/scrapers/newsource.scraper.ts` extending `BaseScraper`.

---

## Recommended Setup

### Minimum (Zero Cost)
```env
# Just use free APIs - no credentials needed
AI_PROVIDER=groq
GROQ_API_KEY=gsk_xxx
```
Jobs from: Remotive, RemoteOK, Arbeitnow

### Recommended (Zero Cost + More Jobs)
```env
AI_PROVIDER=groq
GROQ_API_KEY=gsk_xxx

# Add free API keys
ADZUNA_APP_ID=xxx
ADZUNA_APP_KEY=xxx
RAPIDAPI_KEY=xxx
```
Jobs from: All free APIs + Adzuna + JSearch

### Full Setup (With Indian Portals)
```env
AI_PROVIDER=groq
GROQ_API_KEY=gsk_xxx

# Free APIs
ADZUNA_APP_ID=xxx
ADZUNA_APP_KEY=xxx

# Indian portals
NAUKRI_EMAIL=xxx
NAUKRI_PASSWORD=xxx
```
Jobs from: All sources except LinkedIn
