/**
 * Normalize an API error detail payload into a user-facing message string.
 * Handles string, array, and object detail formats from FastAPI/axios responses.
 */
export function getDetailMessage(detail: unknown, fallbackMessage: string): string {
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const firstDetail = detail[0];

    if (typeof firstDetail === 'string' && firstDetail.trim()) {
      return firstDetail;
    }

    if (typeof firstDetail === 'object' && firstDetail !== null) {
      const maybeMessage = firstDetail as { msg?: unknown; loc?: unknown };
      const msg = typeof maybeMessage.msg === 'string' ? maybeMessage.msg : null;
      const loc = Array.isArray(maybeMessage.loc)
        ? maybeMessage.loc
            .filter(
              (part): part is string | number =>
                typeof part === 'string' || typeof part === 'number',
            )
            .join(' > ')
        : null;

      if (msg && loc) {
        return `${loc}: ${msg}`;
      }
      if (msg) {
        return msg;
      }
    }
  }

  if (typeof detail === 'object' && detail !== null) {
    const maybeDetail = detail as { msg?: unknown };
    if (typeof maybeDetail.msg === 'string' && maybeDetail.msg.trim()) {
      return maybeDetail.msg;
    }
  }

  return fallbackMessage;
}

/**
 * Extract a user-facing error message from an unknown error value.
 * Handles axios response errors and standard Error objects.
 */
export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (typeof error === 'object' && error !== null) {
    const maybeResponse = error as { response?: { data?: { detail?: string } } };
    if (typeof maybeResponse.response?.data?.detail === 'string') {
      return maybeResponse.response.data.detail;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}
