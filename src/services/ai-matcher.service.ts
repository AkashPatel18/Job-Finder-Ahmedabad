import { config } from '../config/index.js';
import { searchCriteria, userProfile } from '../config/search-criteria.js';
import { aiLogger as logger } from './logger.service.js';

interface JobData {
  title: string;
  company: string;
  location: string;
  description: string;
  requirements?: string;
  salaryRange?: string;
}

interface MatchResult {
  score: number; // 0.0 to 1.0
  reason: string;
  shouldApply: boolean;
  highlights: string[];
  concerns: string[];
}

interface CoverLetterResult {
  coverLetter: string;
  keyPoints: string[];
}

type AIProvider = 'groq' | 'openai' | 'gemini';

/**
 * AI Matcher Service - Supports multiple FREE and paid AI providers
 *
 * FREE options:
 * - Groq (recommended) - Uses Llama 3.3 70B, very fast
 * - Google Gemini - Free tier with 1500 requests/day
 *
 * Paid options:
 * - OpenAI - GPT-4 Turbo
 */
class AIMatcherService {
  private provider: AIProvider;
  private lastCallTime: number = 0;
  private minDelayMs: number = 3000; // 3 seconds between calls to avoid rate limits

  constructor() {
    this.provider = config.ai.provider;
    this.validateProvider();
  }

