import { Platform } from '@prisma/client';
import { BaseApplicator, ApplyResult, ApplicationWithJob } from './base.applicator.js';
import { config } from '../config/index.js';
import { userProfile } from '../config/search-criteria.js';
import { applicatorLogger as logger } from '../services/logger.service.js';
import fs from 'fs';

export class NaukriApplicator extends BaseApplicator {
  constructor() {
    super('NAUKRI' as Platform);
  }

  async login(): Promise<boolean> {
    if (!this.page) {
      throw new Error('Applicator not initialized. Call initialize() first.');
    }

    const { email, password } = config.credentials.naukri;

    if (!email || !password) {
      logger.warn('Naukri credentials not configured');
      return false;
    }

    try {
      logger.info('Logging in to Naukri...');

      await this.page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });
      await this.delay(3000);

      // Check if already logged in
      const alreadyLoggedIn = await this.page.$('.nI-gNb-drawer__icon, .user-initials, [class*="user-icon"], [class*="profile-icon"], .nI-gNb-icon');
      if (alreadyLoggedIn) {
        logger.info('Already logged in to Naukri');
        this.isLoggedIn = true;
        return true;
      }

      // Wait for login form
      await this.page.waitForSelector('form, [class*="login"], [class*="Login"]', { timeout: 10000 }).catch(() => {});
      await this.delay(2000);

      // Try multiple selectors for email field
      const emailSelectors = [
        'input[type="text"][placeholder*="Email"]',
        'input[type="text"][placeholder*="email"]',
        'input[type="email"]',
        'input[placeholder*="Enter"]',
        'input#usernameField',
        'input[name="username"]',
        'input[name="email"]',
        'form input[type="text"]:first-of-type',
      ];

      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          const emailField = await this.page.$(selector);
          if (emailField && await emailField.isVisible()) {
            await emailField.click();
            await this.delay(300);
            await emailField.fill(email);
            logger.info(`Email entered using selector: ${selector}`);
            emailFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!emailFilled) {
        logger.error('Could not find email field');
        await this.takeScreenshot('login_no_email_field');
        return false;
      }

      await this.delay(1000);

      // Try multiple selectors for password field
      const passwordSelectors = [
        'input[type="password"]',
        'input[placeholder*="Password"]',
        'input[placeholder*="password"]',
        'input#passwordField',
        'input[name="password"]',
      ];

      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          const passwordField = await this.page.$(selector);
          if (passwordField && await passwordField.isVisible()) {
            await passwordField.click();
            await this.delay(300);
            await passwordField.fill(password);
            logger.info(`Password entered using selector: ${selector}`);
            passwordFilled = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!passwordFilled) {
        logger.error('Could not find password field');
        await this.takeScreenshot('login_no_password_field');
        return false;
      }

      await this.delay(1000);

      // Try multiple selectors for login button
      const loginButtonSelectors = [
        'button[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("login")',
        'button:has-text("Sign in")',
        'button[class*="login"]',
        'button[class*="Login"]',
        'input[type="submit"]',
        'form button',
      ];

      let loginClicked = false;
      for (const selector of loginButtonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button && await button.isVisible()) {
            await button.click();
            logger.info(`Login button clicked using selector: ${selector}`);
            loginClicked = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!loginClicked) {
        await this.page.keyboard.press('Enter');
        logger.info('Pressed Enter to submit login form');
      }

      // Wait for navigation
      await this.waitForNavigation();
      await this.delay(4000);

      // Verify login success
      const successIndicators = [
        '.nI-gNb-drawer__icon',
        '.user-initials',
        '[class*="user-icon"]',
        '[class*="profile"]',
        '.nI-gNb-icon',
        '[class*="logged"]',
        'a[href*="logout"]',
      ];

      for (const selector of successIndicators) {
        const element = await this.page.$(selector);
        if (element) {
          logger.info('Naukri login successful');
          this.isLoggedIn = true;
          await this.takeScreenshot('login_success');
          return true;
        }
      }

      // Check URL for success
      const currentUrl = this.page.url();
      if (currentUrl.includes('homepage') || currentUrl.includes('dashboard') || !currentUrl.includes('login')) {
        logger.info('Naukri login successful (URL check)');
        this.isLoggedIn = true;
        await this.takeScreenshot('login_success');
        return true;
      }

      // Check for error messages
      const errorMsg = await this.safeGetText('.error-msg, .errMsg, [class*="error"]');
      if (errorMsg) {
        logger.error(`Naukri login failed: ${errorMsg}`);
      }

