import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quizApi } from '@/api';
import { StatusBadge, SkeletonTransition } from '@/components';
import { ChevronRight, AlertCircle, Flame } from 'lucide-react';

function resolveOptionText(answer: string, options: Record<string, unknown> | unknown[] | null): string {
  if (!options || Array.isArray(options)) return answer;
  const resolved = (options as Record<string, unknown>)[answer];
  return resolved ? String(resolved) : answer;
}

function resolveCorrectAnswerText(
  correctAnswer: Record<string, unknown> | null | undefined,
  options: Record<string, unknown> | unknown[] | null,
): string {
  if (!correctAnswer) return '알 수 없음';

  const answerValue = correctAnswer.answer;
  if (typeof answerValue === 'string' || typeof answerValue === 'number' || typeof answerValue === 'boolean') {
    return resolveOptionText(String(answerValue), options);
  }

  const fallbackValue = Object.values(correctAnswer).find(
    (value): value is string | number | boolean =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
  );

  return fallbackValue ? resolveOptionText(String(fallbackValue), options) : '알 수 없음';
}

function formatMode(mode: string) {
  return mode === 'exam' ? '시험 모드' : '일반 모드';
}

function getPerformanceTier(scorePercentage: number, canReviewWrongNotes: boolean) {
  if (scorePercentage >= 90) {
    return {
      badge: '탁월한 성취',
      colorClass: 'text-semantic-success',
      bgClass: 'bg-semantic-success/10',
      borderClass: 'border-semantic-success/30',
      headline: '안정적인 정답률을 기록했습니다.',
      message: '이 도메인의 핵심 개념을 잘 이해하고 있습니다. 이제 난이도를 높이거나 다른 범위를 학습할 준비가 되었습니다.',
      primaryAction: { label: '새 퀴즈 시작하기', to: '/quiz/new' }
    };
  }
  if (scorePercentage >= 70) {
    return {
      badge: '안정적인 흐름',
      colorClass: 'text-brand-300',
      bgClass: 'bg-brand-500/10',
      borderClass: 'border-brand-500/30',
      headline: '좋은 기반이 다져지고 있습니다.',
      message: '일부 사소한 오답만 보완한다면 개념을 완벽히 마스터할 수 있습니다.',
      primaryAction: canReviewWrongNotes
        ? { label: '오답노트 복습하기', to: '/wrong-notes' }
        : { label: '새 퀴즈 시작하기', to: '/quiz/new' }
    };
  }
  return {
    badge: '복습 권장',
    colorClass: 'text-semantic-warning',
    bgClass: 'bg-semantic-warning/10',
    borderClass: 'border-semantic-warning/30',
    headline: '핵심 개념의 복습이 필요합니다.',
    message: '부분적으로 혼동이 있는 개념들이 발견되었습니다. 해설을 읽어보고 다시 한 번 도전해 보세요.',
    primaryAction: canReviewWrongNotes
      ? { label: '오답노트 확인하기', to: '/wrong-notes' }
      : { label: '새 퀴즈 시작하기', to: '/quiz/new' }
  };
}

function QuizResultsSkeleton({ message }: { message?: string }) {
  return (
    <div className="max-w-4xl mx-auto py-10 space-y-16 animate-pulse" aria-hidden="true">
      <section>
        <div className="bg-surface border border-white/[0.05] rounded-3xl p-10 sm:p-16 flex flex-col items-center space-y-8">
          <div className="skeleton h-48 w-48 sm:h-56 sm:w-56 rounded-full" />
          <div className="space-y-4 w-full max-w-xl flex flex-col items-center">
            <div className="skeleton h-6 w-28 rounded-md" />
            <div className="skeleton h-8 w-72 rounded-md" />
            <div className="skeleton h-4 w-80 max-w-full rounded-md" />
          </div>
          <div className="flex gap-4">
            <div className="skeleton h-12 w-44 rounded-xl" />
            <div className="skeleton h-12 w-44 rounded-xl" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-white/[0.05] rounded-2xl p-6 space-y-2">
            <div className="skeleton h-3 w-16 rounded-md" />
            <div className="skeleton h-9 w-20 rounded-md" />
          </div>
        ))}
      </section>

      <section className="space-y-6">
        <div className="skeleton h-8 w-48 rounded-md border-b border-white/[0.05] pb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface border border-white/[0.05] rounded-3xl p-6 sm:p-8">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="skeleton h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-4">
                  <div className="flex gap-2">
                    <div className="skeleton h-5 w-14 rounded-full" />
                    <div className="skeleton h-4 w-20 rounded-md" />
                  </div>
                  <div className="skeleton h-6 w-full rounded-md" />
                  <div className="skeleton h-14 w-full rounded-xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {message && (
        <p className="text-center text-sm font-medium text-content-muted animate-fade-in" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}

