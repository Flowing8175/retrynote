import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api';
import type { AdminDbTableInfo } from '@/types';
import type { TabKey } from './adminUtils';

interface AdminDbTabProps {
  isVerified: boolean;
  activeTab: TabKey;
}

function isLargeTable(totalSize: string): boolean {
  return totalSize.trim().endsWith('GB');
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export default function AdminDbTab({ isVerified, activeTab }: AdminDbTabProps) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-db'],
    queryFn: adminApi.getDbDiagnostics,
    enabled: isVerified && activeTab === 'db',
    staleTime: 0,
    retry: false,
  });

  const sortedTables: AdminDbTableInfo[] = data
    ? [...data.tables].sort((a, b) => b.row_estimate - a.row_estimate)
    : [];

  const httpStatus = (error as { response?: { status?: number } } | null)?.response?.status;
  const is403 = httpStatus === 403;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-surface-raised px-5 py-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
            마이그레이션 버전
          </p>
          <p className="font-mono text-xl font-semibold text-content-primary">
            {isLoading ? (
              <span className="inline-block h-6 w-40 animate-pulse rounded bg-white/5" />
            ) : (
              data?.migration_version ?? '—'
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-surface-raised px-5 py-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
            전체 DB 크기
          </p>
          <p className="font-mono text-xl font-semibold text-content-primary">
            {isLoading ? (
              <span className="inline-block h-6 w-24 animate-pulse rounded bg-white/5" />
            ) : (
              data?.db_total_size ?? '—'
            )}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-surface-raised px-5 py-4">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
              테이블 수
            </p>
            <p className="font-mono text-xl font-semibold text-content-primary">
              {isLoading ? (
                <span className="inline-block h-6 w-12 animate-pulse rounded bg-white/5" />
              ) : (
                sortedTables.length
              )}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500/15 px-3 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshIcon spinning={isFetching} />
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4 text-sm text-red-400">
          {is403
            ? 'DB 진단은 super_admin 권한이 필요합니다.'
            : `데이터를 불러오지 못했습니다${httpStatus ? ` (HTTP ${httpStatus})` : ''}. 잠시 후 다시 시도해 주세요.`}
        </div>
      )}

      {data?.checked_at && (
        <p className="px-1 text-xs text-content-muted">
          마지막 점검: <span className="font-mono">{new Date(data.checked_at).toLocaleString('ko-KR')}</span>
        </p>
      )}

      <div className="overflow-x-auto overflow-hidden rounded-3xl border border-white/[0.07] bg-surface">
        <table className="min-w-full divide-y divide-white/[0.07]">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                테이블
              </th>
              <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                행 수 (estimated)
              </th>
              <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-[0.18em] text-content-muted">
                크기
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07] bg-surface">
            {isLoading && sortedTables.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-sm text-content-muted">
                  불러오는 중…
                </td>
              </tr>
            )}

            {!isLoading && !error && sortedTables.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-sm text-content-muted">
                  테이블 정보가 없습니다.
                </td>
              </tr>
            )}

            {sortedTables.map((table) => {
              const large = isLargeTable(table.total_size);
              return (
                <tr
                  key={table.name}
                  className={`transition-colors hover:bg-surface-deep/50 ${large ? 'bg-amber-500/[0.03]' : ''}`}
                >
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-content-primary">{table.name}</span>
                      {large && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                          ⚠️ 대용량
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-right font-mono text-sm text-content-secondary">
                    {table.row_estimate.toLocaleString('ko-KR')}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap text-right font-mono text-sm text-content-secondary">
                    {table.total_size}
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
