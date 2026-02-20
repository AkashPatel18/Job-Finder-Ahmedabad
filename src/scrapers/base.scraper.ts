import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { Platform } from '@prisma/client';
import { PlatformConfig, getPlatformConfig } from '../config/platforms.js';
import { scraperLogger as logger } from '../services/logger.service.js';
import { config } from '../config/index.js';

export interface ScrapedJob {
  externalId: string;
  title: string;
  companyName: string;
  location: string;
  jobType?: string;
  experienceRange?: string;
  salaryRange?: string;
  description: string;
  url: string;
  postedAt?: Date;
  isEasyApply: boolean;
  skills: string[];
}

export interface ScraperOptions {
  headless?: boolean;
  maxPages?: number;
  searchKeywords?: string[];
  locations?: string[];
}

export abstract class BaseScraper {
  protected platform: Platform;
  protected platformConfig: PlatformConfig;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;

  constructor(platform: Platform) {
    this.platform = platform;
    this.platformConfig = getPlatformConfig(platform);
  }

  async initialize(options: ScraperOptions = {}): Promise<void> {
    logger.info(`Initializing ${this.platformConfig.displayName} scraper`);

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: options.headless ?? true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    };

    // Add proxy if configured
    if (config.proxy.enabled && config.proxy.url) {
      launchOptions.proxy = {
        server: config.proxy.url,
      };
    }

    this.browser = await chromium.launch(launchOptions);

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: this.getRandomUserAgent(),
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });

    // Add stealth scripts
    await this.context.addInitScript(() => {
      // Override webdriver detection
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-IN', 'en-US', 'en'],
      });
    });

    this.page = await this.context.newPage();

    logger.info(`${this.platformConfig.displayName} scraper initialized`);
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
    }
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }

    this.page = null;
    this.context = null;
    this.browser = null;

    logger.info(`${this.platformConfig.displayName} scraper cleaned up`);
  }

  abstract login(): Promise<boolean>;
  abstract searchJobs(keywords: string[], locations: string[]): Promise<ScrapedJob[]>;
  abstract scrapeJobDetails(jobUrl: string): Promise<ScrapedJob | null>;

  protected async delay(ms?: number): Promise<void> {
    const delayTime = ms ?? this.platformConfig.rateLimit.delayBetweenRequests;
    // Add some randomness to appear more human
    const randomDelay = delayTime + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, randomDelay));
  }

  protected async humanType(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.click(selector);
    await this.delay(200);

    // Type with random delays between characters
    for (const char of text) {
      await this.page.type(selector, char, { delay: 50 + Math.random() * 100 });
    }
  }

  protected async safeClick(selector: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.click(selector);
      return true;
    } catch {
      logger.warn(`Could not click selector: ${selector}`);
      return false;
    }
  }

  protected async safeGetText(selector: string): Promise<string> {
    if (!this.page) return '';

    try {
      const element = await this.page.waitForSelector(selector, { timeout: 3000 });
      return (await element?.textContent()) ?? '';
    } catch {
      return '';
    }
  }

  protected async takeScreenshot(name: string): Promise<string | null> {
    if (!this.page) return null;

    try {
      const path = `data/screenshots/${this.platform.toLowerCase()}_${name}_${Date.now()}.png`;
      await this.page.screenshot({ path, fullPage: false });
      return path;
    } catch (error) {
      logger.error('Failed to take screenshot:', error);
      return null;
    }
  }

  protected extractSkills(text: string): string[] {
    const skillKeywords = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#',
      'React', 'Angular', 'Vue', 'Node.js', 'Express', 'NestJS', 'Django', 'Flask',
      'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
      'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform',
      'GraphQL', 'REST', 'gRPC', 'Microservices',
      'Git', 'CI/CD', 'Jenkins', 'GitHub Actions',
      'Agile', 'Scrum', 'TDD', 'BDD',
    ];

    const foundSkills: string[] = [];
    const lowerText = text.toLowerCase();

    for (const skill of skillKeywords) {
      if (lowerText.includes(skill.toLowerCase())) {
        foundSkills.push(skill);
      }
    }

    return [...new Set(foundSkills)];
  }

  private getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
}
