import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { authApi } from '@/api';
import { Modal } from '@/components';
import { useAuthStore } from '@/stores';
import { useUsageStatus } from '@/lib/useUsageStatus';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const { data: usageStatus } = useUsageStatus();
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
      </div>

      {/* Account Info */}
      <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-content-primary">계정 정보</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-content-muted">이메일</span>
            <span className="text-sm text-content-primary">{user?.email}</span>
          </div>
          <div className="border-t border-white/[0.05]" />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-content-muted">사용자 이름</span>
            <span className="text-sm text-content-primary">{user?.username || '—'}</span>
          </div>
          <div className="border-t border-white/[0.05]" />
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-content-muted">현재 요금제</span>
            <span className="text-sm font-medium text-brand-300">{(usageStatus?.tier ?? 'free').charAt(0).toUpperCase() + (usageStatus?.tier ?? 'free').slice(1)}</span>
          </div>
          {user?.created_at && (
            <>
              <div className="border-t border-white/[0.05]" />
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-content-muted">가입일</span>
                <span className="text-sm text-content-primary">{new Date(user.created_at).toLocaleDateString('ko-KR')}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Password */}
      <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-content-primary">비밀번호</h2>
        <p className="text-sm text-content-secondary">비밀번호를 변경하려면 재설정 링크를 이용하세요.</p>
        <Link
          to="/password-reset"
          className="inline-flex items-center rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
        >
          비밀번호 변경
        </Link>
      </div>

      <div className="rounded-2xl border border-semantic-error/60 bg-semantic-error-bg p-6">
        <h2 className="text-base font-semibold text-semantic-error">위험 구역</h2>
        <p className="mt-2 text-sm leading-6 text-content-secondary">
          계정을 삭제하면 모든 자료, 퀴즈, 오답 데이터가 영구적으로 사라집니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <button
          type="button"
          onClick={openDeleteModal}
          className="mt-4 inline-flex items-center rounded-xl border border-semantic-error/60 px-4 py-2.5 text-sm font-medium text-semantic-error transition-colors hover:bg-semantic-error hover:text-white"
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
