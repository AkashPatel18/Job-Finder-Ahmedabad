/**
 * JOB COMMAND CENTER
 *
 * Runs:
 * 1. Interactive Telegram Bot - for mobile access
 * 2. Web Dashboard - for desktop access
 * 3. Scheduler - for automated career page monitoring (optional)
 *
 * All platforms are synced via the same database.
 *
 * Usage:
 *   npm run command-center                    # Without scheduler
 *   npm run command-center -- --scheduler     # With scheduler
 *   npx tsx src/command-center.ts --scheduler # With scheduler
 */

import { connectDatabase, disconnectDatabase } from './database/index.js';
import { telegramInteractiveBot } from './bot/telegram-interactive.bot.js';
import { apiServer } from './server/api.server.js';
import { schedulerService } from './services/scheduler.service.js';
import { logger } from './services/logger.service.js';

const enableScheduler = process.argv.includes('--scheduler');

async function main() {
  const schedulerStatus = enableScheduler ? 'ENABLED (8 AM & 6 PM daily)' : 'DISABLED (use --scheduler to enable)';

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                     JOB COMMAND CENTER                         ║
╠═══════════════════════════════════════════════════════════════╣
║                                                                 ║
║   Dashboard:  http://localhost:3456                            ║
║   Companies:  http://localhost:3456/companies                  ║
║   Telegram:   Open your bot and send /start                    ║
║                                                                 ║
║   Scheduler:  ${schedulerStatus.padEnd(42)}║
║                                                                 ║
║   All platforms are synced in real-time!                       ║
║                                                                 ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  try {
    // Connect to database
    logger.info('Connecting to database...');
    await connectDatabase();
    logger.info('Database connected');

    // Start API server (Dashboard)
    logger.info('Starting Dashboard server...');
    await apiServer.start();

    // Start Telegram bot
    logger.info('Starting Telegram bot...');
    await telegramInteractiveBot.start();

    // Start scheduler if enabled
    if (enableScheduler) {
      logger.info('Starting Scheduler...');
      await schedulerService.start();
      logger.info('Scheduler started - career monitoring at 8 AM & 6 PM daily');
    }

    console.log('');
    console.log('Job Command Center is running!');
    console.log('');
    console.log('  Telegram: Send /start to your bot');
    console.log('  Dashboard: http://localhost:3456');
    if (enableScheduler) {
      console.log('  Scheduler: Active - monitoring careers at 8 AM & 6 PM');
    }
    console.log('');

  } catch (error) {
    logger.error('Failed to start Command Center:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  if (enableScheduler) schedulerService.stop();
  await telegramInteractiveBot.stop();
  await apiServer.stop();
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  if (enableScheduler) schedulerService.stop();
  await telegramInteractiveBot.stop();
  await apiServer.stop();
  await disconnectDatabase();
  process.exit(0);
});

// Start
main();
