import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';
import { userProfile } from '../config/search-criteria.js';

export interface EmailContent {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailSenderService {
  private transporter: nodemailer.Transporter | null = null;
  private emailLogger = logger.child({ service: 'email-sender' });
  private dailySentCount = 0;
  private lastResetDate = new Date().toDateString();

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    if (!config.coldEmail.gmail.email || !config.coldEmail.gmail.appPassword) {
      this.emailLogger.warn('Gmail credentials not configured. Email sending disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.coldEmail.gmail.email,
        pass: config.coldEmail.gmail.appPassword,
      },
    });

    this.emailLogger.info('Gmail SMTP transporter initialized');
  }

  /**
   * Check if we can send more emails today
   */
  canSendEmail(): boolean {
    // Reset counter if new day
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailySentCount = 0;
      this.lastResetDate = today;
    }

    return this.dailySentCount < config.coldEmail.dailyLimit;
  }

  /**
   * Get remaining emails for today
   */
  getRemainingEmails(): number {
    return Math.max(0, config.coldEmail.dailyLimit - this.dailySentCount);
  }

  /**
   * Send a cold email
   */
  async sendEmail(content: EmailContent): Promise<SendResult> {
    if (!this.transporter) {
      return {
        success: false,
        error: 'Email transporter not initialized. Check Gmail credentials.',
      };
    }

    if (!this.canSendEmail()) {
      return {
        success: false,
        error: `Daily email limit reached (${config.coldEmail.dailyLimit}/day)`,
      };
    }

    try {
      const mailOptions = {
        from: {
          name: userProfile.name,
          address: config.coldEmail.gmail.email!,
        },
        to: content.to,
        subject: content.subject,
        html: content.body,
        replyTo: content.replyTo || config.coldEmail.gmail.email,
        headers: {
          'X-Priority': '3', // Normal priority
          'X-Mailer': 'Job Application Bot',
        },
      };

      const result = await this.transporter.sendMail(mailOptions);

      this.dailySentCount++;
      this.emailLogger.info(`Email sent to ${content.to}. MessageId: ${result.messageId}`);

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      this.emailLogger.error('Failed to send email:', error);
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Send a job inquiry email with professional template
   */
  async sendJobInquiry(
    toEmail: string,
    companyName: string,
    recipientName?: string,
    customMessage?: string
  ): Promise<SendResult> {
    const subject = `${userProfile.title} - Job Inquiry at ${companyName}`;

    const greeting = recipientName
      ? `Dear ${recipientName},`
      : 'Dear Hiring Team,';

    const body = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { margin-bottom: 20px; }
    .content { margin-bottom: 20px; }
    .skills { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; }
    .skill-tag { display: inline-block; background: #e0e0e0; padding: 3px 10px; margin: 3px; border-radius: 3px; font-size: 13px; }
    .achievements { margin: 15px 0; }
    .achievements li { margin: 8px 0; }
    .signature { margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
    .contact { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p>${greeting}</p>
    </div>

    <div class="content">
      <p>I hope this email finds you well. I am <strong>${userProfile.name}</strong>, a <strong>${userProfile.title}</strong> with <strong>${userProfile.yearsOfExperience}+ years</strong> of experience in building scalable web applications.</p>

      <p>I am reaching out to inquire about any current or upcoming opportunities at <strong>${companyName}</strong>. I am particularly interested in roles involving full-stack development, backend engineering, or software architecture.</p>

      ${customMessage ? `<p>${customMessage}</p>` : ''}

      <div class="skills">
        <strong>Technical Skills:</strong><br>
        ${userProfile.skills.expert.map(s => `<span class="skill-tag">${s}</span>`).join('')}
        ${userProfile.skills.proficient.slice(0, 5).map(s => `<span class="skill-tag">${s}</span>`).join('')}
      </div>

      <div class="achievements">
        <strong>Key Achievements:</strong>
        <ul>
          ${userProfile.achievements.slice(0, 3).map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>

      <p>I would welcome the opportunity to discuss how my skills and experience could contribute to ${companyName}'s success. I have attached my resume for your reference and am available for a call at your convenience.</p>

      <p>Thank you for considering my application. I look forward to hearing from you.</p>
    </div>

    <div class="signature">
      <p>Best regards,<br>
      <strong>${userProfile.name}</strong><br>
      ${userProfile.title}</p>

      <div class="contact">
        <p>
          📧 ${userProfile.email}<br>
          📱 ${userProfile.phone}<br>
          📍 ${userProfile.location}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({
      to: toEmail,
      subject,
      body,
    });
  }

  /**
   * Verify the transporter is working
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      this.emailLogger.info('Gmail SMTP connection verified');
      return true;
    } catch (error) {
      this.emailLogger.error('Gmail SMTP verification failed:', error);
      return false;
    }
  }

  /**
   * Get daily email stats
   */
  getStats(): { sent: number; remaining: number; limit: number } {
    return {
      sent: this.dailySentCount,
      remaining: this.getRemainingEmails(),
      limit: config.coldEmail.dailyLimit,
    };
  }
}

export const emailSenderService = new EmailSenderService();
