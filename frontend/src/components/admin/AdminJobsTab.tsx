import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api';
import type { AdminJobItem } from '@/types';
import { formatDateTime } from './adminUtils';
import type { TabKey } from './adminUtils';

interface AdminJobsTabProps {
  isVerified: boolean;
  activeTab: TabKey;
}

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'pending', label: '대기' },
  { value: 'running', label: '실행 중' },
  { value: 'completed', label: '완료' },
  { value: 'failed', label: '실패' },
];

const JOB_TYPE_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'process_file', label: 'process_file' },
  { value: 'generate_quiz', label: 'generate_quiz' },
  { value: 'grade_exam', label: 'grade_exam' },
  { value: 'review_objection', label: 'review_objection' },
  { value: 'admin_regrade', label: 'admin_regrade' },
];

function JobStatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    pending: 'bg-semantic-warning-bg text-semantic-warning border border-semantic-warning-border',
    running: 'bg-semantic-info-bg text-semantic-info border border-semantic-info-border',
    completed: 'bg-semantic-success-bg text-semantic-success border border-semantic-success-border',
    failed: 'bg-semantic-error-bg text-semantic-error border border-semantic-error-border',
  };
  const cls = config[status] ?? 'bg-white/5 text-content-muted border border-white/[0.07]';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function AdminJobsTab({ isVerified, activeTab }: AdminJobsTabProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-jobs', statusFilter, jobTypeFilter],
    queryFn: () => adminApi.listJobs(statusFilter || undefined, jobTypeFilter || undefined),
    enabled: isVerified && activeTab === 'jobs',
    refetchInterval: 10_000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => adminApi.retryJob(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-jobs'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => adminApi.cancelJob(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-jobs'] }),
  });

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.07] bg-surface-raised px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-content-muted">상태:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-white/[0.07] bg-surface px-2 py-1 text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-content-muted">유형:</span>
          <select
            value={jobTypeFilter}
            onChange={(e) => setJobTypeFilter(e.target.value)}
            className="rounded-lg border border-white/[0.07] bg-surface px-2 py-1 text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          >
            {JOB_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <span className="ml-auto font-mono text-xs text-content-muted">{total}건</span>
        {isLoading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />}
      </div>

      <div className="overflow-x-auto overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
        <table className="min-w-full divide-y divide-white/[0.07]">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                ID
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                상태
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                유형
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                생성
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                시작
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                재시도
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                오류
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07] bg-surface">
            {isLoading && jobs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-sm text-content-muted">
                  불러오는 중…
                </td>
              </tr>
            )}

            {!isLoading && jobs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-sm text-content-muted">
                  작업이 없습니다.
                </td>
              </tr>
            )}

            {jobs.map((job: AdminJobItem) => {
              const isRetrying = retryMutation.isPending && retryMutation.variables === job.id;
              const isCancelling = cancelMutation.isPending && cancelMutation.variables === job.id;
              const canRetry = job.status === 'failed' && job.retry_count < 3;
              const canCancel = job.status === 'pending' || job.status === 'running';
              const errorDisplay = job.error_message
                ? job.error_message.length > 100
                  ? `${job.error_message.slice(0, 100)}…`
                  : job.error_message
                : null;

              return (
                <tr key={job.id} className="align-top transition-colors hover:bg-surface-deep/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-xs text-content-muted" title={job.id}>
                      {job.id.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                    {job.job_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                    {formatDateTime(job.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-content-secondary">
                    {job.started_at ? (
                      formatDateTime(job.started_at)
                    ) : (
                      <span className="text-content-muted">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center font-mono text-xs text-content-secondary">
                    {job.retry_count}
                  </td>
                  <td className="max-w-xs px-6 py-4">
                     {errorDisplay ? (
                       <span
                         className="font-mono text-xs text-semantic-error"
                         title={job.error_message ?? undefined}
                       >
                         {errorDisplay}
                       </span>
                     ) : (
                       <span className="text-content-muted">—</span>
                     )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {canRetry && (
                        <button
                          onClick={() => retryMutation.mutate(job.id)}
                          disabled={isRetrying}
                          className="flex items-center gap-1 rounded-lg bg-brand-500/15 px-2.5 py-1 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isRetrying && <SpinnerIcon />}
                          재시도
                        </button>
                      )}
                      {canCancel && (
                       <button
                           onClick={() => cancelMutation.mutate(job.id)}
                           disabled={isCancelling}
                           className="flex items-center gap-1 rounded-lg bg-semantic-error-bg px-2.5 py-1 text-xs font-medium text-semantic-error transition-colors hover:bg-semantic-error-bg/80 disabled:cursor-not-allowed disabled:opacity-50"
                         >
                          {isCancelling && <SpinnerIcon />}
                          취소
                        </button>
                      )}
                      {!canRetry && !canCancel && (
                        <span className="text-xs text-content-muted">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
