import { config } from '../config/index.js';
import { searchCriteria } from '../config/search-criteria.js';
import { logger } from './logger.service.js';

export interface APIJob {
  externalId: string;
  title: string;
  companyName: string;
  location: string;
  description: string;
  url: string;
  salary?: string;
  postedAt?: Date;
  source: string;
  tags?: string[];
  jobType?: string;
  remote?: boolean;
}

interface _APIResponse<T> {
  success: boolean;
  jobs: T[];
  error?: string;
}

/**
 * Free Job APIs - No authentication required
 */
class JobAPIService {
  private apiLogger = logger.child({ service: 'job-api' });

  /**
   * Fetch jobs from all enabled free APIs
   */
  async fetchAllJobs(): Promise<APIJob[]> {
    const allJobs: APIJob[] = [];
    const fetchPromises: Promise<APIJob[]>[] = [];

    // Always-free APIs (no key required)
    if (config.apis.remotive.enabled) {
      fetchPromises.push(this.fetchRemotiveJobs());
    }
    if (config.apis.remoteok.enabled) {
      fetchPromises.push(this.fetchRemoteOKJobs());
    }
    if (config.apis.arbeitnow.enabled) {
      fetchPromises.push(this.fetchArbeitnowJobs());
    }

    // Free tier APIs (key required)
    if (config.apis.adzuna.enabled) {
      fetchPromises.push(this.fetchAdzunaJobs());
    }
    if (config.apis.rapidApi.enabled) {
      fetchPromises.push(this.fetchJSearchJobs());
    }
    if (config.apis.findwork.enabled) {
      fetchPromises.push(this.fetchFindworkJobs());
    }

    const results = await Promise.allSettled(fetchPromises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allJobs.push(...result.value);
      } else {
        this.apiLogger.error('API fetch failed:', result.reason);
      }
    }

