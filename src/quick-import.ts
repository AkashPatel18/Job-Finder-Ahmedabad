#!/usr/bin/env tsx
/**
 * QUICK IMPORT - Paste company data directly
 *
 * Usage:
 *   npm run quick-import
 *
 * Accepts multiple formats:
 * - Simple text (one company per line)
 * - CSV format
 * - JSON format
 * - Tab-separated data (from spreadsheets)
 */

import * as readline from 'readline';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const companiesFile = join(__dirname, 'data/companies.json');

interface Company {
  name: string;
  careers: string;
  specialty: string;
  source: string;
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(private|pvt|limited|ltd|llp|inc|corp|technologies|tech|solutions|infotech|software|services)\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function generateCareersUrl(name: string): string {
  const searchQuery = encodeURIComponent(`${name} careers Ahmedabad`);
  return `https://www.google.com/search?q=${searchQuery}`;
}

function parseInput(input: string): Company[] {
  const companies: Company[] = [];
  const lines = input.trim().split('\n').filter(line => line.trim());

  // Detect format
  const firstLine = lines[0]?.trim() || '';

  // Check if JSON array
  if (input.trim().startsWith('[')) {
    try {
      const jsonData = JSON.parse(input);
      for (const item of jsonData) {
        if (item.name || item.company || item.companyName) {
          companies.push({
            name: item.name || item.company || item.companyName,
            careers: item.careers || item.careers_url || item.careersUrl || generateCareersUrl(item.name),
            specialty: item.specialty || item.domain || item.industry || 'IT Services',
            source: 'quick-import-json'
          });
        }
      }
      return companies;
    } catch (e) {
      // Not valid JSON, continue with other formats
    }
  }

  // Check if CSV header
  const isCSV = firstLine.toLowerCase().includes('name') && firstLine.includes(',');
  const isTSV = firstLine.includes('\t');

  const startIndex = isCSV ? 1 : 0;
  const delimiter = isTSV ? '\t' : ',';

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Try to parse as CSV/TSV
    const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));

    if (parts.length >= 1 && parts[0]) {
      const name = parts[0]
        .replace(/^\d+[\.\)]\s*/, '') // Remove leading numbers
        .replace(/\s+/g, ' ')
        .trim();

      if (name.length < 2) continue;

      // Skip common non-company strings
      if (/^(page|next|prev|login|menu|home|search|\d+)$/i.test(name)) continue;

      companies.push({
        name,
        careers: parts[1] || generateCareersUrl(name),
        specialty: parts[2] || 'IT Services',
        source: 'quick-import'
      });
    }
  }

  return companies;
}

function loadExistingCompanies(): Set<string> {
  const existing = new Set<string>();

  if (existsSync(companiesFile)) {
    const data = JSON.parse(readFileSync(companiesFile, 'utf-8'));
    const companiesData = data.companies || data;

    for (const region of Object.keys(companiesData)) {
      if (typeof companiesData[region] !== 'object') continue;
      for (const category of Object.keys(companiesData[region])) {
        const categoryData = companiesData[region][category];
        if (Array.isArray(categoryData)) {
          for (const company of categoryData) {
            if (company.name) {
              existing.add(normalizeCompanyName(company.name));
            }
          }
        }
      }
    }
  }

  return existing;
}

function saveCompanies(newCompanies: Company[]): number {
  let data: any;

  if (existsSync(companiesFile)) {
    data = JSON.parse(readFileSync(companiesFile, 'utf-8'));
  } else {
    data = {
      lastUpdated: new Date().toISOString(),
      companies: { ahmedabad: { imported: [] } }
    };
  }

  if (!data.companies) data.companies = {};
  if (!data.companies.ahmedabad) data.companies.ahmedabad = {};
  if (!data.companies.ahmedabad.imported) data.companies.ahmedabad.imported = [];

  for (const company of newCompanies) {
    data.companies.ahmedabad.imported.push({
      name: company.name,
      careers: company.careers,
      specialty: company.specialty,
      source: company.source,
      addedAt: new Date().toISOString()
    });
  }

  data.lastUpdated = new Date().toISOString();
  writeFileSync(companiesFile, JSON.stringify(data, null, 2));

  return newCompanies.length;
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    QUICK COMPANY IMPORT                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Paste company data in any format:                             ║
║  - One company name per line                                   ║
║  - CSV: name,careers_url,specialty                             ║
║  - Tab-separated (from Excel/Sheets)                           ║
║  - JSON array                                                  ║
║                                                                ║
║  Press Enter twice when done, or Ctrl+C to cancel              ║
╚═══════════════════════════════════════════════════════════════╝
`);

  const existing = loadExistingCompanies();
  console.log(`Currently have ${existing.size} companies in database.\n`);
  console.log('Paste your data now:\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const lines: string[] = [];
  let emptyLineCount = 0;

  rl.on('line', (line: string) => {
    if (line.trim() === '') {
      emptyLineCount++;
      if (emptyLineCount >= 2) {
        rl.close();
      }
    } else {
      emptyLineCount = 0;
      lines.push(line);
    }
  });

  rl.on('close', () => {
    const input = lines.join('\n');

    if (!input.trim()) {
      console.log('No input received. Exiting.');
      process.exit(0);
    }

    console.log('\nProcessing...\n');

    const parsed = parseInput(input);
    console.log(`Parsed ${parsed.length} companies from input`);

    // Deduplicate
    const newCompanies: Company[] = [];
    let duplicates = 0;

    for (const company of parsed) {
      const key = normalizeCompanyName(company.name);
      if (existing.has(key)) {
        duplicates++;
      } else {
        newCompanies.push(company);
        existing.add(key);
      }
    }

    console.log(`Duplicates skipped: ${duplicates}`);
    console.log(`New companies: ${newCompanies.length}`);

    if (newCompanies.length > 0) {
      const saved = saveCompanies(newCompanies);
      console.log(`\n✓ Saved ${saved} new companies!`);
      console.log(`Total in database: ${existing.size}`);

      console.log('\nNew companies added:');
      for (const company of newCompanies.slice(0, 10)) {
        console.log(`  - ${company.name}`);
      }
      if (newCompanies.length > 10) {
        console.log(`  ... and ${newCompanies.length - 10} more`);
      }
    } else {
      console.log('\nNo new companies to add.');
    }
  });
}

main().catch(console.error);
