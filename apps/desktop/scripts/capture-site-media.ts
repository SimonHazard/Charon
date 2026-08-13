import { unlink } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from '../../site/node_modules/sharp';

const output = new URL('../../site/public/media/', import.meta.url).pathname;
const browser = await chromium.launch();

async function prepare(
  page: import('@playwright/test').Page,
  theme: 'solarized' | 'dark',
  frameShelf = false,
) {
  await page.addInitScript((value) => localStorage.setItem('charon-theme', value), theme);
  await page.goto('http://127.0.0.1:1420/?fixture=media');
  if (frameShelf) {
    await page.addStyleTag({ content: '.desktop-shell { width: 640px; margin-inline: auto; }' });
  }
  await page.locator('[data-note-id="capture-note"]').waitFor();
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
}

async function settleAnimations(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
}

async function captureFramedScreenshot(page: import('@playwright/test').Page) {
  const screenshot = await page.screenshot();
  const canvas = await page.evaluate(
    () =>
      getComputedStyle(document.documentElement).backgroundColor.match(/\d+/g)?.map(Number) ?? [],
  );
  const [r = 0, g = 0, b = 0] = canvas;
  return sharp(screenshot)
    .resize(1440, 960, { fit: 'contain', background: { r, g, b, alpha: 1 } })
    .png()
    .toBuffer();
}

const page = await browser.newPage({
  viewport: { width: 480, height: 720 },
  deviceScaleFactor: 2,
});
await prepare(page, 'solarized');
await settleAnimations(page);
const solarizedPng = await captureFramedScreenshot(page);
await sharp(solarizedPng).webp({ quality: 84 }).toFile(`${output}charon-shelf-solarized.webp`);
await sharp(solarizedPng).avif({ quality: 62 }).toFile(`${output}charon-shelf-solarized.avif`);

await prepare(page, 'dark');
await page.locator('[data-note-id="capture-note"] .note-row-activation').click();
await page.locator('[data-note-editor="capture-note"]').waitFor();
await settleAnimations(page);
await page.locator('.note-list').evaluate((list) => {
  list.scrollTop = 180;
});
const darkPng = await captureFramedScreenshot(page);
await sharp(darkPng).webp({ quality: 84 }).toFile(`${output}charon-editor-dark.webp`);
await sharp(darkPng).avif({ quality: 62 }).toFile(`${output}charon-editor-dark.avif`);
await page.close();

const videoContext = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
  recordVideo: { dir: output, size: { width: 1440, height: 960 } },
});
const videoPage = await videoContext.newPage();
await prepare(videoPage, 'solarized', true);
await videoPage.waitForTimeout(500);
await videoPage.locator('[data-note-id="capture-note"] .note-row-activation').click();
await videoPage.locator('[data-note-editor="capture-note"]').waitFor();
await videoPage.waitForTimeout(900);
await videoPage.getByRole('tab', { name: 'Preview' }).click();
await videoPage.waitForTimeout(900);
const video = videoPage.video();
await videoPage.close();
await videoContext.close();
if (video) {
  const temporaryVideo = await video.path();
  await video.saveAs(`${output}charon-demo.webm`);
  await unlink(temporaryVideo);
}

await browser.close();
