import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { authApi } from '@/api';
import { Modal } from '@/components';
import { useAuthStore } from '@/stores';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => authApi.deleteAccount({ password }),
    onSuccess: () => {
      logout();
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      setErrorMessage(error.response?.data?.detail ?? '계정 삭제 중 오류가 발생했습니다.');
    },
  });

  function openDeleteModal() {
    setPassword('');
    setErrorMessage(null);
    setDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    if (deleteMutation.isPending) return;
    setDeleteModalOpen(false);
    setPassword('');
    setErrorMessage(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">계정 설정</h1>
        <p className="mt-1 text-sm text-content-secondary">{user?.email}</p>
      </div>

      <div className="rounded-2xl border border-semantic-error-border bg-semantic-error-bg p-6">
        <h2 className="text-base font-semibold text-semantic-error">위험 구역</h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">
          계정을 삭제하면 모든 자료, 퀴즈, 오답 데이터가 영구적으로 사라집니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <button
          type="button"
          onClick={openDeleteModal}
          className="mt-4 inline-flex items-center rounded-xl border border-semantic-error px-4 py-2.5 text-sm font-medium text-semantic-error transition-colors hover:bg-semantic-error hover:text-content-inverse"
        >
          계정 삭제
        </button>
      </div>

      <Modal isOpen={deleteModalOpen} onClose={closeDeleteModal} title="계정을 삭제할까요?">
        <div className="space-y-5">
          <p className="text-sm leading-6 text-content-secondary">
            모든 자료, 퀴즈, 오답 데이터가 영구적으로 삭제됩니다. 계속하려면 비밀번호를 입력하세요.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="delete-password" className="block text-sm font-medium text-content-primary">
              비밀번호
            </label>
            <input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="현재 비밀번호 입력"
              className="w-full rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm text-content-primary placeholder:text-content-muted focus:border-brand-500 focus:outline-none"
            />
            {errorMessage && (
              <p className="text-xs text-semantic-error">{errorMessage}</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeDeleteModal}
              disabled={deleteMutation.isPending}
              className="rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={deleteMutation.isPending || password.length === 0}
              onClick={() => deleteMutation.mutate()}
              className="rounded-xl bg-semantic-error px-4 py-2.5 text-sm font-medium text-content-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteMutation.isPending ? '삭제 중…' : '계정 삭제'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