      await this.takeScreenshot('login_failed');
      return false;
    } catch (error) {
      logger.error('Naukri login error:', error);
      await this.takeScreenshot('login_error');
      return false;
    }
  }

  async applyToJob(application: ApplicationWithJob, coverLetter: string): Promise<ApplyResult> {
    if (!this.page) {
      throw new Error('Applicator not initialized');
    }

    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        return {
          success: false,
          errorMessage: 'Failed to login to Naukri',
        };
      }
    }

    const { job } = application;
    logger.info(`Applying to: ${job.title} at ${job.companyName}`);

    try {
      // Navigate to job page
      await this.page.goto(job.url, { waitUntil: 'networkidle' });
      await this.delay(2000);

      // Take screenshot of job page
      await this.takeScreenshot(`job_${job.externalId}_before`);

      // Check if already applied
      const alreadyApplied = await this.checkIfAlreadyApplied();
      if (alreadyApplied) {
        logger.info(`Already applied to ${job.title} at ${job.companyName}`);
        return {
          success: true,
          errorMessage: 'Already applied',
        };
      }

      // Find and click apply button
      const applyClicked = await this.clickApplyButton();
      if (!applyClicked) {
        const screenshotPath = await this.takeScreenshot(`job_${job.externalId}_no_apply_button`);
        return {
          success: false,
          errorMessage: 'Could not find apply button',
          screenshotPath: screenshotPath || undefined,
        };
      }

      await this.delay(2000);

      // Handle apply modal/form
      const formHandled = await this.handleApplyForm(coverLetter);
      if (!formHandled) {
        const screenshotPath = await this.takeScreenshot(`job_${job.externalId}_form_error`);
        return {
          success: false,
          errorMessage: 'Failed to complete application form',
          screenshotPath: screenshotPath || undefined,
        };
      }

      // Wait for submission
      await this.delay(3000);

      // Verify application success
      const success = await this.verifyApplicationSuccess();

      // Take final screenshot
      const screenshotPath = await this.takeScreenshot(`job_${job.externalId}_${success ? 'success' : 'final'}`);

      if (success) {
        logger.info(`Successfully applied to ${job.title} at ${job.companyName}`);
        return {
          success: true,
          screenshotPath: screenshotPath || undefined,
        };
      } else {
        // Even if we can't verify, if we got this far it likely succeeded
        logger.info(`Application submitted (unverified) for ${job.title} at ${job.companyName}`);
        return {
          success: true,
          screenshotPath: screenshotPath || undefined,
          errorMessage: 'Application submitted but success not verified',
        };
      }
    } catch (error) {
      logger.error(`Error applying to ${job.title}:`, error);
      const screenshotPath = await this.takeScreenshot(`job_${job.externalId}_error`);
      return {
        success: false,
        errorMessage: String(error),
        screenshotPath: screenshotPath || undefined,
      };
    }
  }

  private async checkIfAlreadyApplied(): Promise<boolean> {
    if (!this.page) return false;

    const appliedIndicators = [
      'text=Already Applied',
      'text=Applied',
      '.already-applied',
      '[class*="applied"]',
      'button:has-text("Applied")',
    ];

    for (const selector of appliedIndicators) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text?.toLowerCase().includes('applied')) {
            return true;
          }
        }
      } catch {
        // Continue checking
      }
    }

    return false;
  }

  private async clickApplyButton(): Promise<boolean> {
    if (!this.page) return false;

    // List of possible apply button selectors (Naukri changes these frequently)
    const applySelectors = [
      'button:has-text("Apply")',
      'button:has-text("Apply on company site")',
      'button:has-text("Apply Now")',
      'button:has-text("Quick Apply")',
      'a:has-text("Apply")',
      '.apply-btn',
      '.apply-button',
      '#apply-button',
      'button[id*="apply"]',
      'button[class*="apply"]',
      '[data-action="apply"]',
      '.styles_jhc__apply-button__jRVUn', // Common Naukri class
      '.jd-header-apply-btn',
    ];

    for (const selector of applySelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          const isDisabled = await button.getAttribute('disabled');
          if (isDisabled) continue;

          const isVisible = await button.isVisible();
          if (!isVisible) continue;

          await this.scrollToElement(selector);
          await this.delay(500);
          await button.click();
          logger.info(`Clicked apply button: ${selector}`);
          return true;
        }
      } catch {
        // Try next selector
      }
    }

    // Try with force click as fallback
    for (const selector of applySelectors.slice(0, 5)) {
      try {
        await this.page.click(selector, { force: true, timeout: 2000 });
        logger.info(`Force clicked apply button: ${selector}`);
        return true;
      } catch {
        // Try next
      }
    }

    logger.warn('Could not find apply button');
    return false;
  }

  private async handleApplyForm(coverLetter: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.delay(1500);

      // Check if a modal appeared
      const modalSelectors = [
        '.apply-modal',
        '.modal-dialog',
        '[class*="modal"]',
        '[class*="Modal"]',
        '.chatbot-container',
        '.apply-form',
      ];

      for (const selector of modalSelectors) {
        const modal = await this.page.$(selector);
        if (modal && await modal.isVisible()) {
          logger.info(`Found apply modal: ${selector}`);
          break;
        }
      }

      // Handle chatbot-style application (common on Naukri)
      await this.handleChatbotApplication(coverLetter);

      // Handle traditional form fields
      await this.handleFormFields(coverLetter);

      // Handle resume upload if required
      await this.handleResumeUpload();

      // Look for submit/confirm button
      const submitSelectors = [
        'button:has-text("Submit")',
        'button:has-text("Apply")',
        'button:has-text("Confirm")',
        'button:has-text("Send")',
        'button[type="submit"]',
        '.submit-btn',
        '.apply-submit',
        '[class*="submit"]',
      ];

      for (const selector of submitSelectors) {
        try {
          const submitBtn = await this.page.$(selector);
          if (submitBtn && await submitBtn.isVisible()) {
            await this.delay(500);
            await submitBtn.click();
            logger.info(`Clicked submit button: ${selector}`);
            return true;
          }
        } catch {
          // Try next
        }
      }

      // If no submit button found, application might have auto-submitted
      return true;
    } catch (error) {
      logger.error('Error handling apply form:', error);
      return false;
    }
  }

  private async handleChatbotApplication(_coverLetter: string): Promise<void> {
    if (!this.page) return;

    try {
      // Naukri sometimes uses a chatbot-style form
      // Handle questions one by one

      const maxIterations = 10;
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;
        await this.delay(1000);

        // Look for input fields in chatbot
        const inputField = await this.page.$('input[type="text"]:visible, textarea:visible');
        if (inputField) {
          const placeholder = await inputField.getAttribute('placeholder') || '';
          const answer = this.getAnswerForQuestion(placeholder);
          if (answer) {
            await inputField.fill(answer);
            await this.delay(500);

            // Press Enter or click next
            await this.page.keyboard.press('Enter');
            await this.delay(1000);
            continue;
          }
        }

        // Look for radio buttons / multiple choice
        const radioGroup = await this.page.$$('input[type="radio"]');
        if (radioGroup.length > 0) {
          // Select first option by default (usually "Yes" for experience questions)
          await radioGroup[0].click();
          await this.delay(500);

          // Look for continue button
          const nextBtn = await this.page.$('button:has-text("Continue"), button:has-text("Next")');
          if (nextBtn) {
            await nextBtn.click();
          }
          continue;
        }

        // Look for dropdowns
        const dropdown = await this.page.$('select:visible');
        if (dropdown) {
          // Select first non-empty option
          await dropdown.selectOption({ index: 1 });
          await this.delay(500);
          continue;
        }

        // If no more interactive elements, break
        break;
      }
    } catch (error) {
      logger.debug('Chatbot handling completed or error:', error);
    }
  }

  private async handleFormFields(coverLetter: string): Promise<void> {
    if (!this.page) return;

    try {
      const profile = this.getUserProfile();

      // Fill common form fields
      const fieldMappings: Record<string, string> = {
        'input[name*="name"], input[placeholder*="Name"]': profile.name,
        'input[name*="email"], input[placeholder*="Email"]': profile.email,
        'input[name*="phone"], input[placeholder*="Phone"], input[placeholder*="Mobile"]': profile.phone,
        'input[name*="experience"], input[placeholder*="Experience"]': String(profile.yearsOfExperience),
        'input[name*="notice"], input[placeholder*="Notice"]': profile.preferences.noticePeriod,
        'textarea[name*="cover"], textarea[placeholder*="Cover"]': coverLetter,
        'textarea[name*="message"], textarea[placeholder*="Message"]': coverLetter,
      };

      for (const [selector, value] of Object.entries(fieldMappings)) {
        try {
          const field = await this.page.$(selector);
          if (field && await field.isVisible()) {
            const currentValue = await field.inputValue();
            if (!currentValue) {
              await field.fill(value);
              logger.debug(`Filled field: ${selector}`);
            }
          }
        } catch {
          // Field not found, continue
        }
      }

      // Handle experience dropdown
      const expDropdown = await this.page.$('select[name*="experience"]');
      if (expDropdown) {
        try {
          await expDropdown.selectOption({ label: `${profile.yearsOfExperience} Years` });
        } catch {
          // Try selecting by value
          await expDropdown.selectOption({ value: String(profile.yearsOfExperience) }).catch(() => {});
        }
      }

      // Handle current CTC / Expected CTC
      const ctcFields = await this.page.$$('input[placeholder*="CTC"], input[name*="ctc"], input[placeholder*="Salary"]');
      for (const field of ctcFields) {
        const placeholder = await field.getAttribute('placeholder') || '';
        if (placeholder.toLowerCase().includes('current')) {
          await field.fill(String(userProfile.salary.currentCTC)).catch(() => {});
        } else if (placeholder.toLowerCase().includes('expected')) {
          await field.fill(String(userProfile.salary.expectedCTC)).catch(() => {});
        }
      }
    } catch (error) {
      logger.debug('Form field handling completed or error:', error);
    }
  }

  private async handleResumeUpload(): Promise<void> {
    if (!this.page) return;

    try {
      const resumePath = this.getResumePath();

      // Check if resume file exists
      if (!fs.existsSync(resumePath)) {
        logger.warn('Resume file not found at:', resumePath);
        return;
      }

      // Look for file input
      const fileInputSelectors = [
        'input[type="file"]',
        'input[accept*="pdf"]',
        'input[accept*="doc"]',
        'input[name*="resume"]',
        'input[name*="cv"]',
      ];

      for (const selector of fileInputSelectors) {
        try {
          const fileInput = await this.page.$(selector);
          if (fileInput) {
            await fileInput.setInputFiles(resumePath);
            logger.info('Resume uploaded successfully');
            await this.delay(2000); // Wait for upload
            return;
          }
        } catch {
          // Try next selector
        }
      }

      // Check for upload button that triggers file dialog
      const uploadBtn = await this.page.$('button:has-text("Upload"), [class*="upload"]');
      if (uploadBtn) {
        const fileChooserPromise = this.page.waitForEvent('filechooser', { timeout: 5000 });
        await uploadBtn.click();
        try {
          const fileChooser = await fileChooserPromise;
          await fileChooser.setFiles(resumePath);
          logger.info('Resume uploaded via file chooser');
          await this.delay(2000);
        } catch {
          // File chooser didn't appear
        }
      }
    } catch (error) {
      logger.debug('Resume upload handling completed or error:', error);
    }
  }

  private async verifyApplicationSuccess(): Promise<boolean> {
    if (!this.page) return false;

    const successIndicators = [
      'text=Application Submitted',
      'text=Successfully Applied',
      'text=Applied Successfully',
      'text=Thank you for applying',
      'text=Your application has been sent',
      'text=Application sent',
      '.success-message',
      '[class*="success"]',
      '.congratulations',
    ];

    for (const selector of successIndicators) {
      try {
        const element = await this.page.$(selector);
        if (element && await element.isVisible()) {
          return true;
        }
      } catch {
        // Continue checking
      }
    }

    // Also check page content
    const pageContent = await this.page.content();
    const successTexts = ['successfully applied', 'application submitted', 'thank you for applying', 'applied successfully'];

    for (const text of successTexts) {
      if (pageContent.toLowerCase().includes(text)) {
        return true;
      }
    }

    return false;
  }

  private getAnswerForQuestion(question: string): string | null {
    const profile = this.getUserProfile();
    const q = question.toLowerCase();

    // Common Naukri chatbot questions
    if (q.includes('experience') || q.includes('years')) {
      return String(profile.yearsOfExperience);
    }
    if (q.includes('notice period') || q.includes('notice')) {
      return profile.preferences.noticePeriod;
    }
    if (q.includes('current ctc') || q.includes('current salary')) {
      return String(userProfile.salary.currentCTC);
    }
    if (q.includes('expected ctc') || q.includes('expected salary')) {
      return String(userProfile.salary.expectedCTC);
    }
    if (q.includes('location') || q.includes('city')) {
      return profile.location;
    }
    if (q.includes('name')) {
      return profile.name;
    }
    if (q.includes('email')) {
      return profile.email;
    }
    if (q.includes('phone') || q.includes('mobile')) {
      return profile.phone;
    }

    return null;
  }
}

export const naukriApplicator = new NaukriApplicator();
