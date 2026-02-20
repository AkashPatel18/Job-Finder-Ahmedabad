/**
 * GLASSDOOR COMPANY SCRAPER
 *
 * Scrapes IT company names from Glassdoor's Ahmedabad IT companies page.
 * Uses Playwright with stealth to bypass anti-bot protection.
 *
 * Target: https://www.glassdoor.co.in/Explore/top-information-technology-companies-ahmadabad_IS.4,26_ISEC10013_IL.37,46_IM1090.htm
 * Expected: ~1,163 IT companies
 *
 * Usage:
 *   npm run scrape:glassdoor
 */

import { chromium, Browser, Page } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../services/logger.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ScrapedCompany {
  name: string;
  rating?: string;
  employees?: string;
  description?: string;
  location?: string;
}

class GlassdoorCompanyScraper {
  private browser: Browser | null = null;
  private companies: ScrapedCompany[] = [];
  private outputFile: string;

  constructor() {
    this.outputFile = join(__dirname, '../../glassdoor-companies.json');
  }

  /**
   * Initialize browser with stealth settings
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    console.log('Launching browser...');

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ]
    });

    return this.browser;
  }

  /**
   * Create a stealth page
   */
  private async createPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });

    const page = await context.newPage();

    // Anti-detection scripts
    await page.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'hi'],
      });
    });

    return page;
  }

  /**
   * Scrape all pages from Glassdoor
   */
  async scrapeAllPages(): Promise<ScrapedCompany[]> {
    console.log('Starting Glassdoor IT companies scrape...');
    console.log('Target: Ahmedabad Information Technology companies');
    console.log('Expected: ~1,163 companies\n');

    const page = await this.createPage();

    // Base URL for IT companies in Ahmedabad
    const baseUrl = 'https://www.glassdoor.co.in/Explore/top-information-technology-companies-ahmadabad_IS.4,26_ISEC10013_IL.37,46_IM1090.htm';

    let currentPage = 1;
    const maxPages = 120; // 1163 companies / 10 per page ≈ 117 pages
    let consecutiveErrors = 0;

    while (currentPage <= maxPages && consecutiveErrors < 3) {
      try {
        const url = currentPage === 1
          ? baseUrl
          : `${baseUrl}?page=${currentPage}`;

        console.log(`Scraping page ${currentPage}...`);

        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        // Wait for company cards to load
        await page.waitForTimeout(2000);

        // Check if we need to handle cookie consent
        const cookieButton = await page.$('button[id*="cookie"], button[class*="cookie"]');
        if (cookieButton) {
          await cookieButton.click();
          await page.waitForTimeout(500);
        }

        // Extract company data from the page
        const pageCompanies = await page.evaluate(() => {
          const companies: {
            name: string;
            rating?: string;
            employees?: string;
            description?: string;
          }[] = [];

          // Try multiple selectors for company cards
          const selectors = [
            '[data-test="employer-card-single"]',
            '.employer-card',
            '.single-company-card',
            'article[class*="company"]',
            'div[class*="employer"]',
          ];

          let cards: Element[] = [];
          for (const selector of selectors) {
            cards = Array.from(document.querySelectorAll(selector));
            if (cards.length > 0) break;
          }

          // If no cards found with specific selectors, try text-based extraction
          if (cards.length === 0) {
            // Look for company name patterns in the page
            const allText = document.body.innerText;
            const lines = allText.split('\n');

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              // Company names are usually followed by rating or employee count
              if (line.length > 2 && line.length < 100) {
                const nextLine = lines[i + 1]?.trim() || '';
                // Check if next line looks like a rating or employee count
                if (/^\d\.\d$/.test(nextLine) || /employees/i.test(nextLine) || /\d+\s*to\s*\d+/i.test(nextLine)) {
                  companies.push({
                    name: line,
                    rating: /^\d\.\d$/.test(nextLine) ? nextLine : undefined,
                  });
                }
              }
            }
          } else {
            // Extract from cards
            for (const card of cards) {
              const nameEl = card.querySelector('h2, [class*="name"], [class*="title"], a[href*="/Overview/"]');
              const ratingEl = card.querySelector('[class*="rating"], [data-test="rating"]');
              const employeesEl = card.querySelector('[class*="employees"], [class*="size"]');
              const descEl = card.querySelector('[class*="description"], p');

              if (nameEl) {
                companies.push({
                  name: nameEl.textContent?.trim() || '',
                  rating: ratingEl?.textContent?.trim(),
                  employees: employeesEl?.textContent?.trim(),
                  description: descEl?.textContent?.trim()?.slice(0, 200),
                });
              }
            }
          }

          return companies.filter(c => c.name && c.name.length > 1);
        });

        if (pageCompanies.length === 0) {
          console.log(`  No companies found on page ${currentPage}`);
          consecutiveErrors++;

          // Try scrolling to load more content
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(2000);

          // Try again after scroll
          const retryCompanies = await page.evaluate(() => {
            const text = document.body.innerText;
            const companyMatches = text.match(/([A-Z][A-Za-z\s&]+(?:Technologies|Solutions|Systems|Software|Tech|Labs|Infotech|IT|Digital|Data|Cloud|Services|Consulting))/g);
            return companyMatches
              ? [...new Set(companyMatches)].map(name => ({ name: name.trim() }))
              : [];
          });

          if (retryCompanies.length > 0) {
            this.companies.push(...retryCompanies);
            console.log(`  Found ${retryCompanies.length} companies via text extraction`);
            consecutiveErrors = 0;
          }
        } else {
          this.companies.push(...pageCompanies);
          console.log(`  Found ${pageCompanies.length} companies`);
          consecutiveErrors = 0;
        }

        // Check if there's a next page
        const hasNextPage = await page.evaluate(() => {
          const nextBtn = document.querySelector('button[data-test="next-page"], a[aria-label*="next"], .next-page');
          return nextBtn && !nextBtn.hasAttribute('disabled');
        });

        if (!hasNextPage && currentPage > 5) {
          console.log('No more pages available');
          break;
        }

        // Rate limiting
        await page.waitForTimeout(1500 + Math.random() * 1000);
        currentPage++;

        // Save progress periodically
        if (currentPage % 10 === 0) {
          this.saveProgress();
        }

      } catch (error) {
        console.error(`Error on page ${currentPage}:`, error);
        consecutiveErrors++;
        await page.waitForTimeout(3000);
      }
    }

    await this.close();

    // Deduplicate
    const unique = this.deduplicateCompanies();
    console.log(`\nTotal unique companies scraped: ${unique.length}`);

    return unique;
  }

  /**
   * Deduplicate companies
   */
  private deduplicateCompanies(): ScrapedCompany[] {
    const seen = new Map<string, ScrapedCompany>();

    for (const company of this.companies) {
      const key = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key.length > 2 && !seen.has(key)) {
        seen.set(key, company);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Save progress to file
   */
  private saveProgress(): void {
    const unique = this.deduplicateCompanies();
    writeFileSync(this.outputFile, JSON.stringify(unique, null, 2));
    console.log(`Progress saved: ${unique.length} companies`);
  }

  /**
   * Export to CSV for import
   */
  exportToCSV(): string {
    const unique = this.deduplicateCompanies();
    const csvPath = join(__dirname, '../../glassdoor-companies.csv');

    const lines = ['name,careers_url,specialty'];
    for (const company of unique) {
      const name = company.name.replace(/,/g, '');
      const careersUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' careers Ahmedabad')}`;
      const specialty = 'IT Services';
      lines.push(`${name},${careersUrl},${specialty}`);
    }

    writeFileSync(csvPath, lines.join('\n'));
    console.log(`Exported ${unique.length} companies to ${csvPath}`);

    return csvPath;
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

  /**
   * Get scraped companies
   */
  getCompanies(): ScrapedCompany[] {
    return this.deduplicateCompanies();
  }
}

// CLI Runner
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              GLASSDOOR COMPANY SCRAPER                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Scraping IT companies from Glassdoor Ahmedabad                ║
║  Target: ~1,163 companies                                       ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  const scraper = new GlassdoorCompanyScraper();

  try {
    const companies = await scraper.scrapeAllPages();

    console.log(`\nScraping complete!`);
    console.log(`Total companies: ${companies.length}`);

    // Export to CSV
    const csvPath = scraper.exportToCSV();

    console.log(`
Next steps:
1. Review the CSV: ${csvPath}
2. Import: npm run import:companies glassdoor-companies.csv
    `);

  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

export { GlassdoorCompanyScraper };

// Run if called directly
main();