export default function QuizResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading, isError: sessionIsError } = useQuery({
    queryKey: ['quizSession', sessionId],
    queryFn: () => quizApi.getQuizSession(sessionId || ''),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'submitted' || status === 'grading' ? 2000 : false;
    },
  });

  const { data: items, isLoading: itemsLoading, isError: itemsIsError } = useQuery({
    queryKey: ['quizItems', sessionId],
    queryFn: () => quizApi.getQuizItems(sessionId || ''),
    enabled: !!sessionId,
  });

  const { data: answerLogs } = useQuery({
    queryKey: ['quizAnswerLogs', sessionId],
    queryFn: () => quizApi.getAnswerLogs(sessionId || ''),
    enabled: !!sessionId,
    refetchInterval: session?.status === 'submitted' || session?.status === 'grading' ? 2000 : false,
  });

  const completeQuizMutation = useMutation({
    mutationFn: () => quizApi.completeQuizSession(sessionId || ''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quizSession', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-history'] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-history-full'] }),
        queryClient.invalidateQueries({ queryKey: ['wrongNotes'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });

  const shouldFinalizeNormalSession =
    !!sessionId &&
    session?.mode === 'normal' &&
    (session.status === 'ready' || session.status === 'in_progress') &&
    (items?.length ?? 0) > 0 &&
    answerLogs?.length === items?.length;

  useEffect(() => {
    if (shouldFinalizeNormalSession && completeQuizMutation.status === 'idle') {
      completeQuizMutation.mutate();
    }
  }, [shouldFinalizeNormalSession, completeQuizMutation]);

  const scoreRate = session && session.max_score ? session.total_score! / session.max_score : 0;
  const scorePercentage = scoreRate * 100;

  const [displayScore, setDisplayScore] = useState(0);

  const particles = useMemo(() =>
    Array.from({ length: 12 }).map((_, i) => {
      const angle = (i / 12) * 360;
      const distance = 60 + Math.random() * 40;
      return {
        tx: Math.cos((angle * Math.PI) / 180) * distance,
        ty: Math.sin((angle * Math.PI) / 180) * distance,
      };
    }),
  []);

  useEffect(() => {
    if (session?.status !== 'completed' && session?.status !== 'graded') return;
    const target = Math.round(scorePercentage);
    if (target === 0) return;
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      setDisplayScore(current);
      if (current >= target) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [scorePercentage, session?.status]);
  const hasWrongAnswers = answerLogs?.some((log) => log.judgement !== 'correct') ?? false;
  const canReviewWrongNotes = session?.source_mode !== 'no_source' && hasWrongAnswers;
  const tier = getPerformanceTier(scorePercentage, canReviewWrongNotes);

  if (sessionIsError || itemsIsError) {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center space-y-6">
        <AlertCircle size={64} className="mx-auto text-semantic-error" />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-white">결과를 불러오지 못했습니다</h1>
          <p className="text-base text-content-secondary leading-relaxed">
            잠시 후 다시 시도해 주세요.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center bg-surface-raised text-white border border-white/[0.1] px-6 h-12 rounded-xl text-sm font-semibold"
        >
          다시 불러오기
        </button>
      </div>
    );
  }

  const isShowingSkeleton =
    sessionLoading || itemsLoading || !session ||
    completeQuizMutation.isPending || shouldFinalizeNormalSession ||
    session?.status === 'submitted' || session?.status === 'grading';
  const skeletonMessage = completeQuizMutation.isPending || shouldFinalizeNormalSession
    ? '결과를 정리하고 있습니다'
    : session?.status === 'submitted' || session?.status === 'grading'
      ? '채점 결과를 정리하고 있습니다'
      : undefined;

  return (
    <SkeletonTransition loading={isShowingSkeleton} skeleton={<QuizResultsSkeleton message={skeletonMessage} />}>
    {isShowingSkeleton ? null : (
    <div className="max-w-4xl mx-auto py-10 space-y-16 animate-fade-in">
      {/* Score Hero */}
      <section className="animate-fade-in-up">
        <div className="bg-surface border border-white/[0.05] rounded-3xl p-10 sm:p-16 flex flex-col items-center text-center space-y-8">
          <div className="relative">
            <svg className="w-48 h-48 sm:w-56 sm:h-56 transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/[0.05]" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, scorePercentage * 2.827)} 282.7`}
                className={`${tier.colorClass} animate-progress-ring`}
              />
            </svg>
            {scorePercentage >= 90 && (
              <div className="particle-container">
                {particles.map(({ tx, ty }, i) => (
                  <span
                    key={i}
                    className="particle"
                    style={{
                      '--tx': `${tx}px`,
                      '--ty': `${ty}px`,
                      animationDelay: `${0.8 + i * 0.05}s`,
                      background: i % 3 === 0 ? 'oklch(0.72 0.17 160)' : i % 3 === 1 ? 'oklch(0.65 0.15 175)' : 'oklch(0.78 0.15 85)',
                    } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl sm:text-6xl font-semibold tabular-nums text-white tracking-tight">{displayScore}</span>
              <span className="text-sm font-medium text-content-muted mt-1">점</span>
            </div>
          </div>

          <div className="space-y-4 max-w-xl">
            <div className="flex justify-center">
              <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-md border ${tier.borderClass} ${tier.bgClass} ${tier.colorClass} animate-scale-in stagger-1`}>
                {tier.badge}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white leading-snug animate-fade-in-up stagger-2">
              {tier.headline}
            </h1>
            <p className="text-base text-content-secondary leading-relaxed animate-fade-in stagger-3">
              {tier.message}
            </p>
          </div>

          {/* Effort badge — always shown regardless of score */}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-300 text-sm animate-fade-in-up stagger-4">
            <Flame size={16} className="shrink-0" />
            <span>오늘도 공부했어요! 꾸준함이 실력이 됩니다.</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto pt-4">
            <Link
              to={tier.primaryAction.to}
              className="bg-brand-500 text-brand-900 px-8 py-3.5 rounded-xl text-sm font-semibold hover:-translate-y-0.5 transition-transform"
            >
              {tier.primaryAction.label}
            </Link>
            <Link
              to="/"
              className="bg-surface-deep text-white border border-white/[0.05] px-8 py-3.5 rounded-xl text-sm font-medium hover:bg-surface-hover transition-colors"
            >
              대시보드로 돌아가기
            </Link>
          </div>
        </div>
      </section>

      {/* Metrics Split */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="bg-surface border border-white/[0.05] rounded-2xl p-6 space-y-2 text-center sm:text-left">
          <div className="text-xs font-medium text-content-muted">학습량</div>
          <div className="text-3xl font-semibold text-white">{session.items_count} <span className="text-sm font-medium text-content-secondary ml-1">문제</span></div>
        </div>
        <div className="bg-surface border border-white/[0.05] rounded-2xl p-6 space-y-2 text-center sm:text-left">
          <div className="text-xs font-medium text-content-muted">정답률</div>
          <div className="text-3xl font-semibold text-brand-300">{(scoreRate * 100).toFixed(1)}<span className="text-2xl ml-0.5">%</span></div>
        </div>
        <div className="bg-surface border border-white/[0.05] rounded-2xl p-6 space-y-2 text-center sm:text-left">
          <div className="text-xs font-medium text-content-muted">학습 모드</div>
          <div className="text-xl font-medium text-white pt-1">{formatMode(session.mode)}</div>
        </div>
      </section>

      {/* Detailed Analysis */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
          <h2 className="text-2xl font-semibold text-white">문항별 풀이 결과</h2>
        </div>

        <div className="space-y-4">
          {items?.map((item, index) => {
            const log = answerLogs?.find(l => l.item_id === item.id);
            const isCorrect = log?.judgement === 'correct';

            return (
              <article key={item.id} className="bg-surface border border-white/[0.05] rounded-3xl p-6 sm:p-8 space-y-6 transition-all hover:bg-surface-hover">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="w-8 h-8 shrink-0 rounded-full bg-surface-deep flex items-center justify-center text-sm font-semibold text-content-muted">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={log?.judgement || 'pending'} />
                      <span className="text-xs font-medium text-content-muted">{item.concept_label || '개념'}</span>
                    </div>

                    <h3 className="text-lg font-medium text-white leading-relaxed">
                      {item.question_text}
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-content-muted">제출한 답안</div>
                        <div className={`p-4 rounded-xl text-sm font-medium border ${
                          isCorrect
                            ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                            : 'bg-semantic-error/10 border-semantic-error/30 text-semantic-error'
                        }`}>
                          {log?.user_answer
                            ? resolveOptionText(log.user_answer, item.options)
                            : '미응답'}
                        </div>
                      </div>
                      {!isCorrect && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-brand-300">정답</div>
                          <div className="p-4 bg-brand-500/15 border border-brand-500/40 text-brand-200 rounded-xl text-sm font-medium">
                            {resolveCorrectAnswerText(log?.correct_answer, item.options)}
                          </div>
                        </div>
                      )}
                    </div>

                    {log?.explanation && (
                      <div className="text-sm text-content-secondary leading-relaxed bg-surface-deep rounded-2xl p-5 border border-white/[0.05]">
                        {log.explanation}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Footer Actions */}
      <footer className="pt-8 border-t border-white/[0.05] flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="text-sm text-content-muted text-center sm:text-left">
          충분히 검토하셨다면 다음 학습을 준비하세요.
        </div>
        <Link
          to="/quiz/new"
          className="w-full sm:w-auto bg-surface-raised text-white border border-white/[0.1] px-8 py-3.5 rounded-xl text-sm font-semibold hover:-translate-y-0.5 transition-transform flex items-center justify-center gap-2"
        >
          새 퀴즈 만들기 <ChevronRight size={16} className="opacity-50" />
        </Link>
      </footer>
    </div>
    )}
    </SkeletonTransition>
  );
}
