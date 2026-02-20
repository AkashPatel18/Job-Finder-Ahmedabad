/**
 * CLUTCH.CO COMPANY SCRAPER
 *
 * Scrapes IT companies from Clutch.co for Ahmedabad/Gujarat region.
 * Clutch has minimal anti-bot protection and structured data.
 *
 * Expected: ~800 companies
 *
 * Usage:
 *   npx tsx src/scrapers/clutch-companies.scraper.ts
 */

import { chromium, Browser, Page } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ClutchCompany {
  name: string;
  website?: string;
  rating?: string;
  reviews?: string;
  employees?: string;
  hourlyRate?: string;
  location?: string;
  specialty?: string;
}

class ClutchCompanyScraper {
  private browser: Browser | null = null;
  private companies: ClutchCompany[] = [];
  private outputFile: string;

  constructor() {
    this.outputFile = join(__dirname, '../../clutch-companies.csv');
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

  /**
   * Scrape all IT companies from Clutch for Ahmedabad region
   */
  async scrapeAll(): Promise<ClutchCompany[]> {
    console.log('Starting Clutch.co scrape for Ahmedabad IT companies...\n');

    const page = await this.createPage();

    // Clutch URLs for different IT categories in Ahmedabad/Gujarat
    const categoryUrls = [
      // Software Development
      'https://clutch.co/in/developers/ahmedabad',
      'https://clutch.co/in/developers/gujarat',
      // Mobile App Development
      'https://clutch.co/in/app-developers/ahmedabad',
      'https://clutch.co/in/app-developers/gujarat',
      // Web Development
      'https://clutch.co/in/web-developers/ahmedabad',
      'https://clutch.co/in/web-developers/gujarat',
      // IT Services
      'https://clutch.co/in/it-services/ahmedabad',
      'https://clutch.co/in/it-services/gujarat',
      // AI/ML
      'https://clutch.co/in/artificial-intelligence/ahmedabad',
      // Cloud
      'https://clutch.co/in/cloud-consulting/ahmedabad',
      // E-commerce
      'https://clutch.co/in/ecommerce-developers/ahmedabad',
      // UI/UX
      'https://clutch.co/in/agencies/ui-ux-design/ahmedabad',
    ];

    for (const baseUrl of categoryUrls) {
      console.log(`\nScraping category: ${baseUrl}`);
      await this.scrapeCategory(page, baseUrl);
    }

    await this.close();

    // Deduplicate
    const unique = this.deduplicateCompanies();
    console.log(`\nTotal unique companies: ${unique.length}`);

    // Export to CSV
    this.exportToCSV(unique);

    return unique;
  }

  /**
   * Scrape all pages of a category
   */
  private async scrapeCategory(page: Page, baseUrl: string): Promise<void> {
    let pageNum = 0;
    let hasMore = true;

    while (hasMore && pageNum < 20) {
      const url = pageNum === 0 ? baseUrl : `${baseUrl}?page=${pageNum}`;

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);

        const pageCompanies = await page.evaluate(() => {
          const companies: {
            name: string;
            website?: string;
            rating?: string;
            reviews?: string;
            employees?: string;
            hourlyRate?: string;
            location?: string;
            specialty?: string;
          }[] = [];

          // Clutch company cards
          const cards = document.querySelectorAll('.provider-row, .provider, [data-provider-id], .directory-list__item');

          for (const card of cards) {
            const nameEl = card.querySelector('.company_info a, .provider-name, h3.company_name a, .provider__title a');
            const websiteEl = card.querySelector('a[data-link-type="website"], a.website-link');
            const ratingEl = card.querySelector('.sg-rating__number, .rating');
            const reviewsEl = card.querySelector('.reviews-count, .sg-rating__reviews');
            const employeesEl = card.querySelector('[data-employees], .company_details li:nth-child(1)');
            const locationEl = card.querySelector('.locality, .location');
            const specialtyEl = card.querySelector('.tagline, .provider__tagline');

            const name = nameEl?.textContent?.trim();
            if (name && name.length > 1) {
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

  private deduplicateCompanies(): ClutchCompany[] {
    const seen = new Map<string, ClutchCompany>();

    for (const company of this.companies) {
      const key = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key.length > 2 && !seen.has(key)) {
        seen.set(key, company);
      }
    }

    return Array.from(seen.values());
  }

  private exportToCSV(companies: ClutchCompany[]): void {
    const lines = ['name,careers_url,specialty,employees,rating'];

    for (const c of companies) {
      const name = c.name.replace(/,/g, ';');
      const careersUrl = c.website
        ? `${c.website.replace(/\/$/, '')}/careers`
        : `https://www.google.com/search?q=${encodeURIComponent(c.name + ' careers')}`;
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
║              CLUTCH.CO COMPANY SCRAPER                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Scraping IT companies from Clutch.co                          ║
║  Target: Ahmedabad & Gujarat region                            ║
║  Expected: ~800 companies                                      ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  const scraper = new ClutchCompanyScraper();

  try {
    await scraper.scrapeAll();
    console.log('\nDone! Run: npm run aggregate to import into companies.json');
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

export { ClutchCompanyScraper };

main();
