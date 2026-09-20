import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const desktop = '/?fixture=demo';
const site = 'http://127.0.0.1:4321/';

test('editor arrows stay native and keyboard surfaces open immediately', async ({ page }) => {
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Edit Agent handoff', exact: true }).focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('textbox', { name: 'Markdown body' });
  await expect(editor).toBeFocused();
  await editor.fill('First line\nSecond line\nThird line');
  await editor.press('Home');
  await editor.press('ArrowUp');
  await expect(editor).toBeFocused();
  await editor.press('Shift+ArrowDown');
  expect(
    await editor.evaluate(
      (element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart,
    ),
  ).toBeGreaterThan(0);
  await editor.press('Escape');
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.preferences-popover')).toHaveCSS('transition-duration', '0s');
});

test('pointer popovers interpolate scale through transform and reduced motion stays still', async ({
  page,
}) => {
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const popup = page.locator('.preferences-popover');
  await expect(popup).toBeVisible();
  expect(
    await popup.evaluate((element) => {
      const css = getComputedStyle(element);
      return {
        property: css.transitionProperty,
        scale: css.scale,
        duration: css.transitionDuration,
      };
    }),
  ).toEqual({ property: 'transform, opacity', scale: 'none', duration: '0.16s' });
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(popup).toHaveCSS('transform', 'none');
  await expect(popup).toHaveCSS('transition-property', 'opacity');
});

async function expectCompactShelf(page: Page, width: number, height: number) {
  await expect(page.locator('.note-search input')).toBeVisible();
  await expect(page.locator('.note-capture-input input')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const shelf = document.querySelector<HTMLElement>('.note-screen');
    const search = document.querySelector<HTMLElement>('.note-search');
    const list = document.querySelector<HTMLElement>('.note-list');
    const composer = document.querySelector<HTMLElement>('.composer-dock');
    const row = document.querySelector<HTMLElement>('.note-row');
    if (!shelf || !search || !list || !composer || !row) return null;
    const shelfRect = shelf.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const rowStyle = getComputedStyle(row);
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
      shelfWidth: shelfRect.width,
      shelfLeft: shelfRect.left,
      searchBeforeList: searchRect.bottom <= listRect.top,
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
  expect(geometry?.searchBeforeList).toBe(true);
  expect(geometry?.listBeforeComposer).toBe(true);
  expect(geometry?.composerBottom).toBeLessThanOrEqual(height + 1);
  expect(geometry?.rowBorder).toBe('solid');
  expect(geometry?.rowShadow).toBe('none');
  expect(geometry?.rowBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(width - (geometry?.shelfWidth ?? width)).toBeGreaterThanOrEqual(0);
}

test('first launch and manual composer create exactly one Open Note', async ({ page }) => {
  await page.goto(desktop);
  const composer = page.getByPlaceholder('Add a note…');
  await composer.fill('One new synthetic note');
  await composer.press('Enter');
  await expect(page.getByText('One new synthetic note')).toHaveCount(1);
  await expect(composer).toBeFocused();
  await expect(page.locator('.status-segment')).toHaveCount(0);
});

test('search, exact Tag filter, and visible status stay coherent', async ({ page }) => {
  await page.goto(desktop);
  const search = page.getByRole('textbox', { name: 'Search notes' });
  await search.fill('release-brief.pdf');
  await expect(page.getByText('Agent handoff')).toBeVisible();
  await expect(page.getByText('Local Markdown')).toBeHidden();
  await page.getByRole('button', { name: 'Clear search and tag filter' }).click();
  await page.getByRole('button', { name: 'Privacy' }).click();
  await expect(page.getByText('Local Markdown')).toBeVisible();
  await page.getByRole('button', { name: 'Clear tag filter Privacy' }).click();
  await expect(page.getByText('Capture contract')).toBeVisible();
  await expect(page.locator('[data-note-id="done-note"]')).toHaveAttribute('data-status', 'done');
  await expect(
    page.locator('[data-note-id="done-note"]').getByRole('button', { name: 'Mark open' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-note-id="done-note"] .note-row-title')).toHaveCSS(
    'text-decoration-line',
    'line-through',
  );
});

test('direct copy and irreversible Delete keep one-Note scope explicit', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Copy Agent handoff as Markdown' }).click();
  await expect(page.locator('.note-copy-state')).toHaveAttribute('role', 'status');
  const deleteButton = page.getByRole('button', { name: 'Delete Agent handoff' });
  await deleteButton.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete this note permanently?');
  await expect(dialog).toContainText('cannot be undone');
  await expect(dialog).toContainText('external backups');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const focusedDialogControl = dialog.locator(':focus');
  await expect(focusedDialogControl).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+f');
  await expect(focusedDialogControl).toHaveCount(1);
  await expect(page.locator('[name="noteSearch"]')).not.toBeFocused();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteButton).toBeFocused();
  await expect(page.getByText('Agent handoff')).toBeVisible();
});

test('row padding activates the Note while direct controls keep their own action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  const rowMain = page.locator('[data-note-id="capture-note"] .note-row-main');
  const box = await rowMain.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3);
  await expect(page.locator('[data-note-editor="capture-note"]')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Mark done' }).first().click();
  await expect(page.locator('[data-note-id="capture-note"]')).toHaveAttribute(
    'data-status',
    'done',
  );
});

test('Delete announces completion and focuses the nearest surviving row', async ({ page }) => {
  await page.goto(`${desktop}&notes=2`);
  await page.getByRole('button', { name: 'Delete Capture contract' }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('[data-note-id="done-note"]')).toHaveCount(0);
  await expect(page.locator('[data-note-focus="bulk-0"]')).toBeFocused();
  await expect(page.locator('.note-screen > [role="status"]')).toHaveText('Note deleted.');
});

test('Arrow keys retain row focus through virtualized mounts', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(`${desktop}&notes=100`);
  await page.locator('[data-note-focus="capture-note"]').focus();
  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-note-focus]:focus')).toHaveCount(1);
  }
  await expect(page.locator('[data-note-focus="bulk-27"]')).toBeFocused();
});

