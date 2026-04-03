import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from './frontend/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.MOBILE_QA_BASE_URL || 'http://127.0.0.1:5173';
const API_BASE_URL = process.env.MOBILE_QA_API_URL || 'http://localhost:8000';
const SCREENSHOT_PATH = process.env.MOBILE_QA_SCREENSHOT_PATH || path.join(__dirname, '.sisyphus', 'mobile-files-qa.png');

const authState = {
  state: {
    user: {
      id: 'u1',
      username: 'mobile-user',
      email: 'm@example.com',
      role: 'user',
      is_active: true,
      storage_used_bytes: 1024,
      storage_quota_bytes: 1000000,
      last_login_at: null,
    },
    accessToken: 'token',
    refreshToken: 'refresh',
    isAuthenticated: true,
    isAdmin: false,
    impersonatingUserId: null,
    impersonatingUsername: null,
    adminToken: null,
  },
  version: 0,
};

const folders = [
  {
    id: 'folder-1',
    name: '중간고사',
    parent_folder_id: null,
    sort_order: 0,
    status: 'ready',
    created_at: '2026-04-03T00:00:00Z',
  },
  {
    id: 'folder-2',
    name: '기출문제',
    parent_folder_id: null,
    sort_order: 1,
    status: 'ready',
    created_at: '2026-04-03T00:00:00Z',
  },
];

const filesPayload = {
  files: [
    {
      id: 'file-1',
      original_filename: '2026-중간고사-정리노트.pdf',
      file_type: 'pdf',
      file_size_bytes: 3145728,
      source_type: 'upload',
      source_url: null,
      stored_path: '/tmp/file-1',
      status: 'ready',
      parse_error_code: null,
      ocr_required: false,
      retry_count: 0,
      is_searchable: true,
      is_quiz_eligible: true,
      processing_started_at: null,
      processing_finished_at: '2026-04-03T00:00:00Z',
      folder_id: null,
      created_at: '2026-04-03T00:00:00Z',
    },
    {
      id: 'file-2',
      original_filename: '회로이론-핵심요약.docx',
      file_type: 'docx',
      file_size_bytes: 512000,
      source_type: 'upload',
      source_url: null,
      stored_path: null,
      status: 'failed_partial',
      parse_error_code: null,
      ocr_required: false,
      retry_count: 2,
      is_searchable: false,
      is_quiz_eligible: false,
      processing_started_at: null,
      processing_finished_at: '2026-04-03T01:00:00Z',
      folder_id: 'folder-1',
      created_at: '2026-04-03T01:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  size: 20,
};

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.addInitScript((state) => {
    window.sessionStorage.setItem('auth-storage', JSON.stringify(state));
  }, authState);

  await page.route(new RegExp(`${API_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/files/folders(\\?.*)?$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(folders),
    });
  });

  await page.route(new RegExp(`${API_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/files(\\?.*)?$`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(filesPayload),
    });
  });

  await page.goto(`${BASE_URL}/files`, { waitUntil: 'networkidle' });
  await page.getByText('2026-중간고사-정리노트.pdf').first().waitFor();

  const menuButton = page.getByRole('button', { name: '자료 관리' });
  await menuButton.click();
  await page.getByRole('button', { name: '메뉴 닫기' }).waitFor();
  await page.getByRole('button', { name: '메뉴 닫기' }).click();
  await page.waitForFunction(() => {
    const mobileMenu = document.querySelector('aside[aria-label="모바일 메뉴"]');
    return mobileMenu instanceof HTMLElement && mobileMenu.getBoundingClientRect().right <= 0;
  });

  await page.locator('article input[type="checkbox"]').first().click();
  await page.getByRole('button', { name: '선택 삭제' }).waitFor();
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

  const result = await page.evaluate(() => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      if (element.offsetParent === null && getComputedStyle(element).position !== 'fixed') {
        return false;
      }

      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    const mobileMenu = document.querySelector('aside[aria-label="모바일 메뉴"]');
    const mobileMenuRect = mobileMenu instanceof HTMLElement ? mobileMenu.getBoundingClientRect() : null;

    return {
      currentPath: window.location.pathname,
      loginFormVisible: Array.from(document.querySelectorAll('input')).some((el) => {
        const input = el;
        return isVisible(input) && (input.id === 'username-or-email' || input.id === 'password');
      }),
      visibleTable: Array.from(document.querySelectorAll('table')).some((el) => isVisible(el)),
      visibleCards: Array.from(document.querySelectorAll('article')).filter((el) => isVisible(el)).length,
      bulkBarVisible: Array.from(document.querySelectorAll('button')).some((el) => isVisible(el) && el.textContent?.includes('선택 삭제')),
      mobileMenuVisible: mobileMenu instanceof HTMLElement ? isVisible(mobileMenu) && mobileMenuRect !== null && mobileMenuRect.right > 0 : false,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  console.log(JSON.stringify({ ...result, screenshot: SCREENSHOT_PATH }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
