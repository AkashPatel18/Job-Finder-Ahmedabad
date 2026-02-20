# Job Application Bot

An automated job application system that finds jobs from multiple platforms, matches them against your profile using AI, and helps you apply faster.

## Features

- **Multi-Platform Job Fetching** - Aggregates jobs from 10+ sources
- **AI-Powered Matching** - Uses FREE AI (Groq/Gemini) to score job relevance
- **Auto Cover Letters** - Generates tailored cover letters for each job
- **Telegram Notifications** - Get instant alerts for high-match jobs
- **Smart Filtering** - Filters by skills, location, salary, experience
- **Zero Cost** - Runs entirely on FREE APIs and services

## Quick Start

```bash
# 1. Clone and setup
cd /Users/akashpatel/Desktop/Projects/job-bot
npm install
npx playwright install chromium

# 2. Start databases
docker-compose up -d postgres redis

# 3. Configure (see docs/SETUP.md)
cp .env.example .env
# Edit .env with your API keys

# 4. Setup database
npm run db:generate
npm run db:push

# 5. Run
npm run dev
```

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/SETUP.md) | Complete installation & configuration |
| [Configuration](docs/CONFIGURATION.md) | All environment variables explained |
| [Telegram Setup](docs/TELEGRAM_SETUP.md) | How to create Telegram bot |
| [Job Sources](docs/JOB_SOURCES.md) | All supported job platforms |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues & solutions |

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   FREE Job APIs          Scraping (Optional)                │
│   ─────────────          ──────────────────                 │
│   • Remotive             • Naukri                           │
│   • RemoteOK             • Indeed                           │
│   • Arbeitnow            • LinkedIn (risky)                 │
│   • Adzuna                                                  │
│   • JSearch                                                 │
│                                                             │
│         │                        │                          │
│         └──────────┬─────────────┘                          │
│                    ▼                                        │
│         ┌─────────────────────┐                             │
│         │   AI Matching       │                             │
│         │   (Groq - FREE)     │                             │
│         └─────────────────────┘                             │
│                    │                                        │
│         ┌─────────────────────┐                             │
│         │  Score > 70%?       │                             │
│         └─────────────────────┘                             │
│            │              │                                 │
│           YES            NO                                 │
│            │              │                                 │
│            ▼              ▼                                 │
│   ┌──────────────┐  ┌──────────────┐                        │
│   │ Generate     │  │ Skip         │                        │
│   │ Cover Letter │  │              │                        │
│   └──────────────┘  └──────────────┘                        │
│            │                                                │
│            ▼                                                │
│   ┌──────────────────────────────┐                          │
│   │  Telegram Notification       │                          │
│   │  with Apply Link             │                          │
│   └──────────────────────────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Cost Breakdown

| Service | Cost | Notes |
|---------|------|-------|
| Groq AI | FREE | Unlimited for normal use |
| Remotive API | FREE | No key needed |
| RemoteOK API | FREE | No key needed |
| Arbeitnow API | FREE | No key needed |
| Telegram | FREE | Notifications |
| Docker | FREE | Local databases |
| **Total** | **$0/month** | |

## Project Structure

```
job-bot/
├── src/
│   ├── config/           # Configuration
│   ├── scrapers/         # Platform scrapers
│   ├── services/         # Core services
│   │   ├── ai-matcher    # AI job matching
│   │   ├── job-api       # Free API fetcher
│   │   ├── notification  # Telegram alerts
│   │   └── logger        # Logging
│   ├── database/         # Prisma setup
│   └── index.ts          # Entry point
├── docs/                 # Documentation
├── prisma/               # Database schema
├── data/                 # Resume & screenshots
└── docker-compose.yml    # Database services
```

## Requirements

- Node.js 20+
- Docker & Docker Compose
- Telegram account
- Groq API key (free)

## License

MIT

## Support

For issues, check [Troubleshooting](docs/TROUBLESHOOTING.md) or open an issue.
