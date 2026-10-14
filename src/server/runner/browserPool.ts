import { chromium, Browser, BrowserContext } from 'playwright';

export class BrowserPool {
  private browser: Browser | null = null;
  private isLaunching = false;

  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.isLaunching) {
      // Wait for in-flight launch
      while (this.isLaunching) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (this.browser && this.browser.isConnected()) {
        return this.browser;
      }
    }

    this.isLaunching = true;
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      return this.browser;
    } finally {
      this.isLaunching = false;
    }
  }

  /**
   * Creates a fresh, hermetic BrowserContext with zero shared cookies/storage,
   * service workers blocked, and network route interception active.
   */
  async createHermeticContext(browser: Browser, allowedPort: number = 3000): Promise<BrowserContext> {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      ignoreHTTPSErrors: false,
      viewport: { width: 1280, height: 800 },
    });

    // Close any unrequested popups/tabs automatically
    context.on('page', (page) => {
      page.on('popup', (popup) => popup.close().catch(() => {}));
    });

    // Route restriction: block all external requests and non-whitelisted paths
    await context.route('**', (route) => {
      const url = route.request().url();
      const allowedLocalPrefix = `http://127.0.0.1:${allowedPort}/`;
      const allowedLocalhostPrefix = `http://localhost:${allowedPort}/`;

      if (url.startsWith(allowedLocalPrefix) || url.startsWith(allowedLocalhostPrefix)) {
        // Only permit fixtures and static assets
        const pathPart = url.replace(allowedLocalPrefix, '').replace(allowedLocalhostPrefix, '');
        if (
          pathPart.startsWith('fixtures/') ||
          pathPart.startsWith('assets/') ||
          pathPart.startsWith('src/') ||
          pathPart.startsWith('@vite/') ||
          pathPart.startsWith('@react-refresh')
        ) {
          return route.continue();
        }
      }

      // Block all external domains, redirects, and unauthorized local paths
      return route.abort('blockedbyclient');
    });

    return context;
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
    }
  }
}

export const browserPool = new BrowserPool();
