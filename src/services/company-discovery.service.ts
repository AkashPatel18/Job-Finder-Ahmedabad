/**
 * COMPANY DISCOVERY SERVICE
 *
 * Automatically discovers IT companies in Ahmedabad/Gandhinagar from various sources.
 * Sources include:
 * - Web directories (Clutch, GoodFirms, etc.)
 * - Job portals (parsing company names from job listings)
 * - LinkedIn company search
 * - Google searches
 *
 * Zero-cost approach using web scraping and AI extraction.
 */

import { prisma } from '../database/index.js';
import { logger } from './logger.service.js';
import { config } from '../config/index.js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DiscoveredCompany {
  name: string;
  type?: string;
  employees?: string;
  specialty?: string;
  careers?: string;
  linkedin?: string;
  source: string;
  city: string;
}

class CompanyDiscoveryService {
  private groqApiKey: string;
  private discoveredCompanies: DiscoveredCompany[] = [];

  constructor() {
    this.groqApiKey = config.ai.groq.apiKey || '';
  }

  /**
   * Discover companies from multiple web sources
   */
  async discoverFromWeb(): Promise<DiscoveredCompany[]> {
    logger.info('Starting company discovery from web sources...');

    const sources = [
      { name: 'Clutch Ahmedabad', url: 'https://clutch.co/it-services/ahmedabad' },
      { name: 'GoodFirms Ahmedabad', url: 'https://www.goodfirms.co/companies/ahmedabad' },
      { name: 'DesignRush Ahmedabad', url: 'https://www.designrush.com/agency/software-development/in/ahmedabad' },
      { name: 'TopDevelopers Ahmedabad', url: 'https://www.topdevelopers.co/directory/software-development-companies/ahmedabad' },
    ];

    for (const source of sources) {
      try {
        const companies = await this.scrapeDirectory(source.url, source.name);
        this.discoveredCompanies.push(...companies);
        await this.delay(2000); // Rate limiting
      } catch (error) {
        logger.error(`Failed to scrape ${source.name}:`, error);
      }
    }

    // Deduplicate
    const unique = this.deduplicateCompanies(this.discoveredCompanies);
    logger.info(`Discovered ${unique.length} unique companies`);

    return unique;
  }

  /**
   * Scrape a directory page for company names
   */
  private async scrapeDirectory(url: string, sourceName: string): Promise<DiscoveredCompany[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn(`Failed to fetch ${url}: ${response.status}`);
        return [];
      }

      const html = await response.text();
      const textContent = this.extractText(html).slice(0, 20000);

