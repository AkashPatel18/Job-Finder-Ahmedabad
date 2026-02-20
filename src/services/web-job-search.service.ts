/**
 * Web Job Search Service
 *
 * Searches the entire internet for job listings using web search.
 * This is like having Perplexity search for jobs for you.
 *
 * Usage:
 *   import { webJobSearchService } from './services/web-job-search.service.js';
 *   const jobs = await webJobSearchService.searchJobs('React Developer', 'Ahmedabad');
 */

import { prisma } from '../database/index.js';
import { logger } from './logger.service.js';
import { aiMatcherService } from './ai-matcher.service.js';
import { searchCriteria } from '../config/search-criteria.js';

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface ParsedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: string;
  salary?: string;
}

class WebJobSearchService {
  private searchEngines = {
    google: 'https://www.google.com/search?q=',
    duckduckgo: 'https://html.duckduckgo.com/html/?q=',
  };

  /**
   * Search for jobs using multiple queries
   */
  async searchAllJobs(): Promise<{ found: number; new: number }> {
    const keywords = searchCriteria.keywords.slice(0, 5);
    const locations = searchCriteria.locations.preferred.slice(0, 3);

    let totalFound = 0;
    let totalNew = 0;

    for (const keyword of keywords) {
      for (const location of locations) {
        try {
          const result = await this.searchJobs(keyword, location);
          totalFound += result.found;
          totalNew += result.new;

          // Rate limiting between searches
          await this.delay(2000);
        } catch (error) {
          logger.error(`Error searching ${keyword} in ${location}:`, error);
        }
      }
    }

    return { found: totalFound, new: totalNew };
  }

  /**
   * Search for jobs with specific keyword and location
   */
  async searchJobs(keyword: string, location: string): Promise<{ found: number; new: number }> {
    logger.info(`Web searching: ${keyword} jobs in ${location}`);

    const queries = this.buildSearchQueries(keyword, location);
    const allJobs: ParsedJob[] = [];

    for (const query of queries) {
      try {
        const jobs = await this.executeSearch(query);
        allJobs.push(...jobs);
      } catch (error) {
        logger.error(`Search failed for query: ${query}`, error);
      }
    }

    // Deduplicate by URL
    const uniqueJobs = this.deduplicateJobs(allJobs);
    logger.info(`Found ${uniqueJobs.length} unique jobs from web search`);

    // Save to database
    let newCount = 0;
    for (const job of uniqueJobs) {
      const isNew = await this.saveJob(job);
      if (isNew) newCount++;
    }

    return { found: uniqueJobs.length, new: newCount };
  }

  /**
   * Build search queries for job hunting
   */
  private buildSearchQueries(keyword: string, location: string): string[] {
    const baseQueries = [
      `${keyword} jobs ${location} 2024 2025`,
      `${keyword} hiring ${location}`,
      `${keyword} openings ${location} apply`,
      `${keyword} careers ${location}`,
      `site:linkedin.com/jobs ${keyword} ${location}`,
      `site:naukri.com ${keyword} ${location}`,
      `site:indeed.com ${keyword} ${location}`,
      `site:glassdoor.com ${keyword} jobs ${location}`,
    ];

    return baseQueries;
  }

