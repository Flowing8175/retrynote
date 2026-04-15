import { billingApi } from '@/api/billing';

let initialized = false;
let initPromise: Promise<void> | null = null;
let checkoutCloseCallback: (() => void) | null = null;

const SCRIPT_POLL_INTERVAL_MS = 100;
const SCRIPT_POLL_MAX_ATTEMPTS = 50;

function waitForScript(): Promise<void> {
  if (window.Paddle) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      if (window.Paddle) {
        clearInterval(timer);
        resolve();
      } else if (++attempts >= SCRIPT_POLL_MAX_ATTEMPTS) {
        clearInterval(timer);
        reject(new Error('Paddle.js failed to load'));
      }
    }, SCRIPT_POLL_INTERVAL_MS);
  });
}

async function doInit(): Promise<void> {
  await waitForScript();
  const config = await billingApi.getPaddleConfig();
  window.Paddle!.Initialize({
    token: config.clientToken,
    ...(config.environment === 'sandbox' ? { environment: 'sandbox' as const } : {}),
    eventCallback: (event) => {
      if (event.name === 'checkout.closed' && checkoutCloseCallback) {
        checkoutCloseCallback();
        checkoutCloseCallback = null;
      }
    },
  });
  initialized = true;
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = doInit().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function openPaddleCheckout(
  transactionId: string,
  onClose?: () => void,
): Promise<void> {
  await ensureInitialized();
  checkoutCloseCallback = onClose ?? null;
  window.Paddle!.Checkout.open({
    transactionId,
    settings: {
      successUrl: `${window.location.origin}/settings/billing?success=1`,
    },
  });
}
