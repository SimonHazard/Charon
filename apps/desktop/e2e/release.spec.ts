import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';

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

test('transient surfaces leave faster than they enter', async ({ page }) => {
  await page.goto(desktop);
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const popup = page.locator('.preferences-popover');
  // Record the duration Base UI's exit state applies, the first time it appears.
  const watchExit = (selector: string) =>
    page.evaluate((target) => {
      const state = window as unknown as { charonExitDuration?: string };
      state.charonExitDuration = undefined;
      const observer = new MutationObserver(() => {
        const element = document.querySelector(`${target}[data-ending-style]`);
        if (!element) return;
        state.charonExitDuration = getComputedStyle(element).transitionDuration;
        observer.disconnect();
      });
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-ending-style'],
        subtree: true,
      });
    }, selector);
  const exitDuration = async () => {
    await page.waitForFunction(
      () => (window as unknown as { charonExitDuration?: string }).charonExitDuration,
    );
    return page.evaluate(
      () => (window as unknown as { charonExitDuration?: string }).charonExitDuration,
    );
  };
  // The shelf column is centred; its left gutter is plain canvas, not a Note row.
  const pressCanvas = () => page.mouse.click(24, 400);

  await settings.click();
  await expect(popup).toHaveCSS('opacity', '1');
  await expect(popup).toHaveCSS('transition-duration', '0.16s');
  await watchExit('.preferences-popover');
  await pressCanvas();
  expect(await exitDuration()).toBe('0.11s');
  await expect(popup).toBeHidden();

  await page.getByRole('button', { name: 'Delete Agent handoff', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(dialog).toHaveCSS('transition-duration', '0.16s');
  await watchExit('[data-slot="alert-dialog-content"]');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await exitDuration()).toBe('0.11s');
  await expect(dialog).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settings.click();
  await expect(popup).toHaveCSS('opacity', '1');
  await expect(popup).toHaveCSS('transition-property', 'opacity');
  // Reduced motion narrows the property only: the entrance keeps its token and easing.
  await expect(popup).toHaveCSS('transition-duration', '0.12s');
  await expect(popup).toHaveCSS('transition-timing-function', 'cubic-bezier(0.2, 0, 0, 1)');
  await watchExit('.preferences-popover');
  await pressCanvas();
  expect(await exitDuration()).toBe('0.1s');
  await expect(popup).toBeHidden();

  // Keyboard surfaces stay immediate: the modality rule wins over the exit token.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCSS('transition-duration', '0s');
  // Focus lands on the first appearance toggle, which shows its Tooltip.
  const systemTooltip = page.locator('[data-slot="tooltip-content"]', { hasText: /^System$/ });
  await expect(systemTooltip).toBeVisible();
  // A 0s Popover unmounts without an exit state, so probe the cascade on a temporary copy.
  expect(
    await popup.evaluate((element) => {
      const probe = element.cloneNode(false) as HTMLElement;
      probe.removeAttribute('id');
      probe.setAttribute('data-ending-style', '');
      document.body.append(probe);
      const duration = getComputedStyle(probe).transitionDuration;
      probe.remove();
      return duration;
    }),
  ).toBe('0s');
  // A Tooltip never claims Escape: one press dismisses it and Preferences together, instantly.
  await watchExit('[data-slot="tooltip-content"]');
  await page.keyboard.press('Escape');
  expect(await exitDuration()).toBe('0s');
  await expect(systemTooltip).toHaveCount(0);
  await expect(popup).toBeHidden();
  await expect(settings).toBeFocused();
});

