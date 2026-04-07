import { chromium } from './frontend/node_modules/playwright/index.mjs';
import path from 'path';

const SCREENSHOTS_DIR = '/home/oh/dev/retrynote/screenshots';
const BASE_URL = 'https://retrynote.cloud';
const API_URL = 'https://retrynote.cloud/api';

const EMAIL = process.env.SS_EMAIL;
const PASSWORD = process.env.SS_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Set SS_EMAIL and SS_PASSWORD env vars');
  process.exit(1);
}

const publicRoutes = [
  { path: '/login', filename: '01-login.png' },
  { path: '/signup', filename: '02-signup.png' },
  { path: '/password-reset', filename: '03-password-reset.png' },
];

const protectedRoutes = [
  { path: '/', filename: '04-dashboard.png' },
  { path: '/files', filename: '05-files.png' },
  { path: '/quiz/new', filename: '06-quiz-new.png' },
  { path: '/wrong-notes', filename: '07-wrong-notes.png' },
  { path: '/retry', filename: '08-retry.png' },
  { path: '/search', filename: '09-search.png' },
  { path: '/admin', filename: '10-admin.png' },
];

async function screenshot(page, route) {
  const url = `${BASE_URL}${route.path}`;
  const outputPath = path.join(SCREENSHOTS_DIR, route.filename);
  console.log(`Navigating to ${url}...`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1500);
  console.log(`Taking screenshot -> ${outputPath}`);
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log(`  Done: ${route.filename}`);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: '/home/oh/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. Public pages (no auth needed)
  for (const route of publicRoutes) {
    await screenshot(page, route);
  }

  // 2. Log in via API, inject session into sessionStorage
  console.log('\nLogging in...');
  const loginRes = await page.evaluate(async ({ apiUrl, email, password }) => {
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username_or_email: email, password }),
    });
    return res.json();
  }, { apiUrl: API_URL, email: EMAIL, password: PASSWORD });

  if (!loginRes.access_token) {
    console.error('Login failed:', loginRes);
    await browser.close();
    process.exit(1);
  }

  // Fetch user profile
  const meRes = await page.evaluate(async ({ apiUrl, token }) => {
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }, { apiUrl: API_URL, token: loginRes.access_token });

  // Inject Zustand auth-storage into sessionStorage
  await page.evaluate(({ token, refreshToken, user }) => {
    const authState = {
      state: {
        user,
        accessToken: token,
        refreshToken,
        isAuthenticated: true,
        isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
        impersonatingUserId: null,
        impersonatingUsername: null,
        adminToken: null,
        usageStatus: null,
      },
      version: 0,
    };
    sessionStorage.setItem('auth-storage', JSON.stringify(authState));
  }, { token: loginRes.access_token, refreshToken: loginRes.refresh_token, user: meRes });

  console.log(`Logged in as ${meRes.email} (${meRes.role})`);

  // 3. Protected pages
  for (const route of protectedRoutes) {
    await screenshot(page, route);
  }

  await browser.close();
  console.log('\nAll screenshots saved!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
