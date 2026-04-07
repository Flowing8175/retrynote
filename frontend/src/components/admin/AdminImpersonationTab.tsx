import type { UseMutationResult } from '@tanstack/react-query';
import { LoadingSpinner } from '@/components';
import type { AdminUserListResponse, ImpersonationResponse } from '@/types';

interface AdminImpersonationTabProps {
  usersData: AdminUserListResponse | undefined;
  usersLoading: boolean;
  impersonationId: string | null;
  impersonatingTarget: string | null;
  startImpersonationMutation: UseMutationResult<ImpersonationResponse, unknown, string>;
  endImpersonationMutation: UseMutationResult<{ status: string }, unknown, string>;
}

export default function AdminImpersonationTab({
  usersData,
  usersLoading,
  impersonationId,
  impersonatingTarget,
  startImpersonationMutation,
  endImpersonationMutation,
}: AdminImpersonationTabProps) {
  return (
    <section className="space-y-6">
      {impersonationId && impersonatingTarget && (
        <div className="rounded-3xl border border-brand-500/30 bg-brand-500/5 p-6 md:p-7">
          <h2 className="text-xl font-semibold text-content-primary">가장 모드 활성</h2>
          <p className="mt-2 text-sm leading-6 text-content-secondary">
            현재 <span className="font-semibold text-brand-500">{impersonatingTarget}</span> 계정으로 가장 중입니다. 종료 버튼을 누르면 가장이 종료됩니다.
          </p>
          <button
            onClick={() => endImpersonationMutation.mutate(impersonationId)}
            disabled={endImpersonationMutation.isPending}
            className="mt-4 inline-flex items-center justify-center rounded-2xl border border-semantic-error-border/30 px-6 py-3 text-sm font-semibold text-semantic-error transition-colors hover:bg-semantic-error-bg/50 disabled:opacity-50"
          >
            {endImpersonationMutation.isPending ? '종료 중…' : '가장 종료'}
          </button>
        </div>
      )}

      {usersLoading ? (
        <LoadingSpinner message="사용자 목록 불러오는 중" />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
          <table className="min-w-full divide-y divide-white/[0.07]">
            <thead className="bg-surface-raised">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">사용자</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">이메일</th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] bg-surface">
              {usersData?.users.map((user) => (
                <tr key={user.id} className="align-top transition-colors hover:bg-surface-deep/50">
                  <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">{user.username}</td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">{user.email}</td>
                  <td className="px-6 py-5 whitespace-nowrap text-sm">
                    <button
                      onClick={() => startImpersonationMutation.mutate(user.id)}
                      disabled={startImpersonationMutation.isPending || !!impersonationId}
                      className="rounded-xl border border-brand-500/25 px-4 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-500/10 disabled:opacity-40"
                    >
                      가장 시작
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