async function chooseLanguage(page: Page, language: 'English' | 'Français') {
  // The themed Select keeps its <label> association in both locales.
  await page.getByRole('combobox', { name: /^(Language|Langue)$/ }).click();
  await page.getByRole('option', { name: language, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function expectCompactShelf(page: Page, width: number, height: number) {
  await expect(page.locator('.note-search input')).toBeVisible();
  await expect(page.locator('.note-capture-input textarea')).toBeVisible();

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

// A real paste fires one `insertFromPaste` input event. `keyboard.insertText` splits
// line breaks into dozens of synchronous WebKit input events that no user can produce.
async function pasteText(page: Page, browserName: string, text: string) {
  if (browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  }
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await page.keyboard.press('ControlOrMeta+V');
}

test('composer keeps a multi-line body as one Note', async ({ browserName, page }) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  const composer = page.getByRole('textbox', { name: 'Capture a note' });
  const field = page.locator('.capture-field');
  const singleLineHeight = await field.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(Math.abs(singleLineHeight - 48)).toBeLessThan(1);
  const before = await page.locator('[data-note-id]').count();
  await composer.click();
  await page.keyboard.type('first');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('second');
  await expect(composer).toHaveValue('first\nsecond');
  await page.keyboard.press('Enter');
  const created = page.locator('.note-row').filter({
    has: page.locator('.note-row-title', { hasText: /^first$/ }),
  });
  await expect(created).toHaveCount(1);
  await expect(created.locator('.note-row-snippet')).toHaveText('second');
  expect(await page.locator('[data-note-id]').count()).toBe(before + 1);
  await expect(composer).toHaveValue('');
  await expect(composer).toBeFocused();

  const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n');
  await pasteText(page, browserName, lines);
  await expect(composer).toHaveValue(lines);
  const geometry = await page.evaluate(() => {
    const input = document.querySelector<HTMLElement>('.capture-field-input');
    const list = document.querySelector<HTMLElement>('.note-list');
    const dock = document.querySelector<HTMLElement>('.composer-dock');
    if (!input || !list || !dock) return null;
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      inputHeight: input.getBoundingClientRect().height,
      maxHeight: 9.5 * rootFontSize,
      scrolls: input.scrollHeight > input.clientHeight,
      listBeforeComposer:
        list.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top + 1,
      dockBottom: dock.getBoundingClientRect().bottom,
    };
  });
  expect(geometry).not.toBeNull();
  expect(geometry?.inputHeight).toBeLessThanOrEqual((geometry?.maxHeight ?? 0) + 0.5);
  expect(geometry?.inputHeight).toBeGreaterThan(singleLineHeight * 2);
  expect(geometry?.scrolls).toBe(true);
  expect(geometry?.listBeforeComposer).toBe(true);
  expect(geometry?.dockBottom).toBeLessThanOrEqual(481);
});

test('composer grows by measurement where field-sizing is unsupported', async ({
  browserName,
  page,
}) => {
  // WebKitGTK 2.44 and older macOS WebKit lack `field-sizing: content`; force that path.
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS);
    CSS.supports = ((...args: [string, string?]) =>
      args[0].startsWith('field-sizing')
        ? false
        : supports(...(args as [string, string]))) as typeof CSS.supports;
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.capture-field-input { field-sizing: fixed !important; }';
      document.head.append(style);
    });
  });
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  const composer = page.getByRole('textbox', { name: 'Capture a note' });
  await composer.click();
  const measure = () =>
    composer.evaluate((element: HTMLTextAreaElement) => ({
      height: element.getBoundingClientRect().height,
      overflow: element.scrollHeight - element.clientHeight,
    }));
  const initial = await measure();
  expect(Math.abs(initial.height - 46)).toBeLessThan(1);
  let previous = initial.height;
  for (let line = 1; line <= 4; line += 1) {
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type(`line ${line}`);
    const current = await measure();
    // Each keystroke grows the field before it can scroll internally.
    expect(current.overflow).toBeLessThanOrEqual(1);
    expect(current.height).toBeGreaterThan(previous);
    previous = current.height;
  }
  const pasted = `\n${Array.from({ length: 30 }, (_, index) => `more ${index}`).join('\n')}`;
  await pasteText(page, browserName, pasted);
  await expect(composer).toHaveValue(`\nline 1\nline 2\nline 3\nline 4${pasted}`);
  const capped = await measure();
  const maxHeight = await page.evaluate(
    () => 9.5 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(capped.height).toBeLessThanOrEqual(maxHeight + 0.5);
  expect(capped.overflow).toBeGreaterThan(0);
  await composer.fill('');
  expect(Math.abs((await measure()).height - initial.height)).toBeLessThan(1);
});

test('search, exact Tag filter, and visible status stay coherent', async ({ page }) => {
  await page.goto(desktop);
  const search = page.getByRole('textbox', { name: 'Search notes' });
  await search.fill('release-brief.pdf');
  await expect(page.getByText('Agent handoff')).toBeVisible();
  await expect(page.getByText('Local Markdown')).toBeHidden();
  await page.getByRole('button', { name: 'Clear search and tag filter' }).click();
  await page.getByRole('button', { name: 'Show notes tagged Privacy' }).click();
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
  const row = page.locator('[data-note-id="capture-note"]');
  const rowHeight = () => row.evaluate((element) => element.getBoundingClientRect().height);
  const heightBeforeCopy = await rowHeight();
  const copy = page.getByRole('button', { name: 'Copy Agent handoff as Markdown' });
  await copy.click();
  await expect(copy).toHaveAttribute('data-copied', '');
  await expect(copy.locator('.tabler-icon-check')).toBeVisible();
  await expect(page.locator('.note-copy-state')).toHaveCount(0);
  await expect(page.locator('.note-screen > [role="status"]')).toHaveText('Copied');
  expect(await rowHeight()).toBe(heightBeforeCopy);
  // The confirmation stays visible after the pointer leaves the row.
  await page.mouse.move(0, 0);
  await expect(copy).toHaveCSS('opacity', '1');
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
  await page.keyboard.press('End');
  await expect(page.locator('[data-note-focus="bulk-99"]')).toBeFocused();
  await expect(page.locator('[data-note-focus="bulk-99"]')).toBeInViewport();
  await page.keyboard.press('Home');
  await expect(page.locator('[data-note-focus="capture-note"]')).toBeFocused();
  await expect(page.locator('[data-note-focus="capture-note"]')).toBeInViewport();
});

