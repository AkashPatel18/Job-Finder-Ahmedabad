/**
 * MASTER COMPANY SCRAPER
 *
 * Orchestrates all company scrapers to build a comprehensive database.
 * Runs scrapers in sequence, aggregates results, and deduplicates.
 *
 * Target: 3700+ IT companies in Ahmedabad/Gujarat
 *
 * Usage:
 *   npx tsx src/scrape-all-companies.ts           # Run all scrapers
 *   npx tsx src/scrape-all-companies.ts --quick   # Run only fast scrapers
 *   npx tsx src/scrape-all-companies.ts --source clutch  # Run specific scraper
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ScraperConfig {
  name: string;
  script: string;
  outputFile: string;
  expectedCompanies: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

const SCRAPERS: ScraperConfig[] = [
  {
    name: 'Clutch.co',
    script: 'src/scrapers/clutch-companies.scraper.ts',
    outputFile: 'clutch-companies.csv',
    expectedCompanies: 800,
    difficulty: 'easy',
  },
  {
    name: 'GoodFirms',
    script: 'src/scrapers/goodfirms-companies.scraper.ts',
    outputFile: 'goodfirms-companies.csv',
    expectedCompanies: 600,
    difficulty: 'easy',
  },
  {
    name: 'JustDial',
    script: 'src/scrapers/justdial-companies.scraper.ts',
    outputFile: 'justdial-companies.csv',
    expectedCompanies: 2000,
    difficulty: 'easy',
  },
  {
    name: 'AmbitionBox',
    script: 'src/scrapers/ambitionbox-companies.scraper.ts',
    outputFile: 'ambitionbox-companies.csv',
    expectedCompanies: 1000,
    difficulty: 'medium',
  },
  {
    name: 'Glassdoor',
    script: 'src/scrapers/glassdoor-companies.scraper.ts',
    outputFile: 'glassdoor-companies.csv',
    expectedCompanies: 1163,
    difficulty: 'hard',
  },
];

/**
 * Run a single scraper
 */
async function runScraper(config: ScraperConfig): Promise<{ success: boolean; companies: number }> {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Starting: ${config.name}`);
    console.log(`Expected: ~${config.expectedCompanies} companies`);
    console.log(`${'═'.repeat(60)}\n`);

    const process = spawn('npx', ['tsx', config.script], {
      stdio: 'inherit',
      shell: true,
    });

    process.on('close', (code) => {
      const outputPath = join(__dirname, '..', config.outputFile);
      let companies = 0;

      if (existsSync(outputPath)) {
        const content = readFileSync(outputPath, 'utf-8');
        companies = content.split('\n').length - 1; // Subtract header
      }

      console.log(`\n${config.name}: ${code === 0 ? 'SUCCESS' : 'FAILED'} - ${companies} companies`);

      resolve({
        success: code === 0,
        companies,
      });
    });

    process.on('error', (err) => {
      console.error(`Error running ${config.name}:`, err);
      resolve({ success: false, companies: 0 });
    });
  });
}

/**
 * Aggregate all CSV files into companies.json
 */
async function aggregateAll(): Promise<void> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('AGGREGATING ALL DATA');
  console.log(`${'═'.repeat(60)}\n`);

  const projectRoot = join(__dirname, '..');
  const csvFiles: string[] = [];

  // Find all company CSV files
  const files = readdirSync(projectRoot);
  for (const file of files) {
    if (file.endsWith('.csv') && (file.includes('compan') || SCRAPERS.some(s => s.outputFile === file))) {
      csvFiles.push(join(projectRoot, file));
    }
  }

  console.log(`Found ${csvFiles.length} CSV files to aggregate:`);
  csvFiles.forEach(f => console.log(`  - ${basename(f)}`));

  // Run the aggregator
  return new Promise((resolve) => {
    const args = ['tsx', 'src/services/company-aggregator.service.ts', ...csvFiles];
    const process = spawn('npx', args, {
      stdio: 'inherit',
      shell: true,
      cwd: projectRoot,
    });

    process.on('close', () => {
      resolve();
    });
  });
}

/**
 * Show summary statistics
 */
function showStats(): void {
  const companiesFile = join(__dirname, 'data/companies.json');
  if (!existsSync(companiesFile)) {
    console.log('No companies.json found');
    return;
  }

  const data = JSON.parse(readFileSync(companiesFile, 'utf-8'));
  let total = 0;
  const byCategory: Record<string, number> = {};
  const byRegion: Record<string, number> = {};

  const companiesData = data.companies || data;
  for (const region of Object.keys(companiesData)) {
    if (typeof companiesData[region] !== 'object') continue;
    byRegion[region] = 0;

    for (const category of Object.keys(companiesData[region])) {
      if (!Array.isArray(companiesData[region][category])) continue;
      const count = companiesData[region][category].length;
      byRegion[region] += count;
      byCategory[category] = (byCategory[category] || 0) + count;
      total += count;
    }
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    FINAL STATISTICS                            ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Companies: ${String(total).padEnd(42)}║
╠═══════════════════════════════════════════════════════════════╣`);

  console.log('║  By Region:');
  for (const [region, count] of Object.entries(byRegion)) {
    console.log(`║    ${region.padEnd(20)} ${String(count).padStart(6)}`);
  }

  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║  By Category:');
  for (const [category, count] of Object.entries(byCategory)) {
    console.log(`║    ${category.padEnd(20)} ${String(count).padStart(6)}`);
  }

  console.log('╚═══════════════════════════════════════════════════════════════╝');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           MASTER COMPANY SCRAPER - AHMEDABAD IT                ║
