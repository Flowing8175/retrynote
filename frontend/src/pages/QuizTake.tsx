import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quizApi } from '@/api';
import { useQuizStore } from '@/stores';
import type { AnswerLogEntry, AnswerResponse } from '@/types';
import { ChevronLeft, ChevronRight, AlertCircle, Waypoints } from 'lucide-react';
import DiagramModal from '@/components/DiagramModal';
import { getErrorMessage } from '@/utils/errorMessages';
import QuizGeneratingScreen from '@/components/quiz/QuizGeneratingScreen';
import QuizChoiceOptions from '@/components/quiz/QuizChoiceOptions';
import QuizAnswerFeedback from '@/components/quiz/QuizAnswerFeedback';
import {
  QUESTION_TYPE_LABELS,
  DEFAULT_OX_OPTIONS,
  AUTO_SUBMIT_QUESTION_TYPES,
  FREE_TEXT_QUESTION_TYPES,
} from '@/utils/quizConstants';

const COMPLETED_STATUSES = new Set(['submitted', 'grading', 'graded', 'regraded', 'closed']);

const QUIZ_REFRESH_INTERVAL_MS = 2000;

function formatCorrectAnswerLabel(
  correctAnswer: Record<string, unknown> | null | undefined,
  options: Record<string, string> | null,
) {
  if (!correctAnswer) return null;

  const rawAnswer = correctAnswer['answer'];
  if (typeof rawAnswer === 'string') {
    const normalizedAnswer = rawAnswer.trim();
    if (!normalizedAnswer) return null;
    if (!options) return normalizedAnswer;

    const resolved = options[normalizedAnswer];
    return typeof resolved === 'string' && resolved.trim() ? resolved : normalizedAnswer;
  }

  if (typeof rawAnswer === 'number' || typeof rawAnswer === 'boolean') {
    return String(rawAnswer);
  }

  return null;
}

function QuizTakeSkeleton() {
  return (
    <div className="max-w-4xl mx-auto py-8 space-y-12 animate-pulse" aria-hidden="true">
      <header className="space-y-4">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="skeleton h-3 w-16 rounded-md" />
            <div className="skeleton h-9 w-20 rounded-md" />
          </div>
          <div className="skeleton h-8 w-20 rounded-lg" />
        </div>
        <div className="skeleton h-2 w-full rounded-full" />
      </header>

      <section className="space-y-10">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="skeleton h-6 w-14 rounded-md" />
            <div className="skeleton h-4 w-20 rounded-md" />
          </div>
          <div className="space-y-2">
            <div className="skeleton h-8 w-full rounded-md" />
            <div className="skeleton h-8 w-3/4 rounded-md" />
          </div>
        </div>

        <div className="grid gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      </section>

      <footer className="pt-8 flex items-center justify-between">
        <div className="flex gap-3">
          <div className="skeleton h-12 w-16 rounded-xl" />
          <div className="skeleton h-12 w-16 rounded-xl" />
        </div>
        <div className="skeleton h-12 w-28 rounded-xl" />
      </footer>
    </div>
  );
}

