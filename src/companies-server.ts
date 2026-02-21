/**
 * COMPANIES DIRECTORY SERVER (Minimal)
 *
 * A lightweight server that ONLY serves the companies directory page.
 * No scrapers, no job dashboard, no database required.
 *
 * Usage:
 *   npm run companies:serve
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const COMPANIES_FILE = join(__dirname, 'data/companies.json');

let companiesData: any = null;

function loadCompanies() {
  if (existsSync(COMPANIES_FILE)) {
    companiesData = JSON.parse(readFileSync(COMPANIES_FILE, 'utf-8'));
    console.log(`Loaded ${countCompanies()} companies`);
  } else {
    companiesData = { companies: { ahmedabad: {}, gandhinagar: {} } };
  }
}

function countCompanies(): number {
  let total = 0;
  const data = companiesData?.companies || {};
  for (const region of Object.values(data) as any[]) {
    for (const category of Object.values(region)) {
      if (Array.isArray(category)) total += category.length;
    }
  }
  return total;
}

function generateHTML(): string {
  const total = countCompanies();
  const lastUpdated = companiesData?.lastUpdated || new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gujarat IT Directory | ${total}+ Companies</title>
  <meta name="description" content="Find ${total}+ IT companies in Ahmedabad & Gujarat with direct career page links.">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #09090b;
      --bg-secondary: #18181b;
      --bg-tertiary: #27272a;
      --border: #27272a;
      --border-hover: #3f3f46;
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --accent: #3b82f6;
      --accent-hover: #60a5fa;
      --success: #22c55e;
      --warning: #eab308;
      --purple: #a855f7;
      --radius: 12px;
      --radius-sm: 8px;
      --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3);
      --transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    /* Hero Section */
    .hero {
      padding: 80px 24px 60px;
      text-align: center;
      background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
      border-bottom: 1px solid var(--border);
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 100px;
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 24px;
    }

    .hero-badge .dot {
      width: 8px;
      height: 8px;
      background: var(--success);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .hero h1 {
      font-size: clamp(32px, 5vw, 48px);
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 16px;
      background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero p {
      font-size: 18px;
      color: var(--text-secondary);
      max-width: 500px;
      margin: 0 auto;
    }

    /* Stats */
    .stats {
      display: flex;
      justify-content: center;
      gap: 48px;
      padding: 32px 24px;
      border-bottom: 1px solid var(--border);
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }

    .stat-label {
      font-size: 13px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }

    /* Search & Filters */
    .controls {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 24px;
      position: sticky;
      top: 0;
      background: var(--bg-primary);
      z-index: 100;
      border-bottom: 1px solid var(--border);
    }

    .search-wrapper {
      position: relative;
      margin-bottom: 20px;
    }

    .search-icon {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 14px 16px 14px 48px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 15px;
      font-family: inherit;
      transition: border-color var(--transition), box-shadow var(--transition);
    }

    .search-input::placeholder {
      color: var(--text-muted);
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .filter-btn {
      padding: 10px 18px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 100px;
      color: var(--text-secondary);
      font-size: 14px;
      font-family: inherit;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--transition);
    }

    .filter-btn:hover {
      background: var(--bg-secondary);
      border-color: var(--border-hover);
      color: var(--text-primary);
    }

    .filter-btn.active {
      background: var(--text-primary);
      border-color: var(--text-primary);
      color: var(--bg-primary);
    }

    /* Main Content */
    .main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 24px 80px;
    }

    .region {
      margin-bottom: 56px;
    }

    .region-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .region-title {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .region-count {
      padding: 4px 12px;
      background: var(--bg-tertiary);
      border-radius: 100px;
      font-size: 13px;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .category {
      margin-bottom: 32px;
    }

    .category-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    /* Company Card */
    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      transition: all var(--transition);
      cursor: default;
    }

    .card:hover {
      border-color: var(--border-hover);
      transform: translateY(-2px);
      box-shadow: var(--shadow);
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .company-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.4;
    }

    .badge {
      flex-shrink: 0;
      padding: 4px 10px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .badge-mnc {
      background: rgba(168, 85, 247, 0.15);
      color: var(--purple);
    }

    .badge-large {
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent-hover);
    }

    .badge-startup {
      background: rgba(34, 197, 94, 0.15);
      color: var(--success);
    }

    .badge-default {
      background: rgba(234, 179, 8, 0.15);
      color: var(--warning);
    }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 16px;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .meta-icon {
      color: var(--text-muted);
    }

    .card-specialty {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 16px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      text-decoration: none;
      cursor: pointer;
      transition: all var(--transition);
    }

    .btn-primary {
      background: var(--accent);
      color: white;
      border: none;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-secondary {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--bg-tertiary);
      border-color: var(--border-hover);
      color: var(--text-primary);
    }

    /* Empty State */
    .empty {
      text-align: center;
      padding: 80px 24px;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .empty-text {
      color: var(--text-muted);
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 32px 24px;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 13px;
    }

    .footer a {
      color: var(--text-secondary);
      text-decoration: none;
    }

    .footer a:hover {
      color: var(--text-primary);
    }

    /* Loading */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 80px 24px;
      color: var(--text-secondary);
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Responsive */
    @media (max-width: 640px) {
      .hero { padding: 48px 20px 40px; }
      .stats { gap: 24px; flex-wrap: wrap; }
      .stat-value { font-size: 28px; }
      .controls { padding: 20px 16px; }
      .main { padding: 24px 16px 60px; }
      .grid { grid-template-columns: 1fr; }
      .card-actions { flex-direction: column; }
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--border-hover);
    }
  </style>
</head>
<body>
  <section class="hero">
    <div class="hero-badge">
      <span class="dot"></span>
      <span>${total.toLocaleString()} companies indexed</span>
    </div>
    <h1>Gujarat IT Companies Directory</h1>
    <p>Discover tech companies in Ahmedabad & Gandhinagar with direct links to their career pages</p>
  </section>

  <section class="stats">
    <div class="stat">
      <div class="stat-value" id="statTotal">${total.toLocaleString()}</div>
      <div class="stat-label">Total Companies</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="statAhmedabad">-</div>
      <div class="stat-label">Ahmedabad</div>
    </div>
    <div class="stat">
      <div class="stat-value" id="statGandhinagar">-</div>
      <div class="stat-label">Gandhinagar</div>
    </div>
  </section>

  <section class="controls">
    <div class="search-wrapper">
      <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.3-4.3"></path>
      </svg>
      <input type="text" class="search-input" placeholder="Search by company name, industry, or size..." id="searchInput">
    </div>
    <div class="filters">
      <button class="filter-btn active" data-filter="all">All Companies</button>
      <button class="filter-btn" data-filter="ahmedabad">Ahmedabad</button>
      <button class="filter-btn" data-filter="gandhinagar">Gandhinagar</button>
      <button class="filter-btn" data-filter="mnc">MNCs</button>
      <button class="filter-btn" data-filter="startup">Startups</button>
      <button class="filter-btn" data-filter="large">Large</button>
    </div>
  </section>

  <main class="main" id="container">
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading companies...</span>
    </div>
  </main>

  <footer class="footer">
    <p>Last updated: ${new Date(lastUpdated).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top: 8px;">Built for job seekers in Gujarat</p>
  </footer>

  <script>
    const data = ${JSON.stringify(companiesData)};
    let filter = 'all';
    let query = '';

    const container = document.getElementById('container');

    function init() {
      updateStats();
      render();
      bindEvents();
    }

    function updateStats() {
      const ahd = count('ahmedabad');
      const gnd = count('gandhinagar');
      document.getElementById('statAhmedabad').textContent = ahd.toLocaleString();
      document.getElementById('statGandhinagar').textContent = gnd.toLocaleString();
      document.getElementById('statTotal').textContent = (ahd + gnd).toLocaleString();
    }

    function count(city) {
      const d = data?.companies?.[city];
      if (!d) return 0;
      return Object.values(d).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    }

    function render() {
      const cities = filter === 'ahmedabad' ? ['ahmedabad'] :
                     filter === 'gandhinagar' ? ['gandhinagar'] :
                     ['ahmedabad', 'gandhinagar'];

      let html = '';
      let total = 0;

      for (const city of cities) {
        const cityData = data?.companies?.[city];
        if (!cityData) continue;

        const cityName = city === 'ahmedabad' ? 'Ahmedabad' : 'Gandhinagar & GIFT City';
        let cityHtml = '';
        let cityCount = 0;

        for (const [cat, companies] of Object.entries(cityData)) {
          if (!Array.isArray(companies)) continue;

          const filtered = companies.filter(c => {
            const type = (c.type || '').toLowerCase();
            if (filter === 'mnc' && !type.includes('mnc')) return false;
            if (filter === 'startup' && !type.includes('startup')) return false;
            if (filter === 'large' && !type.includes('large')) return false;

            if (query) {
              const text = [c.name, c.type, c.specialty, c.employees].join(' ').toLowerCase();
              if (!text.includes(query.toLowerCase())) return false;
            }
            return true;
          });

          if (filtered.length === 0) continue;
          cityCount += filtered.length;

          const catName = cat.charAt(0).toUpperCase() + cat.slice(1).replace(/([A-Z])/g, ' $1');

          cityHtml += '<div class="category">';
          cityHtml += '<div class="category-title">' + catName + ' (' + filtered.length + ')</div>';
          cityHtml += '<div class="grid">';

          for (const c of filtered) {
            const type = c.type || 'Company';
            const badgeClass = type.toLowerCase().includes('mnc') ? 'badge-mnc' :
                               type.toLowerCase().includes('large') ? 'badge-large' :
                               type.toLowerCase().includes('startup') ? 'badge-startup' : 'badge-default';

            cityHtml += '<div class="card">';
            cityHtml += '<div class="card-header">';
            cityHtml += '<div class="company-name">' + esc(c.name) + '</div>';
            cityHtml += '<span class="badge ' + badgeClass + '">' + type + '</span>';
            cityHtml += '</div>';

            cityHtml += '<div class="card-meta">';
            if (c.employees) {
              cityHtml += '<div class="meta-item">';
              cityHtml += '<svg class="meta-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
              cityHtml += '<span>' + c.employees + '</span>';
              cityHtml += '</div>';
            }
            cityHtml += '</div>';

            if (c.specialty) {
              cityHtml += '<div class="card-specialty">' + esc(c.specialty) + '</div>';
            }

            cityHtml += '<div class="card-actions">';
            if (c.careers) {
              cityHtml += '<a href="' + c.careers + '" target="_blank" rel="noopener" class="btn btn-primary">';
              cityHtml += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>';
              cityHtml += 'Careers</a>';
            }
            if (c.linkedin) {
              cityHtml += '<a href="' + c.linkedin + '" target="_blank" rel="noopener" class="btn btn-secondary">LinkedIn</a>';
            }
            cityHtml += '</div>';
            cityHtml += '</div>';
          }

          cityHtml += '</div></div>';
        }

        if (cityCount > 0) {
          html += '<section class="region">';
          html += '<div class="region-header">';
          html += '<h2 class="region-title">' + cityName + '</h2>';
          html += '<span class="region-count">' + cityCount + ' companies</span>';
          html += '</div>';
          html += cityHtml;
          html += '</section>';
          total += cityCount;
        }
      }

      if (total === 0) {
        html = '<div class="empty">';
        html += '<div class="empty-icon">🔍</div>';
        html += '<div class="empty-title">No companies found</div>';
        html += '<div class="empty-text">Try adjusting your search or filters</div>';
        html += '</div>';
      }

      container.innerHTML = html;
    }

    function esc(s) {
      if (!s) return '';
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function bindEvents() {
      // Filters
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          filter = btn.dataset.filter;
          render();
        });
      });

      // Search
      let timeout;
      document.getElementById('searchInput').addEventListener('input', e => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          query = e.target.value;
          render();
        }, 200);
      });

      // Keyboard shortcut
      document.addEventListener('keydown', e => {
        if (e.key === '/' && document.activeElement !== document.getElementById('searchInput')) {
          e.preventDefault();
          document.getElementById('searchInput').focus();
        }
      });
    }

    init();
  </script>