  /**
   * Execute a web search and parse results
   */
  private async executeSearch(query: string): Promise<ParsedJob[]> {
    // Using DuckDuckGo HTML version (more scrape-friendly)
    const searchUrl = `${this.searchEngines.duckduckgo}${encodeURIComponent(query)}`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const html = await response.text();
      return this.parseSearchResults(html, query);
    } catch (error) {
      logger.error(`Search request failed: ${query}`, error);
      return [];
    }
  }

  /**
   * Parse search results HTML to extract job listings
   */
  private parseSearchResults(html: string, query: string): ParsedJob[] {
    const jobs: ParsedJob[] = [];

    // Extract result links and snippets using regex
    // DuckDuckGo HTML format: <a class="result__a" href="...">Title</a>
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]+)<\/a>/gi;

    let linkMatch;
    const results: WebSearchResult[] = [];

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const url = this.cleanUrl(linkMatch[1]);
      const title = this.cleanText(linkMatch[2]);

      // Only include job-related URLs
      if (this.isJobUrl(url)) {
        results.push({ title, url, snippet: '' });
      }
    }

    // Try to match snippets
    let snippetMatch;
    let i = 0;
    while ((snippetMatch = snippetRegex.exec(html)) !== null && i < results.length) {
      results[i].snippet = this.cleanText(snippetMatch[1]);
      i++;
    }

    // Convert to ParsedJob format
    for (const result of results) {
      const parsed = this.parseJobFromResult(result);
      if (parsed) {
        jobs.push(parsed);
      }
    }

    return jobs;
  }

  /**
   * Check if URL is likely a job listing
   */
  private isJobUrl(url: string): boolean {
    const jobPatterns = [
      /linkedin\.com\/jobs/i,
      /naukri\.com/i,
      /indeed\.com/i,
      /glassdoor\.com.*jobs/i,
      /careers\./i,
      /jobs\./i,
      /\/careers\//i,
      /\/jobs\//i,
      /\/job\//i,
      /wellfound\.com/i,
      /instahyre\.com/i,
      /cutshort\.io/i,
      /angel\.co\/jobs/i,
      /remoteok\.com/i,
      /weworkremotely\.com/i,
      /stackoverflow\.com\/jobs/i,
      /hired\.com/i,
      /triplebyte\.com/i,
    ];

    return jobPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Parse a search result into a job object
   */
  private parseJobFromResult(result: WebSearchResult): ParsedJob | null {
    const { title, url, snippet } = result;

    // Extract company name from title or URL
    const company = this.extractCompany(title, url);
    const location = this.extractLocation(title, snippet);
    const source = this.extractSource(url);

    if (!title || !url) return null;

    return {
      title: this.cleanJobTitle(title),
      company: company || 'Unknown Company',
      location: location || 'Remote',
      url,
      description: snippet,
      source,
    };
  }

  /**
   * Extract company name from title
   */
  private extractCompany(title: string, url: string): string {
    // Common patterns: "Job Title at Company", "Job Title - Company"
    const atMatch = title.match(/at\s+([^-|]+)/i);
    if (atMatch) return atMatch[1].trim();

    const dashMatch = title.match(/-\s*([^-|]+)$/);
    if (dashMatch) return dashMatch[1].trim();

    // Extract from URL for known sites
    if (url.includes('linkedin.com')) {
      const companyMatch = url.match(/company\/([^/]+)/);
      if (companyMatch) return companyMatch[1].replace(/-/g, ' ');
    }

    return 'Unknown';
  }

  /**
   * Extract location from title/snippet
   */
  private extractLocation(title: string, snippet: string): string {
    const text = `${title} ${snippet}`.toLowerCase();

    const locations = [
      'remote', 'work from home', 'wfh',
      'ahmedabad', 'gandhinagar', 'bangalore', 'bengaluru',
      'mumbai', 'delhi', 'pune', 'hyderabad', 'chennai',
      'india', 'usa', 'uk', 'europe',
    ];

    for (const loc of locations) {
      if (text.includes(loc)) {
        return loc.charAt(0).toUpperCase() + loc.slice(1);
      }
    }

    return 'Not specified';
  }

  /**
   * Extract source platform from URL
   */
  private extractSource(url: string): string {
    if (url.includes('linkedin.com')) return 'LinkedIn';
    if (url.includes('naukri.com')) return 'Naukri';
    if (url.includes('indeed.com')) return 'Indeed';
    if (url.includes('glassdoor.com')) return 'Glassdoor';
    if (url.includes('wellfound.com')) return 'Wellfound';
    if (url.includes('instahyre.com')) return 'Instahyre';
    if (url.includes('cutshort.io')) return 'Cutshort';
    if (url.includes('remoteok.com')) return 'RemoteOK';
    return 'Web';
  }

  /**
   * Clean job title
   */
  private cleanJobTitle(title: string): string {
    return title
      .replace(/\s*[-|]\s*[^-|]+$/, '') // Remove "- Company" suffix
      .replace(/\s*at\s+[^-|]+$/i, '') // Remove "at Company" suffix
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Clean URL (decode and remove tracking params)
   */
  private cleanUrl(url: string): string {
    try {
      // DuckDuckGo wraps URLs
      if (url.includes('uddg=')) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) {
          return decodeURIComponent(match[1]);
        }
      }
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  }

  /**
   * Clean text (decode HTML entities)
   */
  private cleanText(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Deduplicate jobs by URL
   */
  private deduplicateJobs(jobs: ParsedJob[]): ParsedJob[] {
    const seen = new Set<string>();
    return jobs.filter(job => {
      const key = job.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Save job to database
   */
  private async saveJob(job: ParsedJob): Promise<boolean> {
    try {
      // Generate a unique external ID from URL
      const externalId = this.generateExternalId(job.url);

      // Check if already exists
      const existing = await prisma.job.findFirst({
        where: {
          OR: [
            { url: job.url },
            { externalId },
          ],
        },
      });

      if (existing) {
        return false;
      }

      // Check blacklisted companies
      const isBlacklisted = searchCriteria.excludeCompanies.some(
        company => job.company.toLowerCase().includes(company.toLowerCase())
      );

      if (isBlacklisted) {
        logger.debug(`Skipping blacklisted company: ${job.company}`);
        return false;
      }

      // AI match score
      const matchResult = await aiMatcherService.matchJob({
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
      });

      // Map source to platform
      const platform = this.mapSourceToPlatform(job.source);

      // Save to database
      await prisma.job.create({
        data: {
          platform,
          externalId,
          title: job.title,
          companyName: job.company,
          location: job.location,
          description: job.description,
          url: job.url,
          aiMatchScore: matchResult.score,
          aiMatchReason: matchResult.reason,
          isEasyApply: false,
        },
      });

      logger.info(`Saved new job: ${job.title} at ${job.company}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save job: ${job.title}`, error);
      return false;
    }
  }

  /**
   * Generate external ID from URL
   */
  private generateExternalId(url: string): string {
    // Simple hash from URL
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `web_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Map source string to Platform enum
   */
  private mapSourceToPlatform(source: string): 'LINKEDIN' | 'NAUKRI' | 'INDEED' | 'WELLFOUND' | 'GLASSDOOR' | 'REMOTEOK' {
    const mapping: Record<string, any> = {
      'LinkedIn': 'LINKEDIN',
      'Naukri': 'NAUKRI',
      'Indeed': 'INDEED',
      'Wellfound': 'WELLFOUND',
      'Glassdoor': 'GLASSDOOR',
      'RemoteOK': 'REMOTEOK',
      'Web': 'REMOTEOK', // Default
    };
    return mapping[source] || 'REMOTEOK';
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const webJobSearchService = new WebJobSearchService();
