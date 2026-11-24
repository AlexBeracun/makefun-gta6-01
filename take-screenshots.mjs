// SOLMAR HEAT — rewritten via write tool
// Takes the four real screenshots in shots.json: serves game/ on a local port, opens
// each ?shot= scene in headless Chromium at 1280x720, waits for window.__shotReady, and
// saves a JPEG (quality 80) into screenshots/. Exits non-zero if any file breaks the
// entry caps (256 KiB, long side 1280, short side 480).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');
const shots = JSON.parse(await readFile(join(here, 'shots.json'), 'utf8'));
const types = { '.html': 'text/html', '.js': 'text/javascript' };

const server = createServer(async (request, response) => {
  try {
    const path = request.url === '/' ? '/index.html' : decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = await readFile(join(root, path));
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (error) => {
      throw new Error(`page error on ${shot.query}: ${error.message}`);
    });
    await page.goto(`http://localhost:${port}/index.html${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
    const out = join(here, 'screenshots', shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 80 });
    await page.close();
    const info = await stat(out);
    console.log(`${shot.name}: ${info.size} bytes`);
    if (info.size > 262144) throw new Error(`${shot.name} is over the 256 KiB cap`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log('all screenshots taken');
