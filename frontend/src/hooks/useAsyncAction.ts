import { useState } from 'react';
import { getDetailMessage } from '@/utils/errorMessages';

function useAsyncAction<T = void>(): {
  loading: boolean;
  error: string;
  setError: (e: string) => void;
  run: (fn: () => Promise<T>) => Promise<T | undefined>;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<T>): Promise<T | undefined> => {
    setError('');
    setLoading(true);
    try {
      return await fn();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: unknown } } };
      setError(getDetailMessage(axiosError.response?.data?.detail, '오류가 발생했습니다.'));
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, setError, run };
}

export { useAsyncAction };
