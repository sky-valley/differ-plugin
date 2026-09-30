import { pathToFileURL } from 'node:url';
// Optional browser dependency belongs in the checking workspace, not content/.
export async function launchBrowser() {
  const module = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
  const { chromium } = await import(module);
  return chromium.launch({ headless: true });
}
export async function viewer(site, browser, subject, width = 390) {
  const cookie = subject ? await site.participate(subject) : undefined;
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(await site.browserURL(cookie));
  return { page, context, cookie };
}
