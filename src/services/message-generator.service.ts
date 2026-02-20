import { userProfile } from '../config/search-criteria.js';
import { logger } from './logger.service.js';

interface JobInfo {
  title: string;
  companyName: string;
  location?: string | null;
  description?: string | null;
  skills?: string[];
}

interface GeneratedMessages {
  linkedinMessage: string;
  linkedinConnectionNote: string;
  linkedinInMail: string;
  emailSubject: string;
  emailBody: string;
  formData: FormData;
}

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  portfolioUrl: string;
  currentLocation: string;
  yearsOfExperience: number;
  currentCTC: string;
  expectedCTC: string;
  noticePeriod: string;
  skills: string;
  coverLetter: string;
  whyJoin: string;
}

class MessageGeneratorService {
  /**
   * Generate all messages for a job
   */
  async generateMessages(job: JobInfo): Promise<GeneratedMessages> {
    const linkedinMessage = this.generateLinkedInConnectionMessage(job);
    const linkedinConnectionNote = this.generateLinkedInConnectionNote(job);
    const linkedinInMail = this.generateLinkedInInMail(job);
    const emailSubject = this.generateEmailSubject(job);
    const emailBody = this.generateEmailBody(job);
    const formData = this.generateFormData(job);

    return {
      linkedinMessage,
      linkedinConnectionNote,
      linkedinInMail,
      emailSubject,
      emailBody,
      formData,
    };
  }

  /**
   * LinkedIn connection message (short, under 300 chars)
   */
  generateLinkedInConnectionMessage(job: JobInfo): string {
    return `Hi! I noticed the ${job.title} opening at ${job.companyName}. With ${userProfile.yearsOfExperience}+ years in ${userProfile.skills.expert.slice(0, 3).join(', ')}, I'd love to connect and learn more about this opportunity. Thank you!`;
  }

  /**
   * LinkedIn connection note (very short, under 200 chars)
   */
  generateLinkedInConnectionNote(job: JobInfo): string {
    return `Hi! Interested in ${job.title} at ${job.companyName}. ${userProfile.yearsOfExperience}+ yrs exp in ${userProfile.skills.expert[0]}. Would love to connect!`;
  }

  /**
   * LinkedIn InMail (longer, more detailed)
   */
  generateLinkedInInMail(job: JobInfo): string {
    const relevantSkills = this.getRelevantSkills(job);

    return `Hi,

I came across the ${job.title} position at ${job.companyName} and I'm very interested in this opportunity.

With ${userProfile.yearsOfExperience}+ years of experience as a ${userProfile.title}, I have strong expertise in ${relevantSkills.join(', ')}.

Key highlights:
${userProfile.achievements.slice(0, 2).map(a => `• ${a}`).join('\n')}

I would love to discuss how my background aligns with ${job.companyName}'s needs.

Looking forward to hearing from you!

Best regards,
${userProfile.name}
${userProfile.phone}
${userProfile.email}`;
  }

  /**
   * Email subject line
   */
  generateEmailSubject(job: JobInfo): string {
    return `Application for ${job.title} - ${userProfile.name} | ${userProfile.yearsOfExperience}+ Years ${userProfile.skills.expert[0]} Experience`;
  }

  /**
   * Cold email body
   */
  generateEmailBody(job: JobInfo): string {
    const relevantSkills = this.getRelevantSkills(job);

    return `Dear Hiring Team,

I am writing to express my strong interest in the ${job.title} position at ${job.companyName}.

As a ${userProfile.title} with ${userProfile.yearsOfExperience}+ years of experience, I bring expertise in ${relevantSkills.join(', ')}. My background includes working on:

${userProfile.achievements.slice(0, 3).map(a => `• ${a}`).join('\n')}

I am particularly drawn to ${job.companyName} because of the innovative work in ${this.inferCompanyDomain(job)}.

I have attached my resume for your review. I would welcome the opportunity to discuss how my skills and experience can contribute to your team.

Thank you for considering my application.

Best regards,
${userProfile.name}
${userProfile.phone}
${userProfile.email}
LinkedIn: https://linkedin.com/in/akashpatel1804`;
  }

