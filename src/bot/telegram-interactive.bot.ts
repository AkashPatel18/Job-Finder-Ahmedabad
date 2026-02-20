import { Telegraf, Context, Markup } from 'telegraf';
import { config } from '../config/index.js';
import { prisma } from '../database/index.js';
import { messageGeneratorService } from '../services/message-generator.service.js';
import { hrFinderService } from '../services/hr-finder.service.js';
import { careerMonitorService } from '../services/career-monitor.service.js';
import { userProfile } from '../config/search-criteria.js';
import { logger } from '../services/logger.service.js';
import { UserJobStatus } from '@prisma/client';

interface BotContext extends Context {
  session?: {
    currentJobIndex: number;
    jobIds: string[];
    filter: 'all' | 'saved' | 'new' | 'applied';
  };
}

class TelegramInteractiveBot {
  private bot: Telegraf<BotContext>;
  private userSessions: Map<number, { currentJobIndex: number; jobIds: string[]; filter: string }> = new Map();

  constructor() {
    this.bot = new Telegraf<BotContext>(config.telegram.botToken);
    this.setupCommands();
    this.setupCallbacks();
  }

  private setupCommands(): void {
    // Start command
    this.bot.command('start', async (ctx) => {
      const welcomeMessage = `
*Job Command Center*

Welcome! Here are the available commands:

*Job Browsing:*
/jobs - Browse all jobs
/new - Show new jobs only
/saved - Show saved jobs
/applied - Show applied jobs
/top - Top 10 matched jobs

*Job Actions:*
/job <id> - View job details
/save <id> - Save a job
/apply <id> - Mark as applied
/skip <id> - Skip/Not interested

*Career Monitor:*
/monitor - Scan ALL company career pages
/monitor TCS Infosys - Scan specific companies
/companies - List monitored companies

*Info:*
/stats - Your application stats
/search <keyword> - Search jobs
/help - Show this help

Start with /jobs or /new to browse!
      `.trim();

      await ctx.replyWithMarkdown(welcomeMessage);
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(`
Commands:
/jobs - Browse all jobs
/new - New jobs only
/saved - Saved jobs
/applied - Applied jobs
/top - Top 10 matches
/job <id> - Job details
/save <id> - Save job
/apply <id> - Mark applied
/skip <id> - Not interested
/stats - Your stats
/search <keyword> - Search
      `.trim());
    });

    // Jobs command - browse all
    this.bot.command('jobs', async (ctx) => {
      await this.showJobsList(ctx, 'all');
    });

    // New jobs
    this.bot.command('new', async (ctx) => {
      await this.showJobsList(ctx, 'new');
    });

    // Saved jobs
    this.bot.command('saved', async (ctx) => {
      await this.showJobsList(ctx, 'saved');
    });

    // Applied jobs
    this.bot.command('applied', async (ctx) => {
      await this.showJobsList(ctx, 'applied');
    });

    // Top matches
    this.bot.command('top', async (ctx) => {
      await this.showTopJobs(ctx);
    });

    // View specific job
    this.bot.command('job', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        await ctx.reply('Usage: /job <job_id>\nExample: /job abc123');
        return;
      }
      await this.showJobDetails(ctx, args[1]);
    });

    // Save job
    this.bot.command('save', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        await ctx.reply('Usage: /save <job_id>');
        return;
      }
      await this.saveJob(ctx, args[1]);
    });

    // Mark as applied
    this.bot.command('apply', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        await ctx.reply('Usage: /apply <job_id>');
        return;
      }
      await this.markApplied(ctx, args[1]);
    });

    // Skip job
    this.bot.command('skip', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) {
        await ctx.reply('Usage: /skip <job_id>');
        return;
      }
      await this.skipJob(ctx, args[1]);
    });

    // Stats
    this.bot.command('stats', async (ctx) => {
      await this.showStats(ctx);
    });

    // Search
    this.bot.command('search', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ');
      if (!args) {
        await ctx.reply('Usage: /search <keyword>\nExample: /search react developer');
        return;
      }
      await this.searchJobs(ctx, args);
    });

    // Monitor command - scan career pages
    this.bot.command('monitor', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);

      await ctx.reply('Starting career page monitoring... This may take a few minutes.');

      try {
        let result;
        if (args.length > 0) {
          const results = await careerMonitorService.monitorByNames(args);
          let total = 0, newJobs = 0;
          for (const r of results) {
            total += r.jobsFound;
            newJobs += r.newJobs;
          }
          result = { total, newJobs };
        } else {
          result = await careerMonitorService.monitorAll();
        }

        await ctx.reply(`
Career Monitor Complete!

Jobs Found: ${result.total}
New Jobs: ${result.newJobs}

Use /new to see new jobs!
        `.trim());
      } catch (error) {
        await ctx.reply(`Monitor failed: ${error}`);
      }
    });

    // Companies command - list companies
    this.bot.command('companies', async (ctx) => {
      const companies = await careerMonitorService.getCompanies();

      let message = `Companies Being Monitored: ${companies.length}\n\n`;

      const byCity: { [key: string]: number } = {};
      for (const c of companies) {
        byCity[c.city] = (byCity[c.city] || 0) + 1;
      }

      for (const [city, count] of Object.entries(byCity)) {
        message += `${city}: ${count} companies\n`;
      }

      message += `\nView all at: http://localhost:3456/companies`;

      await ctx.reply(message);
    });
  }

  private setupCallbacks(): void {
    // Next job in list
    this.bot.action(/^next_(.+)$/, async (ctx) => {
      const filter = ctx.match[1];
      const userId = ctx.from?.id;
      if (!userId) return;

      const session = this.userSessions.get(userId);
      if (!session || session.jobIds.length === 0) {
        await ctx.answerCbQuery('No more jobs');
        return;
      }

      session.currentJobIndex = (session.currentJobIndex + 1) % session.jobIds.length;
      this.userSessions.set(userId, session);

      await ctx.answerCbQuery(`Job ${session.currentJobIndex + 1}/${session.jobIds.length}`);
      await this.showJobAtIndex(ctx, session);
    });

    // Previous job
    this.bot.action(/^prev_(.+)$/, async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const session = this.userSessions.get(userId);
      if (!session || session.jobIds.length === 0) {
        await ctx.answerCbQuery('No jobs');
        return;
      }

      session.currentJobIndex = session.currentJobIndex > 0
        ? session.currentJobIndex - 1
        : session.jobIds.length - 1;
      this.userSessions.set(userId, session);

      await ctx.answerCbQuery(`Job ${session.currentJobIndex + 1}/${session.jobIds.length}`);
      await this.showJobAtIndex(ctx, session);
    });

    // View details
    this.bot.action(/^details_(.+)$/, async (ctx) => {
      const jobId = ctx.match[1];
      await ctx.answerCbQuery();
      await this.showJobDetails(ctx, jobId);
    });

    // Save job
    this.bot.action(/^save_(.+)$/, async (ctx) => {
      const jobId = ctx.match[1];
      await this.saveJob(ctx, jobId);
      await ctx.answerCbQuery('Saved!');
    });

    // Mark applied
    this.bot.action(/^applied_(.+)$/, async (ctx) => {
      const jobId = ctx.match[1];
      await this.markApplied(ctx, jobId);
      await ctx.answerCbQuery('Marked as applied!');
    });

    // Skip job
    this.bot.action(/^skip_(.+)$/, async (ctx) => {
      const jobId = ctx.match[1];
      await this.skipJob(ctx, jobId);
      await ctx.answerCbQuery('Skipped!');
    });

    // Get LinkedIn message
    this.bot.action(/^linkedin_msg_(.+)$/, async (ctx) => {
      const jobId = ctx.match[1];
      await ctx.answerCbQuery();
      await this.sendLinkedInMessage(ctx, jobId);
    });

    // Get application info
    this.bot.action(/^app_info_(.+)$/, async (ctx) => {
      const jobId = ctx.match[1];
      await ctx.answerCbQuery();
      await this.sendApplicationInfo(ctx, jobId);
    });

    // Find HR
    this.bot.action(/^find_hr_(.+)$/, async (ctx) => {
      const jobId = ctx.match[1];
      await ctx.answerCbQuery('Searching for HR...');
      await this.findAndShowHR(ctx, jobId);
    });
  }

  private async showJobsList(ctx: Context, filter: 'all' | 'new' | 'saved' | 'applied'): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    let whereClause: any = {};

    switch (filter) {
      case 'new':
        whereClause = { userStatus: 'NEW' };
        break;
      case 'saved':
        whereClause = { savedByUser: true };
        break;
      case 'applied':
        whereClause = { userStatus: 'APPLIED' };
        break;
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      orderBy: [
        { aiMatchScore: 'desc' },
        { scrapedAt: 'desc' }
      ],
      take: 50,
      select: {
        id: true,
        title: true,
        companyName: true,
        aiMatchScore: true,
        location: true,
        userStatus: true,
        savedByUser: true,
      }
    });

    if (jobs.length === 0) {
      await ctx.reply(`No ${filter} jobs found.`);
      return;
    }

    // Store session
    this.userSessions.set(userId, {
      currentJobIndex: 0,
      jobIds: jobs.map(j => j.id),
      filter
    });

    const session = this.userSessions.get(userId)!;
    await this.showJobAtIndex(ctx, session);
  }

  private async showJobAtIndex(ctx: Context, session: { currentJobIndex: number; jobIds: string[]; filter: string }): Promise<void> {
    const jobId = session.jobIds[session.currentJobIndex];
    const job = await prisma.job.findUnique({ where: { id: jobId } });

    if (!job) {
      await ctx.reply('Job not found');
      return;
    }

    const matchEmoji = (job.aiMatchScore || 0) >= 0.9 ? '🔥' :
                       (job.aiMatchScore || 0) >= 0.8 ? '⭐' :
                       (job.aiMatchScore || 0) >= 0.7 ? '✅' : '📋';

    const savedEmoji = job.savedByUser ? '💾' : '';
    const statusEmoji = job.userStatus === 'APPLIED' ? '✅' :
                        job.userStatus === 'NOT_INTERESTED' ? '⏭️' : '';

    const shortId = job.id.substring(0, 8);

    const message = `
${matchEmoji} *${session.currentJobIndex + 1}/${session.jobIds.length}* ${savedEmoji}${statusEmoji}

*${this.escapeMarkdown(job.title)}*
🏢 ${this.escapeMarkdown(job.companyName)}
📍 ${this.escapeMarkdown(job.location || 'Not specified')}
📊 Match: ${((job.aiMatchScore || 0) * 100).toFixed(0)}%
💼 ${job.platform}

ID: \`${shortId}\`
    `.trim();

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⬅️ Prev', `prev_${session.filter}`),
        Markup.button.callback('➡️ Next', `next_${session.filter}`)
      ],
      [
        Markup.button.callback('📋 Details', `details_${job.id}`),
        Markup.button.callback('💾 Save', `save_${job.id}`)
      ],
      [
        Markup.button.callback('✅ Applied', `applied_${job.id}`),
        Markup.button.callback('⏭️ Skip', `skip_${job.id}`)
      ],
      [
        Markup.button.url('🔗 Apply', job.url)
      ]
    ]);

    try {
      await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
    } catch {
      await ctx.replyWithMarkdown(message, keyboard);
    }
  }

  private async showJobDetails(ctx: Context, jobIdOrShort: string): Promise<void> {
    // Find job by full ID or short ID (first 8 chars)
    let job = await prisma.job.findUnique({ where: { id: jobIdOrShort } });

    if (!job) {
      // Try finding by short ID
      job = await prisma.job.findFirst({
        where: { id: { startsWith: jobIdOrShort } }
      });
    }

    if (!job) {
      await ctx.reply('Job not found. Use /jobs to browse available jobs.');
      return;
    }

    // Generate messages if not already generated
    if (!job.linkedinMessage) {
      const messages = await messageGeneratorService.generateMessages(job);
      await prisma.job.update({
        where: { id: job.id },
        data: {
          linkedinMessage: messages.linkedinMessage,
          applicationFormData: JSON.stringify(messages.formData)
        }
      });
      job.linkedinMessage = messages.linkedinMessage;
      job.applicationFormData = JSON.stringify(messages.formData);
    }

    const matchEmoji = (job.aiMatchScore || 0) >= 0.9 ? '🔥' :
                       (job.aiMatchScore || 0) >= 0.8 ? '⭐' : '✅';

    const detailMessage = `
${matchEmoji} *Job Details*

*${this.escapeMarkdown(job.title)}*
🏢 *Company:* ${this.escapeMarkdown(job.companyName)}
📍 *Location:* ${this.escapeMarkdown(job.location || 'Not specified')}
💰 *Salary:* ${this.escapeMarkdown(job.salaryRange || 'Not disclosed')}
📊 *Match Score:* ${((job.aiMatchScore || 0) * 100).toFixed(0)}%
💼 *Platform:* ${job.platform}
🔧 *Skills:* ${job.skills.slice(0, 5).join(', ') || 'N/A'}

${job.hrLinkedinUrl ? `👤 *HR:* [${this.escapeMarkdown(job.hrName || 'View Profile')}](${job.hrLinkedinUrl})` : ''}
${job.careerPageUrl ? `🌐 *Career Page:* [Apply Here](${job.careerPageUrl})` : ''}

*Why this matches:*
${this.escapeMarkdown(job.aiMatchReason || 'Good match based on your profile')}

ID: \`${job.id.substring(0, 8)}\`
    `.trim();

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('💬 LinkedIn Msg', `linkedin_msg_${job.id}`),
        Markup.button.callback('📝 Form Info', `app_info_${job.id}`)
      ],
      [
        Markup.button.callback('🔍 Find HR', `find_hr_${job.id}`),
        Markup.button.callback('💾 Save', `save_${job.id}`)
      ],
      [
        Markup.button.callback('✅ Applied', `applied_${job.id}`),
        Markup.button.callback('⏭️ Skip', `skip_${job.id}`)
      ],
      [
        Markup.button.url('🔗 Apply Now', job.url)
      ]
    ]);

    await ctx.replyWithMarkdown(detailMessage, {
      ...keyboard,
      link_preview_options: { is_disabled: true }
    });
  }

  private async sendLinkedInMessage(ctx: Context, jobId: string): Promise<void> {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      await ctx.reply('Job not found');
      return;
    }

    let message = job.linkedinMessage;
    if (!message) {
      const messages = await messageGeneratorService.generateMessages(job);
      message = messages.linkedinMessage;
      await prisma.job.update({
        where: { id: jobId },
        data: { linkedinMessage: message }
      });
    }

    await ctx.reply(`
*LinkedIn Connection Message:*
(Copy and send to HR/Recruiter)

\`\`\`
${message}
\`\`\`
    `.trim(), { parse_mode: 'Markdown' });
  }

  private async sendApplicationInfo(ctx: Context, jobId: string): Promise<void> {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      await ctx.reply('Job not found');
      return;
    }

    let formData = job.applicationFormData ? JSON.parse(job.applicationFormData) : null;
    if (!formData) {
      const messages = await messageGeneratorService.generateMessages(job);
      formData = messages.formData;
      await prisma.job.update({
        where: { id: jobId },
        data: { applicationFormData: JSON.stringify(formData) }
      });
    }

    const infoMessage = `
*Application Form Info*
(Copy-paste for ${this.escapeMarkdown(job.companyName)})

*Full Name:* \`${userProfile.name}\`
*Email:* \`${userProfile.email}\`
*Phone:* \`${userProfile.phone}\`
*LinkedIn:* \`https://linkedin.com/in/akashpatel1804\`
*Location:* \`${userProfile.location}\`
*Experience:* \`${userProfile.yearsOfExperience} years\`
*Current CTC:* \`${userProfile.salary.currentCTC} LPA\`
*Expected CTC:* \`${userProfile.salary.expectedCTC} LPA\`
*Notice Period:* \`${userProfile.preferences.noticePeriod}\`

*Skills:*
\`${userProfile.skills.expert.join(', ')}\`

*Cover Letter:*
\`\`\`
${formData?.coverLetter || 'Will be customized for this role'}
\`\`\`
    `.trim();

    await ctx.replyWithMarkdown(infoMessage);
  }

  private async findAndShowHR(ctx: Context, jobId: string): Promise<void> {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      await ctx.reply('Job not found');
      return;
    }

    await ctx.reply(`🔍 Searching for HR at ${job.companyName}...`);

    try {
      const hrInfo = await hrFinderService.findHR(job.companyName);

      if (hrInfo.linkedinUrl || hrInfo.careerPageUrl) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            hrLinkedinUrl: hrInfo.linkedinUrl,
            hrName: hrInfo.hrName,
            careerPageUrl: hrInfo.careerPageUrl
          }
        });

        let response = `*HR Info for ${this.escapeMarkdown(job.companyName)}*\n\n`;

        if (hrInfo.hrName) {
          response += `👤 *HR Name:* ${this.escapeMarkdown(hrInfo.hrName)}\n`;
        }
        if (hrInfo.linkedinUrl) {
          response += `🔗 *LinkedIn:* [View Profile](${hrInfo.linkedinUrl})\n`;
        }
        if (hrInfo.careerPageUrl) {
          response += `🌐 *Career Page:* [Apply Here](${hrInfo.careerPageUrl})\n`;
        }

        await ctx.replyWithMarkdown(response, {
          link_preview_options: { is_disabled: true }
        });
      } else {
        await ctx.reply(`Could not find HR info for ${job.companyName}. Try searching manually on LinkedIn.`);
      }
    } catch (error) {
      logger.error('Error finding HR:', error);
      await ctx.reply('Error searching for HR. Please try again later.');
    }
  }

  private async saveJob(ctx: Context, jobIdOrShort: string): Promise<void> {
    let job = await prisma.job.findUnique({ where: { id: jobIdOrShort } });
    if (!job) {
      job = await prisma.job.findFirst({
        where: { id: { startsWith: jobIdOrShort } }
      });
    }

    if (!job) {
      await ctx.reply('Job not found');
      return;
    }

    await prisma.job.update({
      where: { id: job.id },
      data: {
        savedByUser: true,
        userStatus: 'SAVED'
      }
    });

    await ctx.reply(`💾 Saved: ${job.title} at ${job.companyName}`);
  }

  private async markApplied(ctx: Context, jobIdOrShort: string): Promise<void> {
    let job = await prisma.job.findUnique({ where: { id: jobIdOrShort } });
    if (!job) {
      job = await prisma.job.findFirst({
        where: { id: { startsWith: jobIdOrShort } }
      });
    }

    if (!job) {
      await ctx.reply('Job not found');
      return;
    }

    await prisma.job.update({
      where: { id: job.id },
      data: { userStatus: 'APPLIED' }
    });

    await ctx.reply(`✅ Marked as applied: ${job.title} at ${job.companyName}`);
  }

  private async skipJob(ctx: Context, jobIdOrShort: string): Promise<void> {
    let job = await prisma.job.findUnique({ where: { id: jobIdOrShort } });
    if (!job) {
      job = await prisma.job.findFirst({
        where: { id: { startsWith: jobIdOrShort } }
      });
    }

    if (!job) {
      await ctx.reply('Job not found');
      return;
    }

    await prisma.job.update({
      where: { id: job.id },
      data: { userStatus: 'NOT_INTERESTED' }
    });

    await ctx.reply(`⏭️ Skipped: ${job.title} at ${job.companyName}`);
  }

  private async showTopJobs(ctx: Context): Promise<void> {
    const jobs = await prisma.job.findMany({
      where: {
        userStatus: { in: ['NEW', 'VIEWED', 'SAVED'] }
      },
      orderBy: { aiMatchScore: 'desc' },
      take: 10
    });

    if (jobs.length === 0) {
      await ctx.reply('No jobs found. Run the scraper first!');
      return;
    }

    let message = '*🔥 Top 10 Job Matches*\n\n';

    jobs.forEach((job, i) => {
      const matchEmoji = (job.aiMatchScore || 0) >= 0.9 ? '🔥' :
                         (job.aiMatchScore || 0) >= 0.8 ? '⭐' : '✅';
      const savedEmoji = job.savedByUser ? '💾' : '';

      message += `${i + 1}. ${matchEmoji} *${this.escapeMarkdown(job.title)}* ${savedEmoji}\n`;
      message += `   🏢 ${this.escapeMarkdown(job.companyName)} | ${((job.aiMatchScore || 0) * 100).toFixed(0)}%\n`;
      message += `   ID: \`${job.id.substring(0, 8)}\`\n\n`;
    });

    message += '\nUse /job <id> to see details';

    await ctx.replyWithMarkdown(message);
  }

  private async showStats(ctx: Context): Promise<void> {
    const [total, newJobs, saved, applied, interviews] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { userStatus: 'NEW' } }),
      prisma.job.count({ where: { savedByUser: true } }),
      prisma.job.count({ where: { userStatus: 'APPLIED' } }),
      prisma.job.count({ where: { userStatus: 'INTERVIEWING' } })
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayJobs = await prisma.job.count({
      where: { scrapedAt: { gte: today } }
    });

    const message = `
*📊 Your Job Stats*

*Total Jobs:* ${total}
*New Today:* ${todayJobs}
*New (Unreviewed):* ${newJobs}
*Saved:* ${saved}
*Applied:* ${applied}
*Interviews:* ${interviews}

Use /jobs to start browsing!
    `.trim();

    await ctx.replyWithMarkdown(message);
  }

  private async searchJobs(ctx: Context, keyword: string): Promise<void> {
    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { companyName: { contains: keyword, mode: 'insensitive' } },
          { skills: { has: keyword } }
        ]
      },
      orderBy: { aiMatchScore: 'desc' },
      take: 10
    });

    if (jobs.length === 0) {
      await ctx.reply(`No jobs found for "${keyword}"`);
      return;
    }

    let message = `*🔍 Search: "${this.escapeMarkdown(keyword)}"*\n\n`;

    jobs.forEach((job, i) => {
      message += `${i + 1}. *${this.escapeMarkdown(job.title)}*\n`;
      message += `   🏢 ${this.escapeMarkdown(job.companyName)}\n`;
      message += `   ID: \`${job.id.substring(0, 8)}\`\n\n`;
    });

    await ctx.replyWithMarkdown(message);
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  async start(): Promise<void> {
    try {
      await this.bot.launch();
      logger.info('Interactive Telegram bot started');
    } catch (error) {
      logger.error('Failed to start Telegram bot:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.bot.stop('SIGTERM');
    logger.info('Interactive Telegram bot stopped');
  }
}

export const telegramInteractiveBot = new TelegramInteractiveBot();
