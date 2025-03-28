import { test as base, expect, chromium, Worker, Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ExtensionPage } from './pages/ExtensionPage';
import { WebPage } from './pages/WebPage';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set in environment variables');
}

type TestFixtures = {
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
  extensionId: string;
  extensionPage: Page;
};

const test = base.extend<TestFixtures>({
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, '../dist');
    const userDataDir = path.join(__dirname, 'test-user-data-dir');
    
    console.log(`Loading extension from: ${pathToExtension}`);
    console.log(`User data directory: ${userDataDir}`);
    
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        `--no-sandbox`,
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
      timeout: 60000,
    });
    
    await use(context);
    
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let serviceWorker: Worker | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (!serviceWorker && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const workers = context.serviceWorkers();
     
      if (workers.length > 0) {
        serviceWorker = workers.find(worker => worker.url().includes('background')) || null;
      }
      attempts++;
    }

    if (!serviceWorker) {
      throw new Error(`Could not find extension service worker after ${maxAttempts} attempts`);
    }

    const extensionId = serviceWorker.url().split('/')[2];
    console.log('Extension ID detected:', extensionId);
    await use(extensionId);
  },

  extensionPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    
    try {
      await page.goto(`chrome-extension://${extensionId}/popup.html`, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      
      await page.evaluate(() => {
        console.log('Extension popup DOM:', document.documentElement.innerHTML);
      });
      
      await use(page);
    } catch (error) {
      console.error('Error loading extension popup:', error);
      throw error;
    }
  },
});

async function setupTestPage(context: TestFixtures['context'], extensionId: string, apiKey: string) {
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForLoadState('networkidle');
  
  const apiKeyInput = popupPage.locator('input[type="password"]');
  await apiKeyInput.fill(apiKey);
  const saveButton = popupPage.locator('button._saveButton_ilpvh_96');
  await saveButton.click();
  await popupPage.close();
  
  const page = await context.newPage();
  await page.goto('https://playwright.dev/docs/intro');
  await page.waitForLoadState('networkidle');
  
  return page;
}

test.describe('Word Highlighter Extension', () => {
  test('popup opens and saves API key', async ({ extensionPage }) => {
    const popup = new ExtensionPage(extensionPage);
    
    await expect(popup.title).toHaveText('Word Highlighter');
    await popup.saveApiKey(GEMINI_API_KEY);
    await expect(popup.savedMessage).toBeVisible();
  });

  test('highlights words on webpage', async ({ context, extensionId }) => {
    const page = await setupTestPage(context, extensionId, GEMINI_API_KEY);
    const webPage = new WebPage(page);
    
    await webPage.hoverOverWord('Installation');
    
    const tooltipText = await webPage.getTooltipText();
    expect(tooltipText).toBeTruthy();
    expect(tooltipText?.length).toBeGreaterThan(0);
  });

  test('shows error for invalid API key', async ({ context, extensionId }) => {
    const page = await setupTestPage(context, extensionId, 'invalid-key');
    const webPage = new WebPage(page);
    
    await webPage.hoverOverWord('Installation');
    await webPage.expectTooltipError('API key not valid. Please pass a valid API key.');
  });
});