test('note list fades only the clipped edges', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto(`${desktop}&notes=100`);
  const list = page.locator('.note-list');
  await expect(page.locator('[data-note-focus="capture-note"]')).toBeVisible();
  await expect(list).toHaveAttribute('data-clipped-start', 'false');
  await expect(list).toHaveAttribute('data-clipped-end', 'true');
  expect(await list.evaluate((element) => getComputedStyle(element).maskImage)).toContain(
    'linear-gradient',
  );

  await list.evaluate((element) => {
    element.scrollTop = 800;
  });
  await expect
    .poll(async () => [
      await list.getAttribute('data-clipped-start'),
      await list.getAttribute('data-clipped-end'),
    ])
    .toEqual(['true', 'true']);

  // Rows measure as they mount, so keep asking for the end until the list settles there.
  await expect
    .poll(async () => {
      await list.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      return list.getAttribute('data-clipped-end');
    })
    .toBe('false');
  await expect(list).toHaveAttribute('data-clipped-start', 'true');

  await page.goto(`${desktop}&notes=2`);
  await expect(page.locator('[data-note-focus="bulk-1"]')).toBeVisible();
  await expect(list).toHaveAttribute('data-clipped-start', 'false');
  await expect(list).toHaveAttribute('data-clipped-end', 'false');

  // Keyboard navigation never parks the focused row's surface under a fade (12px top, 16px
  // bottom). An edge the list rests against has no fade, so it needs no clearance.
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(`${desktop}&notes=100`);
  await page.locator('[data-note-focus="capture-note"]').focus();
  const fadeClearance = () =>
    page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('.note-list');
      const focused = document.activeElement?.closest<HTMLElement>('.note-row');
      if (!scroller || !focused) return -1;
      const outer = scroller.getBoundingClientRect();
      const inner = focused.getBoundingClientRect();
      const top = scroller.scrollTop > 1 ? inner.top - outer.top - 12 : 0;
      const bottom =
        scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1
          ? outer.bottom - inner.bottom - 16
          : 0;
      return Math.min(top, bottom);
    });
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-note-focus]:focus')).toHaveCount(1);
    await expect.poll(fadeClearance).toBeGreaterThanOrEqual(0);
  }
  await expect(page.locator('[data-note-focus="bulk-9"]')).toBeFocused();
  await expect(list).toHaveAttribute('data-clipped-start', 'true');
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('ArrowUp');
    await expect.poll(fadeClearance).toBeGreaterThanOrEqual(0);
  }
  await expect(page.locator('[data-note-focus="capture-note"]')).toBeFocused();
  await expect(list).toHaveAttribute('data-clipped-start', 'false');
});

test('an editor opened at the bottom of the list scrolls into view', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(`${desktop}&notes=40`);
  await page.locator('[data-note-focus="capture-note"]').focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-note-focus="bulk-39"]')).toBeFocused();
  await page.keyboard.press('Enter');
  const editor = page.locator('[data-note-editor="bulk-39"] textarea');
  await expect(editor).toBeFocused();
  await expect(editor).toBeInViewport();
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

