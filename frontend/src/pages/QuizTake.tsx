import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { quizApi } from '@/api';
import { useQuizStore } from '@/stores';
import { gradeLocally } from '@/utils/gradeLocally';
import type { AnswerLogEntry, AnswerResponse, BatchAnswerSubmit } from '@/types';
import type { LocalGradeResult } from '@/utils/gradeLocally';
import type { QuizItemDetail } from '@/types/quiz';
import { ChevronLeft, ChevronRight, AlertCircle, X } from 'lucide-react';
import { getErrorMessage } from '@/utils/errorMessages';
import QuizGeneratingScreen from '@/components/quiz/QuizGeneratingScreen';
import QuizChoiceOptions from '@/components/quiz/QuizChoiceOptions';
import QuizAnswerFeedback from '@/components/quiz/QuizAnswerFeedback';
import { PillShimmer } from '@/components';
import { useSSE } from '@/hooks/useSSE';
import {
  QUESTION_TYPE_LABELS,
  DEFAULT_OX_OPTIONS,
  AUTO_SUBMIT_QUESTION_TYPES,
  FREE_TEXT_QUESTION_TYPES,
} from '@/utils/quizConstants';

const COMPLETED_STATUSES = new Set(['submitted', 'grading', 'graded', 'regraded', 'closed']);

const QUIZ_REFRESH_INTERVAL_MS = 2000;
const GENERATING_TIMEOUT_MS = 300_000;

const STAGE_LABELS: Record<string, string> = {
  analyzing: '학습 자료를 분석하고 있습니다...',
  generating: 'AI가 문항을 생성하고 있습니다...',
  streaming_questions: '문항을 불러오고 있습니다...',
};