    this.apiLogger.info(`Fetched ${allJobs.length} jobs from APIs`);
    return allJobs;
  }

  /**
   * Remotive API - 100% FREE, no key needed
   * Best for: Remote tech/developer jobs
   * Docs: https://remotive.com/api/remote-jobs
   */
  async fetchRemotiveJobs(): Promise<APIJob[]> {
    const jobs: APIJob[] = [];

    try {
      // Remotive categories for tech jobs
      const categories = ['software-dev', 'devops', 'data'];

      for (const category of categories) {
        const url = `https://remotive.com/api/remote-jobs?category=${category}&limit=50`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Remotive API error: ${response.status}`);
        }

        const data = await response.json() as { jobs: any[] };

        for (const job of data.jobs || []) {
          // Filter for relevant jobs
          const titleLower = job.title?.toLowerCase() || '';
          const isRelevant = searchCriteria.keywords.some(
            kw => titleLower.includes(kw.toLowerCase())
          );

          if (!isRelevant) continue;

          jobs.push({
            externalId: `remotive_${job.id}`,
            title: job.title,
            companyName: job.company_name,
            location: job.candidate_required_location || 'Remote',
            description: job.description || '',
            url: job.url,
            salary: job.salary || undefined,
            postedAt: job.publication_date ? new Date(job.publication_date) : undefined,
            source: 'REMOTIVE',
            tags: job.tags || [],
            jobType: job.job_type,
            remote: true,
          });
        }

        // Rate limiting
        await this.delay(1000);
      }

      this.apiLogger.info(`Remotive: Found ${jobs.length} relevant jobs`);
    } catch (error) {
      this.apiLogger.error('Remotive API error:', error);
    }

    return jobs;
  }

  /**
   * RemoteOK API - 100% FREE, no key needed
   * Best for: Remote jobs globally
   * Docs: https://remoteok.com/api
   */
  async fetchRemoteOKJobs(): Promise<APIJob[]> {
    const jobs: APIJob[] = [];

    try {
      // RemoteOK has tags-based filtering
      const tags = ['javascript', 'nodejs', 'react', 'typescript', 'backend', 'fullstack'];

      for (const tag of tags) {
        const url = `https://remoteok.com/api?tag=${tag}`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'JobApplicationBot/1.0',
          },
        });

        if (!response.ok) {
          throw new Error(`RemoteOK API error: ${response.status}`);
        }

        const data = await response.json() as any[];

        // First item is metadata, skip it
        const jobList = Array.isArray(data) ? data.slice(1) : [];

        for (const job of jobList) {
          if (!job.id || !job.position) continue;

          // Check if location is suitable (remote or India-friendly)
          const location = job.location || 'Worldwide';
          const isLocationOk =
            location.toLowerCase().includes('worldwide') ||
            location.toLowerCase().includes('anywhere') ||
            location.toLowerCase().includes('remote') ||
            location.toLowerCase().includes('india') ||
            location.toLowerCase().includes('asia');

          if (!isLocationOk) continue;

          jobs.push({
            externalId: `remoteok_${job.id}`,
            title: job.position,
            companyName: job.company || 'Unknown',
            location: location,
            description: job.description || '',
            url: job.url || `https://remoteok.com/l/${job.id}`,
            salary: job.salary_min && job.salary_max
              ? `$${job.salary_min} - $${job.salary_max}`
              : undefined,
            postedAt: job.date ? new Date(job.date) : undefined,
            source: 'REMOTEOK',
            tags: job.tags || [],
            remote: true,
          });
        }

        await this.delay(2000); // RemoteOK rate limit
      }

      // Deduplicate by ID
      const uniqueJobs = Array.from(
        new Map(jobs.map(j => [j.externalId, j])).values()
      );

      this.apiLogger.info(`RemoteOK: Found ${uniqueJobs.length} relevant jobs`);
      return uniqueJobs;
    } catch (error) {
      this.apiLogger.error('RemoteOK API error:', error);
      return jobs;
    }
  }

  /**
   * Arbeitnow API - 100% FREE, no key needed
   * Best for: European + Remote jobs
   * Docs: https://arbeitnow.com/api/job-board-api
   */
  async fetchArbeitnowJobs(): Promise<APIJob[]> {
    const jobs: APIJob[] = [];

    try {
      const url = 'https://arbeitnow.com/api/job-board-api';

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Arbeitnow API error: ${response.status}`);
      }

      const data = await response.json() as { data: any[] };

      for (const job of data.data || []) {
        // Filter for remote jobs or worldwide
        const isRemote = job.remote === true ||
          job.location?.toLowerCase().includes('remote');

        if (!isRemote) continue;

        // Check if title matches our keywords
        const titleLower = job.title?.toLowerCase() || '';
        const isRelevant = searchCriteria.keywords.some(
          kw => titleLower.includes(kw.toLowerCase())
        );

        if (!isRelevant) continue;

        jobs.push({
          externalId: `arbeitnow_${job.slug}`,
          title: job.title,
          companyName: job.company_name,
          location: job.location || 'Remote',
          description: job.description || '',
          url: job.url,
          postedAt: job.created_at ? new Date(job.created_at * 1000) : undefined,
          source: 'ARBEITNOW',
          tags: job.tags || [],
          remote: isRemote,
        });
      }

      this.apiLogger.info(`Arbeitnow: Found ${jobs.length} relevant jobs`);
    } catch (error) {
      this.apiLogger.error('Arbeitnow API error:', error);
    }

    return jobs;
  }

  /**
   * Adzuna API - FREE tier: 250 requests/month
   * Best for: India-specific jobs
   * Docs: https://developer.adzuna.com/
   */
  async fetchAdzunaJobs(): Promise<APIJob[]> {
    const jobs: APIJob[] = [];

    if (!config.apis.adzuna.appId || !config.apis.adzuna.appKey) {
      return jobs;
    }

    try {
      const keywords = ['javascript', 'nodejs', 'react', 'fullstack'];
      const locations = ['india', 'gujarat', 'ahmedabad'];

      for (const keyword of keywords.slice(0, 2)) { // Limit API calls
        for (const location of locations.slice(0, 1)) {
          const url = new URL('https://api.adzuna.com/v1/api/jobs/in/search/1');
          url.searchParams.set('app_id', config.apis.adzuna.appId);
          url.searchParams.set('app_key', config.apis.adzuna.appKey);
          url.searchParams.set('what', keyword);
          url.searchParams.set('where', location);
          url.searchParams.set('results_per_page', '20');
          url.searchParams.set('max_days_old', '7');

          const response = await fetch(url.toString());
          if (!response.ok) {
            throw new Error(`Adzuna API error: ${response.status}`);
          }

          const data = await response.json() as { results: any[] };

          for (const job of data.results || []) {
            jobs.push({
              externalId: `adzuna_${job.id}`,
              title: job.title,
              companyName: job.company?.display_name || 'Unknown',
              location: job.location?.display_name || 'India',
              description: job.description || '',
              url: job.redirect_url,
              salary: job.salary_min && job.salary_max
                ? `₹${job.salary_min} - ₹${job.salary_max}`
                : undefined,
              postedAt: job.created ? new Date(job.created) : undefined,
              source: 'ADZUNA',
              remote: job.title?.toLowerCase().includes('remote'),
            });
          }

          await this.delay(1000);
        }
      }

      this.apiLogger.info(`Adzuna: Found ${jobs.length} jobs`);
    } catch (error) {
      this.apiLogger.error('Adzuna API error:', error);
    }

    return jobs;
  }

  /**
   * JSearch API (RapidAPI) - FREE tier: 500 requests/month
   * Best for: Aggregated job listings
   * Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
   */
  async fetchJSearchJobs(): Promise<APIJob[]> {
    const jobs: APIJob[] = [];

    if (!config.apis.rapidApi.key) {
      return jobs;
    }

    try {
      const queries = [
        'fullstack developer remote india',
        'nodejs developer remote',
        'react developer ahmedabad',
      ];

      for (const query of queries.slice(0, 2)) { // Limit API calls
        const url = new URL('https://jsearch.p.rapidapi.com/search');
        url.searchParams.set('query', query);
        url.searchParams.set('num_pages', '1');
        url.searchParams.set('date_posted', 'week');

        const response = await fetch(url.toString(), {
          headers: {
            'X-RapidAPI-Key': config.apis.rapidApi.key,
            'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
          },
        });

        if (!response.ok) {
          throw new Error(`JSearch API error: ${response.status}`);
        }

        const data = await response.json() as { data: any[] };

        for (const job of data.data || []) {
          jobs.push({
            externalId: `jsearch_${job.job_id}`,
            title: job.job_title,
            companyName: job.employer_name || 'Unknown',
            location: job.job_city
              ? `${job.job_city}, ${job.job_country}`
              : job.job_country || 'Remote',
            description: job.job_description || '',
            url: job.job_apply_link || job.job_google_link,
            salary: job.job_min_salary && job.job_max_salary
              ? `${job.job_salary_currency || '$'}${job.job_min_salary} - ${job.job_max_salary}`
              : undefined,
            postedAt: job.job_posted_at_datetime_utc
              ? new Date(job.job_posted_at_datetime_utc)
              : undefined,
            source: 'JSEARCH',
            remote: job.job_is_remote,
            jobType: job.job_employment_type,
          });
        }

        await this.delay(1000);
      }

      this.apiLogger.info(`JSearch: Found ${jobs.length} jobs`);
    } catch (error) {
      this.apiLogger.error('JSearch API error:', error);
    }

    return jobs;
  }

  /**
   * FindWork API - FREE tier available
   * Best for: Developer jobs
   * Docs: https://findwork.dev/developers/
   */
  async fetchFindworkJobs(): Promise<APIJob[]> {
    const jobs: APIJob[] = [];

    if (!config.apis.findwork.key) {
      return jobs;
    }

    try {
      const url = new URL('https://findwork.dev/api/jobs/');
      url.searchParams.set('search', 'javascript nodejs react');
      url.searchParams.set('remote', 'true');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Token ${config.apis.findwork.key}`,
        },
      });

      if (!response.ok) {
        throw new Error(`FindWork API error: ${response.status}`);
      }

      const data = await response.json() as { results: any[] };

      for (const job of data.results || []) {
        jobs.push({
          externalId: `findwork_${job.id}`,
          title: job.role,
          companyName: job.company_name || 'Unknown',
          location: job.location || 'Remote',
          description: job.text || '',
          url: job.url,
          postedAt: job.date_posted ? new Date(job.date_posted) : undefined,
          source: 'FINDWORK',
          tags: job.keywords || [],
          remote: job.remote,
        });
      }

      this.apiLogger.info(`FindWork: Found ${jobs.length} jobs`);
    } catch (error) {
      this.apiLogger.error('FindWork API error:', error);
    }

    return jobs;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const jobAPIService = new JobAPIService();
