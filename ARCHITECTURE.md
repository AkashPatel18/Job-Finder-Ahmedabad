# Gujarat IT Companies Directory - Technical Architecture

> A comprehensive guide to understanding the system architecture, data flow, and deployment infrastructure.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Core Components](#core-components)
6. [Data Architecture](#data-architecture)
7. [Server Architecture](#server-architecture)
8. [Frontend Architecture](#frontend-architecture)
9. [Scraping Infrastructure](#scraping-infrastructure)
10. [Security Implementation](#security-implementation)
11. [Deployment](#deployment)
12. [API Reference](#api-reference)
13. [Development Guide](#development-guide)

---

## System Overview

The Gujarat IT Companies Directory is a web application designed to aggregate and display IT companies in Ahmedabad and Gandhinagar regions. The system consists of two distinct operational modes:

| Mode | Purpose | Components |
|------|---------|------------|
| **Production Server** | Serves the public-facing companies directory | `companies-server.ts` only |
| **Full Application** | Includes scrapers, job matching, and automation | All components |

The production deployment is intentionally minimal, serving only the companies directory without database dependencies, scrapers, or job automation features.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA SOURCES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│   │ Glassdoor │  │ Clutch.co│  │ GoodFirms│  │ JustDial │  │AmbitionBox│    │
│   └─────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘   │
│         │             │             │             │               │          │
│         └─────────────┴──────┬──────┴─────────────┴───────────────┘          │
│                              │                                               │
│                              ▼                                               │
│                    ┌─────────────────────┐                                   │
│                    │  Playwright Scrapers │                                  │
│                    │  (Headless Browser)  │                                  │
│                    └──────────┬──────────┘                                   │
│                               │                                              │
└───────────────────────────────┼──────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA AGGREGATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌───────────────────────────────────────────────────────────────────┐     │
│   │                  company-aggregator.service.ts                     │     │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │     │
│   │  │ Deduplication│  │ Normalization│  │ Category Classification │   │     │
│   │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │     │
│   └───────────────────────────────────────────────────────────────────┘     │
│                                    │                                         │
│                                    ▼                                         │
│                        ┌───────────────────────┐                             │
│                        │  src/data/companies.json │                          │
│                        │     (~600KB, 2100+ companies) │                     │
│                        └───────────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                │ Server reads at startup
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION SERVER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    companies-server.ts                               │   │
│   │                                                                      │   │
│   │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │   │
│   │  │ Security Layer │  │  Rate Limiter  │  │  CORS Handler  │        │   │
│   │  │ (Headers, CSP) │  │ (100 req/min)  │  │  (Allowlist)   │        │   │
│   │  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘        │   │
│   │          └───────────────────┼───────────────────┘                  │   │
│   │                              ▼                                      │   │
│   │              ┌───────────────────────────────┐                      │   │
│   │              │      Request Handler          │                      │   │
│   │              │  ┌─────────────────────────┐  │                      │   │
│   │              │  │ GET /        → HTML     │  │                      │   │
│   │              │  │ GET /api/companies → JSON│ │                      │   │
│   │              │  │ GET /health  → Status   │  │                      │   │
│   │              │  └─────────────────────────┘  │                      │   │
│   │              └───────────────────────────────┘                      │   │
│   │                              │                                      │   │
│   │                              ▼                                      │   │
│   │              ┌───────────────────────────────┐                      │   │
│   │              │   HTML Generator (SSR)        │                      │   │
│   │              │   - Embeds JSON data inline   │                      │   │
│   │              │   - Full CSS/JS included      │                      │   │
│   │              └───────────────────────────────┘                      │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                │ Port 8080
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GCP CLOUD RUN                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │  Load Balancer (SSL Termination)                                      │  │
│   │      ↓                                                                │  │
│   │  https://your-service.run.app:443  →  Container:8080                 │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │    Internet Users     │
                    │  (Browser Requests)   │
                    └───────────────────────┘
```

---

## Tech Stack

### Runtime & Language

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | ≥20.0.0 | JavaScript runtime |
| TypeScript | 5.3.x | Type-safe JavaScript |
| tsx | 4.7.x | TypeScript execution without compilation |

### Core Dependencies

| Package | Purpose |
|---------|---------|
| `http` (built-in) | HTTP server (no Express overhead) |
| `playwright` | Headless browser for web scraping |
| `playwright-extra` | Stealth plugin to avoid bot detection |

### Optional Dependencies (Full Application)

| Package | Purpose |
|---------|---------|
| `@prisma/client` | Database ORM |
| `openai` | AI-powered job matching |
| `telegraf` | Telegram bot integration |
| `bullmq` / `ioredis` | Job queue management |
| `winston` | Structured logging |
| `nodemailer` | Email notifications |

---

## Project Structure

```
job-bot/
├── src/
│   ├── companies-server.ts      # Production server (standalone)
│   ├── data/
│   │   └── companies.json       # Primary data store (~600KB)
│   │
│   ├── scrapers/                # Data collection modules
│   │   ├── base.scraper.ts      # Abstract scraper class
│   │   ├── glassdoor-companies.scraper.ts
│   │   ├── clutch-companies.scraper.ts
│   │   ├── goodfirms-companies.scraper.ts
│   │   ├── justdial-companies.scraper.ts
│   │   └── ambitionbox-companies.scraper.ts
│   │
│   ├── services/                # Business logic
│   │   ├── company-aggregator.service.ts
│   │   ├── career-monitor.service.ts
│   │   ├── ai-matcher.service.ts
│   │   └── ...
│   │
│   ├── server/                  # Full application server
│   │   └── api.server.ts        # Express-based API (not used in prod)
│   │
│   ├── config/                  # Configuration
│   │   ├── index.ts
│   │   ├── platforms.ts
│   │   └── search-criteria.ts
│   │
│   └── bot/                     # Telegram integration
│       └── telegram-interactive.bot.ts
│
├── Dockerfile                   # Production container
├── Dockerfile.cloudrun          # GCP Cloud Run variant
├── docker-compose.yml           # Local development
├── package.json
├── tsconfig.json
└── .env                         # Environment variables (not committed)
```

---

## Core Components

### 1. Companies Server (`companies-server.ts`)

The production server is a **single-file, zero-dependency** Node.js application (aside from TypeScript/tsx). Key design decisions:

- **No framework**: Uses native `http` module for minimal overhead
- **No database**: Reads from static JSON file at startup
- **SSR pattern**: HTML is generated server-side with embedded data
- **Self-contained**: All HTML, CSS, and JavaScript are inline

```typescript
// Simplified flow
loadCompanies();                    // Read JSON → memory
const server = createServer(handleRequest);
server.listen(PORT);

function handleRequest(req, res) {
  if (url === '/')              return serveHTML();
  if (url === '/api/companies') return serveJSON();
  if (url === '/health')        return serveHealth();
}
```

### 2. Data Aggregator (`company-aggregator.service.ts`)

Consolidates data from multiple sources into a single normalized dataset:

- Deduplicates companies by name similarity
- Normalizes field names across sources
- Categorizes by company type (MNC, Startup, Mid-size, etc.)
- Merges career page URLs and LinkedIn links

### 3. Scrapers (`src/scrapers/`)

Each scraper extends a base class and implements source-specific extraction logic:

| Scraper | Target | Expected Yield |
|---------|--------|----------------|
| Glassdoor | glassdoor.com | ~500 companies |
| Clutch | clutch.co | ~800 companies |
| GoodFirms | goodfirms.co | ~600 companies |
| JustDial | justdial.com | ~2000 companies |
| AmbitionBox | ambitionbox.com | ~1000 companies |

---

## Data Architecture

### Schema: `companies.json`

```json
{
  "lastUpdated": "2026-02-20T10:54:56.548Z",
  "source": "Web Search - Feb 2026",
  "stats": {
    "ahmedabad": {
      "totalCompanies": 1380,
      "percentOfGujarat": "25-30%"
    },
    "gandhinagar": {
      "giftCityEntities": 939,
      "foreignCompanies": 100
    }
  },
  "companies": {
    "ahmedabad": {
      "mnc": [...],
      "startup": [...],
      "mid_size": [...],
      "service_based": [...],
      "product_based": [...]
    },
    "gandhinagar": {
      "gift_city": [...],
      "government": [...],
      "tech_park": [...]
    }
  }
}
```

### Company Object Schema

```typescript
interface Company {
  name: string;              // "TCS (Tata Consultancy Services)"
  type?: string;             // "MNC" | "Startup" | "Mid-size" | "Service" | "Product"
  employees?: string;        // "5000+" | "50-100" | "10-50"
  careers?: string;          // "https://www.tcs.com/careers"
  linkedin?: string;         // "https://www.linkedin.com/company/tcs"
  website?: string;          // "https://www.tcs.com"
  glassdoorRating?: number;  // 4.2
  founded?: string;          // "1968"
  headquarters?: string;     // "Mumbai, India"
}
```

### Data Flow

```
Scrapers (Playwright)
       │
       ▼
CSV/JSON files (temporary)
       │
       ▼
Aggregator Service
       │
       ▼
companies.json (canonical store)
       │
       ▼
Server reads at startup
       │
       ▼
Embedded in HTML response
```

---

## Server Architecture

### Request Handling Pipeline

```
Incoming Request
       │
       ▼
┌──────────────────┐
│ Extract Client IP │ ← X-Forwarded-For (Cloud Run)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Rate Limiting   │ ← 100 requests/minute/IP
│  (In-Memory Map) │
└────────┬─────────┘
         │
    ┌────┴────┐
    │ Limited │───▶ 429 Too Many Requests
    └────┬────┘
         │ OK
         ▼
┌──────────────────┐
│  Route Matching  │
└────────┬─────────┘
         │
    ┌────┴────────────────────────────┐
    │                                 │
    ▼                                 ▼
┌──────────┐  ┌──────────────┐  ┌──────────┐
│    /     │  │ /api/companies│  │ /health  │
└────┬─────┘  └──────┬───────┘  └────┬─────┘
     │               │               │
     ▼               ▼               ▼
 HTML+CSP      JSON+CORS         JSON
```

### Port Configuration

| Environment | Port | How It's Set |
|-------------|------|--------------|
| Local Development | 3000 | Default fallback |
| Docker | 8080 | `ENV PORT=8080` in Dockerfile |
| Cloud Run | 8080 | GCP sets `PORT` env var |

```typescript
const PORT = process.env.PORT || 3000;
```

---

## Frontend Architecture

### Rendering Strategy: Server-Side Rendering (SSR)

The frontend does **not** make API calls. Instead, company data is embedded directly into the HTML at render time:

```typescript
// In generateHTML():
return `
  <script>
    const data = ${JSON.stringify(companiesData)};  // Data injected here
    // Frontend JavaScript uses 'data' directly
  </script>
`;
```

**Advantages:**
- Single HTTP request (no subsequent API call)
- Faster initial render
- Works without JavaScript (data in DOM)

**Trade-offs:**
- Larger HTML payload (~600KB embedded)
- Data only updates on server restart

### UI Components

| Component | Functionality |
|-----------|---------------|
| Search Bar | Real-time filtering by company name |
| Region Tabs | Toggle between Ahmedabad / Gandhinagar |
| Type Filter | Filter by MNC, Startup, Mid-size, etc. |
| Company Cards | Display company info with career links |
| Stats Badge | Shows total company count |

### CSS Architecture

- **CSS Variables**: Theming via `:root` custom properties
- **Dark Theme**: `--bg-primary: #09090b`
- **Responsive**: Mobile-first with breakpoints
- **Animations**: Subtle transitions (150ms cubic-bezier)

---

## Security Implementation

### 1. Security Headers

```typescript
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',      // Prevent MIME sniffing
  'X-Frame-Options': 'DENY',                 // Prevent clickjacking
  'X-XSS-Protection': '1; mode=block',       // XSS filter
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};
```

### 2. Content Security Policy (CSP)

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
```

### 3. Rate Limiting

```typescript
const RATE_LIMIT = 100;           // Max requests
const RATE_WINDOW = 60 * 1000;    // Per 1 minute

// In-memory store (resets on container restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
```

**Behavior:**
- Tracks requests per IP address
- Returns `429 Too Many Requests` when exceeded
- Includes `Retry-After: 60` header

### 4. CORS Configuration

```typescript
const allowedOrigins = [
  'https://gujarat-it-companies.onrender.com',
  'https://job-finder-ahmedabad.onrender.com',
  'http://localhost:3000',
  'http://localhost:3456',
];
```

Only listed origins can make cross-origin API requests.

---

## Deployment

### Container Structure

```dockerfile
FROM node:20-slim
WORKDIR /app

# Install minimal dependencies
COPY package*.json ./
RUN npm install tsx typescript

# Copy only required files
COPY src/companies-server.ts ./src/
COPY src/data/companies.json ./src/data/

# Configuration
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Start server
CMD ["npx", "tsx", "src/companies-server.ts"]
```

### GCP Cloud Run

| Setting | Value |
|---------|-------|
| Region | asia-south1 (Mumbai) |
| Memory | 256MB (sufficient) |
| CPU | 1 vCPU |
| Min Instances | 0 (scale to zero) |
| Max Instances | 10 |
| Concurrency | 80 requests/instance |
| Authentication | Allow unauthenticated |

### CI/CD Pipeline

```
GitHub Push
     │
     ▼
Cloud Build Trigger
     │
     ▼
Build Docker Image
     │
     ▼
Push to Container Registry
     │
     ▼
Deploy to Cloud Run
     │
     ▼
Live at https://xxx.run.app
```

---

## API Reference

### `GET /`

Returns the full HTML page with embedded company data.

**Response:** `text/html; charset=utf-8`

**Headers:**
- `Content-Security-Policy`
- All security headers

### `GET /api/companies`

Returns raw company data as JSON.

**Response:** `application/json`

**CORS:** Restricted to allowlist

**Sample Response:**
```json
{
  "lastUpdated": "2026-02-20T10:54:56.548Z",
  "companies": {
    "ahmedabad": { ... },
    "gandhinagar": { ... }
  }
}
```

### `GET /health`

Health check endpoint for load balancers.

**Response:**
```json
{
  "status": "ok",
  "companies": 2108
}
```

---

## Development Guide

### Prerequisites

- Node.js ≥ 20.0.0
- npm or yarn

### Quick Start

```bash
# Install dependencies
npm install

# Run companies server locally
npm run companies:serve

# Server available at http://localhost:3000
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run companies:serve` | Start the companies directory server |
| `npm run scrape:all` | Run all scrapers sequentially |
| `npm run scrape:glassdoor` | Scrape Glassdoor only |
| `npm run aggregate` | Combine all data sources |
| `npm run aggregate:stats` | Show data statistics |

### Adding a New Scraper

1. Create `src/scrapers/newsite-companies.scraper.ts`
2. Extend base scraper pattern
3. Add npm script in `package.json`
4. Register in `scrape-all-companies.ts`

### Updating Company Data

```bash
# 1. Run scrapers to collect fresh data
npm run scrape:all

# 2. Aggregate into companies.json
npm run aggregate

# 3. Commit and push to trigger deployment
git add src/data/companies.json
git commit -m "Update company data"
git push
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment mode |

> **Note:** The production server requires no environment variables. All configuration is embedded.

---

## Performance Considerations

| Metric | Value | Notes |
|--------|-------|-------|
| Cold Start | ~2s | Cloud Run container startup |
| Response Time | <50ms | After warm start |
| HTML Size | ~700KB | With 2100 companies embedded |
| Memory Usage | ~50MB | Node.js + data in memory |

### Optimization Opportunities

1. **Gzip Compression**: Currently not implemented; would reduce payload by ~80%
2. **CDN Caching**: Static HTML could be cached at edge
3. **Pagination**: For very large datasets (10K+ companies)

---

## Monitoring & Observability

### Health Check

Cloud Run performs health checks on `/health`:

```bash
curl https://your-service.run.app/health
# {"status":"ok","companies":2108}
```

### Logging

```typescript
console.log(`Loaded ${countCompanies()} companies`);
// Visible in Cloud Run logs
```

Access logs via:
- GCP Console → Cloud Run → Logs
- `gcloud logging read`

---

## License

MIT License - See [LICENSE](./LICENSE) for details.

---

*Last Updated: February 2026*
*Maintainer: Akash Patel*