╠═══════════════════════════════════════════════════════════════╣
║  Target: 3700+ IT companies                                    ║
║  Sources: Clutch, GoodFirms, JustDial, AmbitionBox, Glassdoor  ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Determine which scrapers to run
  let scrapersToRun = SCRAPERS;

  if (args.includes('--quick')) {
    scrapersToRun = SCRAPERS.filter(s => s.difficulty === 'easy');
    console.log('Running quick mode (easy scrapers only)\n');
  } else if (args.includes('--source')) {
    const sourceIdx = args.indexOf('--source');
    const sourceName = args[sourceIdx + 1]?.toLowerCase();
    scrapersToRun = SCRAPERS.filter(s => s.name.toLowerCase().includes(sourceName));
    if (scrapersToRun.length === 0) {
      console.error(`Unknown source: ${sourceName}`);
      console.log('Available sources:', SCRAPERS.map(s => s.name).join(', '));
      process.exit(1);
    }
  } else if (args.includes('--aggregate-only')) {
    console.log('Aggregating existing CSV files only...\n');
    await aggregateAll();
    showStats();
    return;
  }

  // Show plan
  console.log('Scrapers to run:');
  let expectedTotal = 0;
  for (const s of scrapersToRun) {
    console.log(`  ${s.name.padEnd(15)} ~${s.expectedCompanies} companies (${s.difficulty})`);
    expectedTotal += s.expectedCompanies;
  }
  console.log(`\nExpected total (before dedup): ~${expectedTotal} companies`);
  console.log('Estimated unique after dedup: ~' + Math.floor(expectedTotal * 0.6));

  // Run scrapers
  const results: { name: string; success: boolean; companies: number }[] = [];

  for (const scraper of scrapersToRun) {
    const result = await runScraper(scraper);
    results.push({ name: scraper.name, ...result });
  }

  // Show scraper results
  console.log(`\n${'═'.repeat(60)}`);
  console.log('SCRAPER RESULTS');
  console.log(`${'═'.repeat(60)}`);

  let totalScraped = 0;
  for (const r of results) {
    const status = r.success ? '✓' : '✗';
    console.log(`  ${status} ${r.name.padEnd(15)} ${r.companies} companies`);
    totalScraped += r.companies;
  }
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Total scraped: ${totalScraped} companies`);

  // Aggregate
  await aggregateAll();

  // Show final stats
  showStats();

  console.log(`
Next steps:
1. View companies: http://localhost:3456/companies
2. Export for review: npm run aggregate -- --export all-companies.csv
3. Monitor careers: npm run monitor
  `);
}

main().catch(console.error);