  /**
   * Generate form data for quick copy-paste
   */
  generateFormData(job: JobInfo): FormData {
    const relevantSkills = this.getRelevantSkills(job);

    return {
      fullName: userProfile.name,
      email: userProfile.email,
      phone: userProfile.phone,
      linkedinUrl: 'https://linkedin.com/in/akashpatel1804',
      portfolioUrl: 'https://github.com/akashpatel1804',
      currentLocation: userProfile.location,
      yearsOfExperience: userProfile.yearsOfExperience,
      currentCTC: `${userProfile.salary.currentCTC} LPA`,
      expectedCTC: `${userProfile.salary.expectedCTC} LPA`,
      noticePeriod: userProfile.preferences.noticePeriod,
      skills: relevantSkills.join(', '),
      coverLetter: this.generateShortCoverLetter(job),
      whyJoin: this.generateWhyJoin(job),
    };
  }

  /**
   * Short cover letter for forms
   */
  private generateShortCoverLetter(job: JobInfo): string {
    const relevantSkills = this.getRelevantSkills(job);

    return `I am excited to apply for the ${job.title} position at ${job.companyName}. With ${userProfile.yearsOfExperience}+ years of experience in ${relevantSkills.slice(0, 3).join(', ')}, I am confident in my ability to contribute effectively to your team.

My key achievements include:
${userProfile.achievements.slice(0, 2).map(a => `• ${a}`).join('\n')}

I am particularly interested in ${job.companyName}'s work and believe my skills align well with this role. I am available with a ${userProfile.preferences.noticePeriod} notice period.

Looking forward to discussing this opportunity.`;
  }

  /**
   * Generate "Why do you want to join" answer
   */
  private generateWhyJoin(job: JobInfo): string {
    const domain = this.inferCompanyDomain(job);

    return `I am drawn to ${job.companyName} for several reasons:

1. The opportunity to work on ${domain}-related challenges excites me as it aligns with my career goals.

2. The ${job.title} role perfectly matches my ${userProfile.yearsOfExperience}+ years of experience in ${userProfile.skills.expert.slice(0, 2).join(' and ')}.

3. I believe my background in ${userProfile.domains.slice(0, 2).join(' and ')} can bring valuable perspective to the team.

4. ${job.companyName}'s growth trajectory presents excellent opportunities for professional development.`;
  }

  /**
   * Get skills relevant to the job
   */
  private getRelevantSkills(job: JobInfo): string[] {
    const jobSkills = job.skills || [];
    const jobDescription = (job.description || '').toLowerCase();

    // Find matching skills from user profile
    const allUserSkills = [
      ...userProfile.skills.expert,
      ...userProfile.skills.proficient,
      ...userProfile.skills.familiar,
    ];

    const relevantSkills = allUserSkills.filter(skill => {
      const skillLower = skill.toLowerCase();
      return (
        jobSkills.some(js => js.toLowerCase().includes(skillLower)) ||
        jobDescription.includes(skillLower)
      );
    });

    // If no matches, return expert skills
    return relevantSkills.length > 0
      ? relevantSkills.slice(0, 5)
      : userProfile.skills.expert.slice(0, 5);
  }

  /**
   * Infer company domain from job info
   */
  private inferCompanyDomain(job: JobInfo): string {
    const description = (job.description || '').toLowerCase();
    const company = job.companyName.toLowerCase();

    if (description.includes('fintech') || description.includes('banking') || description.includes('payment')) {
      return 'fintech and financial technology';
    }
    if (description.includes('health') || description.includes('medical')) {
      return 'healthcare technology';
    }
    if (description.includes('ecommerce') || description.includes('retail')) {
      return 'e-commerce';
    }
    if (description.includes('edtech') || description.includes('education')) {
      return 'education technology';
    }
    if (description.includes('saas') || description.includes('b2b')) {
      return 'SaaS and B2B solutions';
    }
    if (description.includes('ai') || description.includes('machine learning')) {
      return 'AI and machine learning';
    }
    if (description.includes('security') || description.includes('cyber')) {
      return 'cybersecurity';
    }

    return 'technology innovation';
  }
}

export const messageGeneratorService = new MessageGeneratorService();
