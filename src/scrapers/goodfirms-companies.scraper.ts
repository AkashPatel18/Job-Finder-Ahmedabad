/**
 * GOODFIRMS COMPANY SCRAPER
 *
 * Scrapes IT companies from GoodFirms.co for Ahmedabad/Gujarat region.
 * Similar structure to Clutch, minimal anti-bot.
 *
 * Expected: ~600 companies
 *
 * Usage:
 *   npx tsx src/scrapers/goodfirms-companies.scraper.ts
 */

import { chromium, Browser, Page } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface GoodFirmsCompany {
  name: string;
  website?: string;
  rating?: string;
  reviews?: string;
  employees?: string;
  location?: string;
  specialty?: string;
}

class GoodFirmsCompanyScraper {
  private browser: Browser | null = null;
  private companies: GoodFirmsCompany[] = [];
  private outputFile: string;

  constructor() {
    this.outputFile = join(__dirname, '../../goodfirms-companies.csv');
  }

  private async initBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    return this.browser;
  }

  private async createPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    return context.newPage();
  }

  async scrapeAll(): Promise<GoodFirmsCompany[]> {
    console.log('Starting GoodFirms scrape for Ahmedabad IT companies...\n');

    const page = await this.createPage();

    // GoodFirms category URLs for Ahmedabad
    const categoryUrls = [
      // Software Development
      'https://www.goodfirms.co/software-development/ahmedabad',
      'https://www.goodfirms.co/companies/software-development/india/ahmedabad',
      // Mobile App
      'https://www.goodfirms.co/mobile-app-development/ahmedabad',
      'https://www.goodfirms.co/companies/mobile-app-development/india/ahmedabad',
      // Web Development
      'https://www.goodfirms.co/web-development/ahmedabad',
      // IT Services
      'https://www.goodfirms.co/it-services/ahmedabad',
      // AI/ML
      'https://www.goodfirms.co/artificial-intelligence/ahmedabad',
      // E-commerce
      'https://www.goodfirms.co/ecommerce-development/ahmedabad',
      // Digital Marketing
      'https://www.goodfirms.co/seo-services/ahmedabad',
      // Cloud
      'https://www.goodfirms.co/cloud-computing/ahmedabad',
    ];

    for (const baseUrl of categoryUrls) {
      console.log(`\nScraping: ${baseUrl}`);
      await this.scrapeCategory(page, baseUrl);
    }

    await this.close();

    const unique = this.deduplicateCompanies();
    console.log(`\nTotal unique companies: ${unique.length}`);

    this.exportToCSV(unique);

    return unique;
  }

  private async scrapeCategory(page: Page, baseUrl: string): Promise<void> {
    let pageNum = 1;
    let hasMore = true;

    while (hasMore && pageNum <= 15) {
      const url = pageNum === 1 ? baseUrl : `${baseUrl}/page-${pageNum}`;

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const pageCompanies = await page.evaluate(() => {
          const companies: {
            name: string;
            website?: string;
            rating?: string;
            reviews?: string;
            employees?: string;
            location?: string;
            specialty?: string;
          }[] = [];

          // GoodFirms company cards
          const cards = document.querySelectorAll('.company-card, .firm-card, .company-wrapper, .profile-wrapper, [class*="company-list"] > div');

          for (const card of cards) {
            const nameEl = card.querySelector('h3 a, .company-name a, .firm-name a, h2 a, .profile-name a');
            const websiteEl = card.querySelector('a[rel="nofollow"], a.visit-website');
            const ratingEl = card.querySelector('.rating-number, .rating span, .review-rating');
            const reviewsEl = card.querySelector('.reviews-count, .review-count');
            const employeesEl = card.querySelector('.company-info li:nth-child(2), .employees, [class*="employee"]');
            const locationEl = card.querySelector('.location, .company-location, [class*="location"]');
            const specialtyEl = card.querySelector('.tagline, .service-focus, .specialization');

            const name = nameEl?.textContent?.trim();
            if (name && name.length > 2) {
              companies.push({
                name,
                website: websiteEl?.getAttribute('href') || undefined,
                rating: ratingEl?.textContent?.trim(),
                reviews: reviewsEl?.textContent?.replace(/[^0-9]/g, '') || undefined,
                employees: employeesEl?.textContent?.trim(),
                location: locationEl?.textContent?.trim(),
                specialty: specialtyEl?.textContent?.trim()?.slice(0, 100),
              });
            }
          }

          // Fallback: extract from any links with company-like patterns
          if (companies.length === 0) {
            const links = document.querySelectorAll('a[href*="/company/"], a[href*="/profile/"]');
            for (const link of links) {
              const name = link.textContent?.trim();
              if (name && name.length > 2 && name.length < 100) {
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
          await page.waitForTimeout(1000 + Math.random() * 500);
        }

      } catch (error) {
        console.error(`  Error on page ${pageNum}:`, error);
        hasMore = false;
      }
    }
  }

  private deduplicateCompanies(): GoodFirmsCompany[] {
    const seen = new Map<string, GoodFirmsCompany>();

    for (const company of this.companies) {
      const key = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key.length > 2 && !seen.has(key)) {
        seen.set(key, company);
      }
    }

    return Array.from(seen.values());
  }

  private exportToCSV(companies: GoodFirmsCompany[]): void {
    const lines = ['name,careers_url,specialty,employees,rating'];

    for (const c of companies) {
      const name = c.name.replace(/,/g, ';');
      const careersUrl = c.website
        ? `${c.website.replace(/\/$/, '')}/careers`
        : `https://www.google.com/search?q=${encodeURIComponent(c.name + ' careers Ahmedabad')}`;
      const specialty = (c.specialty || 'IT Services').replace(/,/g, ';');
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
║              GOODFIRMS COMPANY SCRAPER                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Scraping IT companies from GoodFirms.co                       ║
║  Target: Ahmedabad region                                      ║
║  Expected: ~600 companies                                      ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  const scraper = new GoodFirmsCompanyScraper();

  try {
    await scraper.scrapeAll();
    console.log('\nDone! Run: npm run aggregate to import into companies.json');
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

export { GoodFirmsCompanyScraper };

main();