</body>
</html>`;
}

// Security headers
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

// Simple rate limiting (in-memory, resets on restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests per window
const RATE_WINDOW = 60 * 1000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return false;
  }

  record.count++;
  return record.count > RATE_LIMIT;
}

function getClientIP(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '/';
  const clientIP = getClientIP(req);

  // Rate limiting check
  if (isRateLimited(clientIP)) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': '60',
      ...securityHeaders
    });
    res.end(JSON.stringify({ error: 'Too many requests. Please wait.' }));
    return;
  }

  // Health check (no rate limit for health checks)
  if (url === '/health' || url === '/api/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      ...securityHeaders
    });
    res.end(JSON.stringify({ status: 'ok', companies: countCompanies() }));
    return;
  }

  // API endpoint with restricted CORS
  if (url === '/api/companies') {
    const origin = req.headers.origin || '';
    const allowedOrigins = [
      'https://gujarat-it-companies.onrender.com',
      'https://job-finder-ahmedabad.onrender.com',
      'http://localhost:3000',
      'http://localhost:3456',
    ];

    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
      ...securityHeaders
    });
    res.end(JSON.stringify(companiesData));
    return;
  }

  // Main page with CSP
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;",
    ...securityHeaders
  });
  res.end(generateHTML());
}

loadCompanies();

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         GUJARAT IT COMPANIES DIRECTORY                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Server: http://localhost:${String(PORT).padEnd(37)}║
║  Companies: ${String(countCompanies()).padEnd(48)}║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
