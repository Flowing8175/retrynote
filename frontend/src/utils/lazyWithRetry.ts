import React, { type ComponentType } from 'react';

/**
 * React.lazy with retry + auto-reload for stale chunk failures after deployments.
 *
 * 1. Retry the dynamic import up to `maxRetries` times with backoff.
 * 2. If all retries fail and it's a chunk error, force-reload the page once
 *    (new HTML = new chunk manifest). Cooldown prevents reload loops.
 * 3. If already reloaded recently, let the error propagate to AppErrorBoundary.
 */

const RELOAD_KEY = 'chunk_reload_ts';
const RELOAD_COOLDOWN_MS = 10_000;

function isChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Importing a module script failed') ||
    error.message.includes('error loading dynamically imported module') ||
    error.name === 'ChunkLoadError'
  );
}

function shouldReload(): boolean {
  const last = sessionStorage.getItem(RELOAD_KEY);
  if (!last) return true;
  return Date.now() - Number(last) > RELOAD_COOLDOWN_MS;
}

function forceReload(): never {
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
  throw new Error('Reloading page');
}

export default function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  maxRetries = 2,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await factory();
      } catch (error) {
        if (!isChunkError(error) || attempt === maxRetries) {
          if (isChunkError(error) && shouldReload()) {
            forceReload();
          }
          throw error;
        }
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw new Error('lazyWithRetry: exhausted retries');
  });
}
