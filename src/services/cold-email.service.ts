import { config } from '../config/index.js';
import { userProfile } from '../config/search-criteria.js';
import { logger } from './logger.service.js';
import { emailFinderService, FoundEmail } from './email-finder.service.js';
import { emailSenderService } from './email-sender.service.js';
import { aiMatcherService } from './ai-matcher.service.js';
import { prisma } from '../database/index.js';

interface ColdEmailTarget {
  companyName: string;
  companyDomain?: string;
  jobTitle?: string;
  jobUrl?: string;
  jobDescription?: string;
}

interface ColdEmailResult {
  success: boolean;
  email?: string;
  error?: string;
  messageId?: string;
}

class ColdEmailService {
  private emailLogger = logger.child({ service: 'cold-email' });

  /**
   * Check if cold email is enabled and configured
   */
  isEnabled(): boolean {
    return config.coldEmail.enabled;
  }

  /**
   * Send cold email to a company's HR
   */
  async sendColdEmail(target: ColdEmailTarget): Promise<ColdEmailResult> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: 'Cold email not enabled. Configure Gmail credentials in .env',
      };
    }

    if (!emailSenderService.canSendEmail()) {
      return {
        success: false,
        error: 'Daily email limit reached',
      };
    }

    try {
      this.emailLogger.info(`Sending cold email to ${target.companyName}`);

      // Check if we've already emailed this company
      const existingOutreach = await prisma.coldEmailOutreach.findFirst({
        where: {
          companyName: target.companyName,
          sentAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      });

      if (existingOutreach) {
        this.emailLogger.info(`Already emailed ${target.companyName} recently, skipping`);
        return {
          success: false,
          error: 'Already contacted this company recently',
        };
      }

      // Find HR email
      const hrEmail = await emailFinderService.getBestEmail(
        target.companyName,
        target.companyDomain
      );

      if (!hrEmail) {
        this.emailLogger.warn(`No email found for ${target.companyName}`);
        return {
          success: false,
          error: 'Could not find HR email',
        };
      }

      // Generate personalized email content using AI
      const emailContent = await this.generatePersonalizedEmail(target, hrEmail);

      // Send the email
      const result = await emailSenderService.sendEmail({
        to: hrEmail.email,
        subject: emailContent.subject,
        body: emailContent.body,
      });

      // Record the outreach
      await prisma.coldEmailOutreach.create({
        data: {
          companyName: target.companyName,
          companyDomain: target.companyDomain || '',
          recipientEmail: hrEmail.email,
          recipientName: hrEmail.firstName ? `${hrEmail.firstName} ${hrEmail.lastName || ''}`.trim() : undefined,
          recipientPosition: hrEmail.position,
          emailSubject: emailContent.subject,
          status: result.success ? 'SENT' : 'FAILED',
          errorMessage: result.error,
          jobTitle: target.jobTitle,
          jobUrl: target.jobUrl,
        },
      });

      if (result.success) {
        this.emailLogger.info(`Cold email sent to ${hrEmail.email} at ${target.companyName}`);
      }

      return {
        success: result.success,
        email: hrEmail.email,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      this.emailLogger.error(`Error sending cold email to ${target.companyName}:`, error);
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Generate personalized email using AI
   */
  private async generatePersonalizedEmail(
    target: ColdEmailTarget,
    recipient: FoundEmail
  ): Promise<{ subject: string; body: string }> {
    // Use AI to generate if we have job details
    if (target.jobDescription && config.ai.groq.enabled) {
      try {
        const aiEmail = await this.generateWithAI(target, recipient);
        if (aiEmail) {
          return aiEmail;
        }
      } catch (error) {
        this.emailLogger.warn('AI email generation failed, using template');
      }
    }

    // Fallback to template
    return this.generateTemplateEmail(target, recipient);
  }

  /**
   * Generate email content using AI
   */
  private async generateWithAI(
    target: ColdEmailTarget,
    recipient: FoundEmail
  ): Promise<{ subject: string; body: string } | null> {
    const systemPrompt = 'You are a professional email writer helping job seekers write effective cold emails to HR/recruiters. Always respond with valid JSON only.';

    const prompt = `
Write a professional cold email for a job inquiry.

CANDIDATE:
- Name: ${userProfile.name}
- Title: ${userProfile.title}
- Experience: ${userProfile.yearsOfExperience} years
- Key Skills: ${userProfile.skills.expert.join(', ')}
- Key Achievement: ${userProfile.achievements[0]}

TARGET COMPANY: ${target.companyName}
${target.jobTitle ? `JOB OF INTEREST: ${target.jobTitle}` : 'GENERAL INQUIRY'}
${recipient.firstName ? `RECIPIENT: ${recipient.firstName} ${recipient.lastName || ''} (${recipient.position || 'HR'})` : ''}

${target.jobDescription ? `JOB CONTEXT (use to personalize):\n${target.jobDescription.substring(0, 500)}` : ''}

Requirements:
1. Subject line: Professional, specific, under 60 characters
2. Email body: 150-200 words, professional but friendly
3. Mention specific skills that match the company/role
4. Include a clear call to action
5. Format as HTML with proper paragraphs

Respond with JSON:
{
  "subject": "email subject line",
  "body": "full HTML email body"
}
`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.ai.groq.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const content = data.choices[0]?.message?.content;

      if (content) {
        const parsed = JSON.parse(content);
        return {
          subject: parsed.subject,
          body: this.wrapEmailBody(parsed.body),
        };
      }
    } catch (error) {
      this.emailLogger.error('AI email generation error:', error);
    }

    return null;
  }

  /**
   * Generate template-based email (fallback)
   */
  private generateTemplateEmail(
    target: ColdEmailTarget,
    recipient: FoundEmail
  ): { subject: string; body: string } {
    const greeting = recipient.firstName
      ? `Dear ${recipient.firstName},`
      : 'Dear Hiring Team,';

    const subject = target.jobTitle
      ? `${userProfile.title} - Interest in ${target.jobTitle} role at ${target.companyName}`
      : `${userProfile.title} - Job Inquiry at ${target.companyName}`;

    const body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; }
    .skills { background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 15px 0; }
    .cta { margin: 20px 0; }
  </style>
</head>
<body>
  <p>${greeting}</p>

  <p>I hope this message finds you well. My name is <strong>${userProfile.name}</strong>, and I'm a <strong>${userProfile.title}</strong> with ${userProfile.yearsOfExperience}+ years of experience in building scalable web applications.</p>

  ${target.jobTitle
    ? `<p>I came across the <strong>${target.jobTitle}</strong> position at ${target.companyName} and was immediately drawn to the opportunity. My background aligns well with what you're looking for.</p>`
    : `<p>I'm reaching out to inquire about any current or upcoming opportunities at <strong>${target.companyName}</strong> that might be a good fit for my skill set.</p>`
  }

  <div class="skills">
    <strong>Key Skills:</strong> ${userProfile.skills.expert.join(', ')}
  </div>

  <p><strong>Recent Achievement:</strong> ${userProfile.achievements[0]}</p>

  <div class="cta">
    <p>I would love the opportunity to discuss how I can contribute to ${target.companyName}'s success. Would you be available for a brief call this week?</p>
  </div>

  <p>Thank you for your time and consideration.</p>

  <p>Best regards,<br>
  <strong>${userProfile.name}</strong><br>
  ${userProfile.title}<br>
  📧 ${userProfile.email} | 📱 ${userProfile.phone}</p>
</body>
</html>
    `;

    return { subject, body };
  }

  /**
   * Wrap email body with proper HTML structure
   */
  private wrapEmailBody(body: string): string {
    if (body.includes('<!DOCTYPE') || body.includes('<html')) {
      return body;
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; }
  </style>
</head>
<body>
  ${body}

  <p style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
    Best regards,<br>
    <strong>${userProfile.name}</strong><br>
    ${userProfile.title}<br>
    📧 ${userProfile.email} | 📱 ${userProfile.phone}
  </p>
</body>
</html>
    `;
  }

  /**
   * Process companies from discovered jobs and send cold emails
   */
  async processCompaniesFromJobs(limit: number = 10): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    if (!this.isEnabled()) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    const stats = { processed: 0, sent: 0, failed: 0 };

    try {
      // Get high-match jobs that we haven't cold-emailed yet
      const jobs = await prisma.job.findMany({
        where: {
          aiMatchScore: { gte: 0.7 },
          companyName: {
            notIn: (await prisma.coldEmailOutreach.findMany({
              select: { companyName: true },
            })).map(o => o.companyName),
          },
        },
        orderBy: { aiMatchScore: 'desc' },
        take: limit,
        distinct: ['companyName'],
      });

      this.emailLogger.info(`Processing ${jobs.length} companies for cold email outreach`);

      for (const job of jobs) {
        if (!emailSenderService.canSendEmail()) {
          this.emailLogger.info('Daily email limit reached, stopping');
          break;
        }

        stats.processed++;

        const result = await this.sendColdEmail({
          companyName: job.companyName,
          jobTitle: job.title,
          jobUrl: job.url,
          jobDescription: job.description || undefined,
        });

        if (result.success) {
          stats.sent++;
        } else {
          stats.failed++;
        }

        // Delay between emails
        await new Promise(resolve => setTimeout(resolve, config.coldEmail.delayMs));
      }
    } catch (error) {
      this.emailLogger.error('Error processing companies for cold email:', error);
    }

    return stats;
  }

  /**
   * Get cold email statistics
   */
  async getStats(): Promise<{
    totalSent: number;
    sentToday: number;
    remainingToday: number;
    responseRate: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalSent, sentToday, responded] = await Promise.all([
      prisma.coldEmailOutreach.count({ where: { status: 'SENT' } }),
      prisma.coldEmailOutreach.count({
        where: { status: 'SENT', sentAt: { gte: today } },
      }),
      prisma.coldEmailOutreach.count({ where: { status: 'RESPONDED' } }),
    ]);

    return {
      totalSent,
      sentToday,
      remainingToday: emailSenderService.getRemainingEmails(),
      responseRate: totalSent > 0 ? (responded / totalSent) * 100 : 0,
    };
  }
}

export const coldEmailService = new ColdEmailService();
