import { Page, Locator } from '@playwright/test';

export class ExtensionPage {
  readonly page: Page;
  readonly title: Locator;
  readonly apiKeyInput: Locator;
  readonly saveButton: Locator;
  readonly savedMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.locator('h1');
    this.apiKeyInput = page.locator('input[type="password"]');
    this.saveButton = page.locator('button._saveButton_ilpvh_96');
    this.savedMessage = page.locator('p').filter({ hasText: 'API key saved successfully!' });
  }

  async saveApiKey(apiKey: string) {
    await this.apiKeyInput.fill(apiKey);
    await this.saveButton.click();
  }
}