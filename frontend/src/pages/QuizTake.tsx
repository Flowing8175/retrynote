import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { quizApi } from '@/api';
import { useQuizStore } from '@/stores';
import { LoadingSpinner, StatusBadge } from '@/components';
import type { AnswerResponse } from '@/types';

const VALIDATION_TIMEOUT_MS = 3000;
const QUIZ_REFRESH_INTERVAL_MS = 2000;

function isInteractiveShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const interactiveSelector = 'input, textarea, select, button, a, [contenteditable="true"], [role="radio"], [role="checkbox"], [role="button"]';
  return Boolean(target.closest(interactiveSelector));
}

export default function QuizTake() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { currentSession, currentAnswerMap, setCurrentSession, setCurrentItems, setCurrentAnswer } = useQuizStore();
  const currentAnswerMapRef = useRef(currentAnswerMap);
  useEffect(() => {
    currentAnswerMapRef.current = currentAnswerMap;
  }, [currentAnswerMap]);

  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [answerResult, setAnswerResult] = useState<AnswerResponse | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string>>({});
  const [answerResultsByItemId, setAnswerResultsByItemId] = useState<Record<string, AnswerResponse>>({});
  const [furthestAvailableIndex, setFurthestAvailableIndex] = useState(0);

  const { data: sessionData, isLoading: sessionLoading } = useQuery({
    queryKey: ['quizSession', sessionId],
    queryFn: () => quizApi.getQuizSession(sessionId || ''),
    enabled: !!sessionId,
    refetchInterval: (query) =>
      query.state.data?.status === 'generating' || query.state.data?.status === 'draft'
        ? QUIZ_REFRESH_INTERVAL_MS
        : false,
    refetchIntervalInBackground: true,
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['quizItems', sessionId],
    queryFn: () => quizApi.getQuizItems(sessionId || ''),
    enabled: !!sessionId,
    refetchInterval: (query) =>
      query.state.data?.length === 0 && sessionData?.status !== 'failed' && sessionData?.status !== 'generation_failed'
        ? QUIZ_REFRESH_INTERVAL_MS
        : false,
    refetchIntervalInBackground: true,
  });

  const submitAnswerMutation = useMutation({
    mutationFn: (data: { itemId: string; answer: string }) =>
      quizApi.submitAnswer(sessionId || '', data.itemId, { user_answer: data.answer }),
    onSuccess: (result, variables) => {
      setAnswerResult(result);
      setIsSubmitted(true);
      setCurrentAnswer(variables.itemId, variables.answer);
      setDraftAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setSubmittedAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setAnswerResultsByItemId((prev) => ({ ...prev, [variables.itemId]: result }));
      setValidationMessage(null);
      setFurthestAvailableIndex((prev) => {
        if (!itemsData || itemsData.length === 0) {
          return prev;
        }

        return Math.min(itemsData.length - 1, Math.max(prev, currentItemIndex + 1));
      });
    },
  });

  const saveDraftAnswerMutation = useMutation({
    mutationFn: (data: { itemId: string; answer: string }) =>
      quizApi.saveDraftAnswer(sessionId || '', { item_id: data.itemId, user_answer: data.answer }),
    onSuccess: (_result, variables) => {
      setCurrentAnswer(variables.itemId, variables.answer);
      setDraftAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setSubmittedAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setValidationMessage(null);

      setFurthestAvailableIndex((prev) => {
        if (!itemsData || itemsData.length === 0) {
          return prev;
        }

        return Math.min(itemsData.length - 1, Math.max(prev, currentItemIndex + 1));
      });

      if (itemsData && currentItemIndex < itemsData.length - 1) {
        setCurrentItemIndex((prev) => Math.min(prev + 1, itemsData.length - 1));
      }
    },
  });

  const submitExamMutation = useMutation({
    mutationFn: () => quizApi.submitExam(sessionId || '', { idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      navigate(`/quiz/${sessionId}/results`);
    },
  });

  const currentItem = itemsData?.[currentItemIndex];
  const isExamMode = currentSession?.mode === 'exam';
  const completedCount = isExamMode
    ? Object.values(submittedAnswers).filter((answer) => answer.trim()).length
    : Object.keys(submittedAnswers).length;
  const progressPercent = itemsData?.length ? (completedCount / itemsData.length) * 100 : 0;
  const isGeneratingQuiz = sessionData?.status === 'draft' || sessionData?.status === 'generating';

  useEffect(() => {
    if (sessionData && itemsData) {
      const snapshot = currentAnswerMapRef.current;
      const restoredAnswerMap = Object.fromEntries(
        itemsData
          .filter((item) => snapshot[item.id] != null)
          .map((item) => [item.id, snapshot[item.id]])
      );
      const restoredIndexes = itemsData
        .map((item, index) => (restoredAnswerMap[item.id] ? index : -1))
        .filter((index) => index >= 0);
      const highestRestoredIndex = restoredIndexes.length > 0 ? Math.max(...restoredIndexes) : -1;

      setCurrentSession(sessionData);
      setCurrentItems(itemsData);
      setCurrentItemIndex(0);
      setUserAnswer(restoredAnswerMap[itemsData[0]?.id] ?? '');
      setIsSubmitted(false);
      setAnswerResult(null);
      setValidationMessage(null);
      setDraftAnswers(restoredAnswerMap);
      setSubmittedAnswers(restoredAnswerMap);
      setAnswerResultsByItemId({});
      setFurthestAvailableIndex(
        itemsData.length === 0 ? 0 : Math.min(itemsData.length - 1, Math.max(0, highestRestoredIndex + 1))
      );
    }
  }, [sessionData, itemsData, setCurrentItems, setCurrentSession]);

  useEffect(() => {
    if (itemsData && itemsData.length > 0) {
      const currentItem = itemsData[currentItemIndex];

      if (!currentItem) {
        return;
      }

      setUserAnswer(
        submittedAnswers[currentItem.id] ??
          draftAnswers[currentItem.id] ??
          currentAnswerMap[currentItem.id] ??
          ''
      );

      const storedResult = answerResultsByItemId[currentItem.id] ?? null;
      setIsSubmitted(isExamMode ? Boolean(storedResult) : Boolean(storedResult || submittedAnswers[currentItem.id]));
      setAnswerResult(isExamMode ? null : storedResult);
    }
  }, [answerResultsByItemId, currentItemIndex, currentAnswerMap, draftAnswers, isExamMode, itemsData, submittedAnswers]);

  useEffect(() => {
    if (!validationMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setValidationMessage(null);
    }, VALIDATION_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [validationMessage]);

  const handleExit = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const isAnyMutationPending =
    submitAnswerMutation.isPending || saveDraftAnswerMutation.isPending || submitExamMutation.isPending;

  const goToQuestion = useCallback(
    (nextIndex: number) => {
      if (!itemsData || isAnyMutationPending) {
        return;
      }

      if (
        nextIndex < 0 ||
        nextIndex >= itemsData.length ||
        nextIndex > furthestAvailableIndex ||
        nextIndex === currentItemIndex
      ) {
        return;
      }

      setCurrentItemIndex(nextIndex);
      setValidationMessage(null);
    },
    [currentItemIndex, furthestAvailableIndex, itemsData, isAnyMutationPending]
  );

  const handleAnswerChange = useCallback(
    (answer: string) => {
      setUserAnswer(answer);

      if (currentItem) {
        setDraftAnswers((prev) => ({ ...prev, [currentItem.id]: answer }));

        if (isExamMode) {
          setSubmittedAnswers((prev) => {
            if (prev[currentItem.id] === answer) {
              return prev;
            }

            const next = { ...prev };
            delete next[currentItem.id];
            return next;
          });
        }
      }

      if (validationMessage && answer.trim()) {
        setValidationMessage(null);
      }
    },
    [currentItem, validationMessage]
  );

  const handleSubmit = useCallback(() => {
    if (!currentItem || isAnyMutationPending) {
      return;
    }

    if (!userAnswer.trim()) {
      setValidationMessage('답안을 입력해주세요.');
      return;
    }

    if (isExamMode) {
      saveDraftAnswerMutation.mutate({ itemId: currentItem.id, answer: userAnswer });
      return;
    }

    submitAnswerMutation.mutate({ itemId: currentItem.id, answer: userAnswer });
  }, [currentItem, isAnyMutationPending, isExamMode, saveDraftAnswerMutation, submitAnswerMutation, userAnswer]);

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleSubmit();
    },
    [handleSubmit]
  );

  const handleNext = useCallback(() => {
    if (itemsData && currentItemIndex < itemsData.length - 1) {
      setCurrentItemIndex(currentItemIndex + 1);
      setValidationMessage(null);
    } else {
      navigate(`/quiz/${sessionId}/results`);
    }
  }, [currentItemIndex, itemsData, navigate, sessionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const targetTag = target?.tagName;
      const isTextArea = targetTag === 'TEXTAREA';
      const isInteractiveTarget = isInteractiveShortcutTarget(event.target);

      if (event.key === 'Escape') {
        event.preventDefault();
        handleExit();
        return;
      }

      if (!itemsData || isAnyMutationPending) {
        return;
      }

      if (event.key === 'ArrowLeft' && !isInteractiveTarget) {
        event.preventDefault();
        goToQuestion(currentItemIndex - 1);
        return;
      }

      if (event.key === 'ArrowRight' && !isInteractiveTarget) {
        event.preventDefault();
        goToQuestion(currentItemIndex + 1);
        return;
      }

      if (
        event.key === 'Enter' &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !isInteractiveTarget &&
        targetTag !== 'BUTTON' &&
        targetTag !== 'A'
      ) {
        if (isTextArea && event.shiftKey) {
          return;
        }

        event.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentItemIndex, goToQuestion, handleExit, handleSubmit, isAnyMutationPending, itemsData]);

  if (sessionLoading || itemsLoading || isGeneratingQuiz) {
    return <LoadingSpinner />;
  }

  if (sessionData?.status === 'generation_failed') {
    return (
      <section className="overflow-hidden rounded-3xl border border-semantic-error-border bg-gradient-to-b from-semantic-error-bg to-surface shadow-sm">
        <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-12 text-center sm:px-10 sm:py-14">
          <p className="text-sm font-medium tracking-[0.18em] text-content-secondary">생성 실패</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-content-primary sm:text-2xl">
            퀴즈 생성에 실패했습니다.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">
            다시 생성해 주세요.
          </p>
        </div>
      </section>
    );
  }

  if (!itemsData || itemsData.length === 0) {
    return (
      <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-surface to-surface-deep/90 shadow-sm">
        <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-12 text-center sm:px-10 sm:py-14">
          <p className="text-sm font-medium tracking-[0.18em] text-brand-300">퀴즈 준비 중</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-content-primary sm:text-2xl">
            퀴즈 문제를 아직 준비 중입니다.
          </h1>
        </div>
      </section>
    );
  }

  if (!currentItem) {
    return (
      <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-surface to-surface-deep/90 shadow-sm">
        <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-12 text-center sm:px-10 sm:py-14">
          <p className="text-sm font-medium tracking-[0.18em] text-brand-300">불러오기 오류</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-content-primary sm:text-2xl">
            현재 문제를 불러오지 못했습니다.
          </h1>
        </div>
      </section>
    );
  }

  const activeItem = currentItem;

  return (
    <div className={isExamMode ? 'pb-28' : ''}>
      <div className="mb-6 rounded-3xl border border-white/[0.07] bg-surface px-6 py-5 md:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-content-primary">
              퀴즈 풀이
              {isExamMode && <span className="ml-2 text-sm font-medium text-brand-300">(시험 모드)</span>}
            </h1>
          </div>

          <div className="flex items-center gap-3 self-start">
            <StatusBadge status={currentSession?.status || ''} />
            <button
              type="button"
              onClick={handleExit}
              className="rounded-xl border border-white/[0.07] px-4 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              나가기 <span className="text-content-muted">Esc</span>
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-content-secondary">
            문제 {currentItemIndex + 1} / {itemsData.length} · 완료 {completedCount}문제
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-content-secondary">
              <span>진행률</span>
              <span className="text-content-muted">{completedCount} / {itemsData.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-content-muted">
              <span className="rounded-full border border-white/[0.07] bg-surface px-2 py-1">← 이전</span>
              <span className="rounded-full border border-white/[0.07] bg-surface px-2 py-1">→ 다음</span>
              <span className="rounded-full border border-white/[0.07] bg-surface px-2 py-1">Enter 제출</span>
              {activeItem.question_type !== 'multiple_choice' && activeItem.question_type !== 'ox' ? (
                <span className="rounded-full border border-white/[0.07] bg-surface px-2 py-1">Shift+Enter 줄바꿈</span>
              ) : null}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-deep">
            <div
              role="progressbar"
              aria-valuenow={Math.round(progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="퀴즈 진행률"
              className="h-full rounded-full bg-brand-500 transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-sm text-content-secondary">문제 이동</div>
          <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-2 py-3">
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2 px-1">
                {itemsData.map((item, index) => {
                  const isCurrentQuestion = index === currentItemIndex;
                  const isCompleted = Boolean(submittedAnswers[item.id]);
                  const isAvailable = index <= furthestAvailableIndex;

                   const pillClass = isCurrentQuestion
                     ? 'border-brand-500 bg-brand-500 text-content-inverse'
                     : isCompleted
                    ? 'border-semantic-success-border bg-semantic-success-bg text-semantic-success'
                    : isAvailable
                    ? 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning'
                    : 'border-white/[0.07] bg-surface-deep text-content-muted';

                  const stateLabel = isCurrentQuestion
                    ? '현재 문제'
                    : isCompleted
                    ? '제출 완료'
                    : isAvailable
                    ? '이동 가능'
                    : '잠김';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goToQuestion(index)}
                      disabled={!isAvailable || isAnyMutationPending}
                      aria-current={isCurrentQuestion ? 'page' : undefined}
                      aria-label={`${index + 1}번 문제 (${stateLabel})`}
                      className={`flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${pillClass}`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-7 md:px-8">
        {/* Question */}
        <div className="mb-6">
          <h2 className="text-xl font-medium text-content-primary mb-4">
            {activeItem.question_text}
          </h2>

          {/* Options for multiple choice / OX */}
          {activeItem.question_type === 'multiple_choice' && activeItem.options != null && (
            <div className="space-y-3">
              {Object.entries(activeItem.options as Record<string, string>).map(([key, text]) => (
                <label
                  key={key}
                  className={`flex items-center rounded-2xl border px-5 py-4 transition-colors ${
                    isSubmitted && answerResult && userAnswer === key
                      ? answerResult.judgement === 'correct'
                        ? 'border-semantic-success-border bg-semantic-success-bg text-content-primary'
                        : answerResult.judgement === 'partial'
                        ? 'border-semantic-warning-border bg-semantic-warning-bg text-content-primary'
                        : 'border-semantic-error-border bg-semantic-error-bg text-content-primary'
                      : userAnswer === key
                      ? 'border-brand-500/30 bg-brand-500/10 text-brand-300'
                      : 'border-white/[0.07] bg-surface-deep text-content-primary hover:bg-surface-hover hover:border-white/[0.14]'
                   } ${isSubmitted || isAnyMutationPending ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    value={key}
                    checked={userAnswer === key}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    disabled={isSubmitted || isAnyMutationPending}
                    className="mr-3 h-4 w-4 shrink-0 accent-brand-500"
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
          )}

          {activeItem.question_type === 'ox' && (
            <div className="space-y-3">
              {['O', 'X'].map((option) => (
                <label
                  key={option}
                  className={`flex items-center rounded-2xl border px-5 py-4 transition-colors ${
                    isSubmitted && answerResult && userAnswer === option
                      ? answerResult.judgement === 'correct'
                        ? 'border-semantic-success-border bg-semantic-success-bg text-content-primary'
                        : answerResult.judgement === 'partial'
                        ? 'border-semantic-warning-border bg-semantic-warning-bg text-content-primary'
                        : 'border-semantic-error-border bg-semantic-error-bg text-content-primary'
                      : userAnswer === option
                      ? 'border-brand-500/30 bg-brand-500/10 text-brand-300'
                      : 'border-white/[0.07] bg-surface-deep text-content-primary hover:bg-surface-hover hover:border-white/[0.14]'
                   } ${isSubmitted || isAnyMutationPending ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    value={option}
                    checked={userAnswer === option}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    disabled={isSubmitted || isAnyMutationPending}
                    className="mr-3 h-4 w-4 shrink-0 accent-brand-500"
                  />
                  <span className="font-medium">{option}</span>
                </label>
              ))}
            </div>
          )}

          {/* Text input for short answer / fill blank */}
          {(activeItem.question_type === 'short_answer' || activeItem.question_type === 'fill_blank') && (
            <textarea
              value={userAnswer}
              onChange={(e) => handleAnswerChange(e.target.value)}
              disabled={isSubmitted || isAnyMutationPending}
              placeholder="답안을 입력하세요"
              className="w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-content-primary placeholder-content-muted transition-colors hover:bg-surface-hover focus:border-brand-500 focus:outline-none focus:shadow-[0_0_0_2px_oklch(0.65_0.15_175_/_0.2)]"
              rows={3}
            />
          )}

          {/* Essay textarea */}
          {activeItem.question_type === 'essay' && (
            <textarea
              value={userAnswer}
              onChange={(e) => handleAnswerChange(e.target.value)}
              disabled={isSubmitted || isAnyMutationPending}
              placeholder="답안을 작성하세요"
              className="w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-content-primary placeholder-content-muted transition-colors hover:bg-surface-hover focus:border-brand-500 focus:outline-none focus:shadow-[0_0_0_2px_oklch(0.65_0.15_175_/_0.2)]"
              rows={8}
            />
          )}
        </div>

        {validationMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-semantic-error-border bg-semantic-error-bg px-5 py-4"
          >
            <div>
              <div className="font-medium text-content-primary">입력한 답안이 없습니다.</div>
              <div className="mt-1 text-sm text-content-secondary">{validationMessage}</div>
            </div>
            <button
              type="button"
              onClick={() => setValidationMessage(null)}
              className="rounded-xl px-2 py-1 text-sm text-content-secondary transition-colors hover:bg-surface-hover"
            >
              닫기
            </button>
          </div>
        )}

        {/* Answer Result */}
        {isExamMode ? (
          <div className="mb-4 rounded-2xl border border-brand-500/20 bg-brand-500/10 px-5 py-5 text-content-primary">
            <div className="text-lg font-semibold text-brand-300">시험 모드: 제출 후 채점</div>
            <div className="mt-2 text-sm leading-6 text-content-secondary">
              문항별 답안은 임시 저장됩니다. 전체 제출 후 결과를 확인할 수 있어요.
            </div>
          </div>
         ) : isSubmitted && answerResult ? (
           <div className={`animate-scale-in mb-4 rounded-2xl border px-5 py-5 ${
             answerResult.judgement === 'correct'
               ? 'animate-answer-correct border-semantic-success-border bg-semantic-success-bg'
               : answerResult.judgement === 'partial'
               ? 'border-semantic-warning-border bg-semantic-warning-bg'
               : 'animate-answer-wrong border-semantic-error-border bg-semantic-error-bg'
           }`}>
             <div className={`text-lg font-semibold ${
               answerResult.judgement === 'correct'
                 ? 'text-semantic-success'
                 : answerResult.judgement === 'partial'
                 ? 'text-semantic-warning'
                 : 'text-semantic-error'
             }`}>
               {answerResult.judgement === 'correct'
                 ? '정답'
                 : answerResult.judgement === 'partial'
                 ? '부분정답'
                 : '오답'}
             </div>
             <div className="mt-2 text-sm text-content-secondary">
               점수: {answerResult.score_awarded} / {answerResult.max_score}
             </div>
             {answerResult.grading_rationale && (
               <div className="text-sm text-content-secondary mt-2">
                  {answerResult.grading_rationale}
               </div>
             )}
             {answerResult.explanation && (
               <div className="mt-4 pt-4 border-t border-white/10">
                 <div className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-2">해설</div>
                 <div className="text-sm text-content-secondary whitespace-pre-wrap">
                    {answerResult.explanation}
                 </div>
               </div>
             )}
             {answerResult.tips && (
               <div className="mt-3 pt-3 border-t border-white/10">
                 <div className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-2">팁</div>
                 <div className="text-sm text-content-secondary whitespace-pre-wrap">
                    {answerResult.tips}
                 </div>
               </div>
             )}
           </div>
         ) : null}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => goToQuestion(currentItemIndex - 1)}
            disabled={currentItemIndex === 0 || isAnyMutationPending}
            className="rounded-xl border border-white/[0.07] px-5 py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            이전 문제
          </button>

          {!isSubmitted ? (
            <button
              type="submit"
              disabled={isAnyMutationPending || !userAnswer.trim()}
              className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-medium text-content-inverse transition hover:bg-brand-600 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnyMutationPending ? '처리 중...' : isExamMode ? '임시 저장' : '제출'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-medium text-content-inverse transition hover:bg-brand-600 hover:-translate-y-px"
            >
              {currentItemIndex < itemsData.length - 1 ? '다음 문제' : '결과 보기'}
            </button>
          )}
        </div>
      </form>

      {isExamMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="text-sm text-content-secondary">
              {Object.values(draftAnswers).filter((answer) => answer.trim()).length} / {itemsData.length} 문제 답변됨
            </div>
            <button
              type="button"
              onClick={() => submitExamMutation.mutate()}
              disabled={submitExamMutation.isPending || completedCount !== itemsData.length}
              className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-medium text-content-inverse transition hover:bg-brand-600 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitExamMutation.isPending ? '제출 중...' : '전체 제출'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
