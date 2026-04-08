import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { quizApi } from '@/api';
import { LoadingSpinner, Modal, StatusBadge } from '@/components';

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatRelativeDate(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return formatHistoryDate(value);
}

function formatHistorySource(sourceMode: string) {
  return sourceMode === 'document_based' ? '자료 기반' : '자료 없이 생성';
}

function formatHistoryMode(mode: string) {
  return mode === 'exam' ? '시험 모드' : '일반 모드';
}

function getSessionTitle(session: { title: string | null; source_mode: string; mode: string; question_count: number | null }) {
  if (session.title) return session.title;
  const sourceLabel = session.source_mode === 'document_based' ? '자료 기반' : 'AI 배경지식';
  const modeLabel = session.mode === 'exam' ? '시험' : '학습';
  return `${sourceLabel} ${modeLabel} 퀴즈`;
}

function getSessionSubtitle(session: { question_count: number | null; mode: string; created_at: string }) {
  const parts: string[] = [];
  if (session.question_count != null) parts.push(`${session.question_count}문제`);
  parts.push(formatHistoryMode(session.mode));
  parts.push(formatRelativeDate(session.created_at));
  return parts.join(' · ');
}

export default function QuizHistory() {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['quiz-history-full'],
    queryFn: () => quizApi.listQuizSessions(20),
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => quizApi.deleteQuizSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz-history-full'] });
      queryClient.invalidateQueries({ queryKey: ['quiz-history'] });
      setDeletingId(null);
    },
  });

  if (isLoading) {
    return <LoadingSpinner message="퀴즈 기록을 불러오는 중" />;
  }

  return (
    <>
      <div className="space-y-8">
        <section className="animate-fade-in-up px-1 py-2">
          <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">
            퀴즈 기록
          </h1>
          <p className="mt-2 text-base text-content-secondary">
            이전에 만든 퀴즈 세션을 확인하거나 삭제할 수 있습니다.
          </p>
        </section>

        <section className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-7 md:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-content-primary">최근 기록</h2>
            </div>
            <Link
              to="/quiz/new"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-content-inverse hover:-translate-y-px hover:bg-brand-600 transition-[transform,background-color] duration-150"
            >
              새 퀴즈 만들기
            </Link>
          </div>

          {(historyData?.length ?? 0) === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-8 text-center">
              <p className="text-sm leading-6 text-content-secondary">최근 기록이 없습니다.</p>
              <Link
                to="/quiz/new"
                className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/[0.07] bg-surface px-4 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-surface-hover"
              >
                첫 퀴즈 만들기 →
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {historyData?.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <Link
                    to={`/quiz/${session.id}`}
                    className="min-w-0 flex-1 transition-opacity hover:opacity-80"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
                        {formatHistorySource(session.source_mode)}
                      </span>
                      <StatusBadge status={session.status} />
                    </div>
                    <div className="mt-3 text-lg font-semibold text-content-primary">
                      {getSessionTitle(session)}
                    </div>
                    <div className="mt-1.5 text-sm text-content-secondary">
                      {getSessionSubtitle(session)}
                      {session.total_score != null && session.max_score != null
                        ? ` · ${session.total_score}/${session.max_score}점`
                        : ''}
                    </div>
                  </Link>

                  <div className="flex items-center gap-3 lg:shrink-0">
                    <Link
                      to={`/quiz/${session.id}`}
                      className="inline-flex items-center py-2.5 px-3 text-sm text-brand-300 hover:text-brand-400 transition-colors"
                    >
                      열어보기 →
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeletingId(session.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-surface px-3 py-2.5 text-xs font-medium text-content-secondary transition-colors hover:border-semantic-error/30 hover:bg-semantic-error-bg/60 hover:text-semantic-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        isOpen={deletingId !== null}
        onClose={() => setDeletingId(null)}
        title="퀴즈를 삭제할까요?"
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-content-secondary">
            삭제된 퀴즈는 복구할 수 없습니다. 관련 오답 기록은 유지됩니다.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDeletingId(null)}
              className="inline-flex items-center justify-center rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-semantic-error px-4 py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
