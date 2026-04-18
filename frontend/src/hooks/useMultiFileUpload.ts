import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import axios from 'axios';
import { filesApi } from '@/api';

const DEFAULT_ALLOWED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'png', 'jpg', 'jpeg'];
const DEFAULT_MAX_SIZE_MB = 5;
const DEFAULT_CONCURRENCY = 3;

export type UploadItemStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'failed'
  | 'canceled';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadItemStatus;
  progress: number;
  errorMessage: string | null;
  serverFileId: string | null;
}

export interface UseMultiFileUploadOptions {
  concurrency?: number;
  maxSizeMB?: number;
  allowedExtensions?: string[];
  folderId?: string | null;
  onItemSucceeded?: (item: UploadItem) => void;
}

export interface UseMultiFileUploadReturn {
  items: UploadItem[];
  isActive: boolean;
  activeCount: number;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  enqueue: (files: File[]) => void;
  cancelItem: (id: string) => void;
  retryItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearFinished: () => void;
  cancelAll: () => void;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot + 1).toLowerCase();
}

function isTerminalStatus(status: UploadItemStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'canceled';
}

function mapUploadError(error: unknown, fallback: string): string {
  if (axios.isCancel(error)) {
    return '업로드 취소됨';
  }
  const axiosError = error as AxiosError<{ detail?: string | { detail?: string } }>;
  const rawDetail = axiosError?.response?.data?.detail;
  const detail =
    typeof rawDetail === 'string'
      ? rawDetail
      : typeof rawDetail === 'object' && rawDetail && 'detail' in rawDetail
      ? (rawDetail.detail ?? null)
      : null;
  if (detail) return detail;
  const status = axiosError?.response?.status;
  if (status === 402) return '저장 공간이 부족합니다';
  if (status === 409) return '이미 업로드된 파일입니다';
  if (status === 413) return '파일 용량 초과';
  if (status === 415) return '지원하지 않는 형식';
  if (status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도하세요';
  if (axiosError?.code === 'ERR_NETWORK') return '네트워크 오류';
  return fallback;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useMultiFileUpload(
  options: UseMultiFileUploadOptions = {},
): UseMultiFileUploadReturn {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    maxSizeMB = DEFAULT_MAX_SIZE_MB,
    allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
    folderId = null,
    onItemSucceeded,
  } = options;

  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const runningCountRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const invalidateFiles = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['files'] });
  }, [queryClient]);

  const runOne = useCallback(
    async (itemId: string) => {
      const snapshot = itemsRef.current.find((i) => i.id === itemId);
      if (!snapshot) return;

      const controller = new AbortController();
      controllersRef.current.set(itemId, controller);

      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, status: 'uploading', progress: 0, errorMessage: null }
            : item,
        ),
      );

      try {
        const response = await filesApi.uploadFile(snapshot.file, null, null, folderId, {
          signal: controller.signal,
          onUploadProgress: (percent) => {
            setItems((prev) =>
              prev.map((item) => {
                if (item.id !== itemId) return item;
                if (isTerminalStatus(item.status)) return item;
                const nextStatus: UploadItemStatus = percent >= 100 ? 'processing' : 'uploading';
                return { ...item, progress: percent, status: nextStatus };
              }),
            );
          },
        });

        const finished: UploadItem = {
          ...snapshot,
          status: 'done',
          progress: 100,
          errorMessage: null,
          serverFileId: response.file_id,
        };
        setItems((prev) => prev.map((item) => (item.id === itemId ? finished : item)));
        invalidateFiles();
        onItemSucceeded?.(finished);
      } catch (error) {
        const wasCanceled = axios.isCancel(error) || controller.signal.aborted;
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== itemId) return item;
            if (item.status === 'canceled') return item;
            if (wasCanceled) {
              return { ...item, status: 'canceled', errorMessage: '업로드 취소됨' };
            }
            return {
              ...item,
              status: 'failed',
              errorMessage: mapUploadError(error, '업로드 실패'),
            };
          }),
        );
      } finally {
        controllersRef.current.delete(itemId);
        runningCountRef.current = Math.max(0, runningCountRef.current - 1);
        pump();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folderId, invalidateFiles, onItemSucceeded],
  );

  const pump = useCallback(() => {
    while (runningCountRef.current < concurrency && queueRef.current.length > 0) {
      const nextId = queueRef.current.shift()!;
      const snapshot = itemsRef.current.find((i) => i.id === nextId);
      if (!snapshot || snapshot.status !== 'queued') continue;
      runningCountRef.current += 1;
      void runOne(nextId);
    }
  }, [concurrency, runOne]);

  const validate = useCallback(
    (file: File): string | null => {
      const ext = getExtension(file.name);
      if (!ext || !allowedExtensions.includes(ext)) {
        return `지원하지 않는 형식 (.${ext || '알 수 없음'})`;
      }
      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        return `파일 용량 초과 (최대 ${maxSizeMB}MB)`;
      }
      if (file.size === 0) {
        return '빈 파일은 업로드할 수 없습니다';
      }
      return null;
    },
    [allowedExtensions, maxSizeMB],
  );

  const enqueue = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const existingKeys = new Set(
        itemsRef.current
          .filter((item) => !isTerminalStatus(item.status))
          .map((item) => `${item.file.name}:${item.file.size}`),
      );

      const newItems: UploadItem[] = [];
      const newlyQueuedIds: string[] = [];

      for (const file of files) {
        const key = `${file.name}:${file.size}`;
        if (existingKeys.has(key)) {
          newItems.push({
            id: generateId(),
            file,
            status: 'failed',
            progress: 0,
            errorMessage: '이번 배치에 동일한 파일이 이미 있습니다',
            serverFileId: null,
          });
          continue;
        }
        existingKeys.add(key);

        const validationError = validate(file);
        if (validationError) {
          newItems.push({
            id: generateId(),
            file,
            status: 'failed',
            progress: 0,
            errorMessage: validationError,
            serverFileId: null,
          });
          continue;
        }

        const id = generateId();
        newItems.push({
          id,
          file,
          status: 'queued',
          progress: 0,
          errorMessage: null,
          serverFileId: null,
        });
        newlyQueuedIds.push(id);
      }

      const nextItems = [...itemsRef.current, ...newItems];
      itemsRef.current = nextItems;
      setItems(nextItems);
      queueRef.current.push(...newlyQueuedIds);
      pump();
    },
    [pump, validate],
  );

  const cancelItem = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((qid) => qid !== id);
    const controller = controllersRef.current.get(id);
    if (controller) controller.abort();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (isTerminalStatus(item.status)) return item;
        return { ...item, status: 'canceled', errorMessage: '업로드 취소됨' };
      }),
    );
  }, []);

  const cancelAll = useCallback(() => {
    queueRef.current = [];
    controllersRef.current.forEach((c) => c.abort());
    setItems((prev) =>
      prev.map((item) =>
        isTerminalStatus(item.status)
          ? item
          : { ...item, status: 'canceled', errorMessage: '업로드 취소됨' },
      ),
    );
  }, []);

  const retryItem = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((item) => item.id === id);
      if (!target) return;
      if (target.status !== 'failed' && target.status !== 'canceled') return;

      const validationError = validate(target.file);
      if (validationError) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, status: 'failed', errorMessage: validationError, progress: 0 }
              : item,
          ),
        );
        return;
      }

      const nextItems = itemsRef.current.map((item) =>
        item.id === id
          ? { ...item, status: 'queued' as UploadItemStatus, progress: 0, errorMessage: null }
          : item,
      );
      itemsRef.current = nextItems;
      setItems(nextItems);
      queueRef.current.push(id);
      pump();
    },
    [pump, validate],
  );

  const removeItem = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((qid) => qid !== id);
    const controller = controllersRef.current.get(id);
    if (controller) controller.abort();
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((item) => !isTerminalStatus(item.status)));
  }, []);

  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  const activeCount = items.filter(
    (item) =>
      item.status === 'queued' || item.status === 'uploading' || item.status === 'processing',
  ).length;
  const completedCount = items.filter((item) => item.status === 'done').length;
  const failedCount = items.filter(
    (item) => item.status === 'failed' || item.status === 'canceled',
  ).length;

  return {
    items,
    isActive: activeCount > 0,
    activeCount,
    totalCount: items.length,
    completedCount,
    failedCount,
    enqueue,
    cancelItem,
    retryItem,
    removeItem,
    clearFinished,
    cancelAll,
  };
}
