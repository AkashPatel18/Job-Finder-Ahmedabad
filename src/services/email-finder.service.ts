import { config } from '../config/index.js';
import { logger } from './logger.service.js';

export interface FoundEmail {
  email: string;
  confidence: number; // 0-100
  source: 'hunter' | 'apollo' | 'pattern' | 'scraped';
  firstName?: string;
  lastName?: string;
  position?: string;
}

export interface CompanyEmails {
  companyName: string;
  domain: string;
  emails: FoundEmail[];
}

class EmailFinderService {
  private emailLogger = logger.child({ service: 'email-finder' });

  /**
   * Find HR/Recruiter emails for a company
   */
  async findCompanyEmails(companyName: string, domain?: string): Promise<CompanyEmails> {
    this.emailLogger.info(`Finding emails for: ${companyName}`);

    const companyDomain = domain || this.extractDomain(companyName);
    const emails: FoundEmail[] = [];

    // Try Hunter.io first (best for email finding)
    if (config.coldEmail.apis.hunter.enabled) {
      const hunterEmails = await this.findWithHunter(companyDomain);
      emails.push(...hunterEmails);
    }

    // Try Apollo.io
    if (config.coldEmail.apis.apollo.enabled && emails.length < 3) {
      const apolloEmails = await this.findWithApollo(companyName, companyDomain);
      emails.push(...apolloEmails);
    }

    // Generate common HR email patterns as fallback
    if (emails.length === 0) {
      const patternEmails = this.generateEmailPatterns(companyName, companyDomain);
      emails.push(...patternEmails);
    }

    // Remove duplicates
    const uniqueEmails = this.deduplicateEmails(emails);

    this.emailLogger.info(`Found ${uniqueEmails.length} emails for ${companyName}`);

    return {
      companyName,
      domain: companyDomain,
      emails: uniqueEmails,
    };
  }

  /**
   * Hunter.io API - Find emails by domain
   */
  private async findWithHunter(domain: string): Promise<FoundEmail[]> {
    const emails: FoundEmail[] = [];

    try {
      // Domain search - find all emails at domain
      const searchUrl = `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${config.coldEmail.apis.hunter.apiKey}&limit=10`;

      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`Hunter API error: ${response.status}`);
      }

      const data = await response.json() as any;

      if (data.data?.emails) {
        for (const email of data.data.emails) {
          // Prioritize HR, Talent, Recruiting roles
          const isHR = this.isHRRole(email.position || '');

          if (isHR || emails.length < 5) {
            emails.push({
              email: email.value,
              confidence: email.confidence || 50,
              source: 'hunter',
              firstName: email.first_name,
              lastName: email.last_name,
              position: email.position,
            });
          }
        }
      }

      this.emailLogger.debug(`Hunter found ${emails.length} emails for ${domain}`);
    } catch (error) {
      this.emailLogger.error('Hunter API error:', error);
    }

    return emails;
  }

  /**
   * Apollo.io API - Find people at company
   */
  private async findWithApollo(companyName: string, domain: string): Promise<FoundEmail[]> {
    const emails: FoundEmail[] = [];

    try {
      const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': config.coldEmail.apis.apollo.apiKey!,
        },
        body: JSON.stringify({
          q_organization_domains: domain,
          page: 1,
          per_page: 10,
          person_titles: [
            'HR',
            'Human Resources',
            'Recruiter',
            'Talent Acquisition',
            'People Operations',
            'Hiring Manager',
            'Technical Recruiter',
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Apollo API error: ${response.status}`);
      }

      const data = await response.json() as any;

      if (data.people) {
        for (const person of data.people) {
          if (person.email) {
            emails.push({
              email: person.email,
              confidence: person.email_status === 'verified' ? 90 : 60,
              source: 'apollo',
              firstName: person.first_name,
              lastName: person.last_name,
              position: person.title,
            });
          }
        }
      }

      this.emailLogger.debug(`Apollo found ${emails.length} emails for ${companyName}`);
    } catch (error) {
      this.emailLogger.error('Apollo API error:', error);
    }

    return emails;
  }

  /**
   * Generate common HR email patterns when APIs fail
   */
  private generateEmailPatterns(companyName: string, domain: string): FoundEmail[] {
    const hrPrefixes = [
      'hr',
      'careers',
      'jobs',
      'recruiting',
      'talent',
      'hiring',
      'recruitment',
      'people',
      'humanresources',
      'hr.india',
      'india.hr',
      'careers.india',
    ];

    const emails: FoundEmail[] = [];

    for (const prefix of hrPrefixes) {
      emails.push({
        email: `${prefix}@${domain}`,
        confidence: 30, // Lower confidence for generated patterns
        source: 'pattern',
        position: 'HR Department',
      });
    }

    // Also try info@ and contact@ as fallback
    emails.push({
      email: `info@${domain}`,
      confidence: 20,
      source: 'pattern',
      position: 'General Contact',
    });

    return emails;
  }

  /**
   * Extract domain from company name
   */
  private extractDomain(companyName: string): string {
    // Clean company name
    let domain = companyName
      .toLowerCase()
      .replace(/\s+(pvt\.?|private|ltd\.?|limited|inc\.?|incorporated|llc|corp\.?|corporation)\s*/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

    // Common domain suffixes to try
    return `${domain}.com`;
  }

  /**
   * Check if position is HR-related
   */
  private isHRRole(position: string): boolean {
    const hrKeywords = [
      'hr',
      'human resource',
      'recruiter',
      'recruiting',
      'talent',
      'hiring',
      'people',
      'acquisition',
      'staffing',
    ];

    const lowerPosition = position.toLowerCase();
    return hrKeywords.some(keyword => lowerPosition.includes(keyword));
  }

  /**
   * Remove duplicate emails
   */
  private deduplicateEmails(emails: FoundEmail[]): FoundEmail[] {
    const seen = new Set<string>();
    return emails.filter(email => {
      const key = email.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Verify if an email exists (using Hunter.io verify)
   */
  async verifyEmail(email: string): Promise<{ valid: boolean; score: number }> {
    if (!config.coldEmail.apis.hunter.enabled) {
      return { valid: true, score: 50 }; // Assume valid if can't verify
    }

    try {
      const url = `https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${config.coldEmail.apis.hunter.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        return { valid: true, score: 50 };
      }

      const data = await response.json() as any;
      return {
        valid: data.data?.result === 'deliverable' || data.data?.result === 'risky',
        score: data.data?.score || 50,
      };
    } catch {
      return { valid: true, score: 50 };
    }
  }

  /**
   * Get best email for a company (highest confidence HR email)
   */
  async getBestEmail(companyName: string, domain?: string): Promise<FoundEmail | null> {
    const result = await this.findCompanyEmails(companyName, domain);

    if (result.emails.length === 0) {
      return null;
    }

    // Sort by: HR role first, then by confidence
    const sorted = result.emails.sort((a, b) => {
      const aIsHR = this.isHRRole(a.position || '');
      const bIsHR = this.isHRRole(b.position || '');

      if (aIsHR && !bIsHR) return -1;
      if (!aIsHR && bIsHR) return 1;
      return b.confidence - a.confidence;
    });

    return sorted[0];
  }
}

export const emailFinderService = new EmailFinderService();
