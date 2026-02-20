/**
 * COMPANY IMPORTER CLI
 *
 * Import companies from a CSV file or text list.
 * Much more reliable than web scraping protected directories.
 *
 * Usage:
 *   npm run import:companies companies.csv           # Import from CSV
 *   npm run import:companies companies.txt           # Import from text (one per line)
 *   npm run import:companies -- --interactive        # Interactive mode
 *
 * CSV Format:
 *   name,careers_url,specialty
 *   TCS,https://www.tcs.com/careers,IT Services
 *   Simform,https://simformsolutions.freshteam.com/jobs,Custom Software
 *
 * Text Format (one company name per line):
 *   TCS
 *   Simform
 *   Azilen Technologies
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline';
import { logger } from './services/logger.service.js';
import { config } from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ImportedCompany {
  name: string;
  careers?: string;
  specialty?: string;
  employees?: string;
  linkedin?: string;
  type?: string;
}

async function findCareerPage(companyName: string): Promise<string> {
  // Generate a Google search URL as fallback
  return `https://www.google.com/search?q=${encodeURIComponent(companyName + ' careers Ahmedabad')}`;
}

async function importFromCSV(filePath: string): Promise<ImportedCompany[]> {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const companies: ImportedCompany[] = [];

  // Skip header if present
  const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());
    if (parts[0]) {
      companies.push({
        name: parts[0],
        careers: parts[1] || undefined,
        specialty: parts[2] || undefined,
        employees: parts[3] || undefined,
      });
    }
  }

  return companies;
}

async function importFromText(filePath: string): Promise<ImportedCompany[]> {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const companies: ImportedCompany[] = [];

  for (const line of lines) {
    const name = line.trim();
    if (name && !name.startsWith('#')) {
      companies.push({ name });
    }
  }

  return companies;
}

async function interactiveImport(): Promise<ImportedCompany[]> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\nEnter company names (one per line). Type "done" when finished:\n');

  const companies: ImportedCompany[] = [];

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      const name = line.trim();
      if (name.toLowerCase() === 'done') {
        rl.close();
        resolve(companies);
      } else if (name && !name.startsWith('#')) {
        companies.push({ name });
        console.log(`  Added: ${name}`);
      }
    });
  });
}

async function saveCompanies(companies: ImportedCompany[]): Promise<number> {
  const companiesPath = join(__dirname, 'data/companies.json');

  const data = JSON.parse(readFileSync(companiesPath, 'utf-8'));

  // Get existing names
  const existingNames = new Set<string>();
  for (const city of ['ahmedabad', 'gandhinagar']) {
    if (data.companies[city]) {
      for (const category of Object.values(data.companies[city]) as any[]) {
        for (const company of category) {
          existingNames.add(company.name.toLowerCase());
        }
      }
    }
  }

  // Filter new
  const newCompanies = companies.filter(c =>
    !existingNames.has(c.name.toLowerCase())
  );

  if (newCompanies.length === 0) {
    console.log('No new companies to add (all already exist)');
    return 0;
  }

  // Create imported category
  if (!data.companies.ahmedabad.imported) {
    data.companies.ahmedabad.imported = [];
  }

  for (const company of newCompanies) {
    const careerUrl = company.careers || await findCareerPage(company.name);

    data.companies.ahmedabad.imported.push({
      name: company.name,
      type: company.type || 'Imported',
      employees: company.employees || 'Unknown',
      specialty: company.specialty || 'IT Services',
      careers: careerUrl,
      linkedin: company.linkedin || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company.name)}`,
      importedAt: new Date().toISOString()
    });
  }

  // Update file
  data.lastUpdated = new Date().toISOString().split('T')[0];
  writeFileSync(companiesPath, JSON.stringify(data, null, 2));

  return newCompanies.length;
}

async function main() {
  const args = process.argv.slice(2);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   COMPANY IMPORTER                             ║
╠═══════════════════════════════════════════════════════════════╣
║  Import companies from CSV, text file, or interactively        ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  try {
    let companies: ImportedCompany[] = [];

    if (args.includes('--interactive') || args.includes('-i')) {
      companies = await interactiveImport();
    } else if (args.length > 0 && !args[0].startsWith('-')) {
      const filePath = args[0];

      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        console.log('\nUsage:');
        console.log('  npm run import:companies companies.csv');
        console.log('  npm run import:companies companies.txt');
        console.log('  npm run import:companies -- --interactive');
        process.exit(1);
      }

      if (filePath.endsWith('.csv')) {
        console.log(`Importing from CSV: ${filePath}\n`);
        companies = await importFromCSV(filePath);
      } else {
        console.log(`Importing from text file: ${filePath}\n`);
        companies = await importFromText(filePath);
      }
    } else {
      console.log('Usage:');
      console.log('  npm run import:companies companies.csv     # Import from CSV');
      console.log('  npm run import:companies companies.txt     # Import from text file');
      console.log('  npm run import:companies -- -i             # Interactive mode');
      console.log('\nCSV Format: name,careers_url,specialty');
      console.log('Text Format: One company name per line');
      return;
    }

    console.log(`\nFound ${companies.length} companies to import`);

    const added = await saveCompanies(companies);

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   IMPORT COMPLETE                              ║
╠═══════════════════════════════════════════════════════════════╣
║  Companies Processed: ${String(companies.length).padEnd(39)}║
║  New Companies Added: ${String(added).padEnd(40)}║
╚═══════════════════════════════════════════════════════════════╝

Run 'npm run monitor' to scan their career pages for jobs.
    `);

  } catch (error) {
    logger.error('Import failed:', error);
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
