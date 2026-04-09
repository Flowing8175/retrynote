import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quizApi } from '@/api';
import { useQuizStore } from '@/stores';
import { LoadingSpinner, PillShimmer } from '@/components';
import type { AnswerLogEntry, AnswerResponse } from '@/types';
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import DiagramModal from '@/components/DiagramModal';
import { getErrorMessage } from '@/utils/errorMessages';

const COMPLETED_STATUSES = new Set(['submitted', 'grading', 'graded', 'regraded', 'closed']);
const AUTO_SUBMIT_QUESTION_TYPES = new Set(['multiple_choice', 'ox']);
const FREE_TEXT_QUESTION_TYPES = new Set(['short_answer', 'essay', 'fill_blank']);
const DEFAULT_OX_OPTIONS: Record<string, string> = {
  O: 'O',
  X: 'X',
};

const QUIZ_REFRESH_INTERVAL_MS = 2000;

const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: '객관식',
  fill_blank: '빈칸 채우기',
  short_answer: '단답형',
  essay: '서술형',
  ox: 'O/X',
};

function normalizeOxValue(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function ParticleEffect() {
  const particles = Array.from({ length: 8 }).map((_, i) => ({
    id: i,
    tx: `${(Math.random() - 0.5) * 200}px`,
    ty: `${(Math.random() - 0.5) * 200}px`,
    size: `${Math.random() * 4 + 3}px`,
    delay: `${Math.random() * 0.1}s`,
  }));

  return (
    <div className="particle-container">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            '--tx': p.tx,
            '--ty': p.ty,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            backgroundColor: 'oklch(0.72 0.12 170)'
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export default function QuizTake() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentSession, currentAnswerMap, setCurrentSession, setCurrentItems, setCurrentAnswer } = useQuizStore();
  const currentAnswerMapRef = useRef(currentAnswerMap);
  
  useEffect(() => {
    currentAnswerMapRef.current = currentAnswerMap;
  }, [currentAnswerMap]);

  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [answerResult, setAnswerResult] = useState<AnswerResponse | null>(null);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string>>({});
  const [creditError, setCreditError] = useState(false);
  const [answerResultsByItemId, setAnswerResultsByItemId] = useState<Record<string, AnswerResponse>>({});
  const [furthestAvailableIndex, setFurthestAvailableIndex] = useState(0);
  const [diagramModal, setDiagramModal] = useState<{ conceptKey: string; conceptLabel: string } | null>(null);

  const { data: sessionData, isLoading: sessionLoading, isError: sessionIsError, error: sessionError } = useQuery({
    queryKey: ['quizSession', sessionId],
    queryFn: () => quizApi.getQuizSession(sessionId || ''),
    enabled: !!sessionId,
    refetchInterval: (query) =>
      query.state.data?.status === 'generating' || query.state.data?.status === 'draft'
        ? QUIZ_REFRESH_INTERVAL_MS
        : false,
  });

  const {
    data: itemsData,
    isLoading: itemsLoading,
    isError: itemsIsError,
    error: itemsError,
  } = useQuery({
    queryKey: ['quizItems', sessionId],
    queryFn: () => quizApi.getQuizItems(sessionId || ''),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      if (!sessionData) {
        return false;
      }

      if (sessionData.status === 'draft' || sessionData.status === 'generating') {
        return QUIZ_REFRESH_INTERVAL_MS;
      }

      if (sessionData.status === 'ready' && (query.state.data?.length ?? 0) === 0) {
        return QUIZ_REFRESH_INTERVAL_MS;
      }

      return false;
    },
  });

  const isCompleted = !!sessionData && COMPLETED_STATUSES.has(sessionData.status);

  const { data: answerLogsData } = useQuery({
    queryKey: ['answerLogs', sessionId],
    queryFn: () => quizApi.getAnswerLogs(sessionId || ''),
    enabled: !!sessionId && isCompleted,
  });

  useEffect(() => {
    if (sessionData) setCurrentSession(sessionData);
    if (itemsData) setCurrentItems(itemsData);
  }, [sessionData, itemsData, setCurrentSession, setCurrentItems]);

  useEffect(() => {
    if (!answerLogsData || !itemsData?.length) return;
    const submitted: Record<string, string> = {};
    const results: Record<string, AnswerResponse> = {};
    for (const log of answerLogsData) {
      submitted[log.item_id] = log.user_answer;
      results[log.item_id] = { ...(log as AnswerLogEntry), next_item_id: null } as AnswerResponse;
    }
    setSubmittedAnswers(submitted);
    setDraftAnswers(submitted);
    setAnswerResultsByItemId(results);
    setFurthestAvailableIndex(itemsData.length - 1);
    const firstItem = itemsData[0];
    if (submitted[firstItem.id]) {
      setUserAnswer(submitted[firstItem.id]);
      setIsSubmitted(true);
      setAnswerResult(results[firstItem.id] ?? null);
    }
  }, [answerLogsData, itemsData]);

  const submitAnswerMutation = useMutation({
    mutationFn: (data: { itemId: string; answer: string }) =>
      quizApi.submitAnswer(sessionId || '', data.itemId, { user_answer: data.answer }),
    onError: (err) => {
      if (isAxiosError(err) && err.response?.status === 402) {
        setCreditError(true);
      }
    },
    onSuccess: (result, variables) => {
      setAnswerResult(result);
      setIsSubmitted(true);
      setCurrentAnswer(variables.itemId, variables.answer);
      setDraftAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setSubmittedAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setAnswerResultsByItemId((prev) => ({ ...prev, [variables.itemId]: result }));
      setFurthestAvailableIndex((prev) => Math.min((itemsData?.length || 1) - 1, Math.max(prev, currentItemIndex + 1)));

      if (!result.next_item_id && sessionData?.mode === 'normal' && sessionId) {
        completeQuizMutation.mutate();
      }
    },
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

  const saveDraftAnswerMutation = useMutation({
    mutationFn: (data: { itemId: string; answer: string }) =>
      quizApi.saveDraftAnswer(sessionId || '', { item_id: data.itemId, user_answer: data.answer }),
    onSuccess: (_, variables) => {
      setCurrentAnswer(variables.itemId, variables.answer);
      setDraftAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setSubmittedAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setFurthestAvailableIndex((prev) => Math.min((itemsData?.length || 1) - 1, Math.max(prev, currentItemIndex + 1)));
      if (itemsData && currentItemIndex < itemsData.length - 1) {
        setCurrentItemIndex((prev) => prev + 1);
        setUserAnswer(draftAnswers[itemsData[currentItemIndex + 1].id] || '');
      }
    },
  });

  const currentItem = itemsData?.[currentItemIndex];
  const currentQuestionType = typeof currentItem?.question_type === 'string' ? currentItem.question_type : null;
  const isExamMode = currentSession?.mode === 'exam';
  const isChoiceQuestion =
    currentQuestionType === 'multiple_choice' || currentQuestionType === 'ox';
  const choiceOptions = isChoiceQuestion
    ? ((currentItem?.options as Record<string, string> | null) ??
      (currentQuestionType === 'ox' ? DEFAULT_OX_OPTIONS : null))
    : null;

  const handleOptionSelect = (optionKey: string) => {
    if (isSubmitted && !isExamMode) return;
    if (submitAnswerMutation.isPending) return;
    setUserAnswer(optionKey);

    if (
      !isExamMode &&
      currentItem &&
      currentQuestionType &&
      AUTO_SUBMIT_QUESTION_TYPES.has(currentQuestionType)
    ) {
      submitAnswerMutation.mutate({ itemId: currentItem.id, answer: optionKey });
    }
  };

  const handleNext = () => {
    if (itemsData && currentItemIndex < itemsData.length - 1) {
      const nextIndex = currentItemIndex + 1;
      setCurrentItemIndex(nextIndex);
      setIsSubmitted(!!submittedAnswers[itemsData[nextIndex].id]);
      setAnswerResult(answerResultsByItemId[itemsData[nextIndex].id] || null);
      setUserAnswer(submittedAnswers[itemsData[nextIndex].id] || draftAnswers[itemsData[nextIndex].id] || '');
    }
  };

  const handlePrev = () => {
    if (currentItemIndex > 0 && itemsData) {
      const prevIndex = currentItemIndex - 1;
      setCurrentItemIndex(prevIndex);
      setIsSubmitted(!!submittedAnswers[itemsData[prevIndex].id]);
      setAnswerResult(answerResultsByItemId[itemsData[prevIndex].id] || null);
      setUserAnswer(submittedAnswers[itemsData[prevIndex].id] || draftAnswers[itemsData[prevIndex].id] || '');
    }
  };

  const handleViewResults = async () => {
    if (!sessionId) {
      return;
    }

    const shouldFinalizeNormalSession =
      sessionData?.mode === 'normal' &&
      sessionData.status !== 'graded' &&
      sessionData.status !== 'regraded' &&
      sessionData.status !== 'closed';

    if (shouldFinalizeNormalSession) {
      await completeQuizMutation.mutateAsync();
    }

    navigate(`/quiz/${sessionId}/results`);
  };

  if (sessionLoading || (!sessionData && !sessionIsError)) {
    return <LoadingSpinner message="퀴즈 데이터를 준비하고 있습니다" />;
  }

  if (sessionIsError) {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center space-y-6">
        <AlertCircle size={64} className="mx-auto text-semantic-error" />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-white">퀴즈 정보를 불러오지 못했습니다</h1>
          <p className="text-base text-content-secondary leading-relaxed">
            {getErrorMessage(sessionError, '퀴즈 생성 직후 데이터를 읽어오지 못했습니다. 잠시 후 다시 시도해 주세요.')}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center bg-surface-raised text-white border border-white/[0.1] px-6 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            다시 불러오기
          </button>
          <button
            onClick={() => navigate('/quiz/new')}
            className="inline-flex items-center justify-center bg-brand-500 text-brand-900 px-6 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            새 퀴즈 만들기
          </button>
        </div>
      </div>
    );
  }

  if (sessionData.status === 'draft' || sessionData.status === 'generating') {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center space-y-8">
        <div className="flex flex-col items-center gap-2.5 mx-auto">
          <PillShimmer width={200} />
          <PillShimmer width={140} delay={0.4} opacity={0.65} />
          <PillShimmer width={88} delay={0.75} opacity={0.38} />
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold text-white">퀴즈 생성 중...</h1>
          <p className="text-base text-content-secondary leading-relaxed">
            AI가 학습 자료를 분석하여 문항을 설계하고 있습니다.<br/>잠시만 기다려 주세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/quiz/new')}
          className="mt-2 text-sm underline underline-offset-2 transition-colors"
          style={{ color: '#A0AEC0' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#A0AEC0'; }}
        >
          취소하고 돌아가기
        </button>
      </div>
    );
  }

  if (sessionData.status === 'generation_failed') {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center space-y-6">
        <AlertCircle size={64} className="mx-auto text-semantic-error" />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-white">퀴즈 생성에 실패했습니다</h1>
          <p className="text-base text-content-secondary leading-relaxed">
            문항을 준비하지 못했습니다. 다시 생성해 주세요.
          </p>
        </div>
        <button
          onClick={() => navigate('/quiz/new')}
          className="inline-flex items-center justify-center bg-brand-500 text-brand-900 px-6 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
        >
          새 퀴즈 만들기
        </button>
      </div>
    );
  }

  if (itemsLoading || (!itemsData && !itemsIsError) || (sessionData.status === 'ready' && !itemsData?.length && !itemsIsError)) {
    return <LoadingSpinner message="퀴즈 문항을 불러오고 있습니다" />;
  }

  if (itemsIsError) {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center space-y-6">
        <AlertCircle size={64} className="mx-auto text-semantic-error" />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-white">퀴즈 문항을 불러오지 못했습니다</h1>
          <p className="text-base text-content-secondary leading-relaxed">
            {getErrorMessage(itemsError, '생성된 퀴즈 문항을 가져오는 중 문제가 발생했습니다.')}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center bg-surface-raised text-white border border-white/[0.1] px-6 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            다시 불러오기
          </button>
          <button
            onClick={() => navigate('/quiz/new')}
            className="inline-flex items-center justify-center bg-brand-500 text-brand-900 px-6 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            새 퀴즈 만들기
          </button>
        </div>
      </div>
    );
  }

  if (!currentItem) {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center space-y-6">
        <AlertCircle size={64} className="mx-auto text-semantic-warning" />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-white">퀴즈 문항을 찾을 수 없습니다</h1>
          <p className="text-base text-content-secondary leading-relaxed">
            문항 목록을 다시 불러오거나 새 퀴즈를 생성해 주세요.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center bg-surface-raised text-white border border-white/[0.1] px-6 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            다시 불러오기
          </button>
          <button
            onClick={() => navigate('/quiz/new')}
            className="inline-flex items-center justify-center bg-brand-500 text-brand-900 px-6 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            새 퀴즈 만들기
          </button>
        </div>
      </div>
    );
  }

  const progress = ((currentItemIndex + 1) / (itemsData?.length || 1)) * 100;

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-12">
      {/* Progress Header */}
      <header className="space-y-4">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium text-content-muted">진행 상황</div>
            <div className="text-3xl font-semibold tabular-nums text-white">
              <span className="text-white font-semibold">{currentItemIndex + 1}</span>
              <span className="text-content-secondary text-2xl font-normal"> / {itemsData?.length}</span>
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="text-sm font-medium text-white bg-surface border border-white/[0.05] px-3 py-1.5 rounded-lg">
              {isExamMode ? '시험 모드' : '일반 모드'}
            </div>
          </div>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden border border-white/[0.05]">
          <div 
            className="h-full bg-brand-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Main Question Area */}
      {currentItem && (
        <section className="animate-fade-in-up space-y-10">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-brand-300 bg-brand-500/10 px-2.5 py-1 rounded-md border border-brand-500/20">
                {currentQuestionType ? (QUESTION_TYPE_LABELS[currentQuestionType] ?? currentQuestionType.replace('_', ' ')) : '문항'}
              </span>
              <span className="text-xs font-medium text-content-muted">
                {currentItem.concept_label || '개념'}
              </span>
              {currentItem.concept_key && (
                <button
                  onClick={() => setDiagramModal({ conceptKey: currentItem.concept_key!, conceptLabel: currentItem.concept_label || currentItem.concept_key! })}
                  className="text-xs font-medium text-brand-300/60 hover:text-brand-300 transition-colors"
                >
                  개념 확인하기
                </button>
              )}
            </div>
            <h2 className="text-3xl font-semibold leading-relaxed text-white">
              {currentItem.question_text}
            </h2>
          </div>

          {/* Answer Options */}
          <div className="space-y-4">
            {choiceOptions && (
              <div className="grid gap-3">
                {Object.entries(choiceOptions).map(([key, text]) => {
                  const isOxQuestion = currentQuestionType === 'ox';
                  const isSelected = isOxQuestion
                    ? normalizeOxValue(userAnswer) === normalizeOxValue(key)
                    : userAnswer === key;
                  const isCorrectAnswer = isOxQuestion
                    ? normalizeOxValue(answerResult?.correct_answer?.answer) === normalizeOxValue(key)
                    : answerResult?.correct_answer?.answer === key;
                  const isCorrect = answerResult?.judgement === 'correct' && isCorrectAnswer;
                  const isWrong = isSubmitted && isSelected && answerResult?.judgement !== 'correct';
                  const shouldShowCorrect = isSubmitted && !isExamMode && isCorrectAnswer;

                  return (
                    <button
                      key={key}
                      onClick={() => handleOptionSelect(key)}
                      disabled={(isSubmitted && !isExamMode) || isCompleted}
                      className={`relative group flex items-start gap-4 p-5 rounded-2xl text-left transition-all border ${
                        isSelected 
                          ? 'bg-brand-500/15 text-brand-200 border-brand-500/30 ring-1 ring-inset ring-brand-500/30 shadow-sm shadow-brand-900/20' 
                          : shouldShowCorrect 
                            ? 'bg-brand-500/10 text-brand-300 border-brand-500/30'
                            : 'bg-surface text-content-primary border-white/[0.05] hover:bg-surface-hover'
                      } ${isWrong ? 'bg-semantic-error/10 text-semantic-error border-semantic-error/30' : ''}`}
                    >
                      <span className={`text-base font-semibold tabular-nums mt-0.5 ${isSelected ? 'text-brand-100' : 'text-content-muted'}`}>
                        {key.toUpperCase()}
                      </span>
                      <span className={`text-base font-medium leading-relaxed ${isSelected ? 'text-brand-50' : ''}`}>{text}</span>
                      {isCorrect && !isExamMode && <ParticleEffect />}
                    </button>
                  );
                })}
              </div>
            )}

            {currentQuestionType !== null && FREE_TEXT_QUESTION_TYPES.has(currentQuestionType) && (
              <div className="space-y-4">
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (
                        !userAnswer.trim() ||
                        submitAnswerMutation.isPending ||
                        saveDraftAnswerMutation.isPending ||
                        (isSubmitted && !isExamMode) ||
                        isCompleted
                      ) return;
                      if (isExamMode) {
                        saveDraftAnswerMutation.mutate({ itemId: currentItem!.id, answer: userAnswer });
                      } else {
                        submitAnswerMutation.mutate({ itemId: currentItem!.id, answer: userAnswer });
                      }
                    }
                  }}
                  disabled={(isSubmitted && !isExamMode) || isCompleted}
                  placeholder="답변을 입력하세요... (Enter로 제출, Shift+Enter로 줄바꿈)"
                  className="w-full bg-surface border border-white/[0.05] rounded-2xl text-base px-6 py-6 placeholder:text-content-muted focus:ring-2 focus:ring-brand-500 transition-shadow min-h-[200px] resize-y"
                />
              </div>
            )}
          </div>

          {/* Result Feedback (Immediate Mode Only) */}
          {isSubmitted && !isExamMode && answerResult && (
            <div className={`animate-fade-in-up p-6 rounded-2xl border ${answerResult.judgement === 'correct' ? 'bg-brand-500/5 border-brand-500/30' : 'bg-semantic-error/5 border-semantic-error/30'}`}>
              <div className="flex items-center gap-4 mb-4">
                {answerResult.judgement === 'correct' ? (
                  <CheckCircle2 size={24} className="text-brand-300" />
                ) : (
                  <AlertCircle size={24} className="text-semantic-error" />
                )}
                <h3 className={`text-lg font-semibold ${answerResult.judgement === 'correct' ? 'text-brand-300' : 'text-semantic-error'}`}>
                  {answerResult.judgement === 'correct' ? '정답입니다' : '틀렸습니다'}
                </h3>
              </div>
              <p className="text-base text-content-secondary leading-relaxed">
                {answerResult.explanation}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Navigation Controls */}
      {creditError && (
        <p className="text-sm text-content-secondary">
          채점을 위한 크레딧이 부족합니다.{' '}
          <Link to="/pricing" className="underline underline-offset-2 hover:text-white transition-colors">
            플랜 업그레이드
          </Link>
        </p>
      )}

      <footer className="pt-8 flex flex-col-reverse sm:flex-row items-center gap-4 justify-between">
        <div className="flex gap-3 w-full sm:w-auto">
          <button
            onClick={handlePrev}
            disabled={currentItemIndex === 0}
            className="flex-1 sm:flex-none flex items-center justify-center h-12 w-16 bg-surface border border-white/[0.05] rounded-xl text-content-primary hover:bg-surface-hover disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={handleNext}
            disabled={currentItemIndex >= (isCompleted ? (itemsData?.length ?? 1) - 1 : furthestAvailableIndex)}
            className="flex-1 sm:flex-none flex items-center justify-center h-12 w-16 bg-surface border border-white/[0.05] rounded-xl text-content-primary hover:bg-surface-hover disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="w-full sm:w-auto">
          {(!isSubmitted || isExamMode) && !isCompleted ? (
            <button
              onClick={() => {
                if (isExamMode) {
                  saveDraftAnswerMutation.mutate({ itemId: currentItem!.id, answer: userAnswer });
                } else {
                  submitAnswerMutation.mutate({ itemId: currentItem!.id, answer: userAnswer });
                }
              }}
              hidden={!isExamMode && !!currentQuestionType && AUTO_SUBMIT_QUESTION_TYPES.has(currentQuestionType)}
              disabled={!userAnswer.trim() || submitAnswerMutation.isPending || saveDraftAnswerMutation.isPending}
              className="w-full sm:w-auto bg-brand-500 text-brand-900 px-10 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {isExamMode ? '저장 후 다음' : '정답 제출'}
            </button>
          ) : (
            currentItemIndex < (itemsData?.length || 1) - 1 ? (
              <button
                onClick={handleNext}
                className="w-full sm:w-auto bg-surface-raised text-white border border-white/[0.1] px-10 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
              >
                다음 문제
              </button>
            ) : (
              <button
                onClick={() => {
                  void handleViewResults();
                }}
                disabled={completeQuizMutation.isPending}
                className="w-full sm:w-auto bg-brand-500 text-brand-900 px-10 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
              >
                {completeQuizMutation.isPending ? '결과 정리 중...' : '결과 보기'}
              </button>
            )
          )}
        </div>
      </footer>
      <DiagramModal
        isOpen={diagramModal !== null}
        onClose={() => setDiagramModal(null)}
        conceptKey={diagramModal?.conceptKey ?? ''}
        conceptLabel={diagramModal?.conceptLabel ?? ''}
      />
    </div>
  );
}
