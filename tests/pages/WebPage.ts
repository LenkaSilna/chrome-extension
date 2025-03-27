import { Page, Locator, expect } from '@playwright/test';

export class WebPage {
  readonly page: Page;
  readonly highlightedWord: (text: string) => Locator;
  readonly tooltip: Locator;

  constructor(page: Page) {
    this.page = page;
    this.highlightedWord = (text: string) => 
      page.locator('h1 span.highlightable-word', { hasText: text });
    this.tooltip = page.locator('#word-highlighter-tooltip').first();
  }

  async hoverOverWord(text: string) {
    const word = this.highlightedWord(text);
    await word.waitFor({ state: 'visible' });
    await word.hover();
    await this.page.waitForTimeout(1000);
  }

  async getTooltipText() {
    await expect(this.tooltip).toBeVisible();
    return this.tooltip.textContent();
  }

  async expectTooltipError(errorMessage: string) {
    await expect(this.tooltip).toBeVisible();
    await expect(this.tooltip).toHaveText(errorMessage);
  }
}