import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const jobs = [
  ['flyer.html',    '/home/user/out/punchly-flyer-A5.pdf',    '154mm', '216mm'],
  ['onepager.html', '/home/user/out/punchly-onepager-A4.pdf', '216mm', '303mm'],
];
for (const [file, out, width, height] of jobs) {
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///tmp/pgtest/' + file, { waitUntil: 'networkidle' });
  // Fail loudly if the layout overflows its own page box — that is exactly
  // the bug that put a section header through the middle of the checklist.
  const overflow = await p.evaluate(() => {
    const el = document.querySelector('.page');
    return el ? { scroll: el.scrollHeight, client: el.clientHeight } : null;
  });
  await p.pdf({ path: out, width, height, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  const over = overflow && overflow.scroll > overflow.client + 1;
  console.log(`${file} -> ${out}  content ${overflow?.scroll}px / box ${overflow?.client}px  ${over ? '❌ OVERFLOWS' : '✅ fits'}${errs.length ? ' errors:' + errs.join(';') : ''}`);
  await p.close();
}
await b.close();
