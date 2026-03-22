import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:8000/versions/v10/index.html?map=grandprix', { waitUntil: 'load' });
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1200);

const result = await page.evaluate(() => window.__v10Debug?.runLapRuleSelfTest?.() ?? null);
console.log(JSON.stringify(result, null, 2));

await browser.close();
