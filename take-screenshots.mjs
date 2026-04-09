import { chromium } from './frontend/node_modules/playwright/index.mjs';
import path from 'path';

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || '/home/oh/dev/retrynote-onboard-withplan/screenshots';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:8000';

const EMAIL = process.env.SS_EMAIL;
const PASSWORD = process.env.SS_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Set SS_EMAIL and SS_PASSWORD env vars');
  process.exit(1);
}

const publicRoutes = [
  { path: '/', filename: '01-landing.png' },
  { path: '/login', filename: '02-login.png' },
  { path: '/signup', filename: '03-signup.png' },
  { path: '/password-reset', filename: '04-password-reset.png' },
  { path: '/try', filename: '05-try-quiz.png' },
];

const protectedRoutes = [
  { path: '/dashboard', filename: '06-dashboard.png' },
  { path: '/files', filename: '07-files.png' },
  { path: '/quiz/new', filename: '08-quiz-new.png' },
  { path: '/quiz/history', filename: '09-quiz-history.png' },
  { path: '/wrong-notes', filename: '10-wrong-notes.png' },
  { path: '/retry', filename: '11-retry.png' },
  { path: '/search', filename: '12-search.png' },
  { path: '/settings', filename: '13-settings.png' },
  { path: '/settings/billing', filename: '14-billing.png' },
  { path: '/admin', filename: '15-admin.png' },
  { path: '/pricing', filename: '16-pricing.png' },
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
  console.log('Taking screenshots of public pages...');
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
    const data = await res.json();
    return { status: res.status, data };
  }, { apiUrl: API_URL, email: EMAIL, password: PASSWORD });

  if (loginRes.status !== 200) {
    console.error(`Login failed with status ${loginRes.status}:`, JSON.stringify(loginRes.data, null, 2));
    await browser.close();
    process.exit(1);
  }

  const loginResData = loginRes.data;
  if (!loginResData.access_token) {
    console.error('Login failed - no access token:', loginResData);
    await browser.close();
    process.exit(1);
  }

  // Inject Zustand auth-storage into sessionStorage
  // User profile is already in loginResData.user
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
  }, { token: loginResData.access_token, refreshToken: loginResData.refresh_token, user: loginResData.user });

  console.log(`Logged in as ${loginResData.user.email} (${loginResData.user.role})`);

  // 3. Protected pages
  console.log('\nTaking screenshots of protected pages...');
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