export default function QuizTake() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentSession, currentAnswerMap, setCurrentSession, setCurrentItems, setCurrentAnswer } = useQuizStore();
  const currentAnswerMapRef = useRef(currentAnswerMap);
  const headerRef = useRef<HTMLElement>(null);


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
  const suggestedFeedbackRef = useRef<Record<string, string>>({});
  const justCompletedRef = useRef(false);
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

  useEffect(() => {
    if (sessionData?.status === 'generation_failed' && sessionData.error_message?.startsWith('INVALID_INPUT:')) {
      const reason = sessionData.error_message.slice('INVALID_INPUT:'.length);
      navigate('/quiz/new', {
        replace: true,
        state: { inputError: reason, inputSourceMode: sessionData.source_mode },
      });
    }
  }, [sessionData?.status, sessionData?.error_message, sessionData?.source_mode, navigate]);

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
  const isInProgress = !!sessionData && sessionData.status === 'in_progress';
  const isExamSession = sessionData?.mode === 'exam';

  const { data: answerLogsData } = useQuery({
    queryKey: ['answerLogs', sessionId],
    queryFn: () => quizApi.getAnswerLogs(sessionId || ''),
    enabled: !!sessionId && (isCompleted || (isInProgress && !isExamSession)),
  });

  const { data: draftAnswersData } = useQuery({
    queryKey: ['draftAnswers', sessionId],
    queryFn: () => quizApi.getDraftAnswers(sessionId || ''),
    enabled: !!sessionId && isInProgress && isExamSession,
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
      const savedFeedback = suggestedFeedbackRef.current[log.item_id];
      results[log.item_id] = {
        ...(log as AnswerLogEntry),
        next_item_id: null,
        ...(savedFeedback ? { suggested_feedback: savedFeedback } : {}),
      } as AnswerResponse;
    }
    setSubmittedAnswers(submitted);
    setDraftAnswers(submitted);
    setAnswerResultsByItemId(results);

    if (isCompleted) {
      // Completed: allow free navigation
      setFurthestAvailableIndex(itemsData.length - 1);
      // If the session just completed in this interaction, stay on the current
      // question — don't reset to the first one and clobber the displayed result.
      if (justCompletedRef.current) {
        justCompletedRef.current = false;
        return;
      }
      const firstItem = itemsData[0];
      if (submitted[firstItem.id]) {
        setUserAnswer(submitted[firstItem.id]);
        setIsSubmitted(true);
        setAnswerResult(results[firstItem.id] ?? null);
      }
    } else {
      // In-progress (normal mode): resume at the next unanswered question
      const answeredCount = Object.keys(submitted).length;
      const nextIndex = Math.min(answeredCount, itemsData.length - 1);
      setFurthestAvailableIndex(nextIndex);
      setCurrentItemIndex(nextIndex);
      const nextItem = itemsData[nextIndex];
      if (submitted[nextItem.id]) {
        setUserAnswer(submitted[nextItem.id]);
        setIsSubmitted(true);
        setAnswerResult(results[nextItem.id] ?? null);
      } else {
        setUserAnswer('');
        setIsSubmitted(false);
        setAnswerResult(null);
      }
    }
  }, [answerLogsData, itemsData, isCompleted]);

  useEffect(() => {
    if (!draftAnswersData || !itemsData?.length) return;
    const drafts: Record<string, string> = {};
    for (const d of draftAnswersData) {
      drafts[d.item_id] = d.user_answer;
    }
    setDraftAnswers(drafts);
    setSubmittedAnswers(drafts);
    const answeredCount = Object.keys(drafts).length;
    const nextIndex = Math.min(answeredCount, itemsData.length - 1);
    setFurthestAvailableIndex(nextIndex);
    setCurrentItemIndex(nextIndex);
    const nextItem = itemsData[nextIndex];
    setUserAnswer(drafts[nextItem.id] || '');
    setIsSubmitted(false);
  }, [draftAnswersData, itemsData]);

  const submitAnswerMutation = useMutation({
    mutationFn: (data: { itemId: string; answer: string }) =>
      quizApi.submitAnswer(sessionId || '', data.itemId, { user_answer: data.answer }),
    onError: (err) => {
      if (isAxiosError(err) && err.response?.status === 402) {
        setCreditError(true);
      }
    },
    onSuccess: (result, variables) => {
      if (result.suggested_feedback) {
        suggestedFeedbackRef.current[variables.itemId] = result.suggested_feedback;
      }
      setAnswerResult(result);
      setIsSubmitted(true);
      setCurrentAnswer(variables.itemId, variables.answer);
      setDraftAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setSubmittedAnswers((prev) => ({ ...prev, [variables.itemId]: variables.answer }));
      setAnswerResultsByItemId((prev) => ({ ...prev, [variables.itemId]: result }));
      setFurthestAvailableIndex((prev) => Math.min((itemsData?.length || 1) - 1, Math.max(prev, currentItemIndex + 1)));
      setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }), 50);

      if (!result.next_item_id && sessionData?.mode === 'normal' && sessionId) {
        completeQuizMutation.mutate();
      }
    },
  });

  const completeQuizMutation = useMutation({
    mutationFn: () => quizApi.completeQuizSession(sessionId || ''),
    onSuccess: async () => {
      justCompletedRef.current = true;
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
  const optionDescriptions = currentItem?.option_descriptions as Record<string, string> | null;
  const isSkippedAnswer =
    !isExamMode &&
    isSubmitted &&
    !!answerResult &&
    answerResult.judgement !== 'correct' &&
    (answerResult.normalized_user_answer ?? '').trim() === '';

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

  const [questionFading, setQuestionFading] = useState(false);

  const slideQuestion = (fn: () => void) => {
    setQuestionFading(true);
    setTimeout(() => {
      fn();
      requestAnimationFrame(() => setQuestionFading(false));
    }, 150);
  };

  const scrollToHeader = () => {
    if (headerRef.current) {
      const top = headerRef.current.getBoundingClientRect().top + window.scrollY - 32;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  };

  const handleNext = () => {
    if (!itemsData || currentItemIndex >= itemsData.length - 1) return;
    slideQuestion(() => {
      const nextIndex = currentItemIndex + 1;
      setCurrentItemIndex(nextIndex);
      setIsSubmitted(!!submittedAnswers[itemsData[nextIndex].id]);
      setAnswerResult(answerResultsByItemId[itemsData[nextIndex].id] || null);
      setUserAnswer(submittedAnswers[itemsData[nextIndex].id] || draftAnswers[itemsData[nextIndex].id] || '');
    });
  };

  const handleNextWithScroll = () => {
    if (!itemsData || currentItemIndex >= itemsData.length - 1) return;
    slideQuestion(() => {
      const nextIndex = currentItemIndex + 1;
      setCurrentItemIndex(nextIndex);
      setIsSubmitted(!!submittedAnswers[itemsData[nextIndex].id]);
      setAnswerResult(answerResultsByItemId[itemsData[nextIndex].id] || null);
      setUserAnswer(submittedAnswers[itemsData[nextIndex].id] || draftAnswers[itemsData[nextIndex].id] || '');
      scrollToHeader();
    });
  };

  const handleSkip = () => {
    if (!itemsData || currentItemIndex >= itemsData.length - 1 || !currentItem) return;
    if (submitAnswerMutation.isPending || saveDraftAnswerMutation.isPending) return;

    if (isExamMode) {
      slideQuestion(() => {
        const nextIndex = currentItemIndex + 1;
        setFurthestAvailableIndex((prev) => Math.max(prev, nextIndex));
        setCurrentItemIndex(nextIndex);
        setIsSubmitted(!!submittedAnswers[itemsData[nextIndex].id]);
        setAnswerResult(answerResultsByItemId[itemsData[nextIndex].id] || null);
        setUserAnswer(submittedAnswers[itemsData[nextIndex].id] || draftAnswers[itemsData[nextIndex].id] || '');
        scrollToHeader();
      });
      return;
    }

    // Build skip result from item data already available on the client.
    // This avoids depending on the backend grading an empty-string answer.
    const skipResult: AnswerResponse = {
      answer_log_id: `skip-${currentItem.id}`,
      judgement: 'incorrect',
      score_awarded: 0,
      max_score: 1,
      grading_confidence: null,
      grading_rationale: null,
      explanation: currentItem.explanation ?? null,
      tips: currentItem.tips ?? null,
      missing_points: null,
      error_type: null,
      normalized_user_answer: '',
      suggested_feedback: null,
      next_item_id: null,
      correct_answer: currentItem.correct_answer ?? null,
    };

    setUserAnswer('');
    setAnswerResult(skipResult);
    setIsSubmitted(true);
    setDraftAnswers((prev) => ({ ...prev, [currentItem.id]: '' }));
    setSubmittedAnswers((prev) => ({ ...prev, [currentItem.id]: '' }));
    setAnswerResultsByItemId((prev) => ({ ...prev, [currentItem.id]: skipResult }));
    setFurthestAvailableIndex((prev) => Math.min((itemsData.length || 1) - 1, Math.max(prev, currentItemIndex + 1)));

    // Also submit to backend for recording (fire-and-forget).
    submitAnswerMutation.mutate({ itemId: currentItem.id, answer: '' });
  };

  const handlePrev = () => {
    if (currentItemIndex <= 0 || !itemsData) return;
    slideQuestion(() => {
      const prevIndex = currentItemIndex - 1;
      setCurrentItemIndex(prevIndex);
      setIsSubmitted(!!submittedAnswers[itemsData[prevIndex].id]);
      setAnswerResult(answerResultsByItemId[itemsData[prevIndex].id] || null);
      setUserAnswer(submittedAnswers[itemsData[prevIndex].id] || draftAnswers[itemsData[prevIndex].id] || '');
    });
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
    return <QuizTakeSkeleton />;
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
    return <QuizGeneratingScreen onCancel={() => navigate('/quiz/new')} />;
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
    return <QuizTakeSkeleton />;
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
      <header ref={headerRef} className="space-y-4">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium text-content-muted">진행 상황</div>
            <div className="text-3xl font-semibold tabular-nums text-white">
              <span className="text-white font-semibold">{currentItemIndex + 1}</span>
              <span className="text-content-secondary text-2xl font-normal"> / {itemsData?.length}</span>
            </div>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center h-9 px-4 bg-surface border border-white/[0.05] rounded-xl text-sm text-content-secondary hover:bg-surface-hover hover:text-white transition-colors"
          >
            나가기
          </button>
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
        <section className={`space-y-10 transition-opacity duration-150 ease-out ${questionFading ? 'opacity-0' : 'opacity-100'}`}>
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
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-300/80 hover:text-brand-200 bg-brand-500/8 hover:bg-brand-500/15 px-2.5 py-1 rounded-md border border-brand-500/15 hover:border-brand-500/25 transition-colors"
                >
                  <Waypoints size={12} />
                  다이어그램
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
              <QuizChoiceOptions
                options={choiceOptions}
                optionDescriptions={optionDescriptions}
                selectedAnswer={userAnswer}
                correctAnswer={answerResult?.correct_answer?.answer as string | null | undefined}
                judgement={answerResult?.judgement}
                questionType={currentQuestionType ?? ''}
                isResultShown={isSubmitted && !isExamMode}
                isDisabled={(isSubmitted && !isExamMode) || isCompleted}
                onSelect={handleOptionSelect}
              />
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

          {isSubmitted && !isExamMode && answerResult && (
            <QuizAnswerFeedback
              judgement={answerResult.judgement}
              headline={isSkippedAnswer ? '건너뛰었습니다' : undefined}
              correctAnswerLabel={formatCorrectAnswerLabel(answerResult.correct_answer, choiceOptions)}
              feedbackText={
                isSkippedAnswer
                  ? answerResult.explanation || answerResult.suggested_feedback
                  : answerResult.suggested_feedback || answerResult.explanation
              }
            />
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
             <div className="flex items-center gap-3 w-full sm:w-auto">
               {currentItemIndex < (itemsData?.length || 1) - 1 && !isSubmitted && (
                 <button
                   onClick={handleSkip}
                   disabled={submitAnswerMutation.isPending || saveDraftAnswerMutation.isPending}
                   className="flex-1 sm:flex-none h-12 px-6 bg-surface border border-white/[0.08] rounded-xl text-sm font-medium text-content-secondary hover:bg-surface-hover hover:text-white transition-colors disabled:opacity-30 group relative"
                 >
                   <span className="inline-block opacity-100 group-hover:opacity-0 transition-opacity duration-200">모르겠어요</span>
                   <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">건너뛰기</span>
                 </button>
               )}
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
                className="flex-1 sm:flex-none w-full sm:w-auto bg-brand-500 text-brand-900 px-10 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {isExamMode ? '저장 후 다음' : '정답 제출'}
              </button>
            </div>
          ) : (
            currentItemIndex < (itemsData?.length || 1) - 1 ? (
              <button
                onClick={handleNextWithScroll}
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