const thinkingMarkdownComponents: Components = {
  p({ children }) {
    return (
      <p className="text-sm text-content-secondary italic leading-relaxed mb-2 last:mb-0">
        {children}
      </p>
    );
  },
  strong({ children }) {
    return (
      <strong className="not-italic font-semibold text-content-primary">
        {children}
      </strong>
    );
  },
  em({ children }) {
    return <em className="italic">{children}</em>;
  },
  h1({ children }) {
    return (
      <h1 className="not-italic text-base font-semibold text-content-primary mt-3 mb-2 first:mt-0">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="not-italic text-sm font-semibold text-content-primary mt-3 mb-1.5 first:mt-0">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="not-italic text-sm font-semibold text-content-primary mt-2 mb-1 first:mt-0">
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="not-italic text-sm font-medium text-content-primary mt-2 mb-1 first:mt-0">
        {children}
      </h4>
    );
  },
  ul({ children }) {
    return (
      <ul className="list-disc pl-5 space-y-0.5 mb-2 text-sm italic text-content-secondary leading-relaxed last:mb-0">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="list-decimal pl-5 space-y-0.5 mb-2 text-sm italic text-content-secondary leading-relaxed last:mb-0">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        className="not-italic text-brand-400 hover:text-brand-300 underline underline-offset-2 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
  code({ children }) {
    return (
      <code className="not-italic bg-surface text-brand-300 px-1.5 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre className="not-italic bg-surface border border-white/[0.05] rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-content-primary">
        {children}
      </pre>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-brand-500/40 pl-3 my-2 text-content-muted italic">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="border-white/[0.05] my-3" />;
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2 rounded-lg border border-white/[0.05]">
        <table className="w-full text-xs not-italic border-collapse">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-surface">{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="text-left px-2.5 py-1.5 text-content-primary font-medium border-b border-white/[0.05]">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="px-2.5 py-1.5 text-content-secondary border-b border-white/[0.05]">
        {children}
      </td>
    );
  },
};

interface QuizStreamingViewProps {
  stage: string | null;
  items: QuizItemDetail[];
  total: number;
  thinkingText: string;
  thinkingActive: boolean;
  onCancel: () => void;
}

function QuizStreamingView({ stage, items, total, thinkingText, thinkingActive, onCancel }: QuizStreamingViewProps) {
  const isStreamingQuestions = stage === 'streaming_questions';
  const progressPct = total > 0 ? (items.length / total) * 100 : 0;
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const hasThinking = thinkingText.length > 0;

  const headerLabel = isStreamingQuestions
    ? '문항 생성 중'
    : thinkingActive
      ? '생각 중'
      : '준비 중';

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-12 animate-fade-in">
      <header className="space-y-4">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="text-xs font-medium text-content-muted">
              {headerLabel}
            </div>
            {isStreamingQuestions ? (
              <div className="text-3xl font-semibold tabular-nums text-white">
                <span className="text-white font-semibold">{items.length}</span>
                <span className="text-content-secondary text-2xl font-normal"> / {total}</span>
              </div>
            ) : (
              <div className="text-3xl font-semibold text-white">...</div>
            )}
          </div>
          <button
            onClick={onCancel}
            className="flex items-center justify-center h-9 px-4 bg-surface border border-white/[0.05] rounded-xl text-sm text-content-secondary hover:bg-surface-hover hover:text-white transition-colors"
          >
            취소
          </button>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden border border-white/[0.05]">
          <div
            className="h-full bg-brand-500 transition-all duration-500 ease-out"
            style={{ width: isStreamingQuestions ? `${progressPct}%` : '0%' }}
          />
        </div>
      </header>

      {hasThinking ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setThinkingOpen(prev => !prev)}
            className="flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-white transition-colors"
          >
            <svg
              className={`w-4 h-4 text-brand-400 transition-transform duration-200 ${thinkingOpen ? 'rotate-0' : '-rotate-90'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span>{thinkingActive ? '생각하는 과정' : '생각한 과정'}</span>
          </button>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              thinkingOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="overflow-hidden min-h-0">
              <div className="pl-6 border-l-2 border-brand-500/30">
                <div className="text-sm text-content-secondary italic leading-relaxed">
                  <Markdown
                    components={thinkingMarkdownComponents}
                    remarkPlugins={[remarkGfm]}
                  >
                    {thinkingText}
                  </Markdown>
                  {thinkingActive && (
                    <span className="thinking-cursor not-italic" aria-hidden="true">▊</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !isStreamingQuestions ? (
        <div className="space-y-8">
          <div className="flex flex-col items-start gap-2.5 animate-fade-in-up stagger-1">
            <PillShimmer width={220} />
            <PillShimmer width={160} delay={0.3} opacity={0.75} />
            <PillShimmer width={200} delay={0.55} opacity={0.55} />
            <PillShimmer width={120} delay={0.8} opacity={0.38} />
            <PillShimmer width={80} delay={1.0} opacity={0.22} />
          </div>
          {stage && (
            <p className="text-base text-content-secondary animate-fade-in">
              {STAGE_LABELS[stage] ?? stage}
            </p>
          )}
        </div>
      ) : null}

      <div className="pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-content-muted underline underline-offset-2 transition-colors hover:text-white"
        >
          취소하고 돌아가기
        </button>
      </div>
    </div>
  );
}

function buildSyntheticResult(localResult: LocalGradeResult, userAnswer: string): AnswerResponse {
  return {
    answer_log_id: '',
    judgement: localResult.judgement,
    score_awarded: localResult.score_awarded,
    max_score: localResult.max_score,
    grading_confidence: localResult.judgement === 'pending_ai' ? null : 1.0,
    grading_rationale: null,
    explanation: localResult.explanation,
    tips: null,
    missing_points: null,
    error_type: localResult.error_type,
    normalized_user_answer: userAnswer.trim().toLowerCase(),
    suggested_feedback: null,
    next_item_id: null,
    correct_answer: localResult.judgement !== 'correct' ? localResult.correct_answer : null,
  };
}

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
  const [gradingItemId, setGradingItemId] = useState<string | null>(null);
  const [isAiGradingDisabled, setIsAiGradingDisabled] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const currentItemIdRef = useRef<string | undefined>(undefined);
  const [streamedItems, setStreamedItems] = useState<QuizItemDetail[]>([]);
  const [streamStage, setStreamStage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamTotal, setStreamTotal] = useState(0);
  const [streamFailed, setStreamFailed] = useState(false);
  const [thinkingText, setThinkingText] = useState<string>('');
  const [thinkingActive, setThinkingActive] = useState<boolean>(false);
  const [generatingTooLong, setGeneratingTooLong] = useState(false);

  const { data: sessionData, isLoading: sessionLoading, isError: sessionIsError, error: sessionError } = useQuery({
    queryKey: ['quizSession', sessionId],
    queryFn: () => quizApi.getQuizSession(sessionId || ''),
    enabled: !!sessionId,
    refetchInterval: (query) =>
      query.state.data?.status === 'generating'
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

  useEffect(() => {
    const isGenerating = sessionData?.status === 'generating' || isStreaming;
    if (!isGenerating) {
      setGeneratingTooLong(false);
      return;
    }
    const timer = setTimeout(() => setGeneratingTooLong(true), GENERATING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [sessionData?.status, isStreaming]);

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

      if (sessionData.status === 'draft') {
        return false;
      }

      if (sessionData.status === 'generating') {
        return QUIZ_REFRESH_INTERVAL_MS;
      }

      if (sessionData.status === 'ready' && (query.state.data?.length ?? 0) === 0) {
        return QUIZ_REFRESH_INTERVAL_MS;
      }

      return false;
    },
  });

  const shouldStream = !!sessionData && sessionData.status === 'draft' && !!sessionId && !itemsData?.length && !streamFailed;

  const { close: closeSSE } = useSSE(
    `/quiz-sessions/${sessionId}/generate/stream`,
    {
      enabled: shouldStream,
      onMessage: (data: unknown) => {
        const msg = data as {
          type: string;
          stage?: string;
          total?: number;
          item?: QuizItemDetail;
          index?: number;
          text?: string;
        };
        if (msg.type === 'stage') {
          setStreamStage(msg.stage ?? null);
          if (msg.stage === 'streaming_questions' && msg.total) {
            setStreamTotal(msg.total);
          }
          setIsStreaming(true);
        } else if (msg.type === 'thinking_start') {
          setThinkingActive(true);
          setThinkingText('');
        } else if (msg.type === 'thinking_chunk' && msg.text) {
          setThinkingText(prev => prev + msg.text);
        } else if (msg.type === 'thinking_end') {
          setThinkingActive(false);
        } else if (msg.type === 'question' && msg.item) {
          setStreamedItems(prev => [...prev, msg.item!]);
        }
      },
      onDone: () => {
        setIsStreaming(false);
        setStreamStage(null);
        setThinkingActive(false);
        queryClient.invalidateQueries({ queryKey: ['quizSession', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['quizItems', sessionId] });
      },
      onError: () => {
        setIsStreaming(false);
        setStreamStage(null);
        setThinkingActive(false);
        setStreamFailed(true);
        queryClient.invalidateQueries({ queryKey: ['quizSession', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['quizItems', sessionId] });
      },
    }
  );

  const isCompleted = !!sessionData && COMPLETED_STATUSES.has(sessionData.status);
  const isInProgress = !!sessionData && sessionData.status === 'in_progress';
  const isExamSession = sessionData?.mode === 'exam';

  const { data: answerLogsData } = useQuery({
    queryKey: ['answerLogs', sessionId],
    queryFn: () => quizApi.getAnswerLogs(sessionId || ''),
    enabled: !!sessionId && (isCompleted || (isInProgress && !isExamSession)),
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
    if (!isExamSession || !itemsData?.length || isCompleted) return;
    const mapCopy = currentAnswerMapRef.current;
    if (Object.keys(mapCopy).length === 0) return;
    const drafts = { ...mapCopy };
    setDraftAnswers(drafts);
    setSubmittedAnswers(drafts);
    const answeredCount = Object.keys(drafts).length;
    const nextIndex = Math.min(answeredCount, itemsData.length - 1);
    setFurthestAvailableIndex(nextIndex);
    setCurrentItemIndex(nextIndex);
    setUserAnswer(drafts[itemsData[nextIndex].id] || '');
    setIsSubmitted(false);
    setAnswerResult(null);
  }, [isExamSession, itemsData, isCompleted]);

  const submitBatchMutation = useMutation({
    mutationFn: (data: BatchAnswerSubmit) =>
      quizApi.submitBatchAnswers(sessionId || '', data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quizSession', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-history'] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-history-full'] }),
        queryClient.invalidateQueries({ queryKey: ['wrongNotes'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['answerLogs', sessionId] }),
      ]);
      navigate(`/quiz/${sessionId}/results`);
    },
    onError: (err) => {
      if (isAxiosError(err) && err.response?.status === 402) {
        setCreditError(true);
      }
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: () => quizApi.completeQuizSession(sessionId || ''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quizSession', sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-history'] }),
        queryClient.invalidateQueries({ queryKey: ['quiz-history-full'] }),
        queryClient.invalidateQueries({ queryKey: ['wrongNotes'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['answerLogs', sessionId] }),
      ]);
      navigate(`/quiz/${sessionId}/results`);
    },
    onError: (err) => {
      if (isAxiosError(err) && err.response?.status === 402) {
        setCreditError(true);
      }
    },
  });

  const submitAnswerMutation = useMutation({
    mutationFn: ({ itemId, answer }: { itemId: string; answer: string }) =>
      quizApi.submitAnswer(sessionId || '', itemId, { user_answer: answer }),
    onSuccess: (result, variables) => {
      if (result.suggested_feedback) {
        suggestedFeedbackRef.current[variables.itemId] = result.suggested_feedback;
      }
      setAnswerResultsByItemId((prev) => ({ ...prev, [variables.itemId]: result }));
      if (currentItemIdRef.current === variables.itemId) {
        setAnswerResult(result);
        setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }), 50);
      }
      setGradingItemId((prev) => (prev === variables.itemId ? null : prev));
    },
    onError: (_err, variables) => {
      setGradingItemId((prev) => (prev === variables.itemId ? null : prev));
      if (isAxiosError(_err) && _err.response?.status === 402) {
        setCreditError(true);
      }
    },
  });

  const currentItem = itemsData?.[currentItemIndex];
  const currentQuestionType = typeof currentItem?.question_type === 'string' ? currentItem.question_type : null;
  const isExamMode = currentSession?.mode === 'exam';
  const isChoiceQuestion =
    currentQuestionType === 'multiple_choice' || currentQuestionType === 'ox';
  const rawOptions = currentItem?.options as Record<string, string> | null | undefined;
  const hasOptions = rawOptions != null && Object.keys(rawOptions).length > 0;
  const choiceOptions = isChoiceQuestion
    ? (hasOptions ? rawOptions : (currentQuestionType === 'ox' ? DEFAULT_OX_OPTIONS : null))
    : null;
  const optionDescriptions = currentItem?.option_descriptions as Record<string, string | null> | null;

  const handleAnswerGrade = (itemId: string, answer: string, localResult: LocalGradeResult) => {
    const syntheticResult = buildSyntheticResult(localResult, answer);
    setAnswerResult(syntheticResult);
    setIsSubmitted(true);
    setCurrentAnswer(itemId, answer);
    setDraftAnswers((prev) => ({ ...prev, [itemId]: answer }));
    setSubmittedAnswers((prev) => ({ ...prev, [itemId]: answer }));
    setAnswerResultsByItemId((prev) => ({ ...prev, [itemId]: syntheticResult }));
    setFurthestAvailableIndex((prev) =>
      Math.min((itemsData?.length || 1) - 1, Math.max(prev, currentItemIndex + 1))
    );
    if (!isAiGradingDisabled) {
      if (localResult.judgement === 'pending_ai') {
        setGradingItemId(itemId);
      } else {
        setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }), 50);
      }
      submitAnswerMutation.mutate({ itemId, answer });
    } else {
      setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }), 50);
    }
  };

  currentItemIdRef.current = currentItem?.id;

  const applyExamLocalSave = (itemId: string, answer: string) => {
    setCurrentAnswer(itemId, answer);
    setDraftAnswers((prev) => ({ ...prev, [itemId]: answer }));
    setSubmittedAnswers((prev) => ({ ...prev, [itemId]: answer }));
    setFurthestAvailableIndex((prev) =>
      Math.min((itemsData?.length || 1) - 1, Math.max(prev, currentItemIndex + 1))
    );
    if (itemsData && currentItemIndex < itemsData.length - 1) {
      slideQuestion(() => {
        const nextIndex = currentItemIndex + 1;
        setCurrentItemIndex(nextIndex);
        setUserAnswer(draftAnswers[itemsData[nextIndex].id] || '');
        setIsSubmitted(false);
        setAnswerResult(null);
      });
    }
  };

  const isSkippedAnswer =
    !isExamMode &&
    isSubmitted &&
    !!answerResult &&
    answerResult.judgement !== 'correct' &&
    (answerResult.normalized_user_answer ?? '').trim() === '';

  const handleOptionSelect = (optionKey: string) => {
    if (isSubmitted && !isExamMode) return;
    if (submitBatchMutation.isPending) return;
    setUserAnswer(optionKey);

    if (
      !isExamMode &&
      currentItem &&
      currentQuestionType &&
      AUTO_SUBMIT_QUESTION_TYPES.has(currentQuestionType)
    ) {
      handleAnswerGrade(currentItem.id, optionKey, gradeLocally(currentItem, optionKey));
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
    if (submitBatchMutation.isPending) return;

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
    if (!isAiGradingDisabled) {
      submitAnswerMutation.mutate({ itemId: currentItem.id, answer: '' });
    }
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

  const handleViewResults = () => {
    if (!sessionId || !itemsData) return;
    if (isExamMode || isAiGradingDisabled) {
      const answers: BatchAnswerSubmit = {
        answers: itemsData.map((item) => ({
          item_id: item.id,
          user_answer: submittedAnswers[item.id] || '',
        })),
      };
      submitBatchMutation.mutate(answers);
    } else {
      completeSessionMutation.mutate();
    }
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

  if ((shouldStream || isStreaming) && !generatingTooLong) {
    return (
      <QuizStreamingView
        stage={streamStage}
        items={streamedItems}
        total={streamTotal}
        thinkingText={thinkingText}
        thinkingActive={thinkingActive}
        onCancel={() => {
          closeSSE();
          navigate('/quiz/new');
        }}
      />
    );
  }

  if (sessionData.status === 'generating' && !generatingTooLong) {
    return <QuizGeneratingScreen onCancel={() => navigate('/quiz/new')} />;
  }

  if (sessionData.status === 'generation_failed' || generatingTooLong) {
    return (
      <div className="max-w-3xl mx-auto py-32 text-center space-y-6">
        <AlertCircle size={64} className="mx-auto text-semantic-error" />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-white">
            {generatingTooLong ? '퀴즈 생성이 너무 오래 걸리고 있습니다' : '퀴즈 생성에 실패했습니다'}
          </h1>
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
              {currentQuestionType !== 'short_answer' && currentQuestionType !== 'fill_blank' && (
                <span className="text-xs font-medium text-content-muted">
                  {currentItem.concept_label || '개념'}
                </span>
              )}
              {!isExamMode && !isCompleted && currentQuestionType !== null && FREE_TEXT_QUESTION_TYPES.has(currentQuestionType) && (
                <button
                  onClick={() => setIsAiModalOpen(true)}
                  className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                    isAiGradingDisabled
                      ? 'text-content-muted bg-white/[0.04] border-white/[0.08]'
                      : 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15'
                  }`}
                >
                  AI채점
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
                        submitBatchMutation.isPending ||
                        (isSubmitted && !isExamMode) ||
                        isCompleted
                      ) return;
                      if (isExamMode) {
                        applyExamLocalSave(currentItem.id, userAnswer);
                      } else {
                        handleAnswerGrade(currentItem.id, userAnswer, gradeLocally(currentItem, userAnswer));
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

          {isSubmitted && !isExamMode && (
            gradingItemId === currentItem.id ? (
              <div className="animate-fade-in-up p-6 rounded-2xl border border-brand-500/20 bg-brand-500/5">
                <div className="flex items-center gap-3 text-sm text-content-secondary">
                  <div className="w-4 h-4 border-2 border-brand-400/40 border-t-brand-400 rounded-full animate-spin flex-shrink-0" />
                  AI 채점 중...
                </div>
              </div>
            ) : answerResult ? (
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
            ) : null
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
                    disabled={submitBatchMutation.isPending}
                   className="flex-1 sm:flex-none h-12 px-6 bg-surface border border-white/[0.08] rounded-xl text-sm font-medium text-content-secondary hover:bg-surface-hover hover:text-white transition-colors disabled:opacity-30 group relative"
                 >
                   <span className="inline-block opacity-100 group-hover:opacity-0 transition-opacity duration-200">모르겠어요</span>
                   <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">건너뛰기</span>
                 </button>
               )}
              <button
                onClick={() => {
                  if (!currentItem) return;
                  if (isExamMode) {
                    applyExamLocalSave(currentItem.id, userAnswer);
                  } else {
                    handleAnswerGrade(currentItem.id, userAnswer, gradeLocally(currentItem, userAnswer));
                  }
                }}
                hidden={!isExamMode && !!currentQuestionType && AUTO_SUBMIT_QUESTION_TYPES.has(currentQuestionType)}
                disabled={!userAnswer.trim() || submitBatchMutation.isPending}
                className="flex-1 sm:flex-none w-full sm:w-auto bg-brand-500 text-brand-900 px-10 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {isExamMode ? '다음' : '정답 제출'}
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
                onClick={handleViewResults}
                disabled={submitBatchMutation.isPending || completeSessionMutation.isPending}
                className="w-full sm:w-auto bg-brand-500 text-brand-900 px-10 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
              >
                {(submitBatchMutation.isPending || completeSessionMutation.isPending) ? '채점 중...' : '결과 보기'}
              </button>
            )
          )}
        </div>
      </footer>

      {isAiModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          onClick={() => setIsAiModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-surface-raised rounded-2xl border border-white/[0.08] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-base font-semibold text-white">AI채점 비활성화</h2>
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="flex items-center justify-center w-7 h-7 rounded-lg text-content-muted hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-content-secondary leading-relaxed">
                크레딧 사용을 절감하기 위해 AI 채점을<br />임시적으로 비활성화할 수 있습니다.
              </p>
              <p className="text-sm text-semantic-error leading-relaxed">
                답안과 정확히 일치하지 않으면<br />채점 결과에 오류가 있을 수 있습니다.
              </p>
              <button
                onClick={() => {
                  setIsAiGradingDisabled((v) => !v);
                  setIsAiModalOpen(false);
                }}
                className={`w-full h-11 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0 ${
                  isAiGradingDisabled
                    ? 'bg-brand-500 text-brand-900'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15'
                }`}
              >
                {isAiGradingDisabled ? '다시 활성화하기' : '비활성화하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
