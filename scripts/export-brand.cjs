// Optional development tool. Runtime and packaged app do not require Playwright.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const project = path.resolve(__dirname, '..');
  const brand = path.join(project, 'public', 'brand');
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const svg = fs.readFileSync(path.join(brand, 'icon.svg'), 'utf8');
    const frames = [];
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
      const png = await page.screenshot({ omitBackground: true });
      fs.writeFileSync(path.join(brand, `icon-${size}.png`), png);
      if (size <= 256) frames.push({ size, png });
    }
    const header = Buffer.alloc(6 + frames.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
    let offset = header.length;
    frames.forEach(({ size, png }, i) => {
      const pos = 6 + i * 16;
      header[pos] = header[pos + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, pos + 4); header.writeUInt16LE(32, pos + 6);
      header.writeUInt32LE(png.length, pos + 8); header.writeUInt32LE(offset, pos + 12);
      offset += png.length;
    });
    fs.writeFileSync(path.join(brand, 'nivodock.ico'), Buffer.concat([header, ...frames.map(f => f.png)]));
    await page.setViewportSize({ width: 1080, height: 1100 });
    await page.goto(pathToFileURL(path.join(brand, 'index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.join(project, 'branding'), { recursive: true });
    await page.screenshot({ path: path.join(project, 'branding', 'preview.png'), fullPage: true });
    console.log('Exported PNG 16–512, Windows ICO 16–256 and branding/preview.png');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
