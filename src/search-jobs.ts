/**
 * SEARCH JOBS FROM INTERNET
 *
 * Searches the entire internet for jobs matching your criteria.
 *
 * Usage:
 *   npx tsx src/search-jobs.ts
 *   npx tsx src/search-jobs.ts "React Developer" "Remote"
 */

import { connectDatabase, disconnectDatabase } from './database/index.js';
import { webJobSearchService } from './services/web-job-search.service.js';
import { logger } from './services/logger.service.js';

async function main() {
  const args = process.argv.slice(2);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    WEB JOB SEARCH                              ║
╠═══════════════════════════════════════════════════════════════╣
║  Searching the entire internet for jobs...                     ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  try {
    await connectDatabase();

    let result;

    if (args.length >= 2) {
      // Custom search
      const keyword = args[0];
      const location = args[1];
      console.log(`Searching for: ${keyword} in ${location}\n`);
      result = await webJobSearchService.searchJobs(keyword, location);
    } else {
      // Search all configured keywords/locations
      console.log('Searching for all configured job types and locations...\n');
      result = await webJobSearchService.searchAllJobs();
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                      SEARCH COMPLETE                           ║
╠═══════════════════════════════════════════════════════════════╣
║  Jobs Found: ${String(result.found).padEnd(47)}║
║  New Jobs Added: ${String(result.new).padEnd(43)}║
╚═══════════════════════════════════════════════════════════════╝

View jobs at: http://localhost:3456
Or use Telegram: /jobs
    `);

  } catch (error) {
    logger.error('Search failed:', error);
  } finally {
    await disconnectDatabase();
  }
}

main();
