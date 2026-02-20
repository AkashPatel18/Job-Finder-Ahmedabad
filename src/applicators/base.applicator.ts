import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { Platform, Application, Job } from '@prisma/client';
import { config } from '../config/index.js';
import { applicatorLogger as logger } from '../services/logger.service.js';
import { userProfile } from '../config/search-criteria.js';
import path from 'path';
import fs from 'fs';

export interface ApplyResult {
  success: boolean;
  screenshotPath?: string;
  errorMessage?: string;
  confirmationId?: string;
}

export interface ApplicationWithJob extends Application {
  job: Job;
}

export abstract class BaseApplicator {
  protected platform: Platform;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected isLoggedIn = false;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async initialize(headless = true): Promise<void> {
    logger.info(`Initializing ${this.platform} applicator with enhanced stealth mode`);

    // Ensure directories exist
    const screenshotDir = path.join(process.cwd(), 'data', 'screenshots');
    const sessionDir = path.join(process.cwd(), 'data', 'sessions');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless,
      args: [
        // Anti-detection flags
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        // Performance
        '--disable-gpu',
        '--disable-software-rasterizer',
        // Appear more like a real browser
        '--window-size=1920,1080',
        '--start-maximized',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-background-networking',
      ],
    };

    // Add proxy if configured
    if (config.proxy.enabled && config.proxy.url) {
      launchOptions.proxy = { server: config.proxy.url };
    }

    this.browser = await chromium.launch(launchOptions);

