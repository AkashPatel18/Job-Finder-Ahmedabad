import { config } from './config/index.js';
import { searchCriteria } from './config/search-criteria.js';
import { connectDatabase, disconnectDatabase, prisma } from './database/index.js';
import { logger } from './services/logger.service.js';
import { notificationService } from './services/notification.service.js';
import { aiMatcherService } from './services/ai-matcher.service.js';
import { jobAPIService, APIJob } from './services/job-api.service.js';
import { linkedInScraper } from './scrapers/linkedin.scraper.js';
import { naukriScraper } from './scrapers/naukri.scraper.js';
import { BaseScraper, ScrapedJob } from './scrapers/base.scraper.js';
import { naukriApplicator } from './applicators/naukri.applicator.js';
import { BaseApplicator } from './applicators/base.applicator.js';
import { Platform, ApplicationStatus } from '@prisma/client';
import cron from 'node-cron';

class JobApplicationBot {
  private scrapers: Map<Platform, BaseScraper> = new Map();
  private applicators: Map<Platform, BaseApplicator> = new Map();
  private _isRunning = false;
  private dailyApplicationCount = 0;

  constructor() {
    // Only register scrapers that are enabled
    this.registerEnabledScrapers();
    this.registerApplicators();
  }

  private registerApplicators(): void {
    // Naukri auto-apply (if credentials configured)
    if (config.credentials.naukri.enabled) {
      this.applicators.set('NAUKRI' as Platform, naukriApplicator);
      logger.info('Naukri auto-apply ENABLED');
    }

    // Log which platforms support auto-apply
    if (this.applicators.size > 0) {
      logger.info(`Auto-apply enabled for: ${Array.from(this.applicators.keys()).join(', ')}`);
    } else {
      logger.info('No auto-apply platforms configured. Jobs will be queued for manual review.');
    }
  }

  private registerEnabledScrapers(): void {
    // LinkedIn - Only if explicitly enabled (risky)
    if (config.credentials.linkedin.enabled) {
      this.scrapers.set('LINKEDIN' as Platform, linkedInScraper);
      logger.info('LinkedIn scraper enabled (credentials configured)');
    } else {
      logger.info('LinkedIn scraper DISABLED (not configured or LINKEDIN_ENABLED=false)');
    }

    // Naukri - Enable if credentials provided
    if (config.credentials.naukri.enabled) {
      this.scrapers.set('NAUKRI' as Platform, naukriScraper);
      logger.info('Naukri scraper enabled');
    } else {
      logger.info('Naukri scraper disabled (no credentials)');
    }

    // Log enabled APIs
    logger.info('Enabled FREE APIs:', {
      remotive: config.apis.remotive.enabled,
      remoteok: config.apis.remoteok.enabled,
      arbeitnow: config.apis.arbeitnow.enabled,
      adzuna: config.apis.adzuna.enabled,
      jsearch: config.apis.rapidApi.enabled,
      findwork: config.apis.findwork.enabled,
    });
  }

