import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const desktop = '/?fixture=media';
const site = 'http://127.0.0.1:4321/Charon/';

async function expectCompactShelf(page: Page, width: number, height: number) {
  await expect(page.locator('.note-search input')).toBeVisible();
  await expect(page.locator('.note-capture-input input')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const shelf = document.querySelector<HTMLElement>('.note-screen');
    const search = document.querySelector<HTMLElement>('.note-search');
    const status = document.querySelector<HTMLElement>('.status-segment');
    const list = document.querySelector<HTMLElement>('.note-list');
    const composer = document.querySelector<HTMLElement>('.composer-dock');
    const row = document.querySelector<HTMLElement>('.note-row');
    if (!shelf || !search || !status || !list || !composer || !row) return null;
    const shelfRect = shelf.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const rowStyle = getComputedStyle(row);
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      shelfWidth: shelfRect.width,
      shelfLeft: shelfRect.left,
      searchBeforeStatus: searchRect.bottom <= statusRect.top,
      listBeforeComposer: listRect.bottom <= composerRect.top + 1,
      composerBottom: composerRect.bottom,
      rowBorder: rowStyle.borderTopStyle,
      rowShadow: rowStyle.boxShadow,
      rowBackground: rowStyle.backgroundColor,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry?.documentOverflow).toBeLessThanOrEqual(0);
  expect(geometry?.bodyOverflow).toBeLessThanOrEqual(0);
  expect(geometry?.shelfWidth).toBeLessThanOrEqual(544);
  expect(geometry?.shelfLeft).toBeGreaterThanOrEqual(0);
  expect(geometry?.searchBeforeStatus).toBe(true);
  expect(geometry?.listBeforeComposer).toBe(true);
  expect(geometry?.composerBottom).toBeLessThanOrEqual(height + 1);
  expect(geometry?.rowBorder).toBe('solid');
  expect(geometry?.rowShadow).toBe('none');
  expect(geometry?.rowBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(width - (geometry?.shelfWidth ?? width)).toBeGreaterThanOrEqual(0);
}

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
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByRole('checkbox', { name: 'Select Agent handoff' }).click();
  const selectionBar = page.getByRole('toolbar', { name: '1 note selected' });
  await expect(selectionBar).toBeVisible();
  expect(await selectionBar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Copy as Markdown' }).click();
  await expect(page.getByRole('status')).toContainText('Copied');
  const deleteButton = page.getByRole('button', { name: 'Delete 1' });
  await deleteButton.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete 1 note permanently?');
  await expect(dialog).toContainText('cannot be undone');
  await expect(dialog).toContainText('external backups');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteButton).toBeFocused();
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
  await expect(
    page.locator('.attachment-name').filter({ hasText: 'release-brief.pdf' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Write' }).click();
  await page.getByPlaceholder('Add a tag').fill('Review');
  await page.getByPlaceholder('Add a tag').press('Enter');
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: /^Review$/ })).toBeVisible();
});

test('Attachment count opens the same Note and focuses metadata without preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Show 1 attachments in this note' }).click();
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeFocused();
  await expect(
    page.locator('.attachment-name').filter({ hasText: 'release-brief.pdf' }),
  ).toBeVisible();
  await expect(page.locator('.note-editor-inline img, .note-editor-inline video')).toHaveCount(0);
  expect(
    await page
      .locator('[data-note-editor="capture-note"]')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
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
  const preferences = page.locator('.preferences-popover');
  expect(await preferences.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Réglages' })).toBeFocused();
});

test('compact shelf geometry holds at minimum, default, capped, and restored sizes', async ({
  page,
}) => {
  for (const { width, height } of [
    { width: 400, height: 480 },
    { width: 440, height: 680 },
    { width: 480, height: 720 },
    { width: 520, height: 720 },
    { width: 544, height: 720 },
    { width: 720, height: 480 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(desktop);
    await expectCompactShelf(page, width, height);
  }
});

test('compact shelf keeps EN and FR across every theme at 400 and 480 pixels', async ({ page }) => {
  test.slow();
  for (const width of [400, 480]) {
    for (const locale of ['en', 'fr']) {
      for (const theme of ['solarized', 'light', 'dark']) {
        const matrixPage = await page.context().newPage();
        await matrixPage.setViewportSize({ width, height: 720 });
        await matrixPage.goto(desktop);
        await matrixPage.getByRole('button', { name: /Settings|Réglages/ }).click();
        await matrixPage
          .getByRole('button', {
            name: {
              solarized: /Solarized/,
              light: /Light|Clair/,
              dark: /Graphite/,
            }[theme],
          })
          .click();
        await matrixPage
          .getByRole('button', {
            name: locale === 'fr' ? /English|Anglais/ : /French|Français/,
          })
          .click();
        await matrixPage
          .getByRole('button', {
            name: locale === 'fr' ? /French|Français/ : /English|Anglais/,
          })
          .click();
        await expect(matrixPage.locator('html')).toHaveAttribute('lang', locale);
        await expect(matrixPage.locator('html')).toHaveAttribute('data-theme', theme);
        await matrixPage.keyboard.press('Escape');
        await expectCompactShelf(matrixPage, width, 720);
        await matrixPage.close();
      }
    }
  }
});

test('desktop remains usable at effective 360 pixels and reduced preferences', async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'French' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.preferences-popover')).toBeHidden();
  await expect(page.locator('.note-capture-input input')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  if (browserName === 'chromium') {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-reduced-transparency', value: 'reduce' },
        { name: 'prefers-contrast', value: 'more' },
      ],
    });
    await page.reload();
    expect(
      await page.evaluate(
        () =>
          matchMedia('(prefers-reduced-transparency: reduce)').matches &&
          matchMedia('(prefers-contrast: more)').matches,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: /Keyboard shortcuts|Raccourcis clavier/ }).click();
    await expect(page.locator('.help-popover')).toHaveCSS('backdrop-filter', 'none');
    await expect(page.locator('.note-row').first()).toHaveCSS('border-top-color', /rgb/);
  }
});

test('changed compact controls preserve keyboard focus and coarse-pointer actions', async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  const help = page.getByRole('button', { name: 'Keyboard shortcuts' });
  await help.focus();
  await help.press('Enter');
  await expect(page.getByText('Capture from anywhere')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  const done = page.getByRole('button', { name: 'Done', exact: true });
  await done.focus();
  await done.press('Space');
  await expect(done).toHaveAttribute('aria-pressed', 'true');

  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 400, height: 480 },
  });
  const touchPage = await context.newPage();
  await touchPage.goto(desktop);
  expect(await touchPage.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await expect(touchPage.locator('.note-edit-button').first()).toHaveCSS('opacity', '1');
  await context.close();
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
  await page.setViewportSize({ width: 400, height: 480 });
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
  await page.keyboard.press('Escape');
  await expect(page.locator('.preferences-popover')).toBeHidden();
  await page.locator('[data-note-focus="capture-note"]').click();
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByRole('checkbox', { name: 'Select Agent handoff' }).click();
  await page.getByRole('button', { name: 'Delete 1' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCSS('opacity', '1');
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
