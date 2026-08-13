import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome-headless-shell/linux-151.0.7922.77/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  const rootHtml = await page.evaluate(() => document.body.innerHTML.length);
  console.log('BODY HTML LENGTH:', rootHtml);
  
  await browser.close();
})();
