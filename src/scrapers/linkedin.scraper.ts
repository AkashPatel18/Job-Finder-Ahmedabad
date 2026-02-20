import { Platform } from '@prisma/client';
import { BaseScraper, ScrapedJob } from './base.scraper.js';
import { config } from '../config/index.js';
import { scraperLogger as logger } from '../services/logger.service.js';

export class LinkedInScraper extends BaseScraper {
  private _isLoggedIn = false;

  constructor() {
    super('LINKEDIN' as Platform);
  }

  async login(): Promise<boolean> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    const { email, password } = config.credentials.linkedin;

    if (!email || !password) {
      logger.warn('LinkedIn credentials not configured');
      return false;
    }

    try {
      logger.info('Attempting LinkedIn login...');

      await this.page.goto(this.platformConfig.loginUrl, { waitUntil: 'networkidle' });
      await this.delay(2000);

      // Check if already logged in
      if (this.page.url().includes('feed') || this.page.url().includes('jobs')) {
        logger.info('Already logged in to LinkedIn');
        this._isLoggedIn = true;
        return true;
      }

      // Fill login form
      await this.humanType('#username', email);
      await this.delay(500);
      await this.humanType('#password', password);
      await this.delay(500);

      // Click login button
      await this.page.click('button[type="submit"]');

      // Wait for navigation
      await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
      await this.delay(3000);

      // Check for security verification
      if (this.page.url().includes('checkpoint') || this.page.url().includes('challenge')) {
        logger.warn('LinkedIn security checkpoint detected - manual verification may be required');
        await this.takeScreenshot('security_checkpoint');
        return false;
      }

      // Verify login success
      if (this.page.url().includes('feed') || this.page.url().includes('jobs')) {
        logger.info('LinkedIn login successful');
        this._isLoggedIn = true;
        return true;
      }

      logger.warn('LinkedIn login may have failed');
      await this.takeScreenshot('login_failed');
      return false;
    } catch (error) {
      logger.error('LinkedIn login error:', error);
      await this.takeScreenshot('login_error');
      return false;
    }
  }

  async searchJobs(keywords: string[], locations: string[]): Promise<ScrapedJob[]> {
    if (!this.page) {
      throw new Error('Scraper not initialized');
    }

    const jobs: ScrapedJob[] = [];

    for (const keyword of keywords) {
      for (const location of locations) {
        try {
          const searchJobs = await this.searchWithParams(keyword, location);
          jobs.push(...searchJobs);

          // Rate limiting
          await this.delay();
        } catch (error) {
          logger.error(`Error searching for ${keyword} in ${location}:`, error);
        }
      }
    }

    // Remove duplicates by external ID
    const uniqueJobs = Array.from(
      new Map(jobs.map(job => [job.externalId, job])).values()
    );

    logger.info(`Found ${uniqueJobs.length} unique jobs on LinkedIn`);
    return uniqueJobs;
  }

  private async searchWithParams(keyword: string, location: string): Promise<ScrapedJob[]> {
    if (!this.page) return [];

    const jobs: ScrapedJob[] = [];

    try {
      // Build search URL with filters
      const searchUrl = new URL(this.platformConfig.searchUrl);
      searchUrl.searchParams.set('keywords', keyword);
      searchUrl.searchParams.set('location', location);
      searchUrl.searchParams.set('f_TPR', 'r86400'); // Last 24 hours
      searchUrl.searchParams.set('f_WT', '2'); // Remote jobs filter
      searchUrl.searchParams.set('f_E', '3,4'); // Mid-senior level

      logger.info(`Searching LinkedIn: ${keyword} in ${location}`);

      await this.page.goto(searchUrl.toString(), { waitUntil: 'networkidle' });
      await this.delay(2000);

      // Scroll to load more jobs
      await this.scrollPage();

      // Extract job listings
      const jobCards = await this.page.$$('.job-card-container, .jobs-search-results__list-item');

      logger.info(`Found ${jobCards.length} job cards`);

      for (const card of jobCards.slice(0, 25)) { // Limit to 25 per search
        try {
          const job = await this.extractJobFromCard(card);
          if (job) {
            jobs.push(job);
          }
        } catch (error) {
          logger.debug('Error extracting job from card:', error);
        }
      }
    } catch (error) {
      logger.error('Error in LinkedIn search:', error);
    }

    return jobs;
  }

  private async extractJobFromCard(card: any): Promise<ScrapedJob | null> {
    try {
      // Get job link and ID
      const linkElement = await card.$('a.job-card-container__link, a.job-card-list__title');
      if (!linkElement) return null;

      const href = await linkElement.getAttribute('href');
      if (!href) return null;

      // Extract job ID from URL
      const jobIdMatch = href.match(/\/jobs\/view\/(\d+)/);
      const externalId = jobIdMatch ? jobIdMatch[1] : '';
      if (!externalId) return null;

      // Get title
      const titleElement = await card.$('.job-card-list__title, .job-card-container__link span');
      const title = (await titleElement?.textContent())?.trim() || '';

      // Get company
      const companyElement = await card.$('.job-card-container__company-name, .job-card-container__primary-description');
      const companyName = (await companyElement?.textContent())?.trim() || '';

      // Get location
      const locationElement = await card.$('.job-card-container__metadata-item, .job-card-container__metadata-wrapper li');
      const location = (await locationElement?.textContent())?.trim() || '';

      // Check for Easy Apply
      const easyApplyElement = await card.$('.job-card-container__apply-method, .jobs-apply-button');
      const isEasyApply = !!easyApplyElement;

      const url = `https://www.linkedin.com/jobs/view/${externalId}`;

      return {
        externalId,
        title,
        companyName,
        location,
        description: '', // Will be filled when scraping details
        url,
        isEasyApply,
        skills: [],
      };
    } catch (error) {
      logger.debug('Error extracting job from card:', error);
      return null;
    }
  }

  async scrapeJobDetails(jobUrl: string): Promise<ScrapedJob | null> {
    if (!this.page) {
      throw new Error('Scraper not initialized');
    }

    try {
      await this.page.goto(jobUrl, { waitUntil: 'networkidle' });
      await this.delay(2000);

      // Extract job ID
      const jobIdMatch = jobUrl.match(/\/jobs\/view\/(\d+)/);
      const externalId = jobIdMatch ? jobIdMatch[1] : '';

      // Title
      const title = await this.safeGetText('.job-details-jobs-unified-top-card__job-title h1, .top-card-layout__title');

      // Company
      const companyName = await this.safeGetText('.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link');

      // Location
      const location = await this.safeGetText('.job-details-jobs-unified-top-card__primary-description-container span, .topcard__flavor--bullet');

      // Description
      const description = await this.safeGetText('.jobs-description__content, .description__text');

      // Check Easy Apply
      const easyApplyButton = await this.page.$('.jobs-apply-button--top-card, button[aria-label*="Easy Apply"]');
      const isEasyApply = !!easyApplyButton;

      // Extract skills from description
      const skills = this.extractSkills(description);

      // Try to get salary
      const salaryElement = await this.page.$('.compensation__salary, .salary-main-rail__salary');
      const salaryRange = await salaryElement?.textContent() || undefined;

      // Try to get posted date
      const postedElement = await this.page.$('.jobs-unified-top-card__posted-date, .posted-time-ago__text');
      const postedText = await postedElement?.textContent();
      const postedAt = postedText ? this.parsePostedDate(postedText) : undefined;

      if (!title || !companyName) {
        logger.warn(`Could not extract job details from ${jobUrl}`);
        return null;
      }

      return {
        externalId,
        title: title.trim(),
        companyName: companyName.trim(),
        location: location.trim(),
        description: description.trim(),
        url: jobUrl,
        isEasyApply,
        skills,
        salaryRange,
        postedAt,
      };
    } catch (error) {
      logger.error(`Error scraping job details from ${jobUrl}:`, error);
      return null;
    }
  }

  private async scrollPage(): Promise<void> {
    if (!this.page) return;

    for (let i = 0; i < 5; i++) {
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await this.delay(1000);
    }

    // Scroll back to top
    await this.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
  }

  private parsePostedDate(text: string): Date | undefined {
    const now = new Date();
    const lowerText = text.toLowerCase();

    if (lowerText.includes('just now') || lowerText.includes('moment')) {
      return now;
    }

    const hourMatch = lowerText.match(/(\d+)\s*hour/);
    if (hourMatch) {
      now.setHours(now.getHours() - parseInt(hourMatch[1]));
      return now;
    }

    const dayMatch = lowerText.match(/(\d+)\s*day/);
    if (dayMatch) {
      now.setDate(now.getDate() - parseInt(dayMatch[1]));
      return now;
    }

    const weekMatch = lowerText.match(/(\d+)\s*week/);
    if (weekMatch) {
      now.setDate(now.getDate() - parseInt(weekMatch[1]) * 7);
      return now;
    }

    return undefined;
  }
}

export const linkedInScraper = new LinkedInScraper();