      // Use AI to extract company names
      return await this.extractCompaniesWithAI(textContent, sourceName, 'Ahmedabad');
    } catch (error) {
      logger.error(`Error scraping ${url}:`, error);
      return [];
    }
  }

  /**
   * Extract companies from text using AI
   */
  private async extractCompaniesWithAI(content: string, source: string, city: string): Promise<DiscoveredCompany[]> {
    if (!this.groqApiKey) {
      logger.warn('Groq API key not configured, using fallback extraction');
      return this.fallbackExtraction(content, source, city);
    }

    try {
      const prompt = `Extract all IT/Software company names from this directory listing.

Source: ${source}
Location: ${city}, Gujarat, India

Content:
${content}

For each company found, provide:
- name: Company name
- specialty: What they do (if mentioned)
- employees: Employee count (if mentioned)

Return a JSON array of companies. Only return valid JSON, no other text.
Example: [{"name": "Company ABC", "specialty": "Web Development", "employees": "100+"}]`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || '[]';

      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const companies = JSON.parse(jsonMatch[0]);
        return companies.map((c: any) => ({
          name: c.name,
          specialty: c.specialty,
          employees: c.employees,
          source,
          city
        }));
      }

      return [];
    } catch (error) {
      logger.error('AI extraction failed:', error);
      return this.fallbackExtraction(content, source, city);
    }
  }

  /**
   * Fallback extraction using regex
   */
  private fallbackExtraction(content: string, source: string, city: string): DiscoveredCompany[] {
    const companies: DiscoveredCompany[] = [];

    // Common IT company name patterns
    const patterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Technologies|Solutions|Systems|Infotech|Software|Labs|Tech|IT|Digital)/g,
      /([A-Z][A-Za-z]+(?:soft|tech|sys|labs|info|web|code|bits|ware))/gi
    ];

    const found = new Set<string>();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[0].trim();
        if (name.length > 3 && name.length < 50 && !found.has(name.toLowerCase())) {
          found.add(name.toLowerCase());
          companies.push({
            name,
            source,
            city
          });
        }
      }
    }

    return companies;
  }

  /**
   * Search and discover companies using web search
   */
  async discoverFromSearch(query: string): Promise<DiscoveredCompany[]> {
    logger.info(`Discovering companies via search: ${query}`);

    // Use DuckDuckGo HTML search
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        }
      });

      if (!response.ok) {
        logger.warn(`Search failed: ${response.status}`);
        return [];
      }

      const html = await response.text();
      const text = this.extractText(html).slice(0, 15000);

      return await this.extractCompaniesWithAI(text, 'Web Search', 'Ahmedabad');
    } catch (error) {
      logger.error('Search discovery failed:', error);
      return [];
    }
  }

  /**
   * Find career page URL for a company
   */
  async findCareerPage(companyName: string): Promise<string | null> {
    logger.info(`Finding career page for: ${companyName}`);

    try {
      // Try common patterns first
      const cleanName = companyName.toLowerCase()
        .replace(/\s+/g, '')
        .replace(/technologies|solutions|systems|infotech|software|labs|tech|pvt|ltd|private|limited/gi, '');

      const patterns = [
        `https://www.${cleanName}.com/careers`,
        `https://www.${cleanName}.com/career`,
        `https://www.${cleanName}.com/jobs`,
        `https://${cleanName}.com/careers`,
      ];

      // Try each pattern
      for (const url of patterns) {
        try {
          const response = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          if (response.ok) {
            return url;
          }
        } catch {
          continue;
        }
      }

      // Search for career page
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(companyName + ' careers Ahmedabad')}`;
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      if (response.ok) {
        const html = await response.text();
        const urlMatch = html.match(/href="([^"]*careers[^"]*)"/i);
        if (urlMatch) {
          return urlMatch[1];
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error finding career page for ${companyName}:`, error);
      return null;
    }
  }

  /**
   * Save discovered companies to the JSON file
   */
  async saveDiscoveredCompanies(companies: DiscoveredCompany[]): Promise<number> {
    const companiesPath = join(__dirname, '../data/companies.json');

    try {
      const data = JSON.parse(readFileSync(companiesPath, 'utf-8'));

      // Get existing company names
      const existingNames = new Set<string>();
      for (const city of ['ahmedabad', 'gandhinagar']) {
        if (data.companies[city]) {
          for (const category of Object.values(data.companies[city]) as any[]) {
            for (const company of category) {
              existingNames.add(company.name.toLowerCase());
            }
          }
        }
      }

      // Filter new companies
      const newCompanies = companies.filter(c =>
        !existingNames.has(c.name.toLowerCase())
      );

      if (newCompanies.length === 0) {
        logger.info('No new companies to add');
        return 0;
      }

      // Add to discovered category
      if (!data.companies.ahmedabad.discovered) {
        data.companies.ahmedabad.discovered = [];
      }

      for (const company of newCompanies) {
        // Try to find career page
        const careersUrl = await this.findCareerPage(company.name);

        data.companies.ahmedabad.discovered.push({
          name: company.name,
          type: 'Discovered',
          employees: company.employees || 'Unknown',
          specialty: company.specialty || 'Software Development',
          careers: careersUrl || `https://www.google.com/search?q=${encodeURIComponent(company.name + ' careers')}`,
          linkedin: `https://www.linkedin.com/company/${company.name.toLowerCase().replace(/\s+/g, '-')}`,
          source: company.source,
          discoveredAt: new Date().toISOString()
        });

        await this.delay(500); // Rate limit career page lookups
      }

      // Update stats
      data.lastUpdated = new Date().toISOString().split('T')[0];
      data.stats.ahmedabad.discoveredCompanies = data.companies.ahmedabad.discovered.length;

      writeFileSync(companiesPath, JSON.stringify(data, null, 2));
      logger.info(`Added ${newCompanies.length} new companies`);

      return newCompanies.length;
    } catch (error) {
      logger.error('Failed to save discovered companies:', error);
      return 0;
    }
  }

  /**
   * Run full discovery process
   */
  async runDiscovery(): Promise<{ total: number; new: number }> {
    logger.info('Starting full company discovery...');

    const allCompanies: DiscoveredCompany[] = [];

    // Discover from directories
    const webCompanies = await this.discoverFromWeb();
    allCompanies.push(...webCompanies);

    // Discover from searches
    const searches = [
      'IT companies Ahmedabad list 2026',
      'software development companies Ahmedabad',
      'tech startups Ahmedabad Gujarat',
      'IT companies Gandhinagar GIFT City',
      'mobile app development Ahmedabad companies'
    ];

    for (const search of searches) {
      try {
        const companies = await this.discoverFromSearch(search);
        allCompanies.push(...companies);
        await this.delay(3000); // Rate limit searches
      } catch (error) {
        logger.error(`Search failed for: ${search}`);
      }
    }

    // Deduplicate
    const unique = this.deduplicateCompanies(allCompanies);

    // Save new companies
    const newCount = await this.saveDiscoveredCompanies(unique);

    return {
      total: unique.length,
      new: newCount
    };
  }

  /**
   * Deduplicate companies by name
   */
  private deduplicateCompanies(companies: DiscoveredCompany[]): DiscoveredCompany[] {
    const seen = new Map<string, DiscoveredCompany>();

    for (const company of companies) {
      const key = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(key)) {
        seen.set(key, company);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Extract text from HTML
   */
  private extractText(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const companyDiscoveryService = new CompanyDiscoveryService();