  // Rate limiting helper
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.minDelayMs) {
      await new Promise(resolve => setTimeout(resolve, this.minDelayMs - timeSinceLastCall));
    }
    this.lastCallTime = Date.now();
  }

  private validateProvider(): void {
    const providerConfig = {
      groq: config.ai.groq.enabled,
      openai: config.ai.openai.enabled,
      gemini: config.ai.gemini.enabled,
    };

    if (!providerConfig[this.provider]) {
      // Try to find an enabled provider
      const enabledProvider = Object.entries(providerConfig).find(([_, enabled]) => enabled);
      if (enabledProvider) {
        this.provider = enabledProvider[0] as AIProvider;
        logger.info(`AI Provider: Using ${this.provider} (auto-detected)`);
      } else {
        logger.warn('No AI provider configured! Using fallback keyword matching.');
      }
    } else {
      logger.info(`AI Provider: ${this.provider}`);
    }
  }

  private async callAI(prompt: string, systemPrompt: string): Promise<string> {
    switch (this.provider) {
      case 'groq':
        return this.callGroq(prompt, systemPrompt);
      case 'openai':
        return this.callOpenAI(prompt, systemPrompt);
      case 'gemini':
        return this.callGemini(prompt, systemPrompt);
      default:
        throw new Error(`Unknown AI provider: ${this.provider}`);
    }
  }

  /**
   * Groq API - FREE, uses Llama 3.3 70B
   * Sign up: https://console.groq.com/
   */
  private async callGroq(prompt: string, systemPrompt: string): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.ai.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // Free, fast, capable
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return data.choices[0]?.message?.content || '';
  }

  /**
   * OpenAI API - Paid, uses GPT-4 Turbo
   */
  private async callOpenAI(prompt: string, systemPrompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.ai.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Google Gemini API - FREE tier (1500 requests/day)
   * Sign up: https://aistudio.google.com/
   */
  private async callGemini(prompt: string, systemPrompt: string): Promise<string> {
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.ai.gemini.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    return data.candidates[0]?.content?.parts[0]?.text || '';
  }

  async matchJob(job: JobData): Promise<MatchResult> {
    logger.info(`Analyzing job: ${job.title} at ${job.company}`);

    // If no AI provider, use fallback
    if (!config.ai.groq.enabled && !config.ai.openai.enabled && !config.ai.gemini.enabled) {
      return this.fallbackMatch(job);
    }

    const systemPrompt = 'You are a job matching assistant. Always respond with valid JSON only.';

    const prompt = `
You are a job matching AI. Analyze how well this job matches the candidate's profile.

CANDIDATE PROFILE:
- Name: ${userProfile.name}
- Current Title: ${userProfile.title}
- Years of Experience: ${userProfile.yearsOfExperience}
- Location: ${userProfile.location}
- Expert Skills: ${userProfile.skills.expert.join(', ')}
- Proficient Skills: ${userProfile.skills.proficient.join(', ')}
- Familiar Skills: ${userProfile.skills.familiar.join(', ')}
- Domains: ${userProfile.domains.join(', ')}
- Preferences: Remote preferred: ${userProfile.preferences.remotePreferred}

JOB REQUIREMENTS:
- Must have skills: ${searchCriteria.mustHaveSkills.join(', ')}
- Preferred skills: ${searchCriteria.preferredSkills.join(', ')}
- Experience range: ${searchCriteria.experience.min}-${searchCriteria.experience.max} years
- Preferred locations: ${searchCriteria.locations.preferred.join(', ')}
- Minimum salary: ${searchCriteria.salaryExpectation.min} ${searchCriteria.salaryExpectation.currency}
- Exclude keywords: ${searchCriteria.excludeKeywords.join(', ')}

JOB DETAILS:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Salary: ${job.salaryRange || 'Not specified'}
- Description: ${job.description.substring(0, 2000)}

Analyze the job and provide a JSON response with:
1. score: A number from 0.0 to 1.0 indicating match quality
2. reason: A brief explanation of the score
3. shouldApply: Boolean - true if score >= 0.7 and no major red flags
4. highlights: Array of positive match points (max 3)
5. concerns: Array of potential concerns or mismatches (max 3)

Consider:
- Skill match (most important)
- Experience level match
- Location/remote compatibility
- Salary expectations (if mentioned)
- Red flags like excluded keywords
- Company size/type preference

Respond ONLY with valid JSON, no other text.
`;

    try {
      // Wait for rate limit before making AI call
      await this.waitForRateLimit();

      const content = await this.callAI(prompt, systemPrompt);

      if (!content) {
        throw new Error('Empty response from AI');
      }

      const result = JSON.parse(content) as MatchResult;

      logger.info(`Match result for ${job.title}: Score ${result.score}, Should Apply: ${result.shouldApply}`);

      return {
        score: Math.max(0, Math.min(1, result.score)),
        reason: result.reason || 'No reason provided',
        shouldApply: result.shouldApply && result.score >= searchCriteria.aiMatchThreshold,
        highlights: result.highlights || [],
        concerns: result.concerns || [],
      };
    } catch (error) {
      logger.error('Error matching job with AI:', error);

      // Fallback to simple keyword matching
      return this.fallbackMatch(job);
    }
  }

  private fallbackMatch(job: JobData): MatchResult {
    logger.info('Using fallback keyword matching (no AI provider)');

    const description = job.description.toLowerCase();
    const title = job.title.toLowerCase();

    // Count must-have skills
    const mustHaveCount = searchCriteria.mustHaveSkills.filter(
      skill => description.includes(skill.toLowerCase()) || title.includes(skill.toLowerCase())
    ).length;

    // Count preferred skills
    const preferredCount = searchCriteria.preferredSkills.filter(
      skill => description.includes(skill.toLowerCase())
    ).length;

    // Check for excluded keywords
    const hasExcluded = searchCriteria.excludeKeywords.some(
      keyword => title.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())
    );

    // Check location match
    const locationMatch = searchCriteria.locations.preferred.some(
      loc => job.location.toLowerCase().includes(loc.toLowerCase())
    );

    // Calculate score
    let score = 0;
    score += (mustHaveCount / searchCriteria.mustHaveSkills.length) * 0.5; // 50% weight
    score += (preferredCount / searchCriteria.preferredSkills.length) * 0.3; // 30% weight
    score += locationMatch ? 0.2 : 0; // 20% weight

    if (hasExcluded) {
      score *= 0.5; // Penalize for excluded keywords
    }

    return {
      score,
      reason: 'Fallback keyword matching (no AI provider configured)',
      shouldApply: score >= searchCriteria.aiMatchThreshold && !hasExcluded,
      highlights: mustHaveCount > 0 ? [`Matches ${mustHaveCount} required skills`] : [],
      concerns: hasExcluded ? ['Contains excluded keywords'] : [],
    };
  }

  async generateCoverLetter(job: JobData): Promise<CoverLetterResult> {
    logger.info(`Generating cover letter for ${job.title} at ${job.company}`);

    // If no AI provider, use generic template
    if (!config.ai.groq.enabled && !config.ai.openai.enabled && !config.ai.gemini.enabled) {
      return {
        coverLetter: this.getGenericCoverLetter(job),
        keyPoints: ['Full Stack Development expertise', 'Scalable system design', 'Team collaboration'],
      };
    }

    const systemPrompt = 'You are a professional cover letter writer. Always respond with valid JSON only.';

    const prompt = `
Write a concise, professional cover letter for this job application.

CANDIDATE:
- Name: ${userProfile.name}
- Title: ${userProfile.title}
- Experience: ${userProfile.yearsOfExperience} years
- Key Skills: ${userProfile.skills.expert.join(', ')}
- Achievements:
${userProfile.achievements.map(a => `  - ${a}`).join('\n')}

JOB:
- Title: ${job.title}
- Company: ${job.company}
- Description: ${job.description.substring(0, 1500)}

Requirements:
1. Keep it under 200 words
2. Be professional but personable
3. Highlight 2-3 relevant achievements
4. Show enthusiasm for the role
5. Don't be generic - mention specific skills that match
6. Don't include placeholders like [Your Name]

Respond with JSON containing:
- coverLetter: The full cover letter text
- keyPoints: Array of 3 key selling points emphasized

Respond ONLY with valid JSON.
`;

    try {
      // Wait for rate limit before making AI call
      await this.waitForRateLimit();

      const content = await this.callAI(prompt, systemPrompt);

      if (!content) {
        throw new Error('Empty response from AI');
      }

      const result = JSON.parse(content) as CoverLetterResult;

      logger.info(`Cover letter generated for ${job.company}`);

      return result;
    } catch (error) {
      logger.error('Error generating cover letter:', error);

      // Return a generic cover letter
      return {
        coverLetter: this.getGenericCoverLetter(job),
        keyPoints: ['Full Stack Development expertise', 'Scalable system design', 'Team collaboration'],
      };
    }
  }

  private getGenericCoverLetter(job: JobData): string {
    return `Dear Hiring Manager,

I am writing to express my interest in the ${job.title} position at ${job.company}. With over ${userProfile.yearsOfExperience} years of experience in full-stack development, I am confident in my ability to contribute effectively to your team.

In my current role, I have architected and developed enterprise platforms using Node.js, TypeScript, and PostgreSQL. I've achieved significant performance improvements, including optimizing a scanning engine by 85% and building systems that process millions of records efficiently.

My expertise in ${userProfile.skills.expert.slice(0, 3).join(', ')} aligns well with your requirements. I am particularly excited about the opportunity to bring my skills in building scalable, secure applications to ${job.company}.

I look forward to discussing how my background can benefit your team.

Best regards,
${userProfile.name}`;
  }
}

export const aiMatcherService = new AIMatcherService();
