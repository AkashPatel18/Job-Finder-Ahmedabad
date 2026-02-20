/**
 * PLAYWRIGHT COMPANY DISCOVERY SERVICE
 *
 * Uses Playwright with stealth plugin to discover companies from protected websites.
 * This bypasses anti-bot protection on directories like Clutch, GoodFirms, etc.
 */

import { chromium, Browser, Page } from 'playwright';
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
  website?: string;
  source: string;
  city: string;
}

class PlaywrightDiscoveryService {
  private browser: Browser | null = null;
  private groqApiKey: string;

  constructor() {
    this.groqApiKey = config.ai.groq.apiKey || '';
  }

  /**
   * Initialize browser with stealth settings
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ]
    });

    return this.browser;
  }

  /**
   * Create a stealth page
   */
  private async createStealthPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
    });

    const page = await context.newPage();

    // Hide webdriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    return page;
  }

  /**
   * Discover companies from Clutch.co
   */
  async discoverFromClutch(): Promise<DiscoveredCompany[]> {
    logger.info('Discovering companies from Clutch.co...');
    const companies: DiscoveredCompany[] = [];

    try {
      const page = await this.createStealthPage();

      // Try multiple Clutch pages
      const urls = [
        'https://clutch.co/it-services/india/ahmedabad',
        'https://clutch.co/developers/india/ahmedabad',
        'https://clutch.co/agencies/india/ahmedabad',
      ];

      for (const url of urls) {
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);

          // Extract company names from the page
          const pageCompanies = await page.evaluate(() => {
            const items: { name: string; specialty?: string }[] = [];

            // Try different selectors
            const selectors = [
              '.provider-row .company-name',
              '.directory-list h3',
              '.provider-info h3',
              '[data-company-name]',
              '.company-card h3',
            ];

            for (const selector of selectors) {
              document.querySelectorAll(selector).forEach(el => {
                const name = el.textContent?.trim();
                if (name && name.length > 2) {
                  items.push({ name });
                }
              });
            }

            // If no specific selectors work, extract from text
            if (items.length === 0) {
              const text = document.body.innerText;
              const matches = text.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*(?:\s+(?:Technologies|Solutions|Systems|Software|Labs|Tech|Infotech|IT)))/g);
              if (matches) {
                matches.forEach(name => {
                  if (name.length > 5 && name.length < 50) {
                    items.push({ name: name.trim() });
                  }
                });
              }
            }

            return items;
          });

          for (const c of pageCompanies) {
            companies.push({
              name: c.name,
              specialty: c.specialty,
              source: 'Clutch.co',
              city: 'Ahmedabad'
            });
          }

          logger.info(`Found ${pageCompanies.length} companies from ${url}`);
        } catch (error) {
          logger.warn(`Failed to scrape ${url}: ${error}`);
        }
      }

      await page.context().close();
    } catch (error) {
      logger.error('Clutch discovery failed:', error);
    }

    return companies;
  }

  /**
   * Discover companies from GoodFirms
   */
  async discoverFromGoodFirms(): Promise<DiscoveredCompany[]> {
    logger.info('Discovering companies from GoodFirms...');
    const companies: DiscoveredCompany[] = [];

    try {
      const page = await this.createStealthPage();

      const urls = [
        'https://www.goodfirms.co/directory/city/top-software-development-companies/ahmedabad',
        'https://www.goodfirms.co/directory/city/top-mobile-app-development-companies/ahmedabad',
      ];

      for (const url of urls) {
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);

          const pageCompanies = await page.evaluate(() => {
            const items: { name: string }[] = [];

            // GoodFirms selectors
            document.querySelectorAll('.firm-name, .company-name, h3.firm-title').forEach(el => {
              const name = el.textContent?.trim();
              if (name && name.length > 2) {
                items.push({ name });
              }
            });

            return items;
          });

          for (const c of pageCompanies) {
            companies.push({
              name: c.name,
              source: 'GoodFirms',
              city: 'Ahmedabad'
            });
          }

          logger.info(`Found ${pageCompanies.length} companies from GoodFirms`);
        } catch (error) {
          logger.warn(`Failed to scrape GoodFirms: ${error}`);
        }
      }

      await page.context().close();
    } catch (error) {
      logger.error('GoodFirms discovery failed:', error);
    }

    return companies;
  }

  /**
   * Discover companies from LinkedIn search
   */
  async discoverFromLinkedIn(): Promise<DiscoveredCompany[]> {
    logger.info('Discovering companies from LinkedIn...');
    const companies: DiscoveredCompany[] = [];

    try {
      const page = await this.createStealthPage();

      // LinkedIn company search (public, no login required)
      const url = 'https://www.linkedin.com/search/results/companies/?keywords=software%20ahmedabad&origin=SWITCH_SEARCH_VERTICAL';

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Note: LinkedIn might require login, so this may not work fully
      const pageContent = await page.content();

      // Extract company names using AI
      const text = await page.evaluate(() => document.body.innerText);
      const extracted = await this.extractWithAI(text.slice(0, 15000), 'LinkedIn', 'Ahmedabad');
      companies.push(...extracted);

      await page.context().close();
    } catch (error) {
      logger.error('LinkedIn discovery failed:', error);
    }

    return companies;
  }

  /**
   * Discover from Naukri company listings
   */
  async discoverFromNaukri(): Promise<DiscoveredCompany[]> {
    logger.info('Discovering companies from Naukri...');
    const companies: DiscoveredCompany[] = [];

    try {
      const page = await this.createStealthPage();

      // Naukri jobs page with Ahmedabad IT companies
      const url = 'https://www.naukri.com/it-software-jobs-in-ahmedabad?k=it%20software&l=ahmedabad';

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Extract company names from job listings
      const companyNames = await page.evaluate(() => {
        const names: string[] = [];

        // Naukri company name selectors
        document.querySelectorAll('.comp-name, .companyInfo a, [class*="company"]').forEach(el => {
          const name = el.textContent?.trim();
          if (name && name.length > 2 && name.length < 50) {
            names.push(name);
          }
        });

        return [...new Set(names)];
      });

      for (const name of companyNames) {
        companies.push({
          name,
          source: 'Naukri',
          city: 'Ahmedabad'
        });
      }

      logger.info(`Found ${companyNames.length} companies from Naukri`);
      await page.context().close();
    } catch (error) {
      logger.error('Naukri discovery failed:', error);
    }

    return companies;
  }

  /**
   * Extract companies using AI
   */
  private async extractWithAI(content: string, source: string, city: string): Promise<DiscoveredCompany[]> {
    if (!this.groqApiKey) return [];

    try {
      const prompt = `Extract all IT/Software company names from this content.
Location: ${city}, Gujarat, India
Return a JSON array of company names only.
Example: ["Company A", "Company B"]
Only return valid JSON, no other text.

Content:
${content}`;

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
          max_tokens: 2000
        })
      });

      if (!response.ok) return [];

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || '[]';

      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const names = JSON.parse(jsonMatch[0]);
        return names.map((name: string) => ({
          name,
          source,
          city
        }));
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Run full discovery
   */
  async runFullDiscovery(): Promise<{ total: number; new: number; companies: DiscoveredCompany[] }> {
    logger.info('Running full Playwright discovery...');

    const allCompanies: DiscoveredCompany[] = [];

    // Try Naukri (usually works well)
    const naukriCompanies = await this.discoverFromNaukri();
    allCompanies.push(...naukriCompanies);

    // Try Clutch
    const clutchCompanies = await this.discoverFromClutch();
    allCompanies.push(...clutchCompanies);

    // Try GoodFirms
    const goodfirmsCompanies = await this.discoverFromGoodFirms();
    allCompanies.push(...goodfirmsCompanies);

    // Cleanup
    await this.close();

    // Deduplicate
    const unique = this.deduplicateCompanies(allCompanies);
    logger.info(`Total unique companies discovered: ${unique.length}`);

    // Save to file
    const newCount = await this.saveCompanies(unique);

    return {
      total: unique.length,
      new: newCount,
      companies: unique
    };
  }

  /**
   * Save discovered companies
   */
  private async saveCompanies(companies: DiscoveredCompany[]): Promise<number> {
    const companiesPath = join(__dirname, '../data/companies.json');

    try {
      const data = JSON.parse(readFileSync(companiesPath, 'utf-8'));

      // Get existing names
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

      // Filter new
      const newCompanies = companies.filter(c =>
        !existingNames.has(c.name.toLowerCase())
      );

      if (newCompanies.length === 0) {
        logger.info('No new companies to add');
        return 0;
      }

      // Create discovered category if not exists
      if (!data.companies.ahmedabad.discovered) {
        data.companies.ahmedabad.discovered = [];
      }

      for (const company of newCompanies) {
        data.companies.ahmedabad.discovered.push({
          name: company.name,
          type: 'Discovered',
          employees: company.employees || 'Unknown',
          specialty: company.specialty || 'IT Services',
          careers: company.careers || `https://www.google.com/search?q=${encodeURIComponent(company.name + ' careers ahmedabad')}`,
          linkedin: company.linkedin || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company.name)}`,
          source: company.source,
          discoveredAt: new Date().toISOString()
        });
      }

      // Update file
      data.lastUpdated = new Date().toISOString().split('T')[0];
      writeFileSync(companiesPath, JSON.stringify(data, null, 2));

      logger.info(`Added ${newCompanies.length} new companies`);
      return newCompanies.length;
    } catch (error) {
      logger.error('Failed to save companies:', error);
      return 0;
    }
  }

  /**
   * Deduplicate companies
   */
  private deduplicateCompanies(companies: DiscoveredCompany[]): DiscoveredCompany[] {
    const seen = new Map<string, DiscoveredCompany>();

    for (const company of companies) {
      const key = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key.length > 3 && !seen.has(key)) {
        seen.set(key, company);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const playwrightDiscoveryService = new PlaywrightDiscoveryService();
