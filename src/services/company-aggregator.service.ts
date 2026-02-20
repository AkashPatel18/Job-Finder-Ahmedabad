/**
 * COMPANY AGGREGATOR SERVICE
 *
 * A robust solution for aggregating company data from multiple sources:
 * - CSV/JSON file imports
 * - Glassdoor scraper
 * - User-provided data
 * - MCA (Ministry of Corporate Affairs) public data
 * - GitHub organization profiles
 *
 * This service handles deduplication, validation, and career URL discovery.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RawCompanyData {
  name: string;
  careers_url?: string;
  specialty?: string;
  rating?: string;
  employees?: string;
  location?: string;
  website?: string;
  source?: string;
}

interface NormalizedCompany {
  name: string;
  careersUrl: string;
  specialty: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

interface AggregationResult {
  totalProcessed: number;
  newCompanies: number;
  duplicatesSkipped: number;
  companiesWithUrls: number;
  companiesNeedingUrls: number;
}

class CompanyAggregatorService {
  private dataDir: string;
  private companiesFile: string;
  private existingCompanies: Map<string, any> = new Map();

  constructor() {
    this.dataDir = join(__dirname, '../data');
    this.companiesFile = join(this.dataDir, 'companies.json');
    this.loadExistingCompanies();
  }

  /**
   * Load existing companies from companies.json
   */
  private loadExistingCompanies(): void {
    if (existsSync(this.companiesFile)) {
      const data = JSON.parse(readFileSync(this.companiesFile, 'utf-8'));

      // Companies are nested under data.companies.region.category
      const companiesData = data.companies || data;

      for (const region of Object.keys(companiesData)) {
        if (typeof companiesData[region] !== 'object') continue;

        for (const category of Object.keys(companiesData[region])) {
          const companies = companiesData[region][category];
          if (Array.isArray(companies)) {
            for (const company of companies) {
              if (company.name) {
                const key = this.normalizeCompanyName(company.name);
                this.existingCompanies.set(key, company);
              }
            }
          }
        }
      }
    }
    console.log(`Loaded ${this.existingCompanies.size} existing companies`);
  }

  /**
   * Normalize company name for deduplication
   */
  private normalizeCompanyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+(private|pvt|limited|ltd|llp|inc|corp|corporation|technologies|tech|solutions|infotech|infosystems|software|services)\.?/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Generate careers URL from company name and website
   */
  private generateCareersUrl(name: string, website?: string): string {
    if (website) {
      // Clean up website URL
      let baseUrl = website.replace(/\/$/, '');
      if (!baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
      }
      return `${baseUrl}/careers`;
    }

    // Generate search URL as fallback
    const searchQuery = encodeURIComponent(`${name} careers Ahmedabad`);
    return `https://www.google.com/search?q=${searchQuery}`;
  }

  /**
   * Parse CSV file
   */
  parseCSV(filePath: string): RawCompanyData[] {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const companies: RawCompanyData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === 0 || !values[0]) continue;

      const company: RawCompanyData = {
        name: '',
        source: basename(filePath, extname(filePath))
      };

      headers.forEach((header, index) => {
        const value = values[index]?.trim() || '';

        switch (header) {
          case 'name':
          case 'company':
          case 'company_name':
          case 'companyname':
            company.name = value;
            break;
          case 'careers_url':
          case 'careersurl':
          case 'careers':
          case 'url':
            company.careers_url = value;
            break;
          case 'specialty':
          case 'domain':
          case 'industry':
          case 'type':
            company.specialty = value;
            break;
          case 'rating':
            company.rating = value;
            break;
          case 'employees':
          case 'size':
          case 'employee_count':
            company.employees = value;
            break;
          case 'location':
          case 'city':
            company.location = value;
            break;
          case 'website':
          case 'site':
            company.website = value;
            break;
        }
      });

      if (company.name && company.name.length > 1) {
        companies.push(company);
      }
    }

    return companies;
  }

  /**
   * Parse CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return values;
  }

  /**
   * Parse JSON file
   */
  parseJSON(filePath: string): RawCompanyData[] {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Handle array of companies
    if (Array.isArray(data)) {
      return data.map(item => ({
        name: item.name || item.company || item.companyName || '',
        careers_url: item.careers_url || item.careersUrl || item.url || '',
        specialty: item.specialty || item.domain || item.industry || '',
        rating: item.rating || '',
        employees: item.employees || item.size || '',
        website: item.website || '',
        source: basename(filePath, extname(filePath))
      })).filter(c => c.name);
    }

    // Handle object with categories
    const companies: RawCompanyData[] = [];
    for (const category of Object.keys(data)) {
      if (Array.isArray(data[category])) {
        for (const item of data[category]) {
          if (item.name) {
            companies.push({
              name: item.name,
              careers_url: item.careersUrl || item.careers_url || '',
              specialty: item.specialty || '',
              source: `${basename(filePath, extname(filePath))}:${category}`
            });
          }
        }
      }
    }

    return companies;
  }

  /**
   * Parse plain text file (one company per line)
   */
  parseText(filePath: string): RawCompanyData[] {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    return lines
      .map(line => line.trim())
      .filter(line => line.length > 1 && !line.startsWith('#'))
      .map(name => ({
        name,
        source: basename(filePath, extname(filePath))
      }));
  }

  /**
   * Import companies from a file
   */
  importFromFile(filePath: string): RawCompanyData[] {
    const ext = extname(filePath).toLowerCase();

    switch (ext) {
      case '.csv':
        return this.parseCSV(filePath);
      case '.json':
        return this.parseJSON(filePath);
      case '.txt':
        return this.parseText(filePath);
      default:
        console.warn(`Unknown file type: ${ext}`);
        return [];
    }
  }

  /**
   * Scan data directory for importable files
   */
  scanForDataFiles(): string[] {
    const projectRoot = join(__dirname, '../..');
    const files: string[] = [];

    // Scan project root for CSV/JSON files
    const rootFiles = readdirSync(projectRoot);
    for (const file of rootFiles) {
      const ext = extname(file).toLowerCase();
      if (['.csv', '.json'].includes(ext) && file.includes('compan')) {
        files.push(join(projectRoot, file));
      }
    }

    // Scan data directory
    if (existsSync(this.dataDir)) {
      const dataFiles = readdirSync(this.dataDir);
      for (const file of dataFiles) {
        const ext = extname(file).toLowerCase();
        if (['.csv', '.json', '.txt'].includes(ext)) {
          files.push(join(this.dataDir, file));
        }
      }
    }

    return files;
  }

  /**
   * Normalize and validate company data
   */
  normalizeCompany(raw: RawCompanyData): NormalizedCompany | null {
    if (!raw.name || raw.name.length < 2) return null;

    // Clean up company name
    let name = raw.name
      .replace(/^\d+\.\s*/, '') // Remove leading numbers
      .replace(/\s+/g, ' ')
      .trim();

    // Skip invalid names
    if (name.length < 2 || /^[0-9]+$/.test(name)) return null;

    // Skip common non-company strings
    const skipPatterns = [
      /^(the|a|an|in|at|for|and|or|with)$/i,
      /^(page|next|prev|back|home|menu|search|login)$/i,
      /employees$/i,
      /^\d+\s*(to|-)\s*\d+$/i,
    ];

    if (skipPatterns.some(p => p.test(name))) return null;

    // Determine confidence based on data quality
    let confidence: 'high' | 'medium' | 'low' = 'low';

    if (raw.careers_url && raw.careers_url.includes('careers')) {
      confidence = 'high';
    } else if (raw.website || raw.rating || raw.employees) {
      confidence = 'medium';
    }

    // Generate careers URL
    const careersUrl = raw.careers_url && raw.careers_url.length > 10
      ? raw.careers_url
      : this.generateCareersUrl(name, raw.website);

    return {
      name,
      careersUrl,
      specialty: raw.specialty || 'IT Services',
      source: raw.source || 'unknown',
      confidence
    };
  }

  /**
   * Aggregate companies from multiple sources
   */
  async aggregateAll(sources: string[] = []): Promise<AggregationResult> {
    const allFiles = sources.length > 0 ? sources : this.scanForDataFiles();

    console.log(`\nFound ${allFiles.length} data files to process`);

    const newCompanies: NormalizedCompany[] = [];
    let totalProcessed = 0;
    let duplicatesSkipped = 0;

    for (const file of allFiles) {
      console.log(`\nProcessing: ${basename(file)}`);

      try {
        const raw = this.importFromFile(file);
        console.log(`  - Found ${raw.length} entries`);

        for (const company of raw) {
          totalProcessed++;

          const normalized = this.normalizeCompany(company);
          if (!normalized) continue;

          const key = this.normalizeCompanyName(normalized.name);

          // Check for duplicates
          if (this.existingCompanies.has(key)) {
            duplicatesSkipped++;
            continue;
          }

          // Check if already in new companies
          const existsInNew = newCompanies.some(
            c => this.normalizeCompanyName(c.name) === key
          );
          if (existsInNew) {
            duplicatesSkipped++;
            continue;
          }

          newCompanies.push(normalized);
          this.existingCompanies.set(key, normalized);
        }
      } catch (error) {
        console.error(`  Error processing ${file}:`, error);
      }
    }

    // Save new companies
    if (newCompanies.length > 0) {
      await this.saveNewCompanies(newCompanies);
    }

    const companiesWithUrls = newCompanies.filter(
      c => !c.careersUrl.includes('google.com/search')
    ).length;

    return {
      totalProcessed,
      newCompanies: newCompanies.length,
      duplicatesSkipped,
      companiesWithUrls,
      companiesNeedingUrls: newCompanies.length - companiesWithUrls
    };
  }

  /**
   * Save new companies to companies.json
   */
  private async saveNewCompanies(companies: NormalizedCompany[]): Promise<void> {
    let data: any = {
      lastUpdated: new Date().toISOString(),
      source: 'Aggregated Data',
      companies: {
        ahmedabad: { imported: [] }
      }
    };

    if (existsSync(this.companiesFile)) {
      data = JSON.parse(readFileSync(this.companiesFile, 'utf-8'));
    }

    // Ensure companies.ahmedabad.imported exists
    if (!data.companies) {
      data.companies = {};
    }
    if (!data.companies.ahmedabad) {
      data.companies.ahmedabad = {};
    }
    if (!data.companies.ahmedabad.imported) {
      data.companies.ahmedabad.imported = [];
    }

    // Add new companies
    for (const company of companies) {
      data.companies.ahmedabad.imported.push({
        name: company.name,
        careers: company.careersUrl,
        specialty: company.specialty,
        source: company.source,
        addedAt: new Date().toISOString()
      });
    }

    // Update metadata
    let total = 0;
    const companiesData = data.companies || {};
    for (const region of Object.keys(companiesData)) {
      const regionData = companiesData[region];
      if (typeof regionData !== 'object') continue;
      for (const category of Object.keys(regionData)) {
        if (Array.isArray(regionData[category])) {
          total += regionData[category].length;
        }
      }
    }
    data.lastUpdated = new Date().toISOString();

    writeFileSync(this.companiesFile, JSON.stringify(data, null, 2));
    console.log(`\nSaved ${companies.length} new companies. Total: ${total}`);
  }

  /**
   * Export all companies to CSV for review
   */
  exportToCSV(outputPath: string): number {
    const data = JSON.parse(readFileSync(this.companiesFile, 'utf-8'));
    const companiesData = data.companies || data;
    const lines = ['name,careers_url,specialty,category,region'];

    for (const region of Object.keys(companiesData)) {
      if (typeof companiesData[region] !== 'object') continue;
      const regionData = companiesData[region];

      for (const category of Object.keys(regionData)) {
        if (!Array.isArray(regionData[category])) continue;

        for (const company of regionData[category]) {
          const name = (company.name || '').replace(/,/g, ';');
          const url = company.careers || company.careersUrl || '';
          const specialty = (company.specialty || '').replace(/,/g, ';');
          lines.push(`${name},${url},${specialty},${category},${region}`);
        }
      }
    }

    writeFileSync(outputPath, lines.join('\n'));
    return lines.length - 1;
  }

  /**
   * Get statistics about current company data
   */
  getStats(): {
    total: number;
    byRegion: Record<string, number>;
    byCategory: Record<string, number>;
    withCareersUrl: number;
    needingUrls: number;
  } {
    const data = JSON.parse(readFileSync(this.companiesFile, 'utf-8'));
    const companiesData = data.companies || data;

    const stats = {
      total: 0,
      byRegion: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      withCareersUrl: 0,
      needingUrls: 0
    };

    for (const region of Object.keys(companiesData)) {
      if (typeof companiesData[region] !== 'object') continue;

      stats.byRegion[region] = 0;
      const regionData = companiesData[region];

      for (const category of Object.keys(regionData)) {
        if (!Array.isArray(regionData[category])) continue;

        const count = regionData[category].length;
        stats.byRegion[region] += count;
        stats.byCategory[category] = (stats.byCategory[category] || 0) + count;
        stats.total += count;

        for (const company of regionData[category]) {
          // Check careers or careersUrl field
          const careersUrl = company.careers || company.careersUrl || '';
          if (careersUrl && !careersUrl.includes('google.com/search')) {
            stats.withCareersUrl++;
          } else {
            stats.needingUrls++;
          }
        }
      }
    }

    return stats;
  }
}

