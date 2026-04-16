import { useState } from 'react';
import type { AxiosError } from 'axios';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api';
import { Modal, StatusBadge } from '@/components';
import { useModalState } from '@/hooks/useModalState';
import type { AdminUserListResponse, AdminUserItemWithRole } from '@/types';
import { formatDateTime, formatRelative } from './adminUtils';

interface AdminUsersTabProps {
  usersData: AdminUserListResponse | undefined;
  currentAdminId?: string;
}

const ROLE_LABELS: Record<string, string> = {
  user: '일반',
  admin: '관리자',
  super_admin: '최고관리자',
};

const ROLE_RANK: Record<string, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

type DeleteUserModalValue = Pick<AdminUserItemWithRole, 'id' | 'username'>;

export default function AdminUsersTab({ usersData, currentAdminId }: AdminUsersTabProps) {
  const queryClient = useQueryClient();
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowSuccess, setRowSuccess] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteUserModal = useModalState<DeleteUserModalValue>();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await adminApi.exportUsers();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin_users_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const setRowError = (userId: string, msg: string) => {
    setRowErrors((prev) => ({ ...prev, [userId]: msg }));
    setTimeout(() => {
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 3500);
  };

  const setRowSuccessMsg = (userId: string, msg: string) => {
    setRowSuccess((prev) => ({ ...prev, [userId]: msg }));
    setTimeout(() => {
      setRowSuccess((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 2000);
  };

  const closeDeleteModal = () => {
    if (deleteUserMutation.isPending) return;
    deleteUserModal.close();
    setDeleteError(null);
  };

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminApi.toggleUserStatus(userId, { is_active: isActive }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setRowSuccessMsg(variables.userId, variables.isActive ? '활성화됨' : '비활성화됨');
    },
    onError: (_, variables) => {
      setRowError(variables.userId, '상태 변경에 실패했습니다.');
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: 'user' | 'admin' | 'super_admin' }) =>
      adminApi.changeUserRole(userId, { new_role: newRole }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setRowSuccessMsg(variables.userId, `역할 변경됨 → ${ROLE_LABELS[variables.newRole]}`);
    },
    onError: (_, variables) => {
      setRowError(variables.userId, '역할 변경에 실패했습니다.');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) => adminApi.deleteUser(userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setRowSuccessMsg(variables.userId, '삭제됨');
      closeDeleteModal();
    },
    onError: (error: AxiosError<{ detail?: string }>, variables) => {
      const message = error.response?.data?.detail ?? '사용자 삭제에 실패했습니다.';
      setDeleteError(message);
      setRowError(variables.userId, message);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-surface-raised px-4 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {isExporting ? (
            <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          )}
          CSV 내보내기
        </button>
      </div>
      <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
      <table className="min-w-full divide-y divide-white/[0.07]">
        <thead className="bg-surface-raised">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">사용자</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">이메일</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">가입일</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">마지막 접속</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">저장공간</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">상태</th>
            <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">작업</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.07] bg-surface">
          {usersData?.users.map((user) => {
            const userWithRole = user as AdminUserItemWithRole;
            const currentRole = userWithRole.role || 'user';
            const isSelf = currentAdminId !== undefined && currentAdminId === user.id;
            const statusPending =
              toggleStatusMutation.isPending &&
              toggleStatusMutation.variables?.userId === user.id;
            const rolePending =
              changeRoleMutation.isPending &&
              changeRoleMutation.variables?.userId === user.id;
            const deletePending =
              deleteUserMutation.isPending &&
              deleteUserMutation.variables?.userId === user.id;
            const rowError = rowErrors[user.id];
            const rowSuccessText = rowSuccess[user.id];
            const storageMB = user.storage_used_bytes / 1024 / 1024;
            const storagePct = Math.min((storageMB / 500) * 100, 100);
             const storageColor =
               storagePct >= 90
                 ? 'bg-semantic-error'
                 : storagePct >= 70
                   ? 'bg-semantic-warning'
                   : 'bg-brand-500';

            return (
              <tr key={user.id} className="align-top transition-colors hover:bg-surface-deep/50">
                <td className="px-6 py-5 whitespace-nowrap text-sm font-medium text-content-primary">
                  {user.username}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm text-content-primary">
                  {user.email}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                  {formatDateTime(user.created_at)}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm text-content-secondary">
                  {formatRelative(user.last_login_at)}
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm">
                  <div className="min-w-[6rem]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-content-secondary">{storageMB.toFixed(1)} MB</span>
                      <span className="font-mono text-[10px] text-content-muted">/ 500</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className={`h-full rounded-full transition-all ${storageColor}`}
                        style={{ width: `${storagePct}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm">
                  <StatusBadge status={user.is_active ? 'active' : 'inactive'} />
                </td>
                <td className="px-6 py-5 whitespace-nowrap text-sm">
                  <div className="flex flex-col gap-2 min-w-[10rem]">
                    <div className="flex items-center gap-2">
                      <button
                        disabled={isSelf || statusPending || deletePending}
                        onClick={() =>
                          toggleStatusMutation.mutate({
                            userId: user.id,
                            isActive: !user.is_active,
                          })
                        }
                         className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                           user.is_active
                             ? 'bg-semantic-error-bg text-semantic-error hover:bg-semantic-error-bg/80'
                             : 'bg-semantic-success-bg text-semantic-success hover:bg-semantic-success-bg/80'
                         }`}
                      >
                        {statusPending ? (
                          <svg
                            className="h-3 w-3 animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                        ) : null}
                        {user.is_active ? '비활성화' : '활성화'}
                      </button>

                      <select
                        disabled={isSelf || rolePending || deletePending}
                        value={currentRole}
                        onChange={(e) => {
                          const newRole = e.target.value as 'user' | 'admin' | 'super_admin';
                          if (newRole === currentRole) return;
                          const isDemotion = ROLE_RANK[newRole] < ROLE_RANK[currentRole];
                          if (isDemotion) {
                            const confirmed = window.confirm(
                              `${user.username}의 역할을 ${ROLE_LABELS[currentRole]}에서 ${ROLE_LABELS[newRole]}으로 강등하시겠습니까?`
                            );
                            if (!confirmed) return;
                          }
                          changeRoleMutation.mutate({ userId: user.id, newRole });
                        }}
                        className="rounded-lg border border-white/[0.10] bg-surface-raised px-2 py-1.5 text-xs text-content-primary transition-colors hover:border-white/[0.20] focus:outline-none focus:ring-1 focus:ring-brand-500/50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <option value="user">일반</option>
                        <option value="admin">관리자</option>
                        <option value="super_admin">최고관리자</option>
                      </select>

                      <button
                        type="button"
                        disabled={isSelf || statusPending || rolePending || deletePending}
                        onClick={() => {
                          setDeleteError(null);
                          deleteUserModal.open({ id: user.id, username: user.username });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-semantic-error-bg px-3 py-1.5 text-xs font-medium text-semantic-error transition-colors hover:bg-semantic-error-bg/80 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deletePending ? (
                          <svg
                            className="h-3 w-3 animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        {deletePending ? '삭제 중...' : '삭제'}
                      </button>

                      {rolePending && (
                        <svg
                          className="h-3 w-3 animate-spin text-content-muted"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                      )}
                    </div>

                    {isSelf && (
                      <span className="text-[11px] text-content-muted">본인 계정 — 변경/삭제 불가</span>
                    )}
                      {rowError && (
                        <span className="text-[11px] text-semantic-error">{rowError}</span>
                     )}
                     {rowSuccessText && (
                       <span className="text-[11px] text-semantic-success">{rowSuccessText}</span>
                     )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>

      <Modal isOpen={deleteUserModal.isOpen} onClose={closeDeleteModal} title="사용자 삭제 확인" size="md">
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.05] bg-surface-deep p-5">
            <p className="text-sm text-content-secondary">
              <span className="font-medium text-content-primary">{deleteUserModal.value?.username}</span> 계정을 완전히
              삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
          </div>

          {deleteError && <p className="text-sm text-semantic-error">{deleteError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeDeleteModal}
              disabled={deleteUserMutation.isPending}
              className="flex-1 rounded-xl border border-white/[0.05] bg-surface py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                if (!deleteUserModal.value || deleteUserModal.value.id === currentAdminId) {
                  return;
                }
                deleteUserMutation.mutate({ userId: deleteUserModal.value.id });
              }}
              disabled={deleteUserMutation.isPending}
              className="flex-1 rounded-xl bg-semantic-error py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {deleteUserMutation.isPending ? '삭제 중...' : '삭제하기'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
