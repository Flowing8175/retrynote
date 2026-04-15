interface PaddleCheckoutSettings {
  successUrl?: string;
}

interface PaddleCheckoutOpenOptions {
  transactionId: string;
  settings?: PaddleCheckoutSettings;
}

interface PaddleEvent {
  name: string;
  data?: unknown;
}

interface PaddleInitOptions {
  token: string;
  environment?: 'sandbox';
  eventCallback?: (event: PaddleEvent) => void;
}

interface PaddleStatic {
  Initialize: (options: PaddleInitOptions) => void;
  Checkout: {
    open: (options: PaddleCheckoutOpenOptions) => void;
  };
}

interface Window {
  Paddle?: PaddleStatic;
}
