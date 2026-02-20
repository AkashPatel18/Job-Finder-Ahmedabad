/**
 * CAREER PAGE MONITOR
 *
 * Monitors all company career pages and extracts new job postings.
 *
 * Usage:
 *   npm run monitor           # Monitor all companies
 *   npm run monitor TCS       # Monitor specific company
 *   npm run monitor Infosys TCS Wipro  # Monitor multiple companies
 */

import { connectDatabase, disconnectDatabase } from './database/index.js';
import { careerMonitorService } from './services/career-monitor.service.js';
import { logger } from './services/logger.service.js';

async function main() {
  const args = process.argv.slice(2);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   CAREER PAGE MONITOR                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Monitoring company career pages for new job postings...       ║
║  Using AI (Groq) to extract job listings                       ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  try {
    await connectDatabase();

    const companies = await careerMonitorService.getCompanies();
    console.log(`Loaded ${companies.length} companies to monitor\n`);

    let result;

    if (args.length > 0) {
      // Monitor specific companies
      console.log(`Monitoring specific companies: ${args.join(', ')}\n`);
      const results = await careerMonitorService.monitorByNames(args);

      let totalJobs = 0;
      let newJobs = 0;

      for (const r of results) {
        console.log(`  ${r.company}: ${r.jobsFound} jobs found, ${r.newJobs} new`);
        totalJobs += r.jobsFound;
        newJobs += r.newJobs;
      }

      result = { total: totalJobs, newJobs, errors: 0 };
    } else {
      // Monitor all companies
      console.log('Monitoring ALL companies. This may take a while...\n');
      result = await careerMonitorService.monitorAll();
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   MONITORING COMPLETE                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Jobs Found: ${String(result.total).padEnd(48)}║
║  New Jobs Added: ${String(result.newJobs).padEnd(44)}║
║  Errors: ${String(result.errors).padEnd(52)}║
╚═══════════════════════════════════════════════════════════════╝

View new jobs at: http://localhost:3456
Or use Telegram: /jobs
    `);

  } catch (error) {
    logger.error('Monitor failed:', error);
    console.error('Error:', error);
  } finally {
    await disconnectDatabase();
  }
}

main();
