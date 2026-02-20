import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenvConfig();

// Environment schema validation
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string(),

  // AI Provider (choose one - Groq is FREE)
  AI_PROVIDER: z.enum(['groq', 'openai', 'gemini']).default('groq'),
  GROQ_API_KEY: z.string().optional(),      // FREE - recommended
  OPENAI_API_KEY: z.string().optional(),    // Paid
  GEMINI_API_KEY: z.string().optional(),    // FREE tier

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),

  // 2Captcha (optional)
  TWO_CAPTCHA_API_KEY: z.string().optional(),

  // Proxy (optional)
  PROXY_ENABLED: z.string().transform(v => v === 'true').default('false'),
  PROXY_URL: z.string().optional(),

  // Platform Credentials (all optional - platforms are skipped if not configured)
  LINKEDIN_EMAIL: z.string().optional().transform(v => v && v.includes('@') ? v : undefined),
  LINKEDIN_PASSWORD: z.string().optional().transform(v => v && v.length > 0 ? v : undefined),
  LINKEDIN_ENABLED: z.string().transform(v => v === 'true').default('false'),
  NAUKRI_EMAIL: z.string().optional().transform(v => v && v.includes('@') ? v : undefined),
  NAUKRI_PASSWORD: z.string().optional().transform(v => v && v.length > 0 ? v : undefined),
  INDEED_EMAIL: z.string().optional().transform(v => v && v.includes('@') ? v : undefined),
  INDEED_PASSWORD: z.string().optional().transform(v => v && v.length > 0 ? v : undefined),

  // Free Job API Keys (all optional, free tiers available)
  ADZUNA_APP_ID: z.string().optional(),      // Free: 250 requests/month
  ADZUNA_APP_KEY: z.string().optional(),
  RAPIDAPI_KEY: z.string().optional(),        // Free: 500 requests/month (JSearch)
  FINDWORK_API_KEY: z.string().optional(),    // Free tier available

  // Application Settings
  AI_MATCH_THRESHOLD: z.string().transform(Number).default('0.7'),
  MAX_DAILY_APPLICATIONS: z.string().transform(Number).default('50'),
  SCRAPE_INTERVAL_HOURS: z.string().transform(Number).default('4'),
  APPLICATION_DELAY_MS: z.string().transform(Number).default('30000'),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Cold Email Outreach
  GMAIL_EMAIL: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
  APOLLO_API_KEY: z.string().optional(),
  COLD_EMAIL_ENABLED: z.string().transform(v => v === 'true').default('false'),
  COLD_EMAIL_DAILY_LIMIT: z.string().transform(Number).default('40'),
  COLD_EMAIL_DELAY_MS: z.string().transform(Number).default('60000'),
});

// Parse and validate environment
const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment configuration');
  }

  return parsed.data;
};

export const env = parseEnv();

export const config = {
  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  ai: {
    provider: env.AI_PROVIDER,
    groq: {
      apiKey: env.GROQ_API_KEY,
      enabled: !!env.GROQ_API_KEY,
    },
    openai: {
      apiKey: env.OPENAI_API_KEY,
      enabled: !!env.OPENAI_API_KEY,
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      enabled: !!env.GEMINI_API_KEY,
    },
  },

  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
  },

  captcha: {
    apiKey: env.TWO_CAPTCHA_API_KEY,
    enabled: !!env.TWO_CAPTCHA_API_KEY,
  },

  proxy: {
    enabled: env.PROXY_ENABLED,
    url: env.PROXY_URL,
  },

  credentials: {
    linkedin: {
      email: env.LINKEDIN_EMAIL,
      password: env.LINKEDIN_PASSWORD,
      enabled: env.LINKEDIN_ENABLED && !!env.LINKEDIN_EMAIL && !!env.LINKEDIN_PASSWORD,
    },
    naukri: {
      email: env.NAUKRI_EMAIL,
      password: env.NAUKRI_PASSWORD,
      enabled: !!env.NAUKRI_EMAIL && !!env.NAUKRI_PASSWORD,
    },
    indeed: {
      email: env.INDEED_EMAIL,
      password: env.INDEED_PASSWORD,
      enabled: true, // Indeed can work without auth
    },
  },

  // Free Job APIs
  apis: {
    adzuna: {
      appId: env.ADZUNA_APP_ID,
      appKey: env.ADZUNA_APP_KEY,
      enabled: !!env.ADZUNA_APP_ID && !!env.ADZUNA_APP_KEY,
    },
    rapidApi: {
      key: env.RAPIDAPI_KEY,
      enabled: !!env.RAPIDAPI_KEY,
    },
    findwork: {
      key: env.FINDWORK_API_KEY,
      enabled: !!env.FINDWORK_API_KEY,
    },
    // These APIs are completely free, no key needed
    remotive: { enabled: true },
    remoteok: { enabled: true },
    arbeitnow: { enabled: true },
  },

  application: {
    aiMatchThreshold: env.AI_MATCH_THRESHOLD,
    maxDailyApplications: env.MAX_DAILY_APPLICATIONS,
    scrapeIntervalHours: env.SCRAPE_INTERVAL_HOURS,
    applicationDelayMs: env.APPLICATION_DELAY_MS,
  },

  environment: {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
  },

  // Cold Email Outreach
  coldEmail: {
    enabled: env.COLD_EMAIL_ENABLED && !!env.GMAIL_EMAIL && !!env.GMAIL_APP_PASSWORD,
    gmail: {
      email: env.GMAIL_EMAIL,
      appPassword: env.GMAIL_APP_PASSWORD,
    },
    apis: {
      hunter: {
        apiKey: env.HUNTER_API_KEY,
        enabled: !!env.HUNTER_API_KEY,
      },
      apollo: {
        apiKey: env.APOLLO_API_KEY,
        enabled: !!env.APOLLO_API_KEY,
      },
    },
    dailyLimit: env.COLD_EMAIL_DAILY_LIMIT,
    delayMs: env.COLD_EMAIL_DELAY_MS,
  },
};

export type Config = typeof config;
