import type { SystemHealthResponse } from '@/types';

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatRelative(value: string | null): string {
  if (!value) return '미접속';
  const now = new Date();
  const date = new Date(value);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1일 전';
  if (diffDays < 30) return `${diffDays}일 전`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}개월 전`;
  return `${Math.floor(diffMonths / 12)}년 전`;
}

export function LogLevelBadge({ level }: { level: string }) {
  const normalized = level.toUpperCase();
  const cls =
    normalized === 'ERROR' || normalized === 'CRITICAL'
      ? 'bg-red-500/15 text-red-400 border border-red-500/20'
      : normalized === 'WARNING' || normalized === 'WARN'
        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
        : normalized === 'INFO'
          ? 'bg-teal-500/15 text-teal-300 border border-teal-500/20'
          : 'bg-white/5 text-content-muted border border-white/[0.07]';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-medium ${cls}`}>
      {normalized}
    </span>
  );
}

export function HealthStatusBadge({ status }: { status: SystemHealthResponse['status'] }) {
  const config = {
    ok: { cls: 'bg-green-500/15 text-green-400 border border-green-500/20', dot: 'bg-green-400', label: 'OK', pulse: true },
    degraded: { cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/20', dot: 'bg-amber-400', label: 'DEGRADED', pulse: false },
    down: { cls: 'bg-red-500/15 text-red-400 border border-red-500/20', dot: 'bg-red-400', label: 'DOWN', pulse: false },
  } as const;
  const { cls, dot, label, pulse } = config[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold ${cls}`}>
      <span className="relative flex h-2 w-2">
        {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-50" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}

export function ComponentStatusDot({ status }: { status: 'ok' | 'degraded' | 'down' }) {
  if (status === 'ok') {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
      </span>
    );
  }
  if (status === 'degraded') {
    return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />;
  }
  return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400" />;
}

export type TabKey =
  | 'health'
  | 'users'
  | 'logs'
  | 'models'
  | 'audit'
  | 'announcements'
  | 'impersonation'
  | 'model_settings'
  | 'jobs'
  | 'db'
  | 'files';

export const tabs: { key: TabKey; label: string; helper: string }[] = [
  { key: 'health', label: '진단', helper: '시스템 상태 실시간 점검' },
  { key: 'users', label: '사용자', helper: '학습 계정 상태 확인' },
  { key: 'logs', label: '시스템 로그', helper: '최근 운영 흐름 확인' },
  { key: 'models', label: '모델 사용량', helper: '요청량과 사용 흐름 확인' },
  { key: 'audit', label: '감사 로그', helper: '관리자 행위 추적' },
  { key: 'announcements', label: '공지 관리', helper: '배너/공지 생성 및 관리' },
  { key: 'impersonation', label: '가장 모드', helper: '사용자 화면으로 이동' },
  { key: 'model_settings', label: '모델 설정', helper: 'AI 모델 변경' },
  { key: 'jobs', label: '작업 관리', helper: '백그라운드 작업 조회 및 제어' },
  { key: 'db', label: 'DB 진단', helper: '마이그레이션 버전 및 테이블 현황' },
  { key: 'files', label: '파일 파이프라인', helper: '파일 처리 상태 및 실패 현황' },
];

export const LOG_LEVELS = ['전체', 'INFO', 'WARNING', 'ERROR'] as const;
