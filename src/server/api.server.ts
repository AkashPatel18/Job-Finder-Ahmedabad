import http from 'http';
import { URL } from 'url';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { prisma } from '../database/index.js';
import { messageGeneratorService } from '../services/message-generator.service.js';
import { hrFinderService } from '../services/hr-finder.service.js';
import { schedulerService } from '../services/scheduler.service.js';
import { careerMonitorService } from '../services/career-monitor.service.js';
import { companyDiscoveryService } from '../services/company-discovery.service.js';
import { logger } from '../services/logger.service.js';
import { UserJobStatus } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3456;

class APIServer {
  private server: http.Server | null = null;

  async start(): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${PORT}`);
      const path = url.pathname;

      try {
        // Route handling
        if (path === '/api/jobs' && req.method === 'GET') {
          await this.handleGetJobs(url, res);
        } else if (path.startsWith('/api/jobs/') && req.method === 'GET') {
          const id = path.split('/')[3];
          await this.handleGetJob(id, res);
        } else if (path.startsWith('/api/jobs/') && req.method === 'PUT') {
          const id = path.split('/')[3];
          await this.handleUpdateJob(id, req, res);
        } else if (path === '/api/stats' && req.method === 'GET') {
          await this.handleGetStats(res);
        } else if (path.startsWith('/api/jobs/') && path.endsWith('/messages') && req.method === 'GET') {
          const id = path.split('/')[3];
          await this.handleGetMessages(id, res);
        } else if (path.startsWith('/api/jobs/') && path.endsWith('/hr') && req.method === 'GET') {
          const id = path.split('/')[3];
          await this.handleFindHR(id, res);
        } else if (path === '/api/companies' && req.method === 'GET') {
          await this.handleGetCompanies(res);
        } else if (path === '/api/scheduler/status' && req.method === 'GET') {
          await this.handleSchedulerStatus(res);
        } else if (path === '/api/monitor/run' && req.method === 'POST') {
          await this.handleRunMonitor(req, res);
        } else if (path === '/api/discover/run' && req.method === 'POST') {
          await this.handleRunDiscovery(req, res);
        } else if (path === '/' || path === '/index.html') {
          await this.serveDashboard(res);
        } else if (path === '/companies' || path === '/companies.html') {
          await this.serveCompaniesPage(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (error) {
        logger.error('API error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    this.server.listen(PORT, () => {
      logger.info(`API server running at http://localhost:${PORT}`);
      logger.info(`Dashboard available at http://localhost:${PORT}`);
    });
  }

  private async handleGetJobs(url: URL, res: http.ServerResponse): Promise<void> {
    const filter = url.searchParams.get('filter') || 'all';
    const search = url.searchParams.get('search') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    let where: any = {};

    switch (filter) {
      case 'new':
        where.userStatus = 'NEW';
        break;
      case 'saved':
        where.savedByUser = true;
        break;
      case 'applied':
        where.userStatus = 'APPLIED';
        break;
      case 'interviewing':
        where.userStatus = 'INTERVIEWING';
        break;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [{ aiMatchScore: 'desc' }, { scrapedAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }));
  }

  private async handleGetJob(id: string, res: http.ServerResponse): Promise<void> {
    let job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      job = await prisma.job.findFirst({ where: { id: { startsWith: id } } });
    }

    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found' }));
      return;
    }

    // Generate messages if not present
    if (!job.linkedinMessage) {
      const messages = await messageGeneratorService.generateMessages(job);
      job = await prisma.job.update({
        where: { id: job.id },
        data: {
          linkedinMessage: messages.linkedinMessage,
          applicationFormData: JSON.stringify(messages.formData),
        },
      });
    }

    // Get HR search links
    const searchLinks = hrFinderService.getAllSearchLinks(job.companyName);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ job, searchLinks }));
  }

  private async handleUpdateJob(id: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);

    const updateData: any = {};

    if (body.userStatus) {
      updateData.userStatus = body.userStatus as UserJobStatus;
    }
    if (body.savedByUser !== undefined) {
      updateData.savedByUser = body.savedByUser;
    }
    if (body.userNotes !== undefined) {
      updateData.userNotes = body.userNotes;
    }

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ job }));
  }

  private async handleGetCompanies(res: http.ServerResponse): Promise<void> {
    try {
      const companiesPath = join(__dirname, '../data/companies.json');
      const companiesData = readFileSync(companiesPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(companiesData);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load companies data' }));
    }
  }

  private async handleSchedulerStatus(res: http.ServerResponse): Promise<void> {
    const status = {
      isActive: schedulerService.isActive(),
      tasks: schedulerService.getStatus(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  }

  private async handleRunMonitor(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const companies = body.companies as string[] | undefined;

    res.writeHead(200, { 'Content-Type': 'application/json' });

    try {
      let result;
      if (companies && companies.length > 0) {
        const results = await careerMonitorService.monitorByNames(companies);
        let total = 0, newJobs = 0;
        for (const r of results) {
          total += r.jobsFound;
          newJobs += r.newJobs;
        }
        result = { total, newJobs, companies: results };
      } else {
        result = await careerMonitorService.monitorAll();
      }
      res.end(JSON.stringify({ success: true, result }));
    } catch (error) {
      res.end(JSON.stringify({ success: false, error: String(error) }));
    }
  }

  private async handleRunDiscovery(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const searchQuery = body.search as string | undefined;

    res.writeHead(200, { 'Content-Type': 'application/json' });

    try {
      let result;
      if (searchQuery) {
        const companies = await companyDiscoveryService.discoverFromSearch(searchQuery);
        result = { found: companies.length, companies: companies.slice(0, 50) };
      } else {
        result = await companyDiscoveryService.runDiscovery();
      }
      res.end(JSON.stringify({ success: true, result }));
    } catch (error) {
      res.end(JSON.stringify({ success: false, error: String(error) }));
    }
  }

  private async handleGetStats(res: http.ServerResponse): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, newJobs, saved, applied, interviewing, todayJobs, byPlatform] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { userStatus: 'NEW' } }),
      prisma.job.count({ where: { savedByUser: true } }),
      prisma.job.count({ where: { userStatus: 'APPLIED' } }),
      prisma.job.count({ where: { userStatus: 'INTERVIEWING' } }),
      prisma.job.count({ where: { scrapedAt: { gte: today } } }),
      prisma.job.groupBy({
        by: ['platform'],
        _count: true,
      }),
    ]);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total,
      newJobs,
      saved,
      applied,
      interviewing,
      todayJobs,
      byPlatform,
    }));
  }

  private async handleGetMessages(id: string, res: http.ServerResponse): Promise<void> {
    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found' }));
      return;
    }

    const messages = await messageGeneratorService.generateMessages(job);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(messages));
  }

  private async handleFindHR(id: string, res: http.ServerResponse): Promise<void> {
    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Job not found' }));
      return;
    }

    const hrInfo = await hrFinderService.findHR(job.companyName);
    const searchLinks = hrFinderService.getAllSearchLinks(job.companyName);

    // Update job with HR info
    if (hrInfo.linkedinUrl || hrInfo.careerPageUrl) {
      await prisma.job.update({
        where: { id },
        data: {
          hrLinkedinUrl: hrInfo.linkedinUrl,
          hrName: hrInfo.hrName,
          careerPageUrl: hrInfo.careerPageUrl,
        },
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hrInfo, searchLinks }));
  }

  private async serveDashboard(res: http.ServerResponse): Promise<void> {
    const html = this.getDashboardHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  private async serveCompaniesPage(res: http.ServerResponse): Promise<void> {
    const html = this.getCompaniesPageHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  private async parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Command Center</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      padding: 20px;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { font-size: 24px; color: #f8fafc; }
    .stats-bar {
      display: flex;
      gap: 20px;
      padding: 15px 20px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      overflow-x: auto;
    }
    .stat-card {
      background: #334155;
      padding: 15px 25px;
      border-radius: 8px;
      min-width: 120px;
      text-align: center;
    }
    .stat-value { font-size: 28px; font-weight: bold; color: #38bdf8; }
    .stat-label { font-size: 12px; color: #94a3b8; margin-top: 5px; }
    .main-content { display: flex; height: calc(100vh - 140px); }
    .sidebar {
      width: 200px;
      background: #1e293b;
      padding: 20px 10px;
      border-right: 1px solid #334155;
    }
    .filter-btn {
      display: block;
      width: 100%;
      padding: 12px 15px;
      margin-bottom: 8px;
      background: transparent;
      border: none;
      color: #94a3b8;
      text-align: left;
      cursor: pointer;
      border-radius: 6px;
      font-size: 14px;
    }
    .filter-btn:hover, .filter-btn.active { background: #334155; color: #f8fafc; }
    .filter-btn.active { border-left: 3px solid #38bdf8; }
    .jobs-list {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      max-width: 500px;
      border-right: 1px solid #334155;
    }
    .search-box {
      width: 100%;
      padding: 12px 15px;
      background: #334155;
      border: 1px solid #475569;
      border-radius: 8px;
      color: #f8fafc;
      font-size: 14px;
      margin-bottom: 15px;
    }
    .search-box:focus { outline: none; border-color: #38bdf8; }
    .job-card {
      background: #1e293b;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 10px;
      cursor: pointer;
      border: 1px solid #334155;
      transition: all 0.2s;
    }
    .job-card:hover { border-color: #38bdf8; transform: translateX(5px); }
    .job-card.selected { border-color: #38bdf8; background: #334155; }
    .job-title { font-weight: 600; color: #f8fafc; margin-bottom: 5px; }
    .job-company { color: #94a3b8; font-size: 14px; }
    .job-meta { display: flex; gap: 10px; margin-top: 10px; font-size: 12px; }
    .job-meta span { background: #334155; padding: 3px 8px; border-radius: 4px; }
    .match-score {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .match-high { background: #166534; color: #86efac; }
    .match-medium { background: #854d0e; color: #fde047; }
    .match-low { background: #334155; color: #94a3b8; }
    .job-detail {
      flex: 1;
      padding: 25px;
      overflow-y: auto;
    }
    .detail-header { margin-bottom: 25px; }
    .detail-title { font-size: 24px; color: #f8fafc; margin-bottom: 10px; }
    .detail-company { font-size: 18px; color: #38bdf8; margin-bottom: 15px; }
    .detail-meta { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 20px; }
    .detail-meta span { background: #334155; padding: 8px 15px; border-radius: 6px; font-size: 14px; }
    .action-buttons { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 25px; }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-success { background: #16a34a; color: white; }
    .btn-success:hover { background: #15803d; }
    .btn-secondary { background: #334155; color: #f8fafc; }
    .btn-secondary:hover { background: #475569; }
    .btn-warning { background: #ca8a04; color: white; }
    .copy-section {
      background: #1e293b;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .copy-section h3 { color: #38bdf8; margin-bottom: 15px; font-size: 16px; }
    .copy-box {
      background: #0f172a;
      padding: 15px;
      border-radius: 6px;
      position: relative;
      margin-bottom: 10px;
    }
    .copy-box pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #e2e8f0;
      font-size: 13px;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .copy-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      background: #334155;
      border: none;
      color: #94a3b8;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .copy-btn:hover { background: #475569; color: #f8fafc; }
    .links-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .link-card {
      background: #334155;
      padding: 15px;
      border-radius: 8px;
      text-decoration: none;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s;
    }
    .link-card:hover { background: #475569; transform: translateY(-2px); }
    .form-data-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
    }
    .form-field {
      background: #0f172a;
      padding: 12px;
      border-radius: 6px;
    }
    .form-label { color: #94a3b8; font-size: 12px; margin-bottom: 5px; }
    .form-value {
      color: #f8fafc;
      font-family: monospace;
      cursor: pointer;
      padding: 5px;
      border-radius: 4px;
    }
    .form-value:hover { background: #334155; }
    .saved-badge { background: #166534; color: #86efac; padding: 3px 8px; border-radius: 4px; font-size: 11px; margin-left: 10px; }
    .applied-badge { background: #1e40af; color: #93c5fd; padding: 3px 8px; border-radius: 4px; font-size: 11px; margin-left: 10px; }
    .empty-state { text-align: center; padding: 50px; color: #64748b; }
    .loading { text-align: center; padding: 50px; color: #64748b; }
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #16a34a;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      display: none;
      z-index: 1000;
    }
    .toast.show { display: block; animation: fadeIn 0.3s; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Job Command Center</h1>
    <div style="color: #94a3b8; font-size: 14px;">
      Sync with Telegram: Active
    </div>
  </div>

  <div class="stats-bar" id="statsBar">
    <div class="stat-card">
      <div class="stat-value" id="statTotal">-</div>
      <div class="stat-label">Total Jobs</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="statNew">-</div>
      <div class="stat-label">New</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="statSaved">-</div>
      <div class="stat-label">Saved</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="statApplied">-</div>
      <div class="stat-label">Applied</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="statToday">-</div>
      <div class="stat-label">Today</div>
    </div>
  </div>

  <div class="main-content">
    <div class="sidebar">
      <button class="filter-btn active" data-filter="all">All Jobs</button>
      <button class="filter-btn" data-filter="new">New</button>
      <button class="filter-btn" data-filter="saved">Saved</button>
      <button class="filter-btn" data-filter="applied">Applied</button>
      <button class="filter-btn" data-filter="interviewing">Interviewing</button>
    </div>

    <div class="jobs-list">
      <input type="text" class="search-box" placeholder="Search jobs..." id="searchInput">
      <div id="jobsList" class="loading">Loading jobs...</div>
    </div>

    <div class="job-detail" id="jobDetail">
      <div class="empty-state">
        <h2>Select a job to view details</h2>
        <p style="margin-top: 10px;">Click on any job from the list to see copy-paste ready messages and links</p>
      </div>
    </div>
  </div>

  <div class="toast" id="toast">Copied to clipboard!</div>

  <script>
    const API_BASE = '';
    let currentFilter = 'all';
    let currentSearch = '';
    let selectedJobId = null;

    // Load stats
    async function loadStats() {
      try {
        const res = await fetch(API_BASE + '/api/stats');
        const data = await res.json();
        document.getElementById('statTotal').textContent = data.total;
        document.getElementById('statNew').textContent = data.newJobs;
        document.getElementById('statSaved').textContent = data.saved;
        document.getElementById('statApplied').textContent = data.applied;
        document.getElementById('statToday').textContent = data.todayJobs;
      } catch (e) {
        console.error('Failed to load stats', e);
      }
    }

    // Load jobs
    async function loadJobs() {
      const listEl = document.getElementById('jobsList');
      listEl.innerHTML = '<div class="loading">Loading...</div>';

      try {
        const params = new URLSearchParams({ filter: currentFilter });
        if (currentSearch) params.append('search', currentSearch);

        const res = await fetch(API_BASE + '/api/jobs?' + params);
        const data = await res.json();

        if (data.jobs.length === 0) {
          listEl.innerHTML = '<div class="empty-state">No jobs found</div>';
          return;
        }

        listEl.innerHTML = data.jobs.map(job => {
          const matchClass = job.aiMatchScore >= 0.8 ? 'match-high' : job.aiMatchScore >= 0.7 ? 'match-medium' : 'match-low';
          const savedBadge = job.savedByUser ? '<span class="saved-badge">SAVED</span>' : '';
          const appliedBadge = job.userStatus === 'APPLIED' ? '<span class="applied-badge">APPLIED</span>' : '';

          return \`
            <div class="job-card \${job.id === selectedJobId ? 'selected' : ''}" onclick="selectJob('\${job.id}')">
              <div class="job-title">\${escapeHtml(job.title)} \${savedBadge}\${appliedBadge}</div>
              <div class="job-company">\${escapeHtml(job.companyName)}</div>
              <div class="job-meta">
                <span class="match-score \${matchClass}">\${Math.round((job.aiMatchScore || 0) * 100)}% Match</span>
                <span>\${job.platform}</span>
                <span>\${escapeHtml(job.location || 'Remote')}</span>
              </div>
            </div>
          \`;
        }).join('');
      } catch (e) {
        listEl.innerHTML = '<div class="empty-state">Failed to load jobs</div>';
        console.error(e);
      }
    }

    // Select job and show details
    async function selectJob(jobId) {
      selectedJobId = jobId;
      loadJobs(); // Refresh to show selected state

      const detailEl = document.getElementById('jobDetail');
      detailEl.innerHTML = '<div class="loading">Loading details...</div>';

      try {
        const res = await fetch(API_BASE + '/api/jobs/' + jobId);
        const data = await res.json();
        const job = data.job;
        const links = data.searchLinks;

        const formData = job.applicationFormData ? JSON.parse(job.applicationFormData) : null;

        detailEl.innerHTML = \`
          <div class="detail-header">
            <div class="detail-title">\${escapeHtml(job.title)}</div>
            <div class="detail-company">\${escapeHtml(job.companyName)}</div>
            <div class="detail-meta">
              <span>\${Math.round((job.aiMatchScore || 0) * 100)}% Match</span>
              <span>\${escapeHtml(job.location || 'Remote')}</span>
              <span>\${job.platform}</span>
              \${job.salaryRange ? '<span>' + escapeHtml(job.salaryRange) + '</span>' : ''}
            </div>
          </div>

          <div class="action-buttons">
            <a href="\${job.url}" target="_blank" class="btn btn-primary">Apply Now</a>
            <button class="btn btn-success" onclick="updateJobStatus('\${job.id}', 'APPLIED')">Mark Applied</button>
            <button class="btn btn-secondary" onclick="saveJob('\${job.id}')">\${job.savedByUser ? 'Unsave' : 'Save'}</button>
            <button class="btn btn-warning" onclick="updateJobStatus('\${job.id}', 'NOT_INTERESTED')">Skip</button>
          </div>

          <div class="links-section">
            <a href="\${links.linkedinHR}" target="_blank" class="link-card">
              <span>Find HR on LinkedIn</span>
            </a>
            <a href="\${links.linkedinCompany}" target="_blank" class="link-card">
              <span>Company LinkedIn</span>
            </a>
            <a href="\${links.googleCareers}" target="_blank" class="link-card">
              <span>Google Careers</span>
            </a>
            <a href="\${links.glassdoor}" target="_blank" class="link-card">
              <span>Glassdoor Reviews</span>
            </a>
          </div>

          <div class="copy-section">
            <h3>LinkedIn Connection Message (Copy & Send to HR)</h3>
            <div class="copy-box">
              <pre>\${escapeHtml(job.linkedinMessage || 'Loading...')}</pre>
              <button class="copy-btn" onclick="copyText(this.previousElementSibling.textContent)">Copy</button>
            </div>
          </div>

          <div class="copy-section">
            <h3>Application Form Data (Click any field to copy)</h3>
            <div class="form-data-grid">
              \${formData ? \`
                <div class="form-field">
                  <div class="form-label">Full Name</div>
                  <div class="form-value" onclick="copyText('\${formData.fullName}')">\${formData.fullName}</div>
                </div>
                <div class="form-field">
                  <div class="form-label">Email</div>
                  <div class="form-value" onclick="copyText('\${formData.email}')">\${formData.email}</div>
                </div>
                <div class="form-field">
                  <div class="form-label">Phone</div>
                  <div class="form-value" onclick="copyText('\${formData.phone}')">\${formData.phone}</div>
                </div>
                <div class="form-field">
                  <div class="form-label">LinkedIn URL</div>
                  <div class="form-value" onclick="copyText('\${formData.linkedinUrl}')">\${formData.linkedinUrl}</div>
                </div>
                <div class="form-field">
                  <div class="form-label">Experience</div>
                  <div class="form-value" onclick="copyText('\${formData.yearsOfExperience} years')">\${formData.yearsOfExperience} years</div>
                </div>
                <div class="form-field">
                  <div class="form-label">Current CTC</div>
                  <div class="form-value" onclick="copyText('\${formData.currentCTC}')">\${formData.currentCTC}</div>
                </div>
                <div class="form-field">
                  <div class="form-label">Expected CTC</div>
                  <div class="form-value" onclick="copyText('\${formData.expectedCTC}')">\${formData.expectedCTC}</div>
                </div>
                <div class="form-field">
                  <div class="form-label">Notice Period</div>
                  <div class="form-value" onclick="copyText('\${formData.noticePeriod}')">\${formData.noticePeriod}</div>
                </div>
                <div class="form-field">
                  <div class="form-label">Skills</div>
                  <div class="form-value" onclick="copyText('\${formData.skills}')">\${formData.skills}</div>
                </div>
                <div class="form-field">
                  <div class="form-label">Location</div>
                  <div class="form-value" onclick="copyText('\${formData.currentLocation}')">\${formData.currentLocation}</div>
                </div>
              \` : '<div class="loading">Loading form data...</div>'}
            </div>
          </div>

          \${formData ? \`
            <div class="copy-section">
              <h3>Cover Letter (Copy for application)</h3>
              <div class="copy-box">
                <pre>\${escapeHtml(formData.coverLetter)}</pre>
                <button class="copy-btn" onclick="copyText(this.previousElementSibling.textContent)">Copy</button>
              </div>
            </div>

            <div class="copy-section">
              <h3>"Why do you want to join?" (Copy for forms)</h3>
              <div class="copy-box">
                <pre>\${escapeHtml(formData.whyJoin)}</pre>
                <button class="copy-btn" onclick="copyText(this.previousElementSibling.textContent)">Copy</button>
              </div>
            </div>
          \` : ''}
        \`;
      } catch (e) {
        detailEl.innerHTML = '<div class="empty-state">Failed to load job details</div>';
        console.error(e);
      }
    }

    // Update job status
    async function updateJobStatus(jobId, status) {
      try {
        await fetch(API_BASE + '/api/jobs/' + jobId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userStatus: status })
        });
        showToast('Status updated!');
        loadStats();
        loadJobs();
        selectJob(jobId);
      } catch (e) {
        console.error(e);
      }
    }

    // Save/unsave job
    async function saveJob(jobId) {
      try {
        const res = await fetch(API_BASE + '/api/jobs/' + jobId);
        const data = await res.json();
        const currentlySaved = data.job.savedByUser;

        await fetch(API_BASE + '/api/jobs/' + jobId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ savedByUser: !currentlySaved })
        });
        showToast(currentlySaved ? 'Removed from saved' : 'Saved!');
        loadStats();
        loadJobs();
        selectJob(jobId);
      } catch (e) {
        console.error(e);
      }
    }

    // Copy text to clipboard
    function copyText(text) {
      navigator.clipboard.writeText(text.trim());
      showToast('Copied to clipboard!');
    }

    // Show toast notification
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // Escape HTML
    function escapeHtml(text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        loadJobs();
      });
    });

    // Search input
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value;
        loadJobs();
      }, 300);
    });

    // Initial load
    loadStats();
    loadJobs();

    // Auto-refresh every 30 seconds
    setInterval(() => {
      loadStats();
      loadJobs();
    }, 30000);
  </script>
</body>
</html>`;
  }

  private getCompaniesPageHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IT Companies - Ahmedabad & Gandhinagar</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      padding: 20px;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { font-size: 24px; color: #f8fafc; }
    .nav-links { display: flex; gap: 15px; }
    .nav-links a {
      color: #94a3b8;
      text-decoration: none;
      padding: 8px 15px;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .nav-links a:hover, .nav-links a.active { background: #334155; color: #f8fafc; }
    .stats-bar {
      display: flex;
      gap: 20px;
      padding: 15px 20px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      overflow-x: auto;
    }
    .stat-card {
      background: #334155;
      padding: 15px 25px;
      border-radius: 8px;
      min-width: 150px;
      text-align: center;
    }
    .stat-value { font-size: 28px; font-weight: bold; color: #38bdf8; }
    .stat-label { font-size: 12px; color: #94a3b8; margin-top: 5px; }
    .main-content { padding: 20px; }
    .section { margin-bottom: 30px; }
    .section-title {
      font-size: 20px;
      color: #38bdf8;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #334155;
    }
    .subsection-title {
      font-size: 16px;
      color: #94a3b8;
      margin: 20px 0 10px 0;
    }
    .companies-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 15px;
    }
    .company-card {
      background: #1e293b;
      padding: 15px;
      border-radius: 8px;
      border: 1px solid #334155;
      transition: all 0.2s;
    }
    .company-card:hover { border-color: #38bdf8; transform: translateY(-2px); }
    .company-name { font-weight: 600; color: #f8fafc; margin-bottom: 5px; font-size: 16px; }
    .company-type {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-bottom: 8px;
    }
    .type-mnc { background: #7c3aed; color: white; }
    .type-large { background: #2563eb; color: white; }
    .type-midsize { background: #0891b2; color: white; }
    .type-startup { background: #16a34a; color: white; }
    .company-meta { font-size: 13px; color: #94a3b8; margin-bottom: 10px; }
    .company-links { display: flex; gap: 10px; }
    .company-links a {
      padding: 6px 12px;
      background: #334155;
      color: #f8fafc;
      text-decoration: none;
      border-radius: 4px;
      font-size: 12px;
      transition: all 0.2s;
    }
    .company-links a:hover { background: #475569; }
    .company-links a.primary { background: #2563eb; }
    .company-links a.primary:hover { background: #1d4ed8; }
    .search-box {
      width: 100%;
      max-width: 400px;
      padding: 12px 15px;
      background: #334155;
      border: 1px solid #475569;
      border-radius: 8px;
      color: #f8fafc;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .search-box:focus { outline: none; border-color: #38bdf8; }
    .filter-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .filter-tab {
      padding: 8px 16px;
      background: #334155;
      border: none;
      color: #94a3b8;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .filter-tab:hover, .filter-tab.active { background: #475569; color: #f8fafc; }
    .filter-tab.active { border-bottom: 2px solid #38bdf8; }
    .loading { text-align: center; padding: 50px; color: #64748b; }
    .last-updated { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>IT Companies Directory</h1>
    <div class="nav-links">
      <a href="/">Jobs Dashboard</a>
      <a href="/companies" class="active">Companies</a>
    </div>
  </div>

  <div class="stats-bar" id="statsBar">
    <div class="stat-card">
      <div class="stat-value" id="statAhmedabad">-</div>
      <div class="stat-label">Ahmedabad Companies</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="statGandhinagar">-</div>
      <div class="stat-label">Gandhinagar/GIFT City</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="statTotal">-</div>
      <div class="stat-label">Total Listed</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">939</div>
      <div class="stat-label">GIFT City Entities</div>
    </div>
  </div>

  <div class="main-content">
    <input type="text" class="search-box" placeholder="Search companies..." id="searchInput">

    <div class="filter-tabs">
      <button class="filter-tab active" data-filter="all">All</button>
      <button class="filter-tab" data-filter="ahmedabad">Ahmedabad</button>
      <button class="filter-tab" data-filter="gandhinagar">Gandhinagar</button>
      <button class="filter-tab" data-filter="mnc">MNCs</button>
      <button class="filter-tab" data-filter="startup">Startups</button>
    </div>

    <div class="last-updated" id="lastUpdated">Loading...</div>

    <div id="companiesContainer" class="loading">Loading companies...</div>
  </div>

  <script>
    let companiesData = null;
    let currentFilter = 'all';
    let searchQuery = '';

    async function loadCompanies() {
      try {
        const res = await fetch('/api/companies');
        companiesData = await res.json();
        document.getElementById('lastUpdated').textContent = 'Last Updated: ' + companiesData.lastUpdated + ' | Source: ' + companiesData.source;
        updateStats();
        renderCompanies();
      } catch (e) {
        document.getElementById('companiesContainer').innerHTML = '<div class="loading">Failed to load companies</div>';
      }
    }

    function updateStats() {
      const ahmedabad = countCompanies('ahmedabad');
      const gandhinagar = countCompanies('gandhinagar');
      document.getElementById('statAhmedabad').textContent = ahmedabad;
      document.getElementById('statGandhinagar').textContent = gandhinagar;
      document.getElementById('statTotal').textContent = ahmedabad + gandhinagar;
    }

    function countCompanies(city) {
      if (!companiesData) return 0;
      const cityData = companiesData.companies[city];
      let count = 0;
      for (const category of Object.values(cityData)) {
        count += category.length;
      }
      return count;
    }

    function renderCompanies() {
      const container = document.getElementById('companiesContainer');
      let html = '';

      const cities = currentFilter === 'ahmedabad' ? ['ahmedabad'] :
                     currentFilter === 'gandhinagar' ? ['gandhinagar'] :
                     ['ahmedabad', 'gandhinagar'];

      for (const city of cities) {
        const cityData = companiesData.companies[city];
        const cityName = city === 'ahmedabad' ? 'Ahmedabad' : 'Gandhinagar / GIFT City';

        html += '<div class="section">';
        html += '<h2 class="section-title">' + cityName + '</h2>';

        for (const [category, companies] of Object.entries(cityData)) {
          const filteredCompanies = filterCompanies(companies);
          if (filteredCompanies.length === 0) continue;

          const categoryName = category.charAt(0).toUpperCase() + category.slice(1).replace(/([A-Z])/g, ' $1');
          html += '<h3 class="subsection-title">' + categoryName + ' (' + filteredCompanies.length + ')</h3>';
          html += '<div class="companies-grid">';

          for (const company of filteredCompanies) {
            const companyType = company.type || 'Imported';
            const typeClass = companyType.toLowerCase().includes('mnc') ? 'type-mnc' :
                              companyType.toLowerCase().includes('large') ? 'type-large' :
                              companyType.toLowerCase().includes('startup') ? 'type-startup' : 'type-midsize';

            html += '<div class="company-card">';
            html += '<div class="company-name">' + escapeHtml(company.name) + '</div>';
            html += '<span class="company-type ' + typeClass + '">' + companyType + '</span>';
            html += '<div class="company-meta">';
            if (company.employees) html += 'Employees: ' + company.employees + '<br>';
            if (company.specialty) html += company.specialty;
            html += '</div>';
            html += '<div class="company-links">';
            if (company.careers) html += '<a href="' + company.careers + '" target="_blank" class="primary">Careers</a>';
            if (company.linkedin) html += '<a href="' + company.linkedin + '" target="_blank">LinkedIn</a>';
            html += '</div>';
            html += '</div>';
          }

          html += '</div>';
        }

        html += '</div>';
      }

      container.innerHTML = html || '<div class="loading">No companies found</div>';
    }

    function filterCompanies(companies) {
      return companies.filter(company => {
        // Type filter
        const companyType = (company.type || '').toLowerCase();
        if (currentFilter === 'mnc' && !companyType.includes('mnc')) return false;
        if (currentFilter === 'startup' && !companyType.includes('startup')) return false;

        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const searchFields = [company.name, company.type, company.specialty || '', company.employees || ''].join(' ').toLowerCase();
          if (!searchFields.includes(query)) return false;
        }

        return true;
      });
    }

    function escapeHtml(text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderCompanies();
      });
    });

    // Search
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchQuery = e.target.value;
        renderCompanies();
      }, 300);
    });

    // Load on start
    loadCompanies();
  </script>
</body>
</html>`;
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      logger.info('API server stopped');
    }
  }
}

export const apiServer = new APIServer();
