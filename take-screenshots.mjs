import { chromium } from '/home/oh/dev/quiz-manager/frontend/node_modules/playwright/index.mjs';
import path from 'path';

const SCREENSHOTS_DIR = '/home/oh/dev/quiz-manager/screenshots';
const BASE_URL = 'http://localhost:5173';

const routes = [
  { path: '/login', filename: '01-login.png' },
  { path: '/signup', filename: '02-signup.png' },
  { path: '/password-reset', filename: '03-password-reset.png' },
  { path: '/', filename: '04-dashboard.png' },
  { path: '/files', filename: '05-files.png' },
  { path: '/quiz/new', filename: '06-quiz-new.png' },
  { path: '/wrong-notes', filename: '07-wrong-notes.png' },
  { path: '/retry', filename: '08-retry.png' },
  { path: '/search', filename: '09-search.png' },
  { path: '/admin', filename: '10-admin.png' },
];

async function main() {
  const browser = await chromium.launch({
    executablePath: '/home/oh/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const route of routes) {
    const url = `${BASE_URL}${route.path}`;
    const outputPath = path.join(SCREENSHOTS_DIR, route.filename);
    
    console.log(`Navigating to ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (e) {
      // If networkidle times out, just wait a bit
      await page.waitForTimeout(2000);
    }
    
    // Extra wait for rendering
    await page.waitForTimeout(1500);
    
    console.log(`Taking screenshot -> ${outputPath}`);
    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`  Done: ${route.filename}`);
  }

  await browser.close();
  console.log('\nAll screenshots saved!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
