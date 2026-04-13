import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { guestApi } from '@/api/guestClient';
import type { GuestQuizSession, GuestQuizItem, GuestAnswerResult } from '@/types/guest';
import QuizGeneratingScreen from '@/components/quiz/QuizGeneratingScreen';
import QuizChoiceOptions from '@/components/quiz/QuizChoiceOptions';
import QuizAnswerFeedback from '@/components/quiz/QuizAnswerFeedback';
import {
  QUESTION_TYPE_LABELS,
  DEFAULT_OX_OPTIONS,
  AUTO_SUBMIT_QUESTION_TYPES,
  FREE_TEXT_QUESTION_TYPES,
} from '@/utils/quizConstants';

export default function TryQuizTake() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<GuestQuizSession | null>(null);
  const [items, setItems] = useState<GuestQuizItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<GuestAnswerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentItem = items[currentIndex];
  const currentQuestionType = currentItem?.question_type ?? null;
  const isChoiceQuestion = currentQuestionType === 'multiple_choice' || currentQuestionType === 'ox';
  const choiceOptions: Record<string, string> | null = isChoiceQuestion
    ? (currentItem?.options_json ?? (currentQuestionType === 'ox' ? DEFAULT_OX_OPTIONS : null))
    : null;
  const optionDescriptions = currentItem?.option_descriptions_json ?? null;

  const fetchSession = async () => {
    if (!sessionId) return;
    try {
      const s = await guestApi.getQuizSession(sessionId);
      setSession(s);
      return s;
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        setNotFound(true);
      } else {
        setError('세션을 불러오는 중 오류가 발생했습니다.');
      }
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    if (!sessionId) return;

    const init = async () => {
      const s = await fetchSession();
      if (!s) return;

      if (s.status === 'ready' || s.status === 'in_progress' || s.status === 'graded') {
        try {
          const fetchedItems = await guestApi.getQuizItems(sessionId);
          setItems(fetchedItems);
        } catch {
          setError('문제를 불러오는 중 오류가 발생했습니다.');
        }
        setLoading(false);
      } else if (s.status === 'generation_failed') {
        setLoading(false);
      } else {
        // draft or generating — poll
        setLoading(false);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Poll when status is draft/generating
  useEffect(() => {
    if (!session) return;
    if (session.status === 'draft' || session.status === 'generating') {
      pollingRef.current = setInterval(async () => {
        if (!sessionId) return;
        const s = await fetchSession();
        if (!s) return;
        if (s.status === 'ready' || s.status === 'in_progress') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          try {
            const fetchedItems = await guestApi.getQuizItems(sessionId);
            setItems(fetchedItems);
          } catch {
            setError('문제를 불러오는 중 오류가 발생했습니다.');
          }
        } else if (s.status === 'generation_failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      }, 2000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  const handleSubmitWithAnswer = async (answerValue: string) => {
    if (!sessionId || !currentItem || !answerValue.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await guestApi.submitAnswer(sessionId, currentItem.id, { user_answer: answerValue });
      setResult(res);
    } catch {
      setSubmitError('답변 제출 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOptionSelect = (key: string) => {
    if (result || submitting) return;
    setAnswer(key);
    if (currentItem && AUTO_SUBMIT_QUESTION_TYPES.has(currentItem.question_type)) {
      void handleSubmitWithAnswer(key);
    }
  };

  const handleSubmit = () => {
    void handleSubmitWithAnswer(answer);
  };

  const handleNext = () => {
    if (currentIndex + 1 >= items.length) {
      navigate(`/try/quiz/${sessionId}/results`);
    } else {
      setCurrentIndex((i) => i + 1);
      setAnswer('');
      setResult(null);
      setSubmitError('');
    }
  };

  const total = items.length;
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
  const isLastQuestion = currentIndex + 1 >= total;

  // ---- Render states ----

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface-deep flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-xl font-semibold text-content-primary mb-2">세션을 찾을 수 없습니다</p>
          <p className="text-sm text-content-secondary mb-4">퀴즈가 만료되었거나 존재하지 않습니다.</p>
          <Link to="/try" className="inline-block text-sm font-semibold text-brand-300 hover:text-brand-400 transition-colors">
            새 퀴즈 만들기
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-deep flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-xl font-semibold text-semantic-error mb-4">{error}</p>
          <Link to="/try" className="inline-block text-sm font-semibold text-brand-300 hover:text-brand-400 transition-colors">
            새 퀴즈 만들기
          </Link>
        </div>
      </div>
    );
  }

  if (session?.status === 'generation_failed') {
    return (
      <div className="min-h-screen bg-surface-deep flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-xl font-semibold text-semantic-error mb-2">문제 생성에 실패했습니다.</p>
          <p className="mt-2 text-sm text-content-secondary mb-4">다시 시도해주세요.</p>
          <Link to="/try" className="inline-block text-sm font-semibold text-brand-300 hover:text-brand-400 transition-colors">
            새 퀴즈 만들기
          </Link>
        </div>
      </div>
    );
  }

  const isPreparingOrLoading = loading || !session || session.status === 'draft' || session.status === 'generating' || items.length === 0;

  if (isPreparingOrLoading) {
    return <QuizGeneratingScreen variant="fullscreen" />;
  }

  return (
    <div className="min-h-screen bg-surface-deep flex flex-col">
      <header className="flex items-center px-6 py-4 border-b border-white/[0.08] flex-shrink-0">
        <span className="text-lg font-bold text-content-primary">RetryNote</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-8 space-y-12 px-4 sm:px-6">

          <header
            className="space-y-4"
            role="progressbar"
            aria-valuenow={currentIndex + 1}
            aria-valuemin={1}
            aria-valuemax={total}
          >
            <div className="flex items-end justify-between">
              <div className="space-y-1">
                <div className="text-xs font-medium text-content-muted">진행 상황</div>
                <div className="text-3xl font-semibold tabular-nums text-white">
                  <span className="text-white font-semibold">{currentIndex + 1}</span>
                  <span className="text-content-secondary text-2xl font-normal"> / {total}</span>
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

          <section className="animate-fade-in-up space-y-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-brand-300 bg-brand-500/10 px-2.5 py-1 rounded-md border border-brand-500/20">
                  {QUESTION_TYPE_LABELS[currentItem.question_type] ?? currentItem.question_type}
                </span>
              </div>
              <h2 className="text-3xl font-semibold leading-relaxed text-white">
                {currentItem.question_text}
              </h2>
            </div>

            <div className="space-y-4">
              {choiceOptions && (
                <QuizChoiceOptions
                  options={choiceOptions}
                  optionDescriptions={optionDescriptions}
                  selectedAnswer={answer}
                  correctAnswer={result?.correct_answer}
                  judgement={result?.judgement}
                  questionType={currentQuestionType ?? ''}
                  isResultShown={result !== null}
                  isDisabled={result !== null || submitting}
                  onSelect={handleOptionSelect}
                />
              )}

              {currentQuestionType !== null && FREE_TEXT_QUESTION_TYPES.has(currentQuestionType) && (
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!answer.trim() || submitting || result) return;
                      handleSubmit();
                    }
                  }}
                  disabled={result !== null || submitting}
                  placeholder="답변을 입력하세요... (Enter로 제출, Shift+Enter로 줄바꿈)"
                  className="w-full bg-surface border border-white/[0.05] rounded-2xl text-base px-6 py-6 placeholder:text-content-muted focus:ring-2 focus:ring-brand-500 transition-shadow min-h-[200px] resize-y"
                />
              )}
            </div>

            {result && (
              <QuizAnswerFeedback
                judgement={result.judgement}
                feedbackText={result.explanation || result.rationale}
                correctAnswerLabel={!choiceOptions && result.correct_answer ? result.correct_answer : undefined}
              />
            )}
          </section>

          {submitError && (
            <p className="text-sm text-semantic-error">{submitError}</p>
          )}

          <footer className="pt-8 flex items-center justify-end gap-3">
            {!result && !AUTO_SUBMIT_QUESTION_TYPES.has(currentQuestionType ?? '') && (
              <button
                type="button"
                disabled={!answer.trim() || submitting}
                onClick={handleSubmit}
                className="w-full sm:w-auto bg-brand-500 text-brand-900 px-10 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {submitting ? '제출 중…' : '정답 제출'}
              </button>
            )}
            {result && (
              <button
                type="button"
                onClick={handleNext}
                className="w-full sm:w-auto bg-brand-500 text-brand-900 px-10 h-12 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
              >
                {isLastQuestion ? '결과 보기' : '다음 문제'}
              </button>
            )}
          </footer>

        </div>
      </div>
    </div>
  );
}
