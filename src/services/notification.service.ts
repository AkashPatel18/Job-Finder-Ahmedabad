import { Telegraf } from 'telegraf';
import { config } from '../config/index.js';
import { notificationLogger as logger } from './logger.service.js';

interface JobNotification {
  title: string;
  company: string;
  location: string;
  platform: string;
  matchScore: number;
  url: string;
}

interface ApplicationNotification {
  title: string;
  company: string;
  platform: string;
  status: 'applied' | 'failed' | 'skipped';
  reason?: string;
}

interface DailySummary {
  date: string;
  jobsScraped: number;
  newJobs: number;
  applicationsSubmitted: number;
  applicationsFailed: number;
  topMatches: JobNotification[];
}

class NotificationService {
  private bot: Telegraf | null = null;
  private chatId: string;
  private enabled: boolean = false;

  constructor() {
    this.chatId = config.telegram.chatId;

    if (config.telegram.botToken && config.telegram.chatId) {
      try {
        this.bot = new Telegraf(config.telegram.botToken);
        this.enabled = true;
        logger.info('Telegram notification service initialized');
      } catch (error) {
        logger.error('Failed to initialize Telegram bot:', error);
      }
    } else {
      logger.warn('Telegram credentials not configured, notifications disabled');
    }
  }

  private async send(message: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<void> {
    if (!this.enabled || !this.bot) {
      logger.debug('Notifications disabled, skipping message');
      return;
    }

    try {
      await this.bot.telegram.sendMessage(this.chatId, message, {
        parse_mode: parseMode,
        link_preview_options: { is_disabled: true },
      });
      logger.debug('Notification sent successfully');
    } catch (error) {
      logger.error('Failed to send Telegram notification:', error);
    }
  }

  async notifyNewJob(job: JobNotification): Promise<void> {
    const matchEmoji = job.matchScore >= 0.9 ? '🔥' : job.matchScore >= 0.8 ? '⭐' : '✅';

    const message = `
${matchEmoji} <b>New Job Match!</b>

<b>Title:</b> ${this.escapeHtml(job.title)}
<b>Company:</b> ${this.escapeHtml(job.company)}
<b>Location:</b> ${this.escapeHtml(job.location)}
<b>Platform:</b> ${job.platform}
<b>Match Score:</b> ${(job.matchScore * 100).toFixed(0)}%

<a href="${job.url}">View Job</a>
    `.trim();

    await this.send(message);
  }

  async notifyApplicationResult(app: ApplicationNotification): Promise<void> {
    const statusEmoji = app.status === 'applied' ? '✅' : app.status === 'failed' ? '❌' : '⏭️';
    const statusText = app.status === 'applied'
      ? 'Successfully Applied'
      : app.status === 'failed'
        ? 'Application Failed'
        : 'Skipped';

    const message = `
${statusEmoji} <b>${statusText}</b>

<b>Title:</b> ${this.escapeHtml(app.title)}
<b>Company:</b> ${this.escapeHtml(app.company)}
<b>Platform:</b> ${app.platform}
${app.reason ? `<b>Reason:</b> ${this.escapeHtml(app.reason)}` : ''}
    `.trim();

    await this.send(message);
  }

  async notifyDailySummary(summary: DailySummary): Promise<void> {
    const successRate = summary.applicationsSubmitted > 0
      ? ((summary.applicationsSubmitted / (summary.applicationsSubmitted + summary.applicationsFailed)) * 100).toFixed(0)
      : '0';

    const topMatchesText = summary.topMatches.length > 0
      ? summary.topMatches.map((job, i) =>
          `${i + 1}. ${this.escapeHtml(job.title)} @ ${this.escapeHtml(job.company)} (${(job.matchScore * 100).toFixed(0)}%)`
        ).join('\n')
      : 'No high matches today';

    const message = `
📊 <b>Daily Summary - ${summary.date}</b>

<b>Scraping:</b>
• Jobs Found: ${summary.jobsScraped}
• New Jobs: ${summary.newJobs}

<b>Applications:</b>
• Submitted: ${summary.applicationsSubmitted}
• Failed: ${summary.applicationsFailed}
• Success Rate: ${successRate}%

<b>Top Matches:</b>
${topMatchesText}
    `.trim();

    await this.send(message);
  }

  async notifyError(error: string, context?: string): Promise<void> {
    const message = `
🚨 <b>Error Alert</b>

${context ? `<b>Context:</b> ${this.escapeHtml(context)}\n` : ''}
<b>Error:</b> ${this.escapeHtml(error)}
    `.trim();

    await this.send(message);
  }

  async notifyStartup(): Promise<void> {
    const message = `
🚀 <b>Job Bot Started</b>

The job application bot is now running and will begin scraping for new opportunities.
    `.trim();

    await this.send(message);
  }

  async notifyShutdown(reason?: string): Promise<void> {
    const message = `
🛑 <b>Job Bot Stopped</b>

${reason ? `<b>Reason:</b> ${this.escapeHtml(reason)}` : 'The bot has been shut down.'}
    `.trim();

    await this.send(message);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export const notificationService = new NotificationService();
