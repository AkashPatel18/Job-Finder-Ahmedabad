import { Platform } from '@prisma/client';

export interface PlatformConfig {
  name: Platform;
  displayName: string;
  baseUrl: string;
  loginUrl: string;
  searchUrl: string;
  requiresAuth: boolean;
  hasEasyApply: boolean;
  rateLimit: {
    requestsPerMinute: number;
    delayBetweenRequests: number; // ms
    maxApplicationsPerSession?: number; // Max applications before break
    sessionBreakMinutes?: number; // Break duration
  };
  selectors?: Record<string, string>;
}

export const platformConfigs: Record<Platform, PlatformConfig> = {
  LINKEDIN: {
    name: 'LINKEDIN' as Platform,
    displayName: 'LinkedIn',
    baseUrl: 'https://www.linkedin.com',
    loginUrl: 'https://www.linkedin.com/login',
    searchUrl: 'https://www.linkedin.com/jobs/search',
    requiresAuth: true,
    hasEasyApply: true,
    rateLimit: {
      requestsPerMinute: 10,
      delayBetweenRequests: 6000, // 6 seconds between requests
    },
    selectors: {
      jobCard: '.job-card-container',
      jobTitle: '.job-card-list__title',
      companyName: '.job-card-container__company-name',
      location: '.job-card-container__metadata-item',
      easyApplyButton: '.jobs-apply-button--top-card',
    },
  },

  NAUKRI: {
    name: 'NAUKRI' as Platform,
    displayName: 'Naukri.com',
    baseUrl: 'https://www.naukri.com',
    loginUrl: 'https://www.naukri.com/nlogin/login',
    searchUrl: 'https://www.naukri.com/jobs',
    requiresAuth: true,
    hasEasyApply: true,
    rateLimit: {
      requestsPerMinute: 10, // Conservative to avoid detection
      delayBetweenRequests: 6000, // 6 seconds between requests
      maxApplicationsPerSession: 10, // Max applications before taking a break
      sessionBreakMinutes: 30, // Break duration between sessions
    },
    selectors: {
      jobCard: '.jobTuple',
      jobTitle: '.title',
      companyName: '.companyInfo',
      location: '.location',
      applyButton: '.apply-button',
    },
  },

  INDEED: {
    name: 'INDEED' as Platform,
    displayName: 'Indeed',
    baseUrl: 'https://in.indeed.com',
    loginUrl: 'https://secure.indeed.com/auth',
    searchUrl: 'https://in.indeed.com/jobs',
    requiresAuth: false, // Can search without auth
    hasEasyApply: true,
    rateLimit: {
      requestsPerMinute: 12,
      delayBetweenRequests: 5000,
    },
    selectors: {
      jobCard: '.job_seen_beacon',
      jobTitle: '.jobTitle',
      companyName: '.companyName',
      location: '.companyLocation',
      applyButton: '.applyButton',
    },
  },

  WELLFOUND: {
    name: 'WELLFOUND' as Platform,
    displayName: 'Wellfound (AngelList)',
    baseUrl: 'https://wellfound.com',
    loginUrl: 'https://wellfound.com/login',
    searchUrl: 'https://wellfound.com/jobs',
    requiresAuth: true,
    hasEasyApply: true,
    rateLimit: {
      requestsPerMinute: 10,
      delayBetweenRequests: 6000,
    },
  },

  INSTAHYRE: {
    name: 'INSTAHYRE' as Platform,
    displayName: 'Instahyre',
    baseUrl: 'https://www.instahyre.com',
    loginUrl: 'https://www.instahyre.com/login',
    searchUrl: 'https://www.instahyre.com/candidate/opportunities',
    requiresAuth: true,
    hasEasyApply: true,
    rateLimit: {
      requestsPerMinute: 15,
      delayBetweenRequests: 4000,
    },
  },

  GLASSDOOR: {
    name: 'GLASSDOOR' as Platform,
    displayName: 'Glassdoor',
    baseUrl: 'https://www.glassdoor.co.in',
    loginUrl: 'https://www.glassdoor.co.in/profile/login',
    searchUrl: 'https://www.glassdoor.co.in/Job/jobs.htm',
    requiresAuth: false,
    hasEasyApply: false,
    rateLimit: {
      requestsPerMinute: 10,
      delayBetweenRequests: 6000,
    },
  },

  CUTSHORT: {
    name: 'CUTSHORT' as Platform,
    displayName: 'Cutshort',
    baseUrl: 'https://cutshort.io',
    loginUrl: 'https://cutshort.io/login',
    searchUrl: 'https://cutshort.io/jobs',
    requiresAuth: true,
    hasEasyApply: true,
    rateLimit: {
      requestsPerMinute: 15,
      delayBetweenRequests: 4000,
    },
  },

  REMOTEOK: {
    name: 'REMOTEOK' as Platform,
    displayName: 'RemoteOK',
    baseUrl: 'https://remoteok.com',
    loginUrl: 'https://remoteok.com/login',
    searchUrl: 'https://remoteok.com/remote-dev-jobs',
    requiresAuth: false,
    hasEasyApply: false,
    rateLimit: {
      requestsPerMinute: 20,
      delayBetweenRequests: 3000,
    },
  },
};

export const getPlatformConfig = (platform: Platform): PlatformConfig => {
  return platformConfigs[platform];
};

export const getEnabledPlatforms = (): Platform[] => {
  return Object.values(platformConfigs)
    .filter(config => config.hasEasyApply)
    .map(config => config.name);
};