  async start(): Promise<void> {
    logger.info('Starting Job Application Bot...');
    logger.info('='.repeat(50));
    logger.info('PRIORITY ORDER:');
    logger.info('1. FREE APIs (Remotive, RemoteOK, Arbeitnow, etc.)');
    logger.info('2. Indian Portals (Naukri, Indeed)');
    logger.info('3. International (LinkedIn - only if enabled)');
    logger.info('='.repeat(50));

    try {
      // Connect to database
      await connectDatabase();

      // Send startup notification
      await notificationService.notifyStartup();

      // Reset daily application count
      this.dailyApplicationCount = 0;

      // Run initial fetch cycle
      await this.runFetchCycle();

      // Schedule recurring jobs
      this.scheduleJobs();

      this._isRunning = true;
      logger.info('Job Application Bot started successfully');
    } catch (error) {
      logger.error('Failed to start bot:', error);
      await notificationService.notifyError(String(error), 'Bot Startup');
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Job Application Bot...');
    this._isRunning = false;

    // Cleanup all scrapers
    for (const scraper of this.scrapers.values()) {
      await scraper.cleanup();
    }

    // Cleanup all applicators
    for (const applicator of this.applicators.values()) {
      await applicator.cleanup();
    }

    await disconnectDatabase();
    await notificationService.notifyShutdown('Graceful shutdown');
    logger.info('Job Application Bot stopped');
  }

  private scheduleJobs(): void {
    // Priority 1: FREE APIs - Every 2 hours (safe, no limits)
    cron.schedule('0 */2 * * *', async () => {
      logger.info('Running scheduled FREE API fetch...');
      await this.fetchFromAPIs();
    });

    // Priority 2: Indian portals - Every 4 hours
    cron.schedule('0 */4 * * *', async () => {
      logger.info('Running scheduled Indian portal scrape...');
      await this.runScrapers(['NAUKRI'] as Platform[]);
    });

    // Priority 3: International (LinkedIn) - Every 8 hours (only if enabled)
    if (config.credentials.linkedin.enabled) {
      cron.schedule('0 */8 * * *', async () => {
        logger.info('Running scheduled LinkedIn scrape...');
        await this.runScrapers(['LINKEDIN'] as Platform[]);
      });
    }

    // Reset daily count at midnight IST
    cron.schedule('0 0 * * *', () => {
      logger.info('Resetting daily application count');
      this.dailyApplicationCount = 0;
    }, {
      timezone: 'Asia/Kolkata',
    });

    // Send daily summary at 9 PM IST
    cron.schedule('0 21 * * *', async () => {
      await this.sendDailySummary();
    }, {
      timezone: 'Asia/Kolkata',
    });

    logger.info('Cron jobs scheduled');
  }

  /**
   * Main fetch cycle - APIs first, then scrapers
   */
  async runFetchCycle(): Promise<void> {
    logger.info('Starting fetch cycle...');

    // PRIORITY 1: Fetch from FREE APIs first (no blocking risk)
    await this.fetchFromAPIs();

    // PRIORITY 2 & 3: Run enabled scrapers
    await this.runAllScrapers();

    // Process applications for new jobs
    await this.processApplications();
  }

  /**
   * Fetch jobs from all enabled free APIs
   */
  async fetchFromAPIs(): Promise<void> {
    logger.info('Fetching from FREE Job APIs...');

    try {
      const apiJobs = await jobAPIService.fetchAllJobs();
      logger.info(`Fetched ${apiJobs.length} jobs from APIs`);

      // Process and save API jobs
      const { total, newJobs } = await this.processAPIJobs(apiJobs);
      logger.info(`APIs: Processed ${total} jobs, ${newJobs} new`);
    } catch (error) {
      logger.error('Error fetching from APIs:', error);
      await notificationService.notifyError(String(error), 'API Fetch');
    }
  }

  /**
   * Process jobs from APIs
   */
  private async processAPIJobs(apiJobs: APIJob[]): Promise<{ total: number; newJobs: number }> {
    let newJobCount = 0;

    for (const apiJob of apiJobs) {
      try {
        // Map API source to Platform enum
        const platform = this.mapSourceToPlatform(apiJob.source);

        // Check if job already exists
        const existingJob = await prisma.job.findUnique({
          where: {
            platform_externalId: {
              platform,
              externalId: apiJob.externalId,
            },
          },
        });

        if (existingJob) {
          continue; // Skip existing jobs
        }

        // Check if company is blacklisted
        const isBlacklisted = searchCriteria.excludeCompanies.some(
          company => apiJob.companyName.toLowerCase().includes(company.toLowerCase())
        );

        if (isBlacklisted) {
          logger.debug(`Skipping blacklisted company: ${apiJob.companyName}`);
          continue;
        }

        // Run AI matching
        const matchResult = await aiMatcherService.matchJob({
          title: apiJob.title,
          company: apiJob.companyName,
          location: apiJob.location,
          description: apiJob.description,
          salaryRange: apiJob.salary,
        });

        // Save job to database
        const job = await prisma.job.create({
          data: {
            platform,
            externalId: apiJob.externalId,
            title: apiJob.title,
            companyName: apiJob.companyName,
            location: apiJob.location,
            jobType: apiJob.remote ? 'REMOTE' : this.mapJobType(apiJob.location),
            salaryRange: apiJob.salary,
            description: apiJob.description,
            url: apiJob.url,
            postedAt: apiJob.postedAt,
            isEasyApply: true, // API jobs usually link directly to apply
            skills: apiJob.tags || [],
            aiMatchScore: matchResult.score,
            aiMatchReason: matchResult.reason,
          },
        });

        newJobCount++;

        // Notify for high matches (80%+)
        if (matchResult.score >= 0.8) {
          await notificationService.notifyNewJob({
            title: job.title,
            company: job.companyName,
            location: job.location || 'Remote',
            platform: apiJob.source,
            matchScore: matchResult.score,
            url: job.url,
          });
        }

        // Create pending application for high-match jobs
        if (matchResult.shouldApply) {
          await prisma.application.create({
            data: {
              jobId: job.id,
              status: 'PENDING',
            },
          });
        }
      } catch (error) {
        logger.error(`Error processing API job ${apiJob.title}:`, error);
      }
    }

    return { total: apiJobs.length, newJobs: newJobCount };
  }

  /**
   * Map API source string to Platform enum
   */
  private mapSourceToPlatform(source: string): Platform {
    const mapping: Record<string, Platform> = {
      'REMOTIVE': 'REMOTEOK' as Platform,
      'REMOTEOK': 'REMOTEOK' as Platform,
      'ARBEITNOW': 'REMOTEOK' as Platform,
      'ADZUNA': 'INDEED' as Platform,
      'JSEARCH': 'INDEED' as Platform,
      'FINDWORK': 'WELLFOUND' as Platform,
    };

    return mapping[source] || ('REMOTEOK' as Platform);
  }

  /**
   * Run all enabled scrapers
   */
  async runAllScrapers(): Promise<void> {
    const platforms = Array.from(this.scrapers.keys());
    if (platforms.length === 0) {
      logger.info('No scrapers enabled, relying on APIs only');
      return;
    }

    await this.runScrapers(platforms);
  }

  /**
   * Run specific scrapers
   */
  async runScrapers(platforms: Platform[]): Promise<void> {
    const keywords = searchCriteria.keywords.slice(0, 3);
    const locations = searchCriteria.locations.preferred.slice(0, 2);

    for (const platform of platforms) {
      const scraper = this.scrapers.get(platform);
      if (!scraper) continue;

      try {
        // Create scraping session
        const session = await prisma.scrapingSession.create({
          data: {
            platform,
            status: 'running',
          },
        });

        logger.info(`Starting ${platform} scraper...`);

        // Initialize and login
        await scraper.initialize({ headless: true });
        const loginSuccess = await scraper.login();

        if (!loginSuccess) {
          logger.warn(`Skipping ${platform} - login failed`);
          await prisma.scrapingSession.update({
            where: { id: session.id },
            data: {
              status: 'failed',
              errorMessage: 'Login failed',
              completedAt: new Date(),
            },
          });
          await scraper.cleanup();
          continue;
        }

        // Scrape jobs
        const scrapedJobs = await scraper.searchJobs(keywords, locations);

        // Process and save jobs
        const { total, newJobs } = await this.processScrapedJobs(platform, scrapedJobs);

        // Update session
        await prisma.scrapingSession.update({
          where: { id: session.id },
          data: {
            status: 'completed',
            jobsFound: total,
            newJobs,
            completedAt: new Date(),
          },
        });

        logger.info(`${platform}: Scraped ${total} jobs, ${newJobs} new`);

        // Cleanup
        await scraper.cleanup();
      } catch (error) {
        logger.error(`Error scraping ${platform}:`, error);
        await notificationService.notifyError(String(error), `Scraping ${platform}`);
        await scraper.cleanup();
      }
    }
  }

  private async processScrapedJobs(
    platform: Platform,
    scrapedJobs: ScrapedJob[]
  ): Promise<{ total: number; newJobs: number }> {
    let newJobCount = 0;

    for (const scrapedJob of scrapedJobs) {
      try {
        // Check if job already exists
        const existingJob = await prisma.job.findUnique({
          where: {
            platform_externalId: {
              platform,
              externalId: scrapedJob.externalId,
            },
          },
        });

        if (existingJob) {
          continue;
        }

        // Check if company is blacklisted
        const isBlacklisted = searchCriteria.excludeCompanies.some(
          company => scrapedJob.companyName.toLowerCase().includes(company.toLowerCase())
        );

        if (isBlacklisted) {
          logger.debug(`Skipping blacklisted company: ${scrapedJob.companyName}`);
          continue;
        }

        // Run AI matching
        const matchResult = await aiMatcherService.matchJob({
          title: scrapedJob.title,
          company: scrapedJob.companyName,
          location: scrapedJob.location,
          description: scrapedJob.description,
          salaryRange: scrapedJob.salaryRange,
        });

        // Save job to database
        const job = await prisma.job.create({
          data: {
            platform,
            externalId: scrapedJob.externalId,
            title: scrapedJob.title,
            companyName: scrapedJob.companyName,
            location: scrapedJob.location,
            jobType: this.mapJobType(scrapedJob.location),
            experienceRange: scrapedJob.experienceRange,
            salaryRange: scrapedJob.salaryRange,
            description: scrapedJob.description,
            url: scrapedJob.url,
            postedAt: scrapedJob.postedAt,
            isEasyApply: scrapedJob.isEasyApply,
            skills: scrapedJob.skills,
            aiMatchScore: matchResult.score,
            aiMatchReason: matchResult.reason,
          },
        });

        newJobCount++;

        // Notify for high matches
        if (matchResult.score >= 0.8) {
          await notificationService.notifyNewJob({
            title: job.title,
            company: job.companyName,
            location: job.location || 'Not specified',
            platform: platform,
            matchScore: matchResult.score,
            url: job.url,
          });
        }

        // Create pending application for high-match easy-apply jobs
        if (matchResult.shouldApply && scrapedJob.isEasyApply) {
          await prisma.application.create({
            data: {
              jobId: job.id,
              status: 'PENDING',
            },
          });
        }
      } catch (error) {
        logger.error(`Error processing job ${scrapedJob.title}:`, error);
      }
    }

    return { total: scrapedJobs.length, newJobs: newJobCount };
  }

  private async processApplications(): Promise<void> {
    if (this.dailyApplicationCount >= config.application.maxDailyApplications) {
      logger.info('Daily application limit reached');
      return;
    }

    const pendingApplications = await prisma.application.findMany({
      where: { status: 'PENDING' },
      include: { job: true },
      orderBy: { job: { aiMatchScore: 'desc' } },
      take: config.application.maxDailyApplications - this.dailyApplicationCount,
    });

    logger.info(`Processing ${pendingApplications.length} pending applications`);

    // Group applications by platform for efficient processing
    const applicationsByPlatform = new Map<Platform, typeof pendingApplications>();
    for (const app of pendingApplications) {
      const platform = app.job.platform;
      if (!applicationsByPlatform.has(platform)) {
        applicationsByPlatform.set(platform, []);
      }
      applicationsByPlatform.get(platform)!.push(app);
    }

    // Process each platform's applications
    for (const [platform, applications] of applicationsByPlatform) {
      const applicator = this.applicators.get(platform);

      if (applicator) {
        // AUTO-APPLY: Use applicator for this platform
        await this.processWithApplicator(platform, applicator, applications);
      } else {
        // MANUAL: Queue for manual review (send notifications with links)
        await this.processManually(applications);
      }
    }
  }

  private async processWithApplicator(
    platform: Platform,
    applicator: BaseApplicator,
    applications: Array<{ id: string; job: any }>
  ): Promise<void> {
    logger.info(`Auto-applying to ${applications.length} jobs on ${platform}`);

    try {
      // Initialize applicator (login once for all applications)
      await applicator.initialize(true); // headless mode

      for (const application of applications) {
        if (this.dailyApplicationCount >= config.application.maxDailyApplications) {
          break;
        }

        try {
          // Mark as applying
          await prisma.application.update({
            where: { id: application.id },
            data: { status: 'APPLYING' as ApplicationStatus },
          });

          // Generate cover letter
          const { coverLetter } = await aiMatcherService.generateCoverLetter({
            title: application.job.title,
            company: application.job.companyName,
            location: application.job.location || '',
            description: application.job.description || '',
          });

          // Actually apply using the applicator
          logger.info(`Auto-applying: ${application.job.title} at ${application.job.companyName}`);
          const result = await applicator.applyToJob(application as any, coverLetter);

          if (result.success) {
            // SUCCESS!
            await prisma.application.update({
              where: { id: application.id },
              data: {
                status: 'APPLIED' as ApplicationStatus,
                appliedAt: new Date(),
                coverLetter,
                screenshotPath: result.screenshotPath,
              },
            });

            // Record in application history
            await prisma.applicationHistory.upsert({
              where: {
                companyName_jobTitle_platform: {
                  companyName: application.job.companyName,
                  jobTitle: application.job.title,
                  platform,
                },
              },
              update: { appliedAt: new Date() },
              create: {
                companyName: application.job.companyName,
                jobTitle: application.job.title,
                platform,
              },
            });

            // Send success notification
            await notificationService.notifyApplicationResult({
              title: application.job.title,
              company: application.job.companyName,
              platform,
              status: 'applied',
              reason: `AUTO-APPLIED successfully! Screenshot: ${result.screenshotPath || 'N/A'}`,
            });

            this.dailyApplicationCount++;
            logger.info(`Successfully auto-applied to ${application.job.title} at ${application.job.companyName}`);
          } else {
            // Failed to apply
            await prisma.application.update({
              where: { id: application.id },
              data: {
                status: 'FAILED' as ApplicationStatus,
                errorMessage: result.errorMessage,
                screenshotPath: result.screenshotPath,
                attempts: { increment: 1 },
              },
            });

            await notificationService.notifyApplicationResult({
              title: application.job.title,
              company: application.job.companyName,
              platform,
              status: 'failed',
              reason: result.errorMessage || 'Unknown error',
            });
          }

          // Rate limiting delay between applications
          await new Promise(resolve => setTimeout(resolve, config.application.applicationDelayMs));
        } catch (error) {
          logger.error(`Error auto-applying to ${application.job.title}:`, error);

          await prisma.application.update({
            where: { id: application.id },
            data: {
              status: 'FAILED' as ApplicationStatus,
              errorMessage: String(error),
              attempts: { increment: 1 },
            },
          });
        }
      }
    } catch (error) {
      logger.error(`Error initializing ${platform} applicator:`, error);
    } finally {
      // Always cleanup the applicator
      await applicator.cleanup();
    }
  }

  private async processManually(applications: Array<{ id: string; job: any }>): Promise<void> {
    for (const application of applications) {
      if (this.dailyApplicationCount >= config.application.maxDailyApplications) {
        break;
      }

      try {
        // Mark as in progress
        await prisma.application.update({
          where: { id: application.id },
          data: { status: 'APPLYING' as ApplicationStatus },
        });

        // Generate cover letter
        const { coverLetter } = await aiMatcherService.generateCoverLetter({
          title: application.job.title,
          company: application.job.companyName,
          location: application.job.location || '',
          description: application.job.description || '',
        });

        // Queue for manual review
        logger.info(`Manual review required: ${application.job.title} at ${application.job.companyName}`);
        logger.info(`Apply URL: ${application.job.url}`);

        await prisma.application.update({
          where: { id: application.id },
          data: {
            status: 'QUEUED' as ApplicationStatus,
            coverLetter,
          },
        });

        // Send notification with apply link
        await notificationService.notifyApplicationResult({
          title: application.job.title,
          company: application.job.companyName,
          platform: application.job.platform,
          status: 'applied',
          reason: `Cover letter ready. Manual apply at: ${application.job.url}`,
        });

        this.dailyApplicationCount++;

        await new Promise(resolve => setTimeout(resolve, config.application.applicationDelayMs));
      } catch (error) {
        logger.error(`Error processing application ${application.id}:`, error);

        await prisma.application.update({
          where: { id: application.id },
          data: {
            status: 'FAILED' as ApplicationStatus,
            errorMessage: String(error),
            attempts: { increment: 1 },
          },
        });
      }
    }
  }

  private async sendDailySummary(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [jobsScraped, newJobs, applicationsSubmitted, applicationsFailed, topMatches] = await Promise.all([
      prisma.job.count({
        where: { scrapedAt: { gte: today } },
      }),
      prisma.job.count({
        where: { scrapedAt: { gte: today } },
      }),
      prisma.application.count({
        where: {
          appliedAt: { gte: today },
          status: 'APPLIED',
        },
      }),
      prisma.application.count({
        where: {
          updatedAt: { gte: today },
          status: 'FAILED',
        },
      }),
      prisma.job.findMany({
        where: {
          scrapedAt: { gte: today },
          aiMatchScore: { gte: 0.8 },
        },
        orderBy: { aiMatchScore: 'desc' },
        take: 5,
      }),
    ]);

    await notificationService.notifyDailySummary({
      date: today.toLocaleDateString('en-IN'),
      jobsScraped,
      newJobs,
      applicationsSubmitted,
      applicationsFailed,
      topMatches: topMatches.map(job => ({
        title: job.title,
        company: job.companyName,
        location: job.location || 'Not specified',
        platform: job.platform,
        matchScore: job.aiMatchScore || 0,
        url: job.url,
      })),
    });
  }

  private mapJobType(location: string): 'REMOTE' | 'HYBRID' | 'ONSITE' | null {
    const lowerLocation = location.toLowerCase();
    if (lowerLocation.includes('remote') || lowerLocation.includes('work from home') || lowerLocation.includes('wfh')) {
      return 'REMOTE';
    }
    if (lowerLocation.includes('hybrid')) {
      return 'HYBRID';
    }
    return null;
  }
}

// Main execution
const bot = new JobApplicationBot();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down...');
  await bot.stop();
  process.exit(0);
});

// Start the bot
bot.start().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
