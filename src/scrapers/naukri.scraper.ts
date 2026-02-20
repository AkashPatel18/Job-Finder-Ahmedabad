import { Platform } from '@prisma/client';
import { BaseScraper, ScrapedJob } from './base.scraper.js';
import { config } from '../config/index.js';
import { scraperLogger as logger } from '../services/logger.service.js';

export class NaukriScraper extends BaseScraper {
  private _isLoggedIn = false;

  constructor() {
    super('NAUKRI' as Platform);
  }

  async login(): Promise<boolean> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    const { email, password } = config.credentials.naukri;

    if (!email || !password) {
      logger.warn('Naukri credentials not configured');
      return false;
    }

    try {
      logger.info('Attempting Naukri login...');

      await this.page.goto(this.platformConfig.loginUrl, { waitUntil: 'domcontentloaded' });
      await this.delay(3000);

      // Check if already logged in (look for profile/user icon)
      const alreadyLoggedIn = await this.page.$('.nI-gNb-drawer__icon, .user-initials, [class*="user-icon"], [class*="profile-icon"], .nI-gNb-icon');
      if (alreadyLoggedIn) {
        logger.info('Already logged in to Naukri');
        this._isLoggedIn = true;
        return true;
      }

      // Wait for login form to appear
      await this.page.waitForSelector('form, [class*="login"], [class*="Login"]', { timeout: 10000 }).catch(() => {});
      await this.delay(2000);

      // Try multiple selectors for email field (Naukri changes these often)
      const emailSelectors = [
        'input[type="text"][placeholder*="Email"]',
        'input[type="text"][placeholder*="email"]',
        'input[type="email"]',
        'input[placeholder*="Enter"]',
        'input#usernameField',
        'input[name="username"]',
        'input[name="email"]',
        'form input[type="text"]:first-of-type',
      ];

      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          const emailField = await this.page.$(selector);
          if (emailField && await emailField.isVisible()) {
            await emailField.click();
            await this.delay(300);
            await emailField.fill(email);
            logger.info(`Email entered using selector: ${selector}`);
            emailFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!emailFilled) {
        logger.error('Could not find email field');
        await this.takeScreenshot('naukri_no_email_field');
        return false;
      }

      await this.delay(1000);

      // Try multiple selectors for password field
      const passwordSelectors = [
        'input[type="password"]',
        'input[placeholder*="Password"]',
        'input[placeholder*="password"]',
        'input#passwordField',
        'input[name="password"]',
      ];

      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          const passwordField = await this.page.$(selector);
          if (passwordField && await passwordField.isVisible()) {
            await passwordField.click();
            await this.delay(300);
            await passwordField.fill(password);
            logger.info(`Password entered using selector: ${selector}`);
            passwordFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!passwordFilled) {
        logger.error('Could not find password field');
        await this.takeScreenshot('naukri_no_password_field');
        return false;
      }

      await this.delay(1000);

      // Try multiple selectors for login button
      const loginButtonSelectors = [
        'button[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("login")',
        'button:has-text("Sign in")',
        'button[class*="login"]',
        'button[class*="Login"]',
        'input[type="submit"]',
        'form button',
      ];

      let loginClicked = false;
      for (const selector of loginButtonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button && await button.isVisible()) {
            await button.click();
            logger.info(`Login button clicked using selector: ${selector}`);
            loginClicked = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!loginClicked) {
        // Try pressing Enter as fallback
        await this.page.keyboard.press('Enter');
        logger.info('Pressed Enter to submit login form');
      }

      // Wait for navigation/login to complete
      await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await this.delay(4000);

      // Verify login success by checking for user indicators
      const successIndicators = [
        '.nI-gNb-drawer__icon',
        '.user-initials',
        '[class*="user-icon"]',
        '[class*="profile"]',
        '.nI-gNb-icon',
        '[class*="logged"]',
        'a[href*="logout"]',
        '[class*="dashboard"]',
      ];

      for (const selector of successIndicators) {
        const element = await this.page.$(selector);
        if (element) {
          logger.info('Naukri login successful');
          this._isLoggedIn = true;
          await this.takeScreenshot('naukri_login_success');
          return true;
        }
      }

      // Check URL for success indicators
      const currentUrl = this.page.url();
      if (currentUrl.includes('homepage') || currentUrl.includes('dashboard') || !currentUrl.includes('login')) {
        logger.info('Naukri login successful (URL check)');
        this._isLoggedIn = true;
        await this.takeScreenshot('naukri_login_success');
        return true;
      }

      logger.warn('Naukri login may have failed');
      await this.takeScreenshot('naukri_login_failed');
      return false;
    } catch (error) {
      logger.error('Naukri login error:', error);
      await this.takeScreenshot('naukri_login_error');
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
          logger.error(`Error searching for ${keyword} in ${location} on Naukri:`, error);
        }
      }
    }

    // Remove duplicates
    const uniqueJobs = Array.from(
      new Map(jobs.map(job => [job.externalId, job])).values()
    );

    logger.info(`Found ${uniqueJobs.length} unique jobs on Naukri`);
    return uniqueJobs;
  }

  private async searchWithParams(keyword: string, location: string): Promise<ScrapedJob[]> {
    if (!this.page) return [];

    const jobs: ScrapedJob[] = [];

    try {
      // Build search URL
      // Naukri URL format: /keyword-jobs-in-location
      const formattedKeyword = keyword.toLowerCase().replace(/\s+/g, '-');
      const formattedLocation = location.toLowerCase().replace(/\s+/g, '-');

      let searchUrl = `https://www.naukri.com/${formattedKeyword}-jobs`;
      if (location.toLowerCase() !== 'remote') {
        searchUrl += `-in-${formattedLocation}`;
      }

      // Add filters
      const params = new URLSearchParams({
        experience: '3', // 3+ years
        jobAge: '1', // Last 24 hours
      });

      // Add remote filter if searching for remote
      if (location.toLowerCase() === 'remote' || location.toLowerCase() === 'work from home') {
        params.set('wfhType', '0'); // Work from home
      }

      searchUrl += `?${params.toString()}`;

      logger.info(`Searching Naukri: ${keyword} in ${location}`);

      await this.page.goto(searchUrl, { waitUntil: 'networkidle' });
      await this.delay(2000);

      // Scroll to load more jobs
      await this.scrollPage();

      // Extract job listings
      const jobCards = await this.page.$$('.jobTuple, .cust-job-tuple, article.jobTuple');

      logger.info(`Found ${jobCards.length} job cards on Naukri`);

      for (const card of jobCards.slice(0, 25)) {
        try {
          const job = await this.extractJobFromCard(card);
          if (job) {
            jobs.push(job);
          }
        } catch (error) {
          logger.debug('Error extracting job from Naukri card:', error);
        }
      }
    } catch (error) {
      logger.error('Error in Naukri search:', error);
    }

    return jobs;
  }

  private async extractJobFromCard(card: any): Promise<ScrapedJob | null> {
    try {
      // Get job link
      const linkElement = await card.$('a.title, a[class*="title"]');
      if (!linkElement) return null;

      const href = await linkElement.getAttribute('href');
      if (!href) return null;

      // Extract job ID from URL
      const jobIdMatch = href.match(/jid=(\w+)|\/(\d+)\?/);
      const externalId = jobIdMatch ? (jobIdMatch[1] || jobIdMatch[2]) : `naukri_${Date.now()}`;

      // Get title
      const title = (await linkElement.textContent())?.trim() || '';

      // Get company
      const companyElement = await card.$('.companyInfo a, .comp-name, a[class*="subTitle"]');
      const companyName = (await companyElement?.textContent())?.trim() || '';

      // Get location
      const locationElement = await card.$('.location, .locWdth, span[class*="loc"]');
      const location = (await locationElement?.textContent())?.trim() || '';

      // Get experience
      const expElement = await card.$('.experience, .expwdth, span[class*="exp"]');
      const experienceRange = (await expElement?.textContent())?.trim();

      // Get salary
      const salaryElement = await card.$('.salary, span[class*="sal"]');
      const salaryRange = (await salaryElement?.textContent())?.trim();

      // Get skills
      const skillsElement = await card.$('.tags, .skills, ul.tags');
      const skillsText = (await skillsElement?.textContent()) || '';
      const skills = this.extractSkills(skillsText);

      // Check for quick apply
      const quickApplyElement = await card.$('.apply-button, button[class*="apply"]');
      const isEasyApply = !!quickApplyElement;

      const url = href.startsWith('http') ? href : `https://www.naukri.com${href}`;

      return {
        externalId,
        title,
        companyName,
        location,
        experienceRange,
        salaryRange,
        description: '', // Will be filled when scraping details
        url,
        isEasyApply,
        skills,
      };
    } catch (error) {
      logger.debug('Error extracting job from Naukri card:', error);
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

      // Extract job ID from URL
      const jobIdMatch = jobUrl.match(/jid=(\w+)|\/(\d+)\?/);
      const externalId = jobIdMatch ? (jobIdMatch[1] || jobIdMatch[2]) : '';

      // Title
      const title = await this.safeGetText('.jd-header-title, h1.title, h1[class*="title"]');

      // Company
      const companyName = await this.safeGetText('.jd-header-comp-name a, .company-name, a[class*="comp-name"]');

      // Location
      const location = await this.safeGetText('.location, .loc, span[class*="loc"]');

      // Experience
      const experienceRange = await this.safeGetText('.experience, .exp, span[class*="exp"]');

      // Salary
      const salaryRange = await this.safeGetText('.salary, .sal, span[class*="sal"]');

      // Description
      const description = await this.safeGetText('.job-desc, .jd-desc, section.job-desc');

      // Skills
      const skillsText = await this.safeGetText('.key-skill, .chip-container, .tags');
      const skills = this.extractSkills(description + ' ' + skillsText);

      // Check for easy apply
      const easyApplyButton = await this.page.$('button.apply-button, button[class*="apply"]');
      const isEasyApply = !!easyApplyButton;

      if (!title || !companyName) {
        logger.warn(`Could not extract job details from Naukri: ${jobUrl}`);
        return null;
      }

      return {
        externalId,
        title: title.trim(),
        companyName: companyName.trim(),
        location: location.trim(),
        experienceRange,
        salaryRange,
        description: description.trim(),
        url: jobUrl,
        isEasyApply,
        skills,
      };
    } catch (error) {
      logger.error(`Error scraping Naukri job details from ${jobUrl}:`, error);
      return null;
    }
  }

  private async scrollPage(): Promise<void> {
    if (!this.page) return;

    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await this.delay(1000);
    }
  }
}

export const naukriScraper = new NaukriScraper();
