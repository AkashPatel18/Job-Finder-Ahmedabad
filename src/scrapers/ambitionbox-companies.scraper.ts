/**
 * AMBITIONBOX COMPANY SCRAPER
 *
 * Scrapes IT companies from AmbitionBox for Ahmedabad region.
 * AmbitionBox is India's largest company review platform (like Glassdoor for India).
 *
 * Expected: ~1000 companies
 *
 * Usage:
 *   npx tsx src/scrapers/ambitionbox-companies.scraper.ts
 */

import { chromium, Browser, Page } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface AmbitionBoxCompany {
  name: string;
  rating?: string;
  reviews?: string;
  employees?: string;
  industry?: string;
  headquarters?: string;
}

class AmbitionBoxCompanyScraper {
  private browser: Browser | null = null;
  private companies: AmbitionBoxCompany[] = [];
  private outputFile: string;

  constructor() {
    this.outputFile = join(__dirname, '../../ambitionbox-companies.csv');
  }

  private async initBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ]
    });

    return this.browser;
  }

  private async createPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-IN',
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    return page;
  }

  async scrapeAll(): Promise<AmbitionBoxCompany[]> {
    console.log('Starting AmbitionBox scrape for Ahmedabad IT companies...\n');

    const page = await this.createPage();

    // AmbitionBox search URLs for IT companies in Ahmedabad
    const searchUrls = [
      // IT Industry in Ahmedabad
      'https://www.ambitionbox.com/list-of-companies?location=ahmedabad&industry=it-services-and-consulting',
      'https://www.ambitionbox.com/list-of-companies?location=ahmedabad&industry=software-product',
      'https://www.ambitionbox.com/list-of-companies?location=ahmedabad&industry=internet',
      'https://www.ambitionbox.com/list-of-companies?location=ahmedabad&industry=analytics-and-kpo',
      'https://www.ambitionbox.com/list-of-companies?location=ahmedabad&industry=emerging-technologies',
      // Gandhinagar
      'https://www.ambitionbox.com/list-of-companies?location=gandhinagar&industry=it-services-and-consulting',
      'https://www.ambitionbox.com/list-of-companies?location=gandhinagar&industry=software-product',
      // Gujarat state level
      'https://www.ambitionbox.com/list-of-companies?location=gujarat&industry=it-services-and-consulting',
      'https://www.ambitionbox.com/list-of-companies?location=gujarat&industry=software-product',
    ];

    for (const url of searchUrls) {
      console.log(`\nScraping: ${url.split('?')[1]}`);
      await this.scrapeSearchResults(page, url);
    }

    await this.close();

    const unique = this.deduplicateCompanies();
    console.log(`\nTotal unique companies: ${unique.length}`);

    this.exportToCSV(unique);

    return unique;
  }

  private async scrapeSearchResults(page: Page, baseUrl: string): Promise<void> {
    let pageNum = 1;
    let hasMore = true;

    while (hasMore && pageNum <= 20) {
      const url = pageNum === 1 ? baseUrl : `${baseUrl}&page=${pageNum}`;

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        // Handle any popups
        const closeBtn = await page.$('button[class*="close"], .modal-close, [aria-label="Close"]');
        if (closeBtn) {
          await closeBtn.click().catch(() => {});
          await page.waitForTimeout(500);
        }

        // Scroll to load content
        await page.evaluate(async () => {
          for (let i = 0; i < 3; i++) {
            window.scrollTo(0, document.body.scrollHeight * (i + 1) / 3);
            await new Promise(r => setTimeout(r, 500));
          }
        });

        const pageCompanies = await page.evaluate(() => {
          const companies: {
            name: string;
            rating?: string;
            reviews?: string;
            employees?: string;
            industry?: string;
            headquarters?: string;
          }[] = [];

          // AmbitionBox company cards
          const cards = document.querySelectorAll('.company-card, [class*="companyCard"], .company-list-item, [class*="CompanyCard"]');

          for (const card of cards) {
            const nameEl = card.querySelector('h2, h3, .company-name, [class*="companyName"], a[href*="/overview"]');
            const ratingEl = card.querySelector('.rating, [class*="rating"], .score');
            const reviewsEl = card.querySelector('.reviews, [class*="review"]');
            const employeesEl = card.querySelector('[class*="employee"], [class*="size"]');
            const industryEl = card.querySelector('[class*="industry"], [class*="sector"]');

            const name = nameEl?.textContent?.trim();
            if (name && name.length > 2 && name.length < 100) {
              companies.push({
                name,
                rating: ratingEl?.textContent?.trim()?.match(/[\d\.]+/)?.[0],
                reviews: reviewsEl?.textContent?.replace(/[^0-9]/g, '') || undefined,
                employees: employeesEl?.textContent?.trim(),
                industry: industryEl?.textContent?.trim(),
              });
            }
          }

          // Fallback: look for company links
          if (companies.length === 0) {
            const links = document.querySelectorAll('a[href*="/overview"]');
            for (const link of links) {
              const name = link.textContent?.trim();
              if (name && name.length > 2 && name.length < 100 && !/view|more|all/i.test(name)) {
                companies.push({ name });
              }
            }
          }

          return companies;
        });

        if (pageCompanies.length === 0) {
          hasMore = false;
        } else {
          this.companies.push(...pageCompanies);
          console.log(`  Page ${pageNum}: Found ${pageCompanies.length} companies`);
          pageNum++;
          await page.waitForTimeout(2000 + Math.random() * 1000);
        }

      } catch (error) {
        console.error(`  Error on page ${pageNum}:`, error);
        hasMore = false;
      }
    }
  }

  private deduplicateCompanies(): AmbitionBoxCompany[] {
    const seen = new Map<string, AmbitionBoxCompany>();

    for (const company of this.companies) {
      const key = company.name.toLowerCase()
        .replace(/\s+(private|pvt|limited|ltd|llp|india)\.?/gi, '')
        .replace(/[^a-z0-9]/g, '');

      if (key.length > 2 && !seen.has(key)) {
        seen.set(key, company);
      }
    }

    return Array.from(seen.values());
  }

  private exportToCSV(companies: AmbitionBoxCompany[]): void {
    const lines = ['name,careers_url,specialty,employees,rating'];

    for (const c of companies) {
      const name = c.name.replace(/,/g, ';');
      const careersUrl = `https://www.google.com/search?q=${encodeURIComponent(c.name + ' careers Ahmedabad')}`;
      const specialty = (c.industry || 'IT Services').replace(/,/g, ';');
      const employees = (c.employees || '').replace(/,/g, ';');
      const rating = c.rating || '';

      lines.push(`${name},${careersUrl},${specialty},${employees},${rating}`);
    }

    writeFileSync(this.outputFile, lines.join('\n'));
    console.log(`\nExported to: ${this.outputFile}`);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// CLI Runner
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              AMBITIONBOX COMPANY SCRAPER                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Scraping IT companies from AmbitionBox.com                    ║
║  Target: Ahmedabad & Gujarat region                            ║
║  Expected: ~1000 companies                                     ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  const scraper = new AmbitionBoxCompanyScraper();

  try {
    await scraper.scrapeAll();
    console.log('\nDone! Run: npm run aggregate to import into companies.json');
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

export { AmbitionBoxCompanyScraper };

main();
