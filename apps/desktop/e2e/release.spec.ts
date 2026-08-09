import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const desktop = '/?fixture=media';
const site = 'http://127.0.0.1:4321/Charon/';

test('first launch and manual composer create exactly one Open Note', async ({ page }) => {
  await page.goto(desktop);
  const composer = page.getByPlaceholder('Capture a thought…');
  await composer.fill('One new synthetic note');
  await composer.press('Enter');
  await expect(page.getByText('One new synthetic note')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Open' })).toBeVisible();
});

test('search, exact Tag filter, Open and Done stay coherent', async ({ page }) => {
  await page.goto(desktop);
  const search = page.getByRole('textbox', { name: 'Search notes' });
  await search.fill('release-brief.pdf');
  await expect(page.getByText('Agent handoff')).toBeVisible();
  await expect(page.getByText('Local Markdown')).toBeHidden();
  await page.getByRole('button', { name: 'Clear search and tag filter' }).click();
  await page.getByRole('button', { name: 'Privacy' }).click();
  await expect(page.getByText('Local Markdown')).toBeVisible();
  await page.getByRole('button', { name: 'Clear tag filter Privacy' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Capture contract')).toBeVisible();
});

test('selection copy and irreversible Delete keep confirmation explicit', async ({ page }) => {
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByRole('checkbox', { name: 'Select Agent handoff' }).click();
  await page.getByRole('button', { name: 'Copy as Markdown' }).click();
  await page.getByRole('button', { name: 'Delete 1' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('cannot be undone');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Agent handoff')).toBeVisible();
});

test('row editor supports Write, Preview, Tags and managed Attachment metadata', async ({
  page,
}) => {
  await page.goto(desktop);
  await page.locator('[data-note-focus="capture-note"]').click();
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toBeFocused();
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.locator('.note-preview')).toContainText(
    'Verify the empty state before adding another control.',
  );
  await expect(page.getByText('release-brief.pdf')).toBeVisible();
  await page.getByRole('tab', { name: 'Write' }).click();
  await page.getByPlaceholder('Add a tag').fill('Review');
  await page.getByPlaceholder('Add a tag').press('Enter');
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: /^Review$/ })).toBeVisible();
});

test('portable focus reveals the existing bottom composer without a draft Note', async ({
  page,
}) => {
  await page.goto(desktop);
  const before = await page.locator('[data-note-id]').count();
  await page.evaluate(() => window.dispatchEvent(new Event('charon:fixture-composer-focus')));
  await expect(page.getByPlaceholder('Capture a thought…')).toBeFocused();
  expect(await page.locator('[data-note-id]').count()).toBe(before);
});

test('compact Preferences applies themes and locale without leaving the shelf', async ({
  page,
}) => {
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
  await page.getByRole('button', { name: 'Graphite' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'French' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { name: 'Préférences' })).toBeVisible();
});

test('desktop remains usable at 200 percent and reduced preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto(desktop);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(page.getByPlaceholder('Capture a thought…')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('site routes, media, privacy and release state are truthful', async ({ page }) => {
  await page.goto(site);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Select it');
  await expect(page.locator('img[src*="charon-shelf-solarized"]')).toBeVisible();
  await page.getByRole('link', { name: 'Privacy' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy is a local contract');
  await expect(page.getByText(/one bounded source Copy/)).toBeVisible();
  await page.goto('http://127.0.0.1:4321/Charon/download/');
  await expect(page.getByText(/no signed installer is claimed/i)).toBeVisible();
});

test('site is keyboard accessible, axe-clean and makes no third-party request', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    ) {
      externalRequests.push(request.url());
    }
  });
  await page.goto(site);
  await page.getByText('Skip to content').focus();
  await expect(page.getByText('Skip to content')).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('desktop major shelf and Preferences states are axe-clean', async ({ page }) => {
  await page.goto(desktop);
  let results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('[data-slot="popover-content"]')).toHaveCSS('opacity', '1');
  // Base UI's focus guards are deliberately tabbable sentinels hidden from the
  // accessibility tree. Axe reports that library implementation detail even
  // though it is what keeps keyboard focus crossing the portalled popover.
  results = await new AxeBuilder({ page }).exclude('[data-base-ui-focus-guard]').analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('site content and capture relationship remain complete without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(site);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('One ordinary local Note', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View releases' }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await context.close();
});
