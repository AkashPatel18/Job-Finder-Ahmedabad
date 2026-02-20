export const searchCriteria = {
  // Job titles to search for
  keywords: [
    'Full Stack Developer',
    'Backend Developer',
    'Node.js Developer',
    'React Developer',
    'Software Engineer',
    'TypeScript Developer',
    'JavaScript Developer',
    'Senior Software Engineer',
    'Senior Full Stack Developer',
    'Senior Backend Developer',
  ],

  // Location preferences
  locations: {
    preferred: [
      'Remote',
      'Work from Home',
      'WFH',
      'Ahmedabad',
      'Gujarat',
      'Gandhinagar',
      'India Remote',
      'Anywhere',
    ],
    // Add cities you want to exclude
    exclude: [] as string[],
  },

  // Experience level
  experience: {
    min: 3,
    max: 6, // 4+ years experience, targeting 3-6 year roles
  },

  // Job types to consider
  jobTypes: ['remote', 'hybrid', 'full-time'] as const,

  // Required skills (job must mention at least some of these)
  mustHaveSkills: [
    'Node.js',
    'JavaScript',
    'TypeScript',
  ],

  // Preferred skills (higher match score if present)
  preferredSkills: [
    'React',
    'React.js',
    'PostgreSQL',
    'GraphQL',
    'Apollo',
    'AWS',
    'GCP',
    'Redis',
    'Docker',
    'Kubernetes',
    'CI/CD',
    'REST API',
    'MongoDB',
    'Python',
  ],

  // Salary expectations (in INR)
  salaryExpectation: {
    min: 2000000, // 20 LPA minimum
    currency: 'INR',
  },

  // Companies to never apply to
  excludeCompanies: [
    'Comperis', // Current employer
    'Comperis Cybersecurity',
    // Add any other blacklisted companies here
  ],

  // Keywords that indicate a bad job match
  excludeKeywords: [
    'Internship',
    'Intern',
    'Fresher',
    'Entry Level',
    '0-1 years',
    '0-2 years',
    'PHP Developer', // Different stack
    '.NET Developer', // Different stack
    'Java Developer', // Different stack (unless hybrid role)
  ],

  // AI matching threshold (0.0 to 1.0)
  aiMatchThreshold: 0.7, // Only apply if AI match score > 70%

  // Source priority (higher priority = fetched first, more frequently)
  // Priority 1: Free APIs - No blocking risk, always available
  // Priority 2: Indian job portals - Best for local jobs
  // Priority 3: LinkedIn - Only if explicitly enabled (risky)
  sources: {
    // FREE APIS - Always use these (no blocking risk)
    freeApis: {
      priority: 1,
      enabled: true,
      sources: [
        'remotive',    // 100% FREE - Remote tech jobs
        'remoteok',    // 100% FREE - Remote jobs globally
        'arbeitnow',   // 100% FREE - European + Remote
        'adzuna',      // FREE tier: 250/month - India jobs
        'jsearch',     // FREE tier: 500/month - Aggregator
        'findwork',    // FREE tier - Developer jobs
      ],
    },

    // INDIAN PORTALS - Good for local jobs, moderate risk
    indianPortals: {
      priority: 2,
      sources: [
        'naukri',      // Requires credentials
        'indeed',      // Works without login
        'instahyre',   // Curated tech jobs
      ],
    },

    // INTERNATIONAL - Higher risk of blocking
    international: {
      priority: 3,
      sources: [
        'linkedin',    // RISKY - Only if LINKEDIN_ENABLED=true
        'wellfound',   // Startup jobs
        'glassdoor',   // Reviews + jobs
      ],
    },
  },

  // Search frequency by priority
  searchFrequency: {
    freeApis: 2,      // Every 2 hours (safe, no limits)
    indianPortals: 4, // Every 4 hours
    international: 8, // Every 8 hours (be careful)
  },
};

// User profile for AI matching
export const userProfile = {
  name: 'Akash Patel',
  title: 'Full Stack Developer',
  yearsOfExperience: 4,
  location: 'Gandhinagar, Gujarat, India',
  email: 'akashpatel18041999@gmail.com',
  phone: '+91 8733999561',

  // Skills for matching
  skills: {
    expert: ['JavaScript', 'TypeScript', 'Node.js', 'React.js', 'PostgreSQL', 'Apollo GraphQL'],
    proficient: ['Redis', 'AWS', 'GCP', 'Docker', 'REST APIs', 'CI/CD', 'GitHub Actions'],
    familiar: ['Python', 'React Native', 'Redux', 'SQL'],
  },

  // Domains worked in
  domains: ['Cybersecurity', 'Insurtech', 'Geospatial', 'Mobile Apps'],

  // Key achievements for cover letters
  achievements: [
    'Optimized cloud infrastructure scanning engine with 85%+ performance improvement',
    'Led development of high-throughput data pipeline processing 150 million records',
    'Architected end-to-end evidence management platform with RBAC',
    'Built Security Graph feature providing single-pane-of-glass infrastructure view',
  ],

  // Preferences
  preferences: {
    remotePreferred: true,
    willingToRelocate: false,
    noticePeriod: '30 days', // or 'Immediate'
  },

  // Salary info for auto-apply forms (in LPA - Lakhs Per Annum)
  salary: {
    currentCTC: 18, // Current CTC in LPA
    expectedCTC: 25, // Expected CTC in LPA
  },
};

export type SearchCriteria = typeof searchCriteria;
export type UserProfile = typeof userProfile;
