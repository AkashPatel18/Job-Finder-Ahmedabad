/**
 * SCHEDULER SERVICE
 *
 * Schedules automated tasks like career page monitoring.
 * Uses node-cron for scheduling.
 *
 * Default Schedule:
 * - Career Monitor: Runs at 8 AM and 6 PM daily
 * - Can be customized via environment variables
 */

import cron from 'node-cron';
import { careerMonitorService } from './career-monitor.service.js';
import { notificationService } from './notification.service.js';
import { logger } from './logger.service.js';
import { config } from '../config/index.js';

interface ScheduledTask {
  name: string;
  schedule: string;
  task: cron.ScheduledTask;
  lastRun?: Date;
  nextRun?: Date;
}

class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private isRunning = false;

  /**
   * Initialize and start all scheduled tasks
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    logger.info('Starting Scheduler Service...');

    // Career Monitor - runs at 8 AM and 6 PM daily
    // Can be customized via CAREER_MONITOR_CRON env variable
    const careerMonitorCron = process.env.CAREER_MONITOR_CRON || '0 8,18 * * *';
    this.scheduleTask('career-monitor', careerMonitorCron, async () => {
      await this.runCareerMonitor();
    });

    // Quick job check - runs every 4 hours
    const quickCheckCron = process.env.QUICK_CHECK_CRON || '0 */4 * * *';
    this.scheduleTask('quick-check', quickCheckCron, async () => {
      await this.runQuickCheck();
    });

    this.isRunning = true;
    logger.info('Scheduler Service started successfully');
    this.logSchedule();
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    logger.info('Stopping Scheduler Service...');

    for (const [name, task] of this.tasks) {
      task.task.stop();
      logger.info(`Stopped task: ${name}`);
    }

    this.tasks.clear();
    this.isRunning = false;
    logger.info('Scheduler Service stopped');
  }

  /**
   * Schedule a new task
   */
  private scheduleTask(name: string, schedule: string, callback: () => Promise<void>): void {
    if (!cron.validate(schedule)) {
      logger.error(`Invalid cron schedule for ${name}: ${schedule}`);
      return;
    }

    const task = cron.schedule(schedule, async () => {
      logger.info(`Running scheduled task: ${name}`);
      const scheduledTask = this.tasks.get(name);
      if (scheduledTask) {
        scheduledTask.lastRun = new Date();
      }

      try {
        await callback();
        logger.info(`Completed scheduled task: ${name}`);
      } catch (error) {
        logger.error(`Error in scheduled task ${name}:`, error);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Kolkata'
    });

    this.tasks.set(name, {
      name,
      schedule,
      task,
      nextRun: this.getNextRunTime(schedule)
    });

    logger.info(`Scheduled task: ${name} with cron: ${schedule}`);
  }

  /**
   * Run career monitor manually or via schedule
   */
  async runCareerMonitor(): Promise<{ total: number; newJobs: number; errors: number }> {
    logger.info('Starting scheduled career page monitoring...');

    try {
      const result = await careerMonitorService.monitorAll();

      // Send notification summary
      if (result.newJobs > 0) {
        await notificationService.notifyNewJob({
          title: `${result.newJobs} New Jobs Found!`,
          company: 'Career Monitor',
          location: 'Ahmedabad/Gandhinagar',
          platform: 'Scheduled Scan',
          matchScore: 0.9,
          url: 'http://localhost:3456'
        });
      }

      logger.info(`Career monitor complete: ${result.total} jobs, ${result.newJobs} new`);
      return result;
    } catch (error) {
      logger.error('Career monitor failed:', error);
      throw error;
    }
  }

  /**
   * Quick check - monitors top priority companies only
   */
  async runQuickCheck(): Promise<void> {
    logger.info('Running quick job check for top companies...');

    const topCompanies = [
      'TCS', 'Infosys', 'Wipro', 'eInfochips', 'Simform',
      'Bacancy', 'Azilen', 'MindInventory', 'OpenXcell', 'Crest Data'
    ];

    try {
      const results = await careerMonitorService.monitorByNames(topCompanies);

      let newJobs = 0;
      for (const r of results) {
        newJobs += r.newJobs;
      }

      if (newJobs > 0) {
        logger.info(`Quick check found ${newJobs} new jobs`);
        await notificationService.notifyNewJob({
          title: `${newJobs} New Jobs (Quick Check)`,
          company: 'Top Companies',
          location: 'Ahmedabad/Gandhinagar',
          platform: 'Quick Check',
          matchScore: 0.85,
          url: 'http://localhost:3456'
        });
      }
    } catch (error) {
      logger.error('Quick check failed:', error);
    }
  }

  /**
   * Get the next run time for a cron schedule
   */
  private getNextRunTime(schedule: string): Date {
    // Simple approximation - node-cron doesn't expose next run time
    const now = new Date();
    return now;
  }

  /**
   * Log the current schedule
   */
  logSchedule(): void {
    console.log('\n--- Scheduled Tasks ---');
    for (const [name, task] of this.tasks) {
      console.log(`  ${name}: ${task.schedule}`);
    }
    console.log('------------------------\n');
  }

  /**
   * Get status of all tasks
   */
  getStatus(): { name: string; schedule: string; lastRun?: Date }[] {
    return Array.from(this.tasks.values()).map(t => ({
      name: t.name,
      schedule: t.schedule,
      lastRun: t.lastRun
    }));
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Run a specific task immediately
   */
  async runTask(taskName: string): Promise<void> {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Task not found: ${taskName}`);
    }

    logger.info(`Manually triggering task: ${taskName}`);

    if (taskName === 'career-monitor') {
      await this.runCareerMonitor();
    } else if (taskName === 'quick-check') {
      await this.runQuickCheck();
    }
  }
}

export const schedulerService = new SchedulerService();
