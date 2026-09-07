import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Everything is resolved from this file, so the command in the docs works from
// anywhere in the checkout and on a machine that is not this one.
const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = resolve(HERE, '..', 'build', 'print');
mkdirSync(BUILD, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const jobs = [
  ['flyer.html',    'punchly-flyer-A5.pdf',    '154mm', '216mm'],
  ['onepager.html', 'punchly-onepager-A4.pdf', '216mm', '303mm'],
];
for (const [file, outName, width, height] of jobs) {
  const out = join(BUILD, outName);
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(pathToFileURL(join(BUILD, file)).href, { waitUntil: 'networkidle' });
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