    // Use persistent context for session cookies (helps avoid repeated logins)
    const sessionPath = path.join(sessionDir, `${this.platform.toLowerCase()}_session`);

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: this.getRandomUserAgent(),
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      geolocation: { latitude: 23.0225, longitude: 72.5714 }, // Ahmedabad coordinates
      permissions: ['geolocation'],
      // More realistic browser settings
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      // Extra HTTP headers to appear more legitimate
      extraHTTPHeaders: {
        'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    // COMPREHENSIVE STEALTH SCRIPTS
    await this.context.addInitScript(() => {
      // 1. Override webdriver detection
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Delete webdriver property completely
      // @ts-ignore
      delete navigator.__proto__.webdriver;

      // 2. Override plugins to appear normal
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ];
          // Make it look like a real PluginArray
          const pluginArray = Object.create(PluginArray.prototype);
          plugins.forEach((p, i) => {
            pluginArray[i] = p;
          });
          pluginArray.length = plugins.length;
          pluginArray.item = (i: number) => plugins[i];
          pluginArray.namedItem = (name: string) => plugins.find(p => p.name === name);
          pluginArray.refresh = () => {};
          return pluginArray;
        },
      });

      // 3. Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-IN', 'en-US', 'en', 'hi'],
      });

      // 4. Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'MacIntel',
      });

      // 5. Override hardware concurrency (CPU cores)
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      });

      // 6. Override device memory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });

      // 7. Override connection
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
        }),
      });

      // 8. Fix permissions API
      const originalQuery = window.navigator.permissions.query;
      // @ts-ignore
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // 9. Override chrome runtime (common detection point)
      // @ts-ignore
      window.chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {},
      };

      // 10. Override toString methods to hide automation
      const originalFunction = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === Function.prototype.toString) {
          return 'function toString() { [native code] }';
        }
        return originalFunction.call(this);
      };

      // 11. Canvas fingerprint randomization
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      // @ts-ignore
      HTMLCanvasElement.prototype.getContext = function(type: string, attributes?: any) {
        const context = originalGetContext.call(this, type, attributes);
        if (type === '2d' && context) {
          // @ts-ignore
          const originalFillText = context.fillText.bind(context);
          // @ts-ignore
          context.fillText = function(text: string, x: number, y: number, maxWidth?: number) {
            // Add tiny random offset to avoid fingerprinting
            const offset = Math.random() * 0.01;
            return originalFillText(text, x + offset, y + offset, maxWidth);
          };
        }
        return context;
      };

      // 12. WebGL fingerprint protection
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        // Randomize certain WebGL parameters
        if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
          return 'Google Inc. (Apple)';
        }
        if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
          return 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)';
        }
        return getParameter.call(this, parameter);
      };

      // 13. Audio context fingerprint protection
      const originalGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function(channel: number) {
        const data = originalGetChannelData.call(this, channel);
        // Add tiny noise to audio fingerprint
        for (let i = 0; i < data.length; i += 100) {
          data[i] = data[i] + Math.random() * 0.0001;
        }
        return data;
      };

      // 14. Hide automation indicators in window
      // @ts-ignore
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      // @ts-ignore
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      // @ts-ignore
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    });

    this.page = await this.context.newPage();

    // Add mouse movement simulation to appear more human
    await this.simulateInitialMouseMovement();

    logger.info(`${this.platform} applicator initialized with stealth mode`);
  }

  async cleanup(): Promise<void> {
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});

    this.page = null;
    this.context = null;
    this.browser = null;
    this.isLoggedIn = false;

    logger.info(`${this.platform} applicator cleaned up`);
  }

  abstract login(): Promise<boolean>;
  abstract applyToJob(application: ApplicationWithJob, coverLetter: string): Promise<ApplyResult>;

  // Simulate human-like mouse movement
  protected async simulateInitialMouseMovement(): Promise<void> {
    if (!this.page) return;

    try {
      // Move mouse in a natural curved pattern
      const points = [
        { x: 100, y: 100 },
        { x: 300, y: 200 },
        { x: 500, y: 150 },
        { x: 700, y: 300 },
      ];

      for (const point of points) {
        await this.page.mouse.move(point.x, point.y, { steps: 10 });
        await this.delay(100 + Math.random() * 200);
      }
    } catch {
      // Ignore mouse movement errors
    }
  }

  // Simulate human-like scrolling
  protected async humanScroll(direction: 'down' | 'up' = 'down', amount = 300): Promise<void> {
    if (!this.page) return;

    try {
      const scrollAmount = direction === 'down' ? amount : -amount;

      // Scroll in small increments with random delays
      const steps = 5;
      const stepAmount = scrollAmount / steps;

      for (let i = 0; i < steps; i++) {
        await this.page.mouse.wheel(0, stepAmount);
        await this.delay(50 + Math.random() * 100);
      }
    } catch {
      // Ignore scroll errors
    }
  }

  // Move mouse to element before clicking (more human-like)
  protected async humanClick(selector: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      const element = await this.page.waitForSelector(selector, { timeout: 5000 });
      if (!element) return false;

      const box = await element.boundingBox();
      if (!box) return false;

      // Move mouse to element with curve
      const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
      const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * 10;

      await this.page.mouse.move(targetX, targetY, { steps: 20 });
      await this.delay(100 + Math.random() * 200);
      await this.page.mouse.click(targetX, targetY);

      return true;
    } catch {
      return false;
    }
  }

  protected async delay(ms?: number): Promise<void> {
    const delayTime = ms ?? 2000;
    // Add more randomness to appear human
    const randomDelay = delayTime + Math.random() * 1500 + Math.random() * 500;
    await new Promise(resolve => setTimeout(resolve, randomDelay));
  }

  protected async humanType(selector: string, text: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    // Move mouse to element first
    await this.humanClick(selector).catch(() => {});
    await this.delay(200);

    // Clear existing text
    await this.page.fill(selector, '');
    await this.delay(100);

    // Type with variable delays (like a real person)
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      // Occasional longer pauses (like thinking)
      if (Math.random() < 0.05) {
        await this.delay(300 + Math.random() * 500);
      }
      // Variable typing speed
      await this.page.type(selector, char, { delay: 30 + Math.random() * 100 });
    }
  }

  protected async safeClick(selector: string, timeout = 5000): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.waitForSelector(selector, { timeout });
      await this.delay(300);
      // Use human-like click
      return await this.humanClick(selector);
    } catch {
      logger.debug(`Could not click selector: ${selector}`);
      return false;
    }
  }

  protected async safeGetText(selector: string): Promise<string> {
    if (!this.page) return '';

    try {
      const element = await this.page.waitForSelector(selector, { timeout: 3000 });
      return (await element?.textContent())?.trim() ?? '';
    } catch {
      return '';
    }
  }

  protected async takeScreenshot(name: string): Promise<string | null> {
    if (!this.page) return null;

    try {
      const filename = `${this.platform.toLowerCase()}_${name}_${Date.now()}.png`;
      const filepath = path.join(process.cwd(), 'data', 'screenshots', filename);
      await this.page.screenshot({ path: filepath, fullPage: false });
      logger.info(`Screenshot saved: ${filename}`);
      return filepath;
    } catch (error) {
      logger.error('Failed to take screenshot:', error);
      return null;
    }
  }

  protected async waitForNavigation(timeout = 30000): Promise<void> {
    if (!this.page) return;
    await this.page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  }

  protected async scrollToElement(selector: string): Promise<void> {
    if (!this.page) return;

    try {
      await this.page.evaluate((sel) => {
        const element = document.querySelector(sel);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, selector);
      await this.delay(500);
    } catch {
      // Ignore scroll errors
    }
  }

  protected getUserProfile() {
    return userProfile;
  }

  protected getResumePath(): string {
    return path.join(process.cwd(), 'data', 'resume.pdf');
  }

  private getRandomUserAgent(): string {
    // More recent and realistic user agents
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
}