export const companyAggregator = new CompanyAggregatorService();

// CLI Runner
async function main() {
  const args = process.argv.slice(2);

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              COMPANY AGGREGATOR SERVICE                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Aggregate company data from multiple sources                  ║
║  Supports: CSV, JSON, TXT files                                ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  if (args.includes('--stats')) {
    const stats = companyAggregator.getStats();
    console.log('\n📊 Current Statistics:');
    console.log(`   Total companies: ${stats.total}`);
    console.log(`   With careers URL: ${stats.withCareersUrl}`);
    console.log(`   Needing URLs: ${stats.needingUrls}`);
    console.log('\n   By Region:');
    for (const [region, count] of Object.entries(stats.byRegion)) {
      console.log(`     - ${region}: ${count}`);
    }
    console.log('\n   By Category:');
    for (const [category, count] of Object.entries(stats.byCategory)) {
      console.log(`     - ${category}: ${count}`);
    }
    return;
  }

  if (args.includes('--export')) {
    const outputPath = args[args.indexOf('--export') + 1] || 'all-companies-export.csv';
    const count = companyAggregator.exportToCSV(outputPath);
    console.log(`Exported ${count} companies to ${outputPath}`);
    return;
  }

  if (args.includes('--scan')) {
    const files = companyAggregator.scanForDataFiles();
    console.log('\n📁 Found data files:');
    for (const file of files) {
      console.log(`   - ${file}`);
    }
    return;
  }

  // Default: aggregate all
  const sources = args.filter(a => !a.startsWith('--'));
  const result = await companyAggregator.aggregateAll(sources);

  console.log('\n📈 Aggregation Results:');
  console.log(`   Total processed: ${result.totalProcessed}`);
  console.log(`   New companies: ${result.newCompanies}`);
  console.log(`   Duplicates skipped: ${result.duplicatesSkipped}`);
  console.log(`   With careers URL: ${result.companiesWithUrls}`);
  console.log(`   Needing URLs: ${result.companiesNeedingUrls}`);

  const stats = companyAggregator.getStats();
  console.log(`\n   Total in database: ${stats.total}`);
}

// Run if called directly
main().catch(console.error);
