import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { quizApi, retryApi } from '@/api';
import { objectionsApi } from '@/api/objections';
import { wrongNotesApi } from '@/api/wrongNotes';
import { StatusBadge } from '@/components';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { QuizItemResponse, WrongNoteItem } from '@/types';

function formatMode(mode: string) {
  return mode === 'exam' ? '시험 모드' : '일반 모드';
}

function formatDifficulty(difficulty: string | null) {
  if (!difficulty) {
    return '설정 안 함';
  }

  const difficultyMap: Record<string, string> = {
    easy: '쉬움',
    medium: '보통',
    hard: '어려움',
  };

  return difficultyMap[difficulty] || difficulty;
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getPerformanceTier(scorePercentage: number) {
  if (scorePercentage >= 90) {
    return {
      badge: '탁월한 성과',
      badgeClass:
        'border border-semantic-success-border bg-semantic-success-bg text-semantic-success',
      accentTextClass: 'text-semantic-success',
      progressClass: 'bg-semantic-success',
       headline: '이번 세트는 비교적 안정적으로 풀렸어요.',
       message: '높은 정답률을 유지하고 있어요. 새 범위로 확장하거나 놓친 문제만 빠르게 짚어볼 수 있습니다.',
       primaryAction: {
          title: '새 퀴즈로 상승 흐름 이어가기',
          description: '다른 범위나 난이도로 도전해 보세요.',
         buttonLabel: '새 퀴즈 만들기',
         to: '/quiz/new',
       },
       secondaryActions: [
         {
            title: '오답노트로 놓친 문제만 점검하기',
            description: '소수의 실수를 정리하면 완성도가 올라갑니다.',
           buttonLabel: '오답노트 보기',
           to: '/wrong-notes',
         },
         {
            title: '대시보드에서 전체 흐름 보기',
            description: '기간별 정답률 추이를 확인할 수 있습니다.',
           buttonLabel: '대시보드로',
           to: '/',
         },
       ],
    };
  }

  if (scorePercentage >= 75) {
    return {
      badge: '안정적인 흐름',
      badgeClass: 'border border-brand-500/20 bg-brand-500/15 text-brand-300',
      accentTextClass: 'text-brand-300',
      progressClass: 'bg-brand-500',
       headline: '좋은 방향으로 정리되고 있어요.',
       message: '대부분 맞추고 있지만 일부 개념에서 흔들림이 보입니다. 오답을 한 번 정리하면 더 안정될 거예요.',
       primaryAction: {
          title: '오답노트로 남은 실수 정리하기',
          description: '틀린 문제를 개념별로 모아서 확인합니다.',
         buttonLabel: '오답노트 보기',
         to: '/wrong-notes',
       },
       secondaryActions: [
         {
            title: '재도전 세트로 취약 개념 다시 풀기',
            description: '반복 오답 패턴을 중심으로 재출제합니다.',
           buttonLabel: '재도전 보기',
           to: '/retry',
         },
         {
            title: '새 퀴즈로 감 유지하기',
            description: '지금 흐름이 좋으니 이어서 풀어보세요.',
           buttonLabel: '새 퀴즈 만들기',
           to: '/quiz/new',
         },
       ],
    };
  }

  if (scorePercentage >= 50) {
    return {
      badge: '정리 중인 구간',
      badgeClass:
        'border border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
      accentTextClass: 'text-semantic-warning',
      progressClass: 'bg-semantic-warning',
     headline: '다음 복습 방향이 조금 더 또렷해졌어요.',
     message: '몇 가지 개념에서 혼동이 있었어요. 오답을 짚고 재도전하면 빠르게 올라갈 수 있습니다.',
     primaryAction: {
       title: '오답노트부터 차근차근 복습하기',
       description: '어디서 틀렸는지 해설과 함께 확인합니다.',
         buttonLabel: '오답노트 보기',
         to: '/wrong-notes',
       },
       secondaryActions: [
         {
          title: '재도전 세트로 바로 다시 풀기',
          description: '같은 개념의 유사 문제를 다시 출제합니다.',
           buttonLabel: '재도전 보기',
           to: '/retry',
         },
         {
          title: '새 퀴즈로 다시 시작하기',
          description: '새로운 문제로 감을 다시 잡아보세요.',
           buttonLabel: '새 퀴즈 만들기',
           to: '/quiz/new',
         },
       ],
    };
  }

  return {
    badge: '복습 먼저',
    badgeClass:
      'border border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning',
    accentTextClass: 'text-semantic-warning',
    progressClass: 'bg-semantic-warning',
    headline: '이번 결과가 다시 볼 지점을 분명하게 보여줬어요.',
    message: '기초 개념부터 차근차근 다시 짚으면 금방 올라갈 수 있어요. 오답노트에서 시작해 보세요.',
    primaryAction: {
      title: '오답노트로 다시 짚어보기',
      description: '틀린 문제를 하나씩 해설과 함께 복습합니다.',
      buttonLabel: '오답노트 보기',
      to: '/wrong-notes',
    },
    secondaryActions: [
      {
        title: '재도전 세트로 바로 연습하기',
        description: '취약 개념 위주로 다시 풀어봅니다.',
        buttonLabel: '재도전 보기',
        to: '/retry',
      },
      {
        title: '대시보드에서 학습 흐름 확인하기',
        description: '전체 학습 현황과 추천을 확인합니다.',
        buttonLabel: '대시보드로',
        to: '/',
      },
    ],
  };
}

function getProgressRingStyle(scorePercentage: number) {
  const clampedScorePercentage = Math.max(0, Math.min(scorePercentage, 100));

  return {
    background: `conic-gradient(from 180deg, oklch(0.65 0.15 175) ${clampedScorePercentage}%, oklch(0.28 0.01 250) ${clampedScorePercentage}% 100%)`,
  };
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function buildObjectionKey(item: Pick<WrongNoteItem, 'question_text' | 'question_type' | 'concept_label' | 'category_tag'>) {
  return [item.question_text, item.question_type, item.concept_label || '', item.category_tag || ''].join('|');
}

function formatJudgementLabel(judgement: string) {
  if (judgement === 'partial') {
    return '부분정답';
  }

  return '오답';
}

function getJudgementBadgeClass(judgement: string) {
  if (judgement === 'partial') {
    return 'border border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning';
  }

  return 'border border-semantic-error-border bg-semantic-error-bg text-semantic-error';
}

export default function QuizResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [openObjectionItemId, setOpenObjectionItemId] = useState<string | null>(null);
  const [objectionReasons, setObjectionReasons] = useState<Record<string, string>>({});
  const [submittedObjections, setSubmittedObjections] = useState<Record<string, boolean>>({});

  const { data: sessionData, isLoading: sessionLoading } = useQuery({
    queryKey: ['quizSession', sessionId],
    queryFn: () => quizApi.getQuizSession(sessionId || ''),
    enabled: !!sessionId,
  });

  const { data: quizItems, isLoading: quizItemsLoading } = useQuery({
    queryKey: ['quizItems', sessionId],
    queryFn: () => quizApi.getQuizItems(sessionId || ''),
    enabled: !!sessionId,
  });

  const { data: wrongNotes, isLoading: wrongNotesLoading } = useQuery({
    queryKey: ['wrongNotes', sessionId, 'objections'],
    queryFn: () => wrongNotesApi.listWrongNotes('date', ['incorrect', 'partial'], undefined, null, null, 1, 100),
    enabled: !!sessionId,
  });

  const objectionCandidates = useMemo(() => {
    if (!quizItems || !wrongNotes?.items) {
      return [];
    }

    const noteMap = new Map<string, WrongNoteItem>();
    for (const note of wrongNotes.items) {
      const key = buildObjectionKey(note);
      if (!noteMap.has(key)) {
        noteMap.set(key, note);
      }
    }

    return quizItems
      .map((item) => {
        const note = noteMap.get(buildObjectionKey(item));
        return note ? { item, note } : null;
      })
      .filter((value): value is { item: QuizItemResponse; note: WrongNoteItem } => Boolean(value));
  }, [quizItems, wrongNotes]);

  const wrongConceptKeys = useMemo(() => {
    return [...new Set(
      objectionCandidates
        .map(({ note }) => note.concept_key)
        .filter((k): k is string => !!k)
    )];
  }, [objectionCandidates]);

  const createRetryMutation = useMutation({
    mutationFn: (conceptKeys: string[]) =>
      retryApi.createRetrySet({
        source: 'wrong_notes',
        concept_keys: conceptKeys.length > 0 ? conceptKeys : null,
        size: null,
      }),
    onSuccess: (data) => {
      navigate(`/quiz/${data.quiz_session_id}`);
    },
  });

  const handleRetryAction = (to: string) => {
    if (to === '/retry') {
      createRetryMutation.mutate(wrongConceptKeys);
    } else {
      navigate(to);
    }
  };

  const createObjectionMutation = useMutation({
    mutationFn: (params: { itemId: string; answerLogId: string; reason: string }) =>
      objectionsApi.createObjection(sessionId || '', params.itemId, {
        answer_log_id: params.answerLogId,
        objection_reason: params.reason,
      }),
    onSuccess: (_result, variables) => {
      setSubmittedObjections((prev) => ({ ...prev, [variables.itemId]: true }));
      setOpenObjectionItemId((current) => (current === variables.itemId ? null : current));
      setObjectionReasons((prev) => ({ ...prev, [variables.itemId]: '' }));
    },
  });
  const objectionSectionLoading = quizItemsLoading || wrongNotesLoading;

  if (sessionLoading) {
    return <LoadingSpinner message="퀴즈 결과 불러오는 중" />;
  }

  if (!sessionData) {
    return (
      <div className="py-12 text-center text-content-secondary">
        퀴즈 결과를 불러오지 못했습니다.
      </div>
    );
  }

  const score = sessionData.total_score || 0;
  const maxScore = sessionData.max_score || 1;
  const scorePercentage = (score / maxScore) * 100;
  const performanceTier = getPerformanceTier(scorePercentage);
  const gradedAt = formatDate(sessionData.graded_at);
  const progressRingStyle = getProgressRingStyle(scorePercentage);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/[0.07] bg-surface p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand-300">채점이 완료됐어요</p>
            <h1 className="mt-2 text-3xl font-bold text-content-primary md:text-4xl">
              퀴즈 결과
            </h1>
            <p className="mt-4 text-lg font-semibold text-content-primary">
              {performanceTier.headline}
            </p>
            {performanceTier.message ? (
              <p className="mt-2 text-base leading-7 text-content-secondary">
                {performanceTier.message}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-content-secondary">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 font-medium ${performanceTier.badgeClass}`}
              >
                {performanceTier.badge}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-surface-deep px-3 py-1 text-xs text-content-secondary">{sessionData.question_count ?? '?'}문제 기준</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-surface-deep px-3 py-1 text-xs text-content-secondary">{formatMode(sessionData.mode)}</span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.07] bg-surface px-8 py-10 text-center lg:min-w-[20rem]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-content-secondary">획득 점수</div>
                <div className="mt-2 text-4xl font-bold text-content-primary md:text-5xl">
                  {score.toFixed(1)}
                  <span className="ml-2 text-xl font-medium text-content-secondary md:text-2xl">
                    / {maxScore.toFixed(1)}
                  </span>
                </div>
                <div className={`mt-2 text-sm font-medium ${performanceTier.accentTextClass}`}>
                  {performanceTier.badge}
                </div>
              </div>

              <div className="relative flex h-24 w-24 items-center justify-center rounded-full p-[7px]" style={progressRingStyle}>
                <div className="flex h-full w-full items-center justify-center rounded-full bg-surface text-center">
                  <div>
                    <div className="text-[11px] text-content-muted">달성</div>
                    <div className="text-lg font-semibold text-content-primary">
                      {Math.round(scorePercentage)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

          <div className="mt-8">
            <div className="mb-2">
              <span className="text-sm text-content-secondary">이번 세트 기준 점수 달성률</span>
            </div>
          <div className="rounded-full bg-surface-deep p-1">
            <div className="h-4 overflow-hidden rounded-full bg-surface-hover">
              <div
                className={`h-full rounded-full ${performanceTier.progressClass}`}
                style={{ width: `${Math.max(0, Math.min(scorePercentage, 100))}%` }}
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 text-xs text-content-muted">
            <span>복습 시작</span>
            <span className="text-center">정리 중</span>
            <span className="text-center">안정적</span>
            <span className="text-right">확장 가능</span>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">학습 요약</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/[0.07] bg-surface p-4">
            <div className="text-sm text-content-secondary">문제 수</div>
            <div className="mt-2 text-2xl font-semibold text-content-primary">
              {sessionData.question_count ?? '?'}문제
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-surface p-4">
            <div className="text-sm text-content-secondary">퀴즈 모드</div>
            <div className="mt-2 text-2xl font-semibold text-content-primary">
              {formatMode(sessionData.mode)}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-surface p-4">
            <div className="text-sm text-content-secondary">난이도</div>
            <div className="mt-2 text-2xl font-semibold text-content-primary">
              {formatDifficulty(sessionData.difficulty)}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-surface p-4">
            <div className="text-sm text-content-secondary">상태</div>
            <div className="mt-2">
              <StatusBadge status={sessionData.status} />
            </div>
          </div>
        </div>

        {gradedAt && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-surface-deep px-3 py-1 text-xs text-content-secondary">채점 완료: {gradedAt}</span>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-content-primary">이의제기</h2>

        {objectionSectionLoading ? (
          <p className="text-sm text-content-secondary">이의제기 항목을 불러오는 중입니다.</p>
        ) : objectionCandidates.length > 0 ? (
          <div className="space-y-3">
            {objectionCandidates.map(({ item, note }) => {
              const isOpen = openObjectionItemId === item.id;
              const isSubmitted = submittedObjections[item.id];
              const reason = objectionReasons[item.id] || '';

              return (
                <div key={item.id} className="rounded-xl border border-white/[0.07] bg-surface p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-content-primary" title={item.question_text}>
                        {truncateText(item.question_text, 80)}
                      </p>
                      <div className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getJudgementBadgeClass(note.judgement)}`}>
                        {formatJudgementLabel(note.judgement)}
                      </div>
                    </div>

                    {isSubmitted ? (
                      <span className="inline-flex items-center rounded-full border border-semantic-success-border bg-semantic-success-bg px-3 py-1 text-xs font-medium text-semantic-success">
                        이의제기가 접수되었습니다
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenObjectionItemId(isOpen ? null : item.id)}
                        className="inline-flex items-center rounded-md border border-white/[0.07] bg-surface-deep px-3 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
                      >
                        이의제기 신청
                      </button>
                    )}
                  </div>

                  {isOpen && !isSubmitted && (
                    <form
                      className="mt-4 space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!reason.trim()) {
                          return;
                        }

                        createObjectionMutation.mutate({
                          itemId: item.id,
                          answerLogId: note.id,
                          reason,
                        });
                      }}
                    >
                      <textarea
                        value={reason}
                        onChange={(e) => setObjectionReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="이의제기 사유를 입력하세요"
                        rows={4}
                        className="w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-content-primary placeholder-content-muted transition-colors hover:bg-surface-hover focus:border-brand-500 focus:outline-none"
                      />
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setOpenObjectionItemId(null)}
                          className="rounded-xl border border-white/[0.07] px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
                        >
                          취소
                        </button>
                        <button
                          type="submit"
                          disabled={!reason.trim() || createObjectionMutation.isPending}
                          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {createObjectionMutation.isPending ? '접수 중...' : '제출'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-content-secondary">이의제기할 항목이 없습니다.</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-content-primary">다음 학습 추천</h2>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.3fr,1fr,1fr]">
          {(() => {
            const isPrimaryRetry = performanceTier.primaryAction.to === '/retry';
            const isPrimaryPending = isPrimaryRetry && createRetryMutation.isPending;
            return (
              <button
                type="button"
                onClick={() => handleRetryAction(performanceTier.primaryAction.to)}
                disabled={isPrimaryPending}
                className="w-full rounded-2xl border border-brand-500/20 bg-brand-500/10 p-5 text-left transition-colors hover:bg-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-sm font-medium text-brand-300">추천 다음 단계</div>
                <div className="mt-3 text-xl font-semibold text-content-primary">
                  {performanceTier.primaryAction.title}
                </div>
                {performanceTier.primaryAction.description && (
                  <p className="mt-2 text-sm leading-6 text-content-secondary">{performanceTier.primaryAction.description}</p>
                )}
                <span className="mt-6 inline-flex items-center rounded-2xl bg-brand-500 px-4 py-2 text-sm font-bold text-content-inverse transition-colors hover:bg-brand-600 hover:-translate-y-px">
                  {isPrimaryPending ? '생성 중…' : performanceTier.primaryAction.buttonLabel}
                </span>
              </button>
            );
          })()}

          {performanceTier.secondaryActions.map((action) => {
            const isRetry = action.to === '/retry';
            const isPending = isRetry && createRetryMutation.isPending;
            return (
              <button
                key={action.to}
                type="button"
                onClick={() => handleRetryAction(action.to)}
                disabled={isPending}
                className="w-full rounded-2xl border border-white/[0.07] bg-surface p-5 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-lg font-semibold text-content-primary">{action.title}</div>
                {action.description && (
                  <p className="mt-2 text-sm leading-6 text-content-secondary">{action.description}</p>
                )}
                <span className="mt-6 inline-flex items-center rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-2 text-sm font-medium text-content-primary">
                  {isPending ? '생성 중…' : action.buttonLabel}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
