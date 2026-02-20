/**
 * COMPANY DISCOVERY CLI
 *
 * Discovers IT companies from web directories using Playwright.
 * Uses stealth mode to bypass anti-bot protection.
 *
 * Usage:
 *   npm run discover              # Run full discovery with Playwright
 *   npm run discover -- --simple  # Use simple fetch-based discovery
 */

import { playwrightDiscoveryService } from './services/playwright-discovery.service.js';
import { companyDiscoveryService } from './services/company-discovery.service.js';
import { logger } from './services/logger.service.js';

async function main() {
  const args = process.argv.slice(2);
  const useSimple = args.includes('--simple');

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   COMPANY DISCOVERY                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Discovering IT companies in Ahmedabad/Gandhinagar...          ║
║  Mode: ${useSimple ? 'Simple (fetch-based)' : 'Playwright (stealth browser)'}                              ║
║  Sources: Naukri, Clutch, GoodFirms                            ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  try {
    console.log('Running discovery (this may take a few minutes)...\n');

    let result;

    if (useSimple) {
      result = await companyDiscoveryService.runDiscovery();
    } else {
      // Use Playwright-based discovery
      result = await playwrightDiscoveryService.runFullDiscovery();
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   DISCOVERY COMPLETE                           ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Companies Found: ${String(result.total).padEnd(38)}║
║  New Companies Added: ${String(result.new).padEnd(40)}║
╚═══════════════════════════════════════════════════════════════╝
`);

    if (result.companies && result.companies.length > 0) {
      console.log('Sample of discovered companies:');
      for (const c of result.companies.slice(0, 15)) {
        console.log(`  - ${c.name} (${c.source})`);
      }
      if (result.companies.length > 15) {
        console.log(`  ... and ${result.companies.length - 15} more`);
      }
    }

    console.log(`
The new companies have been added to src/data/companies.json
Run 'npm run monitor' to scan their career pages for jobs.
    `);

  } catch (error) {
    logger.error('Discovery failed:', error);
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
