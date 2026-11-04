import { pathToFileURL } from 'node:url';
// Optional browser dependency belongs in the checking workspace, not content/.
export async function launchBrowser() {
  const module = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
  const { chromium } = await import(module);
  return chromium.launch({ headless: true });
}
// The frames Differ shows a bit in: the open bit fills the phone, checked at
// 390×693 CSS px; the feed's interactive preview.html is 390×520.
export const frames = { index: { width: 390, height: 693 }, preview: { width: 390, height: 520 } };
async function open(site, browser, subject, page, viewport) {
  const cookie = subject ? await site.participate(subject) : undefined;
  const context = await browser.newContext({ viewport });
  const tab = await context.newPage();
  tab.setDefaultTimeout(8000);
  await tab.goto(new URL(page, await site.browserURL(cookie)).href);
  return { page: tab, context, cookie };
}
// The open bit, at 390×693 unless a check asks for a narrower phone.
export function viewer(site, browser, subject, width = frames.index.width) {
  return open(site, browser, subject, '', { ...frames.index, width });
}
// The bit's preview.html at the feed's 390×520.
export function previewer(site, browser, subject) {
  return open(site, browser, subject, 'preview.html', frames.preview);
}