test('closing the row editor mid-entrance reverses from its live opacity', async ({ page }) => {
  await page.goto(desktop);
  // Close from inside the page on the first frame the pointer entrance is a quarter visible
  // (about 60 ms in), so the moment is exact, then sample the editor's opacity on every frame
  // until it has gone. A rAF timestamp can predate a long mount, so opacity marks the moment.
  await page.evaluate(() => {
    // `time` is the frame's animation time; `at` is when the page sampled it.
    type Sample = { time: number; at: number; opacity: number };
    const record = { closed: null as Sample | null, after: [] as Sample[], gone: false };
    (window as unknown as { charonInterruption?: typeof record }).charonInterruption = record;
    let mounted = false;
    const sample = (now: number) => {
      const editor = document.querySelector<HTMLElement>('[data-note-editor="capture-note"]');
      if (editor) {
        mounted = true;
        const opacity = Number(getComputedStyle(editor).opacity);
        const current = { time: now, at: performance.now(), opacity };
        if (record.closed) {
          record.after.push(current);
        } else if (opacity >= 0.25) {
          record.closed = current;
          editor.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
        }
      } else if (mounted) {
        record.gone = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('button', { name: 'Edit Agent handoff', exact: true }).click();
  await page.waitForFunction(
    () =>
      (window as unknown as { charonInterruption?: { gone: boolean } }).charonInterruption?.gone,
  );
  const { closed, after } = await page.evaluate(
    () =>
      (
        window as unknown as {
          charonInterruption: {
            closed: { time: number; at: number; opacity: number };
            after: { time: number; at: number; opacity: number }[];
          };
        }
      ).charonInterruption,
  );

  // Closed while still entering, not after an instant appearance.
  expect(closed.opacity).toBeLessThan(0.9);
  const opacities = after.map(({ opacity }) => opacity);
  const peak = Math.max(...opacities);
  // The entrance never completes first: the exit starts from the live value...
  expect(peak).toBeLessThan(0.95);
  // ...and reverses once, fading out over several frames to below where it was closed.
  const peakAt = opacities.indexOf(peak);
  expect(
    opacities
      .slice(peakAt + 1)
      .filter((opacity, index) => opacity > opacities[peakAt + index] + 0.005),
  ).toEqual([]);
  expect(
    opacities.filter((opacity) => opacity > 0.02 && opacity < peak).length,
  ).toBeGreaterThanOrEqual(3);
  expect(opacities.at(-1)).toBeLessThan(closed.opacity);
  // No frame jumps. The surface spring moves opacity by at most about 7 per second, and the
  // compositor keeps it moving while the main thread renders the close: Motion samples that live
  // value by the wall clock and hands its velocity to the exit spring, which may carry the
  // opacity a little further first. So a frame may differ from the one before by the spring's
  // travel since that frame's animation time, plus that carry; a restart from an endpoint
  // jumps far more.
  const jumps = after.flatMap((current, index) => {
    const previous = index === 0 ? closed : after[index - 1];
    const allowed = (10 * (current.at - previous.time)) / 1000 + 0.1;
    const change = Math.abs(current.opacity - previous.opacity);
    return change > allowed ? [{ change, allowed }] : [];
  });
  expect(jumps).toEqual([]);
});

test('text typed while the row editor enters is kept', async ({ page }) => {
  await page.goto(desktop);
  // Hold the entrance from its first frame: pause the editor's own animations as soon as they
  // run, so the key below lands while the editor is still entering however long the round trip
  // from the test takes. Record what the editor looked like when the key reached its field.
  await page.evaluate(() => {
    type Hold = { held: Animation[]; typed: boolean; typedWhileEntering?: boolean };
    const hold: Hold = { held: [], typed: false };
    (window as unknown as { charonHold?: Hold }).charonHold = hold;
    const pauseEntrance = () => {
      if (hold.typed) return;
      const editor = document.querySelector<HTMLElement>('[data-note-editor="capture-note"]');
      for (const animation of editor?.getAnimations() ?? []) {
        if (animation.playState !== 'running') continue;
        animation.pause();
        hold.held.push(animation);
      }
      requestAnimationFrame(pauseEntrance);
    };
    requestAnimationFrame(pauseEntrance);
    window.addEventListener(
      'keydown',
      (event) => {
        const editor = (event.target as Element).closest<HTMLElement>(
          '[data-note-editor="capture-note"]',
        );
        if (!editor) return;
        hold.typed = true;
        hold.typedWhileEntering =
          Number(getComputedStyle(editor).opacity) < 1 &&
          editor.getAnimations().some(({ playState }) => playState === 'paused');
      },
      { capture: true, once: true },
    );
  });
  await page.getByRole('button', { name: 'Edit Agent handoff', exact: true }).click();
  // Type once the entrance is held and the field has taken focus.
  await page.waitForFunction(
    () =>
      ((window as unknown as { charonHold?: { held: Animation[] } }).charonHold?.held.length ?? 0) >
        0 && document.activeElement?.matches('[data-note-editor="capture-note"] textarea'),
  );
  // The field opens with its caret at the start.
  await page.keyboard.type('x');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { charonHold: { typedWhileEntering?: boolean } }).charonHold
          .typedWhileEntering,
    ),
  ).toBe(true);
  // The entrance then resumes and completes without touching the text.
  await page.evaluate(() => {
    for (const animation of (window as unknown as { charonHold: { held: Animation[] } }).charonHold
      .held)
      animation.play();
  });
  const editor = page.locator('[data-note-editor="capture-note"]');
  await expect(editor).toHaveCSS('opacity', '1');
  const body = 'x# Agent handoff\n\nVerify the empty state before adding another control.';
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toHaveValue(body);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.locator('[data-note-focus="capture-note"]').click();
  await expect(page.getByRole('textbox', { name: 'Markdown body' })).toHaveValue(body);
});

test('keyboard expansion shows the row editor complete on its first frame', async ({ page }) => {
  await page.goto(desktop);
  const editor = page.locator('[data-note-editor="capture-note"]');
  // Record the editor's own animations and opacity on its first three frames.
  const watchMount = () =>
    page.evaluate(() => {
      const record = { frames: [] as { animations: number; opacity: number }[] };
      (window as unknown as { charonMount?: typeof record }).charonMount = record;
      const observer = new MutationObserver(() => {
        const element = document.querySelector<HTMLElement>('[data-note-editor="capture-note"]');
        if (!element) return;
        observer.disconnect();
        const sample = () =>
          record.frames.push({
            animations: element.getAnimations().length,
            opacity: Number(getComputedStyle(element).opacity),
          });
        sample();
        requestAnimationFrame(() => {
          sample();
          requestAnimationFrame(sample);
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  const mountFrames = async () => {
    await page.waitForFunction(
      () =>
        (window as unknown as { charonMount?: { frames: unknown[] } }).charonMount?.frames
          .length === 3,
    );
    return page.evaluate(
      () =>
        (
          window as unknown as {
            charonMount: { frames: { animations: number; opacity: number }[] };
          }
        ).charonMount.frames,
    );
  };

  // The pointer opens the editor through its surface transition...
  await watchMount();
  await page.getByRole('button', { name: 'Edit Agent handoff', exact: true }).click();
  const pointerFrames = await mountFrames();
  expect(pointerFrames.some(({ animations }) => animations > 0)).toBe(true);
  expect(pointerFrames[0]?.opacity).toBeLessThan(1);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toHaveCount(0);

  // ...while Enter on a focused row shows it complete, with nothing left to animate.
  await page.locator('[data-note-focus="capture-note"]').focus();
  await watchMount();
  await page.keyboard.press('Enter');
  expect(await mountFrames()).toEqual(Array(3).fill({ animations: 0, opacity: 1 }));
  await expect(editor).toBeVisible();
  expect(await editor.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(editor).toHaveCSS('opacity', '1');
  await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'keyboard');
});

/** One frame of an animated surface, sampled in the page. */
type MotionFrame = {
  /** Document timeline time, which CDP's playback rate slows together with the animations. */
  time: number;
  opacity: number;
  /** The surface's own computed transform is the identity. */
  identity: boolean;
  rect: number[];
  /** The surface's own running animations. */
  animations: { property: string; duration: number }[];
};

/**
 * Samples the surface at `selector` on every frame from now on: from its mount until it has
 * shown for 150 ms of animation time and settled (`enter`), or until it has gone (`leave`).
 */
async function recordFrames(page: Page, selector: string, phase: 'enter' | 'leave') {
  await page.evaluate(
    ({ target, phase }) => {
      const record = { frames: [] as unknown[], done: false };
      (window as unknown as { charonFrames?: typeof record }).charonFrames = record;
      const timing = ['offset', 'easing', 'composite', 'computedOffset'];
      let mountedAt: number | null = null;
      let animated = false;
      const sample = () => {
        const element = document.querySelector<HTMLElement>(target);
        const time = Number(document.timeline.currentTime);
        if (element) {
          mountedAt ??= time;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          record.frames.push({
            time,
            opacity: Number(style.opacity),
            identity:
              style.transform === 'none' || new DOMMatrixReadOnly(style.transform).isIdentity,
            rect: [box.x, box.y, box.width, box.height],
            animations: element
              .getAnimations()
              .filter(({ playState }) => playState === 'running')
              .map((animation) => ({
                property:
                  animation instanceof CSSTransition
                    ? animation.transitionProperty
                    : Object.keys((animation.effect as KeyframeEffect).getKeyframes()[0] ?? {})
                        .filter((key) => !timing.includes(key))
                        .join(),
                duration: Number(animation.effect?.getComputedTiming().duration),
              })),
          });
          const running = element
            .getAnimations({ subtree: true })
            .some(({ playState }) => playState === 'running');
          animated ||= running;
          if (phase === 'enter' && animated && !running && time - mountedAt >= 150) {
            record.done = true;
          }
        } else if (phase === 'leave' && mountedAt !== null) {
          record.done = true;
        }
        if (record.frames.length >= 900) record.done = true;
        if (!record.done) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { target: selector, phase },
  );
}

async function recordedFrames(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { charonFrames?: { done: boolean } }).charonFrames?.done,
  );
  return page.evaluate(
    () => (window as unknown as { charonFrames: { frames: MotionFrame[] } }).charonFrames.frames,
  );
}

/** Reduced motion keeps hierarchy with a short opacity fade and never moves or scales. */
function expectFadeInPlace(frames: MotionFrame[], duration: number) {
  expect(frames.length).toBeGreaterThan(1);
  // Times of frames that scale or translate the surface itself.
  expect(frames.filter(({ identity }) => !identity).map(({ time }) => time)).toEqual([]);
  // Nothing travels while visible (a positioner may still place a transparent first frame), and
  // sub-pixel offset rounding is not travel.
  const visible = frames.filter(({ opacity }) => opacity > 0);
  const [first] = visible;
  expect(
    visible
      .filter(({ rect }) => rect.some((value, index) => Math.abs(value - first.rect[index]) > 1))
      .map(({ rect }) => ({ from: first.rect, to: rect })),
  ).toEqual([]);
  const animations = frames.flatMap((frame) => frame.animations);
  expect(new Set(animations.map(({ property }) => property))).toEqual(new Set(['opacity']));
  expect(new Set(animations.map((animation) => animation.duration))).toEqual(new Set([duration]));
  // Sampled mid-fade, so the frames above cover the motion itself.
  expect(frames.some(({ opacity }) => opacity > 0.02 && opacity < 0.98)).toBe(true);
}

// Every animated surface: new ones add themselves here (plan 048). Toasts have their own test.
const reducedMotionSurfaces: {
  name: string;
  selector: string;
  /** Reduced-motion fade durations in ms: entrance, then exit. */
  durations: [number, number];
  prepare?(page: Page): Promise<void>;
  show(page: Page): Promise<void>;
  hide(page: Page): Promise<void>;
}[] = [
  {
    name: 'the row editor',
    selector: '[data-note-editor="capture-note"]',
    durations: [120, 120],
    show: (page) => page.getByRole('button', { name: 'Edit Agent handoff', exact: true }).click(),
    hide: (page) =>
      page
        .locator('[data-note-editor="capture-note"]')
        .getByRole('button', { name: 'Close', exact: true })
        .click(),
  },
  {
    name: 'the status check',
    selector: '[data-note-id="capture-note"] .note-status-dot .note-icon-swap',
    durations: [120, 120],
    show: (page) => page.locator('[data-note-id="capture-note"] .note-status-button').click(),
    hide: (page) => page.locator('[data-note-id="capture-note"] .note-status-button').click(),
  },
  {
    name: 'the Preferences popover',
    selector: '.preferences-popover',
    durations: [120, 100],
    show: (page) => page.getByRole('button', { name: 'Settings', exact: true }).click(),
    // The shelf column is centred; its left gutter is plain canvas.
    hide: (page) => page.mouse.click(24, 400),
  },
  {
    name: 'the Delete confirmation',
    selector: '[data-slot="alert-dialog-content"]',
    durations: [120, 100],
    show: (page) => page.getByRole('button', { name: 'Delete Agent handoff', exact: true }).click(),
    hide: (page) =>
      page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click(),
  },
  {
    name: 'the drawing dialog',
    selector: '[data-slot="dialog-content"]',
    durations: [120, 100],
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Edit Agent handoff', exact: true }).click();
      await expect(page.locator('[data-note-editor="capture-note"]')).toHaveCSS('opacity', '1');
    },
    show: (page) => page.getByRole('button', { name: 'Draw', exact: true }).click(),
    hide: (page) =>
      page
        .getByRole('dialog', { name: 'Drawing' })
        .getByRole('button', { name: 'Cancel', exact: true })
        .click(),
  },
];

for (const surface of reducedMotionSurfaces) {
  test(`reduced motion fades ${surface.name} in place`, async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', 'Animations slow down through the Chromium CDP.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(desktop);
    const session = await page.context().newCDPSession(page);
    const playAt = (playbackRate: number) =>
      session.send('Animation.setPlaybackRate', { playbackRate });
    const element = page.locator(surface.selector);

    await surface.prepare?.(page);
    await recordFrames(page, surface.selector, 'enter');
    await playAt(0.1);
    await surface.show(page);
    const entrance = await recordedFrames(page);
    await playAt(1);
    expectFadeInPlace(entrance, surface.durations[0]);
    expect(entrance.at(-1)?.opacity).toBe(1);

    // Motion starts its animations on the wall clock while CDP slows the document timeline, so
    // a slowed stretch delays every later Motion animation: leave from a fresh timeline.
    await page.reload();
    await surface.prepare?.(page);
    await surface.show(page);
    await expect(element).toHaveCSS('opacity', '1');
    await recordFrames(page, surface.selector, 'leave');
    await playAt(0.1);
    await surface.hide(page);
    const exit = await recordedFrames(page);
    await playAt(1);
    expectFadeInPlace(exit, surface.durations[1]);
    await expect(element).toHaveCount(0);
  });
}

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

async function showFixtureToast(page: Page) {
  // The demo bridge listens once the shelf has mounted.
  await expect(page.getByPlaceholder(/Add a note…|Ajouter une note…/)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('charon:fixture-toast')));
}

test('toasts never cover the composer and swipe away up or right', async ({ page }) => {
  for (const { width, height } of [
    { width: 400, height: 480 },
    { width: 480, height: 720 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(desktop);
    await showFixtureToast(page);
    const toastSurface = page.locator('[data-slot="toast"]');
    await expect(toastSurface).toHaveCSS('opacity', '1');
    await page.waitForFunction(() =>
      document.getAnimations().every(({ playState }) => playState !== 'running'),
    );
    const geometry = await page.evaluate(() => {
      const toast = document.querySelector<HTMLElement>('[data-slot="toast"]');
      const composer = document.querySelector<HTMLElement>('.composer-dock');
      const drag = document.querySelector<HTMLElement>('.window-drag-region');
      if (!toast || !composer) return null;
      const t = toast.getBoundingClientRect();
      const c = composer.getBoundingClientRect();
      return {
        inside:
          t.left >= 0 &&
          t.top >= 0 &&
          t.right <= window.innerWidth &&
          t.bottom <= window.innerHeight,
        intersectsComposer: !(
          t.bottom <= c.top ||
          t.top >= c.bottom ||
          t.right <= c.left ||
          t.left >= c.right
        ),
        belowDragRegion: drag ? t.top >= drag.getBoundingClientRect().bottom : true,
      };
    });
    expect(geometry).toEqual({ inside: true, intersectsComposer: false, belowDragRegion: true });
    await expect(page.getByPlaceholder('Add a note…')).toBeVisible();
    await page.getByPlaceholder('Add a note…').click();
    await expect(page.getByPlaceholder('Add a note…')).toBeFocused();
    // Base UI exposes Close to assistive technology once the toast is hovered or focused.
    await toastSurface.locator('[data-slot="toast-close"]').click();
    await expect(toastSurface).toHaveCount(0);
  }

  for (const [dx, dy] of [
    [0, -80],
    [120, 0],
  ]) {
    await page.goto(desktop);
    await showFixtureToast(page);
    const toastSurface = page.locator('[data-slot="toast"]');
    await expect(toastSurface).toHaveCSS('opacity', '1');
    const box = await toastSurface.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const start = { x: box.x + box.width / 3, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 });
    await page.mouse.up();
    // Well inside Base UI's 5 s auto-dismiss, so only the swipe can have removed it.
    await expect(toastSurface).toHaveCount(0, { timeout: 2_000 });
  }
});

test('toasts crossfade in place under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  await showFixtureToast(page);
  const toastSurface = page.locator('[data-slot="toast"]');
  await expect(toastSurface).toHaveCSS('opacity', '1');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--motion-surface-travel').trim(),
    ),
  ).toBe('0%');
  await expect(toastSurface).toHaveCSS('transition-property', 'opacity');
  const samples = await toastSurface.evaluate(async (element) => {
    const before = element.getBoundingClientRect().top;
    const tops: number[] = [];
    element.querySelector<HTMLElement>('[data-slot="toast-close"]')?.click();
    await new Promise<void>((resolve) => {
      const sample = () => {
        if (!element.isConnected) {
          resolve();
          return;
        }
        tops.push(element.getBoundingClientRect().top);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return { before, tops };
  });
  expect(samples.tops.length).toBeGreaterThan(0);
  for (const top of samples.tops) {
    expect(Math.abs(top - samples.before)).toBeLessThanOrEqual(1);
  }
  await expect(toastSurface).toHaveCount(0);
});

test('compact Preferences applies themes and locale without leaving the shelf', async ({
  page,
}) => {
  const html = page.locator('html');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(desktop);
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).not.toHaveAttribute('style', /background/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'System' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Graphite' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await chooseLanguage(page, 'Français');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { name: 'Préférences' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Langue' })).toHaveText('Français');
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
  await chooseLanguage(page, 'Français');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('textbox', { name: 'Rechercher des notes' })).toBeVisible();
});

test('Preferences About opens nothing until a link is activated', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  const startUrl = page.url();
  await page.getByRole('button', { name: 'Settings' }).click();
  const preferences = page.locator('.preferences-popover');
  await expect(preferences).toBeVisible();
  await preferences.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const about = page.getByRole('region', { name: 'About' });
  await expect(about.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(about.getByText(/^Charon \d+\.\d+\.\d+/u)).toBeVisible();
  await expect(about.getByText(/MIT License/u)).toBeVisible();
  expect(await preferences.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await about.getByRole('button', { name: 'Source code on GitHub' }).click();
  // The browser fixture has no Tauri runtime, so the opener rejects: the failure stays local.
  await expect(about.getByRole('alert')).toHaveText('The browser could not be opened. Try again.');
  await expect(preferences).toBeVisible();
  expect(page.url()).toBe(startUrl);
  expect(requests.filter((url) => url.includes('github.com'))).toEqual([]);
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
  // The Attachment remove button keeps Button's slot inside its Tooltip, so its 44px rule applies.
  // Measure once the editor's entrance scale has settled.
  await page.waitForFunction(() =>
    document.getAnimations().every(({ playState }) => playState === 'finished'),
  );
  const removeArea = await hitArea('.attachment-list [data-slot="button"]');
  expect(removeArea.width).toBeGreaterThanOrEqual(44);
  expect(removeArea.height).toBeGreaterThanOrEqual(44);
  expect(
    await page
      .locator('.attachment-list')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});

test('icon-only controls name themselves in Tooltips', async ({ page }) => {
  await page.goto(desktop);
  const tooltip = page.locator('[data-slot="tooltip-content"]');
  const tooltipNamed = (text: string) =>
    page.locator('[data-slot="tooltip-content"]', { hasText: new RegExp(`^${text}$`) });
  const edit = page.getByRole('button', { name: 'Edit Agent handoff', exact: true });
  for (const theme of ['Light', 'Graphite']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.preferences-popover')).toBeHidden();
    // Keyboard focus shows the short action label, without the Note title beside it.
    await page.keyboard.press('Shift');
    await edit.focus();
    await expect(tooltipNamed('Edit')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(edit).toBeFocused();
  }
  await page.getByRole('button', { name: 'Delete Agent handoff', exact: true }).hover();
  await expect(tooltipNamed('Delete')).toBeVisible();

  // A Tooltip closes when its trigger opens a Popover.
  await edit.click();
  await page.getByRole('button', { name: 'Markdown help', exact: true }).click();
  await expect(page.locator('.markdown-help')).toBeVisible();
  await expect(tooltip).toHaveCount(0);
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
        await chooseLanguage(matrixPage, locale === 'fr' ? 'Français' : 'English');
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
  await chooseLanguage(page, 'Français');
  await page.keyboard.press('Escape');
  await expect(page.locator('.preferences-popover')).toBeHidden();
  await expect(page.locator('.note-capture-input textarea')).toBeVisible();
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
    navigator.platform.startsWith('Mac') ? '⌘ + ⇧ + Space' : 'Alt + Shift + Space',
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

// Feedback colours transition on the direct tokens (ADR 0020); read them once settled.
async function settledBackground(locator: Locator) {
  return locator.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
    return getComputedStyle(element).backgroundColor;
  });
}

test('fine-pointer hover keeps rows, controls, and destructive actions visually distinct', async ({
  page,
}) => {
  await page.goto(desktop);
  await expect(page.locator('.composer-dock')).toHaveCSS('border-top-style', 'solid');

  const row = page.locator('.note-row').first();
  const edit = row.locator('.note-edit-button');
  await row.hover();
  const rowHover = await settledBackground(row);
  await edit.hover();
  const controlHover = await settledBackground(edit);
  expect(controlHover).not.toBe(rowHover);

  const remove = row.locator('.note-delete-button');
  await remove.hover();
  const destructiveHover = await settledBackground(remove);
  expect(destructiveHover).not.toBe(controlHover);

  // Done rows paint the chip colour themselves; the chip keeps a hairline and only the title strikes.
  const done = page.locator('.note-row[data-status="done"]').first();
  const doneChip = done.locator('.tag-filter-chip').first();
  const chipBoundary = () => doneChip.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(await chipBoundary()).not.toBe('none');
  await done.hover();
  expect(await chipBoundary()).not.toBe('none');
  expect(
    await done
      .locator('.note-row-title')
      .evaluate((element) => getComputedStyle(element).textDecorationLine),
  ).toBe('line-through');
  expect(
    await done
      .locator('.note-row-snippet')
      .evaluate((element) => getComputedStyle(element).textDecorationLine),
  ).toBe('none');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.preferences-popover')).toHaveCSS('opacity', '1');
  const selectedTheme = page.getByRole('button', { name: 'System' });
  const otherTheme = page.getByRole('button', { name: 'Graphite' });
  await otherTheme.hover();
  const otherThemeHover = await settledBackground(otherTheme);
  await selectedTheme.hover();
  const selectedThemeHover = await settledBackground(selectedTheme);
  expect(selectedThemeHover).not.toBe(otherThemeHover);
  expect(await selectedTheme.evaluate((element) => getComputedStyle(element).boxShadow)).toContain(
    'inset',
  );

  await page.keyboard.press('Escape');
  await row.hover();
  await expect(edit).toHaveAttribute('aria-expanded', 'false');
  await edit.click();
  await expect(edit).toHaveAttribute('aria-expanded', 'true');
  const preview = page.getByRole('tab', { name: 'Preview' });
  const write = page.getByRole('tab', { name: 'Write' });
  await preview.hover();
  const previewHover = await settledBackground(preview);
  await write.hover();
  const activeTabHover = await settledBackground(write);
  expect(activeTabHover).not.toBe(previewHover);
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
  await page.getByRole('combobox', { name: 'Language' }).click();
  await expect(page.locator('[data-slot="select-content"]')).toHaveCSS('opacity', '1');
  results = await new AxeBuilder({ page }).exclude('[data-base-ui-focus-guard]').analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
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
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);
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
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const help = page.getByRole('button', { name: 'Markdown help', exact: true });
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.markdown-help')).toBeVisible();
  await expect(
    page.locator('.markdown-help').getByRole('heading', { name: 'Not rendered' }),
  ).toBeVisible();
  // Examples stay selectable text: the help never writes the clipboard or the draft.
  await expect(page.locator('.markdown-help pre').first()).not.toHaveCSS('user-select', 'none');
  await page.keyboard.press('Escape');
  await expect(page.locator('.markdown-help')).toHaveCount(0);
  await expect(help).toBeFocused();
  await expect(editor).toHaveValue(body);
  expect(requests).toEqual([]);
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
  await expect(
    page.locator('.help-popover').getByRole('button', { name: 'Markdown help', exact: true }),
  ).toBeFocused();
  expect(requests).toEqual([]);
});

test('Draw stores an inline SVG drawing that Preview renders without requests', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 400, height: 480 });
  await page.goto(desktop);
  await page.getByRole('button', { name: 'Edit Agent handoff', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Markdown body' });
  await editor.fill('');
  const draw = page.getByRole('button', { name: 'Draw', exact: true });
  await draw.click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const canvas = dialog.getByRole('img', { name: 'Drawing canvas' });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  // Ink appears on pointer down, before any move.
  await expect(canvas.locator('.drawing-live-stroke')).toHaveAttribute('d', /^M[\d.]+ [\d.]+L/);
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(
      box.x + box.width * (0.2 + step * 0.05),
      box.y + box.height * (0.3 + Math.sin(step / 2) * 0.2),
    );
  }
  await page.mouse.up();
  await expect(canvas.locator('path[data-stroke-key]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('charon-drawing-dialog.png') });
  await dialog.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(draw).toBeFocused();
  await expect(editor).toHaveValue(
    /^```svg\n<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[^"]+" width="[^"]+" height="[^"]+" data-charon-drawing="1">\n<path d="M[^"]+" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"\/>\n<\/svg>\n```$/,
  );
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  const preview = page.getByTestId('note-preview');
  const drawing = preview.locator('.note-drawing svg[role="img"]');
  await expect(drawing).toHaveCount(1);
  await expect(drawing).toHaveAttribute('aria-label', 'Drawing');
  expect(await drawing.locator('path').count()).toBeGreaterThanOrEqual(1);
  await expect(preview.locator('pre, img, script, foreignObject, image')).toHaveCount(0);
  expect(requests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('charon-drawing-preview.png') });
  await expect(page.locator('[data-note-id="capture-note"] .note-row-title')).toHaveText('Drawing');
});