test('row editor supports Write, Preview, Tags and managed Attachment metadata', async ({
  page,
}) => {
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Edit Agent handoff' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toBeFocused();
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.locator('.note-preview')).toContainText(
    'Verify the empty state before adding another control.',
  );
  await expect(
    page.locator('.attachment-name').filter({ hasText: 'release-brief.pdf' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Write' }).click();
  await page.getByPlaceholder('Add a tag…').fill('Review');
  await page.getByPlaceholder('Add a tag…').press('Enter');
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: /^Review$/ })).toBeVisible();
});

test('row editor folds immediately while its content exits', async ({ page }) => {
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Edit Agent handoff' }).click();
  const row = page.locator('[data-note-id="capture-note"]');
  const editor = page.locator('[data-note-editor="capture-note"]');
  await expect(editor).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every(({ playState }) => playState === 'finished'),
  );
  const expandedHeight = await row.evaluate((element) => element.getBoundingClientRect().height);

  await editor.getByRole('button', { name: 'Close' }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ initialHeight }) => {
            const currentRow = document.querySelector<HTMLElement>('[data-note-id="capture-note"]');
            const exitingEditor = document.querySelector('[data-note-editor="capture-note"]');
            return Boolean(
              currentRow &&
                exitingEditor &&
                currentRow.getBoundingClientRect().height < initialHeight - 8,
            );
          },
          { initialHeight: expandedHeight },
        ),
      { timeout: 250 },
    )
    .toBe(true);
  await expect(editor).toHaveCount(0);
  await expect(row).toHaveAttribute('data-expanded', 'false');
});

test('Attachment count opens the same Note and focuses metadata without preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Show 1 attachment in this note' }).click();
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
  await expect(page.getByPlaceholder('Add a note…')).toBeFocused();
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
  await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { name: 'Préférences' })).toBeVisible();
  const preferences = page.locator('.preferences-popover');
  expect(await preferences.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Réglages' })).toBeFocused();
});

test('French document language is restored before interaction after reload', async ({ page }) => {
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('textbox', { name: 'Rechercher des notes' })).toBeVisible();
});

