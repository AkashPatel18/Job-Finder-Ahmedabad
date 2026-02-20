import { logger } from './logger.service.js';

interface HRInfo {
  hrName?: string;
  linkedinUrl?: string;
  careerPageUrl?: string;
  email?: string;
}

class HRFinderService {
  private commonCareerPagePatterns = [
    '/careers',
    '/jobs',
    '/work-with-us',
    '/join-us',
    '/hiring',
    '/opportunities',
  ];

  /**
   * Find HR/Recruiter info for a company
   */
  async findHR(companyName: string): Promise<HRInfo> {
    const result: HRInfo = {};

    try {
      // Try to find career page
      result.careerPageUrl = await this.findCareerPage(companyName);

      // Generate LinkedIn search URL for HR
      result.linkedinUrl = this.generateLinkedInSearchUrl(companyName);

      logger.info(`Found HR info for ${companyName}:`, result);
    } catch (error) {
      logger.error(`Error finding HR for ${companyName}:`, error);
    }

    return result;
  }

  /**
   * Find company career page
   */
  private async findCareerPage(companyName: string): Promise<string | undefined> {
    // Clean company name for domain search
    const cleanName = companyName
      .toLowerCase()
      .replace(/\s+(pvt|private|ltd|limited|inc|llc|llp|technologies|tech|software|solutions|consulting|services)\.?/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

    // Common domain patterns to try
    const domains = [
      `${cleanName}.com`,
      `${cleanName}.in`,
      `${cleanName}.io`,
      `${cleanName}tech.com`,
      `${cleanName}software.com`,
    ];

    // Return the most likely career page URL
    // In a real implementation, you'd verify these URLs exist
    for (const domain of domains) {
      for (const path of this.commonCareerPagePatterns) {
        const careerUrl = `https://${domain}${path}`;
        // For now, return the first likely option
        // You could add URL verification here
        return careerUrl;
      }
    }

    return undefined;
  }

  /**
   * Generate LinkedIn search URL for HR/Recruiters at company
   */
  generateLinkedInSearchUrl(companyName: string): string {
    const encodedCompany = encodeURIComponent(companyName);
    // LinkedIn search for HR/Recruiters at the company
    return `https://www.linkedin.com/search/results/people/?keywords=HR%20recruiter%20${encodedCompany}&origin=GLOBAL_SEARCH_HEADER`;
  }

  /**
   * Generate LinkedIn company page search
   */
  generateLinkedInCompanyUrl(companyName: string): string {
    const encodedCompany = encodeURIComponent(companyName);
    return `https://www.linkedin.com/search/results/companies/?keywords=${encodedCompany}`;
  }

  /**
   * Generate Google search URL for company careers
   */
  generateGoogleCareersSearch(companyName: string): string {
    const query = encodeURIComponent(`${companyName} careers jobs`);
    return `https://www.google.com/search?q=${query}`;
  }

  /**
   * Get all search links for a company
   */
  getAllSearchLinks(companyName: string): {
    linkedinHR: string;
    linkedinCompany: string;
    googleCareers: string;
    glassdoor: string;
    ambitionbox: string;
  } {
    const encoded = encodeURIComponent(companyName);

    return {
      linkedinHR: this.generateLinkedInSearchUrl(companyName),
      linkedinCompany: this.generateLinkedInCompanyUrl(companyName),
      googleCareers: this.generateGoogleCareersSearch(companyName),
      glassdoor: `https://www.glassdoor.co.in/Search/results.htm?keyword=${encoded}`,
      ambitionbox: `https://www.ambitionbox.com/overview/${encoded.toLowerCase().replace(/%20/g, '-')}-overview`,
    };
  }
}

export const hrFinderService = new HRFinderService();
