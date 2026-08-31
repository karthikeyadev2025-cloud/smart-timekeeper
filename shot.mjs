import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
for (const [theme, dark] of [['light', false], ['dark', true]]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: dark ? 'dark' : 'light' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[${theme}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`[${theme}] console: ${m.text().slice(0,120)}`); });
  await p.goto('http://localhost:4182/', { waitUntil: 'networkidle', timeout: 60000 });
  if (dark) await p.evaluate(() => document.documentElement.classList.add('dark'));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `/tmp/pgtest/land-${theme}-hero.png` });
  await p.screenshot({ path: `/tmp/pgtest/land-${theme}-full.png`, fullPage: true });
  // horizontal overflow check
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  console.log(`${theme}: screenshot ok, horizontal-overflow=${overflow}`);
  await ctx.close();
}
// mobile
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', e => errors.push(`[mobile] ${e.message}`));
await p.goto('http://localhost:4182/', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/pgtest/land-mobile.png' });
const mo = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
console.log(`mobile: screenshot ok, horizontal-overflow=${mo}`);
await b.close();
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