test('compact icon controls expose at least 44px CSS hit areas', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  const hitArea = async (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const pseudo = getComputedStyle(element, '::after');
        const top = Number.parseFloat(pseudo.top) || 0;
        const right = Number.parseFloat(pseudo.right) || 0;
        const bottom = Number.parseFloat(pseudo.bottom) || 0;
        const left = Number.parseFloat(pseudo.left) || 0;
        return { width: rect.width - left - right, height: rect.height - top - bottom };
      });

  await page.getByRole('textbox', { name: 'Search notes' }).fill('Agent');
  const composer = page.getByPlaceholder('Add a note…');
  await composer.fill('Ready');
  for (const selector of ['.shelf-action-button', '.note-search-clear', '.capture-submit-button']) {
    const area = await hitArea(selector);
    expect(area.width).toBeGreaterThanOrEqual(44);
    expect(area.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Edit Agent handoff' }).click();
  const tagArea = await hitArea('.tag-remove-button');
  expect(tagArea.width).toBeGreaterThanOrEqual(44);
  expect(tagArea.height).toBeGreaterThanOrEqual(44);
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

test('compact shelf keeps EN and FR across Light and Dark at 400 and 480 pixels', async ({
  page,
}) => {
  test.slow();
  for (const width of [400, 480]) {
    for (const locale of ['en', 'fr']) {
      for (const theme of ['light', 'dark']) {
        const matrixPage = await page.context().newPage();
        await matrixPage.setViewportSize({ width, height: 720 });
        await matrixPage.goto(desktop);
        await matrixPage.getByRole('button', { name: /Settings|Réglages/ }).click();
        await matrixPage
          .getByRole('button', {
            name: {
              light: /Light|Clair/,
              dark: /Graphite/,
            }[theme],
          })
          .click();
        await matrixPage.getByRole('combobox').selectOption(locale);
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
  await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
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
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: /Supprimer|Delete/ })
      .first()
      .click();
    await expect(page.locator('[data-slot="alert-dialog-overlay"]')).toHaveCSS(
      'backdrop-filter',
      'none',
    );
    await expect(page.getByRole('alertdialog')).toHaveCSS('border-top-style', 'solid');
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
  await expect(page.getByText('Capture text')).toBeVisible();
  const portableShortcut = await page.evaluate(() =>
    navigator.platform.startsWith('Mac') ? '⌘ + Shift + Space' : 'Ctrl + Shift + Space',
  );
  await expect(page.getByText(portableShortcut)).toBeVisible();
  await expect(page.getByText(/Selected-text capture is not claimed/)).toBeVisible();
  await expect(page.getByText('Shift Shift')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  const done = page.locator('[data-note-id="done-note"]');
  await expect(done).toBeVisible();
  const reopen = done.getByRole('button', { name: 'Mark open' });
  await reopen.focus();
  await expect(reopen).toBeFocused();

  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 400, height: 480 },
  });
  const touchPage = await context.newPage();
  await touchPage.goto(desktop);
  expect(await touchPage.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await expect(touchPage.locator('.note-edit-button').first()).toHaveCSS('opacity', '1');
  await expect(touchPage.locator('.note-delete-button').first()).toHaveCSS('opacity', '1');
  await context.close();
});

test('site keeps only the truthful localized early access pages', async ({ page }) => {
  await page.goto(site);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Keep what matters.');
  await expect(page.locator('video, picture, [data-theme-control]')).toHaveCount(0);
  await expect(
    page.getByText('v0.1.0 is available in early access', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download Charon' })).toHaveAttribute(
    'href',
    'https://github.com/SimonHazard/Charon/releases',
  );
  await page.goto(`${site}fr/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gardez l’essentiel.');
  await expect(
    page.getByText('La v0.1.0 est disponible en accès anticipé', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Télécharger Charon' })).toHaveAttribute(
    'href',
    'https://github.com/SimonHazard/Charon/releases',
  );
  await page.goto(`${site}privacy/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await page.goto(`${site}download/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
});

test('site is keyboard accessible, axe-clean and makes no third-party request', async ({
  page,
  browserName,
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
  // macOS WebKit uses Option+Tab to include links in keyboard navigation.
  const nextLink = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press(nextLink);
  await expect(page.getByRole('link', { name: 'Charon', exact: true })).toBeFocused();
  await page.keyboard.press(nextLink);
  await expect(page.getByRole('link', { name: 'Download Charon' })).toBeFocused();
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
  await page.getByRole('button', { name: 'Edit Agent handoff' }).click();
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Delete Agent handoff' }).click();
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
  await expect(
    page.getByText('v0.1.0 is available in early access', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download Charon' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ko-fi' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'simonhazard.com' })).toBeVisible();
  for (const route of ['', 'fr/']) {
    await page.goto(`${site}${route}`);
    for (const width of [320, 390, 768, 1280, 1536]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator('.primary-action')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
  }
  await context.close();
});

test('Windows shelf aligns rows and native title bar; solid Preferences and full-width dialog footer', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' }),
  );
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto(desktop);
  await expect(page.locator('.window-drag-region')).toHaveCount(0);
  await expect(page.locator('.desktop-shell')).toHaveAttribute('data-native-titlebar', 'true');
  const search = await page.locator('.note-search').boundingBox();
  const row = await page.locator('.note-row').first().boundingBox();
  expect(search).not.toBeNull();
  expect(row).not.toBeNull();
  expect(search?.y).toBeLessThan(16);
  expect(Math.abs((search?.x ?? 0) - (row?.x ?? 0))).toBeLessThan(1);
  expect(Math.abs((search?.width ?? 0) - (row?.width ?? 0))).toBeLessThan(1);
  for (const theme of ['Graphite', 'Light']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    const popup = page.locator('.preferences-popover');
    const material = await popup.evaluate((element) => {
      const style = getComputedStyle(element);
      const solid = document.createElement('div');
      solid.style.backgroundColor = 'var(--material-transient-solid)';
      element.append(solid);
      const expected = getComputedStyle(solid).backgroundColor;
      solid.remove();
      return { background: style.backgroundColor, expected, blur: style.backdropFilter };
    });
    expect(material.background).toBe(material.expected);
    expect(material.blur).toBe('none');
    await page.getByRole('combobox').focus();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
  }
  await page.screenshot({ path: testInfo.outputPath('charon-windows-shelf.png') });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.preferences-popover')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('charon-preferences.png') });
  await page.getByRole('combobox').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.preferences-popover')).toBeHidden();
  await page.getByRole('button', { name: 'Delete Agent handoff', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toHaveCSS('opacity', '1');
  // Measure both boxes in one frame so the opening transform cannot skew the comparison.
  const geometry = await dialog.evaluate((element) => {
    const footer = element.querySelector('[data-slot="alert-dialog-footer"]');
    if (!footer) throw new Error('Delete dialog footer is missing');
    const outer = element.getBoundingClientRect();
    const inner = footer.getBoundingClientRect();
    return {
      widthDifference: Math.abs(outer.width - inner.width),
      xDifference: Math.abs(outer.x - inner.x),
    };
  });
  expect(geometry.widthDifference).toBeLessThan(1);
  expect(geometry.xDifference).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath('charon-delete.png') });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto(`${desktop}&notes=100`);
  expect(
    await page
      .locator('.note-list')
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await page.locator('.note-list').evaluate((element) => {
    element.scrollTop = 500;
  });
  await expectCompactShelf(page, 480, 720);
});

test('Markdown help preserves the editor and safe Preview makes no resource requests', async ({
  page,
}, testInfo) => {
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Edit Agent handoff', exact: true }).click();
  const body =
    '# Title\n\n**Bold** *italic* ~~removed~~\n\n- [x] Task\n\n> Quote\n\n```js\nconst value = 1;\n```\n\n| A | B |\n| --- | --- |\n| C | D |\n\n[Link](https://example.com/docs)\n\n![Image](https://example.com/pixel.png)\n\n![Local](file:///private/image.png)\n\n![Relative](./secret.png)\n\n<img src="https://example.com/raw.png" onerror="alert(1)">';
  const editor = page.getByRole('textbox', { name: 'Markdown body' });
  await editor.fill(body);
  const help = page.getByRole('button', { name: 'Markdown help', exact: true });
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.markdown-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.markdown-help')).toHaveCount(0);
  await expect(help).toBeFocused();
  await expect(editor).toHaveValue(body);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  const preview = page.getByTestId('note-preview');
  await expect(preview.getByRole('table')).toBeVisible();
  await expect(preview.locator('a, img, script, iframe, video, audio')).toHaveCount(0);
  await expect(preview.getByText('https://example.com/docs')).toBeVisible();
  expect(requests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('charon-markdown.png') });
  await page.getByRole('tab', { name: 'Write', exact: true }).click();
  await expect(editor).toHaveValue(body);
  await editor.press('Escape');
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await page.getByRole('button', { name: 'Markdown help', exact: true }).click();
  await expect(page.locator('.markdown-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.markdown-help')).toHaveCount(0);
  await expect(page.locator('.help-popover')).toBeVisible();
});
