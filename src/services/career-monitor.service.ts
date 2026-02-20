/**
 * CAREER PAGE MONITOR SERVICE
 *
 * Monitors company career pages directly for new job postings.
 * This bypasses job boards and gets jobs directly from the source.
 *
 * Features:
 * - Fetches company career pages
 * - Uses AI (Groq) to extract job listings
 * - Detects new jobs by comparing with database
 * - Generates application data for each job
 * - Notifies via Telegram
 */

import { prisma } from '../database/index.js';
import { logger } from './logger.service.js';
import { aiMatcherService } from './ai-matcher.service.js';
import { messageGeneratorService } from './message-generator.service.js';
import { notificationService } from './notification.service.js';
import { config } from '../config/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Company {
  name: string;
  type: string;
  employees?: string;
  specialty?: string;
  careers: string;
  linkedin?: string;
  city: string;
}

interface ExtractedJob {
  title: string;
  location?: string;
  type?: string;
  experience?: string;
  skills?: string[];
  description?: string;
  applyUrl?: string;
}

interface MonitorResult {
  company: string;
  careersUrl: string;
  jobsFound: number;
  newJobs: number;
  error?: string;
}

class CareerMonitorService {
  private companies: Company[] = [];
  private groqApiKey: string;
  private isInitialized = false;

  constructor() {
    this.groqApiKey = config.ai.groq.apiKey || '';
  }

  /**
   * Initialize the monitor by loading companies
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const companiesPath = join(__dirname, '../data/companies.json');
      const data = JSON.parse(readFileSync(companiesPath, 'utf-8'));

      this.companies = [];

      // Load Ahmedabad companies
      for (const [category, companies] of Object.entries(data.companies.ahmedabad)) {
        for (const company of companies as any[]) {
          if (company.careers) {
            this.companies.push({
              ...company,
              city: 'Ahmedabad'
            });
          }
        }
      }

      // Load Gandhinagar companies
      for (const [category, companies] of Object.entries(data.companies.gandhinagar)) {
        for (const company of companies as any[]) {
          if (company.careers) {
            this.companies.push({
              ...company,
              city: 'Gandhinagar'
            });
          }
        }
      }

      this.isInitialized = true;
      logger.info(`Career Monitor initialized with ${this.companies.length} companies`);
    } catch (error) {
      logger.error('Failed to initialize Career Monitor:', error);
      throw error;
    }
  }

  /**
   * Monitor all company career pages
   */
  async monitorAll(): Promise<{ total: number; newJobs: number; errors: number }> {
    await this.initialize();

    logger.info(`Starting career page monitoring for ${this.companies.length} companies...`);

    let totalJobs = 0;
    let totalNewJobs = 0;
    let errorCount = 0;

    const results: MonitorResult[] = [];

    for (const company of this.companies) {
      try {
        const result = await this.monitorCompany(company);
        results.push(result);

        totalJobs += result.jobsFound;
        totalNewJobs += result.newJobs;

        if (result.error) {
          errorCount++;
        }

        // Rate limiting - wait between requests
        await this.delay(1500);
      } catch (error) {
        logger.error(`Error monitoring ${company.name}:`, error);
        errorCount++;
        results.push({
          company: company.name,
          careersUrl: company.careers,
          jobsFound: 0,
          newJobs: 0,
          error: String(error)
        });
      }
    }

    // Log summary
    logger.info(`Career monitoring complete: ${totalJobs} jobs found, ${totalNewJobs} new, ${errorCount} errors`);

    // Send summary notification
    if (totalNewJobs > 0) {
      await notificationService.notifyNewJob({
        title: `${totalNewJobs} New Jobs from Career Pages`,
        company: 'Multiple Companies',
        location: 'Ahmedabad/Gandhinagar',
        platform: 'Career Monitor',
        matchScore: 0.9,
        url: 'http://localhost:3456'
      });
    }

    return { total: totalJobs, newJobs: totalNewJobs, errors: errorCount };
  }

  /**
   * Monitor a single company's career page
   */
  async monitorCompany(company: Company): Promise<MonitorResult> {
    logger.info(`Monitoring: ${company.name} - ${company.careers}`);

    try {
      // Fetch career page
      const pageContent = await this.fetchCareerPage(company.careers);

      if (!pageContent) {
        return {
          company: company.name,
          careersUrl: company.careers,
          jobsFound: 0,
          newJobs: 0,
          error: 'Failed to fetch page'
        };
      }

      // Extract jobs using AI
      const extractedJobs = await this.extractJobsWithAI(pageContent, company);

      logger.info(`${company.name}: Found ${extractedJobs.length} jobs`);

      // Save new jobs to database
      let newJobCount = 0;
      for (const job of extractedJobs) {
        const isNew = await this.saveJob(job, company);
        if (isNew) newJobCount++;
      }

      return {
        company: company.name,
        careersUrl: company.careers,
        jobsFound: extractedJobs.length,
        newJobs: newJobCount
      };
    } catch (error) {
      logger.error(`Error monitoring ${company.name}:`, error);
      return {
        company: company.name,
        careersUrl: company.careers,
        jobsFound: 0,
        newJobs: 0,
        error: String(error)
      };
    }
  }

  /**
   * Fetch a career page
   */
  private async fetchCareerPage(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn(`Failed to fetch ${url}: ${response.status}`);
        return null;
      }

      const html = await response.text();

      // Extract text content (strip HTML tags for AI processing)
      const textContent = this.extractTextFromHTML(html);

