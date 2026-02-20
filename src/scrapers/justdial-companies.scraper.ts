/**
 * JUSTDIAL COMPANY SCRAPER
 *
 * Scrapes IT companies from JustDial for Ahmedabad/Gujarat region.
 * JustDial is India's largest local business directory.
 *
 * Expected: ~2000 companies
 *
 * Usage:
 *   npx tsx src/scrapers/justdial-companies.scraper.ts
 */

import { chromium, Browser, Page } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface JustDialCompany {
  name: string;
  website?: string;
  phone?: string;
  address?: string;
  rating?: string;
  category?: string;
}

class JustDialCompanyScraper {
  private browser: Browser | null = null;
  private companies: JustDialCompany[] = [];
  private outputFile: string;

  constructor() {
    this.outputFile = join(__dirname, '../../justdial-companies.csv');
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

    // Anti-detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    return page;
  }

  async scrapeAll(): Promise<JustDialCompany[]> {
    console.log('Starting JustDial scrape for Ahmedabad IT companies...\n');

    const page = await this.createPage();

    // JustDial search categories for IT companies
    const searchTerms = [
      'software-companies',
      'it-companies',
      'software-development-companies',
      'mobile-app-developers',
      'web-designing-companies',
      'web-development-companies',
      'computer-software-dealers',
      'erp-software-dealers',
      'cloud-computing-service-providers',
      'artificial-intelligence-companies',
      'data-analytics-companies',
      'digital-marketing-companies',
      'seo-companies',
      'it-consultants',
      'computer-networking-companies',
      'cybersecurity-services',
    ];

    const cities = ['Ahmedabad', 'Gandhinagar'];

    for (const city of cities) {
      for (const term of searchTerms) {
        const url = `https://www.justdial.com/${city}/${term}`;
        console.log(`\nScraping: ${city} - ${term}`);
        await this.scrapeCategory(page, url, term);
      }
    }

    await this.close();

    const unique = this.deduplicateCompanies();
    console.log(`\nTotal unique companies: ${unique.length}`);

    this.exportToCSV(unique);

    return unique;
  }

  private async scrapeCategory(page: Page, baseUrl: string, category: string): Promise<void> {
    let pageNum = 1;
    let hasMore = true;

    while (hasMore && pageNum <= 10) {
      const url = pageNum === 1 ? baseUrl : `${baseUrl}/page-${pageNum}`;

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Scroll to load lazy content
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await page.waitForTimeout(1000);

        const pageCompanies = await page.evaluate((cat) => {
          const companies: {
            name: string;
            website?: string;
            phone?: string;
            address?: string;
            rating?: string;
            category?: string;
          }[] = [];

          // JustDial listing cards
          const cards = document.querySelectorAll('.store-details, .cntanr, .resultbox_info, li[class*="list"]');

          for (const card of cards) {
            // Name - usually in h2 or span with specific class
            const nameEl = card.querySelector('.store-name, .lng_cont_name, .jcn, h2 a, span.jcn');
            // Website
            const websiteEl = card.querySelector('a[href*="http"]:not([href*="justdial"])');
            // Rating
            const ratingEl = card.querySelector('.green-box, .star_m, [class*="rating"]');
            // Address
            const addressEl = card.querySelector('.mrehdhdtls, .cont_fl_addr, .address');

            const name = nameEl?.textContent?.trim();
            if (name && name.length > 2 && name.length < 150) {
              // Skip if name contains common non-company strings
              if (!/^(Page|Next|Prev|Filter|Sort|Home)/i.test(name)) {
                companies.push({
                  name: name.replace(/\s+/g, ' '),
                  website: websiteEl?.getAttribute('href') || undefined,
                  rating: ratingEl?.textContent?.trim(),
                  address: addressEl?.textContent?.trim()?.slice(0, 100),
                  category: cat,
                });
              }
            }
          }

          // Fallback: extract from structured data or text
          if (companies.length === 0) {
            const allText = document.body.innerText;
            const lines = allText.split('\n').filter(l => l.trim().length > 3);

            for (const line of lines) {
              // Look for patterns like "Company Name 4.5 Rating"
              const match = line.match(/^([A-Z][A-Za-z\s&\-\.]+(?:Technologies|Solutions|Systems|Software|Tech|Labs|Infotech|IT|Pvt Ltd|LLP|Private Limited))(?:\s+[\d\.]+)?/);
              if (match && match[1].length > 3 && match[1].length < 100) {
                companies.push({ name: match[1].trim(), category: cat });
              }
            }
          }

          return companies;
        }, category);

        if (pageCompanies.length === 0) {
          hasMore = false;
        } else {
          this.companies.push(...pageCompanies);
          console.log(`  Page ${pageNum}: Found ${pageCompanies.length} companies`);
          pageNum++;
          await page.waitForTimeout(1500 + Math.random() * 1000);
        }

      } catch (error) {
        console.error(`  Error on page ${pageNum}:`, error);
        hasMore = false;
      }
    }
  }

  private deduplicateCompanies(): JustDialCompany[] {
    const seen = new Map<string, JustDialCompany>();

    for (const company of this.companies) {
      const key = company.name.toLowerCase()
        .replace(/\s+(private|pvt|limited|ltd|llp)\.?/gi, '')
        .replace(/[^a-z0-9]/g, '');

      if (key.length > 2 && !seen.has(key)) {
        seen.set(key, company);
      }
    }

    return Array.from(seen.values());
  }

  private exportToCSV(companies: JustDialCompany[]): void {
    const lines = ['name,careers_url,specialty'];

    for (const c of companies) {
      const name = c.name.replace(/,/g, ';');
      const careersUrl = c.website
        ? `${c.website.replace(/\/$/, '')}/careers`
        : `https://www.google.com/search?q=${encodeURIComponent(c.name + ' careers Ahmedabad')}`;
      const specialty = (c.category || 'IT Services').replace(/-/g, ' ').replace(/,/g, ';');

      lines.push(`${name},${careersUrl},${specialty}`);
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
║              JUSTDIAL COMPANY SCRAPER                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Scraping IT companies from JustDial.com                       ║
║  Target: Ahmedabad & Gandhinagar                               ║
║  Expected: ~2000 companies                                     ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  const scraper = new JustDialCompanyScraper();

  try {
    await scraper.scrapeAll();
    console.log('\nDone! Run: npm run aggregate to import into companies.json');
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

export { JustDialCompanyScraper };

main();
