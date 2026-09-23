// Rasterize the checked-in vector for the press/download assets.
// Run after generate-wordmark.py; requires npm ci in e2e/.
import { chromium } from '../e2e/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../app/assets/logo/', import.meta.url);
const svg = await readFile(new URL('debatable-logo.svg', directory), 'utf8');
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage();
  for (const size of [128, 256]) {
    const png = await page.evaluate(async ({ svg, size }) => {
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { svg, size });
    await writeFile(new URL(`debatable-logo-${size}.png`, directory), Buffer.from(png, 'base64'));
  }
} finally {
  await browser.close();
}