      // Limit content size for AI processing
      return textContent.slice(0, 15000);
    } catch (error) {
      logger.error(`Fetch error for ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract text from HTML
   */
  private extractTextFromHTML(html: string): string {
    return html
      // Remove scripts and styles
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove HTML tags but keep content
      .replace(/<[^>]+>/g, ' ')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract jobs from page content using AI
   */
  private async extractJobsWithAI(content: string, company: Company): Promise<ExtractedJob[]> {
    if (!this.groqApiKey) {
      logger.warn('Groq API key not configured, using fallback extraction');
      return this.fallbackExtraction(content, company);
    }

    try {
      const prompt = `You are a job listing extractor. Analyze this career page content and extract all job listings.

Company: ${company.name}
Location: ${company.city}, Gujarat, India

Page Content:
${content}

Extract ALL job listings found. For each job, provide:
- title: Job title
- location: Job location (if mentioned, otherwise use "${company.city}")
- type: Job type (Full-time, Part-time, Contract, Remote, etc.)
- experience: Required experience
- skills: Array of required skills
- description: Brief description

Return a JSON array of jobs. If no jobs found, return empty array [].
Only return valid JSON, no other text.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || '[]';

      // Parse JSON from response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const jobs = JSON.parse(jsonMatch[0]);
        return jobs.filter((job: any) => job.title);
      }

      return [];
    } catch (error) {
      logger.error('AI extraction failed:', error);
      return this.fallbackExtraction(content, company);
    }
  }

  /**
   * Fallback extraction using regex patterns
   */
  private fallbackExtraction(content: string, company: Company): ExtractedJob[] {
    const jobs: ExtractedJob[] = [];

    // Common job title patterns
    const titlePatterns = [
      /(?:hiring|opening|position|role|job)[:\s]+([A-Za-z\s]+(?:Developer|Engineer|Designer|Manager|Analyst|Lead|Architect))/gi,
      /((?:Senior|Junior|Lead|Staff|Principal)?\s*(?:Software|Full Stack|Frontend|Backend|DevOps|QA|Data|ML|AI)\s*(?:Developer|Engineer))/gi,
      /((?:React|Node|Python|Java|Angular|Vue|AWS|Cloud)\s*Developer)/gi
    ];

    const foundTitles = new Set<string>();

    for (const pattern of titlePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const title = match[1].trim();
        if (title.length > 5 && title.length < 60 && !foundTitles.has(title.toLowerCase())) {
          foundTitles.add(title.toLowerCase());
          jobs.push({
            title,
            location: company.city,
            applyUrl: company.careers
          });
        }
      }
    }

    return jobs;
  }

  /**
   * Save extracted job to database
   */
  private async saveJob(job: ExtractedJob, company: Company): Promise<boolean> {
    try {
      // Generate unique ID
      const externalId = `career_${this.hashString(company.name + job.title)}`;

      // Check if exists
      const existing = await prisma.job.findFirst({
        where: {
          OR: [
            { externalId },
            {
              companyName: company.name,
              title: job.title
            }
          ]
        }
      });

      if (existing) {
        return false;
      }

      // AI match scoring
      const matchResult = await aiMatcherService.matchJob({
        title: job.title,
        company: company.name,
        location: job.location || company.city,
        description: job.description || ''
      });

      // Generate messages
      const jobInfo = {
        title: job.title,
        companyName: company.name,
        location: job.location || company.city,
        description: job.description || ''
      };
      const messages = await messageGeneratorService.generateMessages(jobInfo);

      // Save to database
      await prisma.job.create({
        data: {
          platform: 'INDEED', // Using as generic platform for career page jobs
          externalId,
          title: job.title,
          companyName: company.name,
          location: job.location || company.city,
          jobType: this.mapJobType(job.type),
          experienceRange: job.experience,
          description: job.description,
          url: job.applyUrl || company.careers,
          skills: job.skills || [],
          aiMatchScore: matchResult.score,
          aiMatchReason: matchResult.reason,
          linkedinMessage: messages.linkedinMessage,
          applicationFormData: JSON.stringify(messages.formData),
          careerPageUrl: company.careers,
          isEasyApply: false
        }
      });

      logger.info(`Saved new job: ${job.title} at ${company.name}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save job ${job.title}:`, error);
      return false;
    }
  }

  /**
   * Map job type string to enum
   */
  private mapJobType(type?: string): 'REMOTE' | 'HYBRID' | 'ONSITE' | 'FULL_TIME' | null {
    if (!type) return null;
    const lower = type.toLowerCase();
    if (lower.includes('remote')) return 'REMOTE';
    if (lower.includes('hybrid')) return 'HYBRID';
    if (lower.includes('onsite') || lower.includes('office')) return 'ONSITE';
    if (lower.includes('full')) return 'FULL_TIME';
    return null;
  }

  /**
   * Simple string hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get list of monitored companies
   */
  async getCompanies(): Promise<Company[]> {
    await this.initialize();
    return this.companies;
  }

  /**
   * Monitor specific companies by name
   */
  async monitorByNames(names: string[]): Promise<MonitorResult[]> {
    await this.initialize();

    const results: MonitorResult[] = [];
    const nameLower = names.map(n => n.toLowerCase());

    const matchingCompanies = this.companies.filter(c =>
      nameLower.some(n => c.name.toLowerCase().includes(n))
    );

    for (const company of matchingCompanies) {
      const result = await this.monitorCompany(company);
      results.push(result);
      await this.delay(1000);
    }

    return results;
  }
}

export const careerMonitorService = new CareerMonitorService();
