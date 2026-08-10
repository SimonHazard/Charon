import { unlink } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from '../../site/node_modules/sharp';

const output = new URL('../../site/public/media/', import.meta.url).pathname;
const browser = await chromium.launch();

async function prepare(page: import('@playwright/test').Page, theme: 'solarized' | 'dark') {
  await page.addInitScript((value) => localStorage.setItem('charon-theme', value), theme);
  await page.goto('http://127.0.0.1:1420/?fixture=media');
  await page.locator('[data-note-id="capture-note"]').waitFor();
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
}

async function settleAnimations(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
}

const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
await prepare(page, 'solarized');
await settleAnimations(page);
const solarizedPng = await page.screenshot();
await sharp(solarizedPng).webp({ quality: 84 }).toFile(`${output}charon-shelf-solarized.webp`);
await sharp(solarizedPng).avif({ quality: 62 }).toFile(`${output}charon-shelf-solarized.avif`);

await prepare(page, 'dark');
await page.locator('[data-note-id="capture-note"] .note-row-activation').click();
await page.locator('[data-note-editor="capture-note"]').waitFor();
await settleAnimations(page);
const darkPng = await page.screenshot();
await sharp(darkPng).webp({ quality: 84 }).toFile(`${output}charon-editor-dark.webp`);
await sharp(darkPng).avif({ quality: 62 }).toFile(`${output}charon-editor-dark.avif`);
await page.close();

const videoContext = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  recordVideo: { dir: output, size: { width: 1440, height: 960 } },
});
const videoPage = await videoContext.newPage();
await prepare(videoPage, 'solarized');
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
