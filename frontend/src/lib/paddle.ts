import { billingApi } from '@/api/billing';

let initialized = false;
let initPromise: Promise<void> | null = null;
let scriptPromise: Promise<void> | null = null;
let checkoutCloseCallback: (() => void) | null = null;
let checkoutCompleteCallback: (() => void) | null = null;

function loadScript(): Promise<void> {
  if (window.Paddle) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => {
      if (window.Paddle) resolve();
      else reject(new Error('Paddle script loaded but global not found'));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Paddle.js from CDN'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function doInit(): Promise<void> {
  await loadScript();
  const config = await billingApi.getPaddleConfig();
  window.Paddle!.Initialize({
    token: config.clientToken,
    ...(config.environment === 'sandbox' ? { environment: 'sandbox' as const } : {}),
    eventCallback: (event) => {
      if (event.name === 'checkout.completed' && checkoutCompleteCallback) {
        checkoutCompleteCallback();
        checkoutCompleteCallback = null;
      }
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
  onComplete?: () => void,
): Promise<void> {
  await ensureInitialized();
  checkoutCloseCallback = onClose ?? null;
  checkoutCompleteCallback = onComplete ?? null;
  window.Paddle!.Checkout.open({
    transactionId,
    settings: {
      successUrl: `${window.location.origin}/settings/billing?success=1`,
    },
  });
}
