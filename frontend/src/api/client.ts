import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import type { ResourceType, UpgradePromptPayload } from '@/types/billing';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readLimitType(value: unknown): ResourceType | 'model_access' | null {
  switch (value) {
    case 'quiz':
    case 'ocr':
    case 'storage':
    case 'model_access':
      return value;
    default:
      return null;
  }
}

function normalizeUpgradePayload(payload: unknown): UpgradePromptPayload | null {
  if (!isRecord(payload)) {
    return null;
  }

  const nestedDetail = payload.detail;
  const source = isRecord(nestedDetail) ? nestedDetail : payload;

  const limitType = readLimitType(source.limitType ?? source.limit_type);

  if (!limitType) {
    return null;
  }

  const detail =
    readString(source.detail) ??
    readString(payload.detail) ??
    '사용 한도를 초과했습니다.';

  return {
    detail,
    limitType,
    currentUsage: readNumber(source.currentUsage ?? source.current_usage) ?? 0,
    limit: readNumber(source.limit) ?? 0,
    upgradeUrl: readString(source.upgradeUrl ?? source.upgrade_url) ?? '/pricing',
  };
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken, adminToken } = useAuthStore.getState();
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    if (adminToken && config.headers) {
      config.headers['X-Admin-Token'] = adminToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Serialize concurrent refresh calls so only one /auth/refresh request fires at a time.
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (value: AxiosResponse | PromiseLike<AxiosResponse>) => void;
  reject: (reason: unknown) => void;
  config: InternalAxiosRequestConfig;
}> = [];

function flushQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject, config }) => {
    if (error) {
      reject(error);
    } else {
      if (config.headers && token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      resolve(apiClient(config) as Promise<AxiosResponse>);
    }
  });
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  undefined,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isAuthRoute = originalRequest?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      if (isRefreshing) {
        // Queue this request — it will be retried once the in-flight refresh completes.
        return new Promise<AxiosResponse>((resolve, reject) => {
          pendingQueue.push({ resolve, reject, config: originalRequest });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });
          const { access_token, refresh_token } = response.data;
          useAuthStore.getState().setTokens(access_token, refresh_token);
          flushQueue(null, access_token);
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
          }
          return apiClient(originalRequest) as Promise<AxiosResponse>;
        } catch (refreshError) {
          flushQueue(refreshError, null);
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        isRefreshing = false;
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }

    if (error.response?.status === 402) {
      const config = error.config as InternalAxiosRequestConfig & { _skipUpgradeModal?: boolean };
      if (!config?._skipUpgradeModal) {
        const payload = normalizeUpgradePayload(error.response.data);
        if (payload) {
          window.dispatchEvent(new CustomEvent<UpgradePromptPayload>('upgrade-required', { detail: payload }));
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
