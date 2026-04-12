import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { guestApi } from '@/api/guestClient';
import type { GuestQuizSession, GuestQuizItem, GuestAnswerResult } from '@/types/guest';
import { PillShimmer } from '@/components';

const generatingPhrases = [
  '학습 자료 분석 중...',
  '핵심 개념 추출 중...',
  '문항 설계 중...',
  '정답 및 해설 작성 중...',
  '마지막 검토 중...',
  '거의 완성됐어요!',
];

const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: '객관식',
  ox: 'O/X',
  short_answer: '단답형',
  fill_blank: '빈칸 채우기',
  essay: '서술형',
};

const DEFAULT_OX_OPTIONS: Record<string, string> = { O: 'O', X: 'X' };
const AUTO_SUBMIT_QUESTION_TYPES = new Set(['multiple_choice', 'ox']);
const FREE_TEXT_QUESTION_TYPES = new Set(['short_answer', 'essay', 'fill_blank']);

function normalizeOxValue(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function TryQuizGeneratingScreen() {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhraseIndex((i) => (i + 1) % generatingPhrases.length), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-surface-deep flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
        <span className="text-lg font-bold text-content-primary">RetryNote</span>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-6 animate-fade-in">
          <div className="flex flex-col items-center gap-2.5 animate-fade-in-up stagger-1">
            <PillShimmer width={220} />
            <PillShimmer width={160} delay={0.3} opacity={0.75} />
            <PillShimmer width={200} delay={0.55} opacity={0.55} />
            <PillShimmer width={120} delay={0.8} opacity={0.38} />
            <PillShimmer width={80} delay={1.0} opacity={0.22} />
          </div>
          <p key={phraseIndex} className="text-content-secondary text-base animate-fade-in">
            {generatingPhrases[phraseIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

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
    return <TryQuizGeneratingScreen />;
  }

  return (
    <div className="min-h-screen bg-surface-deep flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
        <span className="text-lg font-bold text-content-primary">RetryNote</span>
        <span className="text-sm font-semibold text-content-secondary">
          {currentIndex + 1}/{total} 문제
        </span>
      </header>

      {/* Progress bar */}
      <div
        className="h-1 bg-white/[0.06] w-full"
        role="progressbar"
        aria-valuenow={currentIndex + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`${total}문제 중 ${currentIndex + 1}번째`}
      >
        <div
          className="h-full bg-brand-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          {/* Question card */}
          <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 sm:p-8">
            {/* Type label */}
            <span className="inline-block rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-300 mb-4">
              {QUESTION_TYPE_LABELS[currentItem.question_type] ?? currentItem.question_type}
            </span>

            {/* Question text */}
            <p className="text-lg sm:text-xl font-semibold text-content-primary leading-relaxed mb-6">
              {currentItem.question_text}
            </p>

            {/* Answer input — only if not yet submitted */}
            {!result && (
              <>
                {choiceOptions && (
                  <div className="grid gap-3" role="radiogroup" aria-label="답변 선택">
                    {Object.entries(choiceOptions).map(([key, text]) => {
                      const isOxQuestion = currentQuestionType === 'ox';
                      const isSelected = isOxQuestion
                        ? normalizeOxValue(answer) === normalizeOxValue(key)
                        : answer === key;

                      return (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => handleOptionSelect(key)}
                          disabled={submitting}
                          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors duration-150 ${
                            isSelected
                              ? 'border-brand-500 bg-brand-500/10 text-content-primary'
                              : 'border-white/[0.08] bg-surface-deep/50 text-content-secondary hover:border-white/[0.15] hover:text-content-primary'
                          }`}
                        >
                          <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            isSelected ? 'bg-brand-500 text-brand-900' : 'bg-white/[0.06] text-content-secondary'
                          }`}>
                            {key.toUpperCase()}
                          </span>
                          {text !== key ? text : null}
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestionType !== null && FREE_TEXT_QUESTION_TYPES.has(currentQuestionType) && (
                  <textarea
                    rows={currentQuestionType === 'essay' ? 5 : 2}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!answer.trim() || submitting) return;
                        handleSubmit();
                      }
                    }}
                    placeholder="답변을 입력하세요..."
                    className="w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-3 text-base text-content-primary placeholder:text-content-secondary resize-none transition-[border-color,box-shadow] duration-150 hover:border-white/[0.15] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                  />
                )}

                {submitError && (
                  <p className="mt-3 text-sm text-semantic-error">{submitError}</p>
                )}

                {!AUTO_SUBMIT_QUESTION_TYPES.has(currentQuestionType ?? '') && (
                  <button
                    type="button"
                    disabled={!answer.trim() || submitting}
                    onClick={handleSubmit}
                    className="mt-5 w-full rounded-2xl bg-brand-500 px-4 py-[0.95rem] text-[0.98rem] font-bold text-brand-900 transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? '제출 중…' : '답변 제출'}
                  </button>
                )}
              </>
            )}

            {result && (
              <div className="mt-2">
                {choiceOptions && (
                  <div className="grid gap-3 mb-4">
                    {Object.entries(choiceOptions).map(([key, text]) => {
                      const isOxQuestion = currentQuestionType === 'ox';
                      const isSelected = isOxQuestion
                        ? normalizeOxValue(answer) === normalizeOxValue(key)
                        : answer === key;
                      const isCorrectAnswer = isOxQuestion
                        ? normalizeOxValue(result.correct_answer) === normalizeOxValue(key)
                        : result.correct_answer === key;
                      const isWrong = isSelected && result.judgement !== 'correct';

                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${
                            isWrong
                              ? 'border-semantic-error/40 bg-semantic-error/10 text-semantic-error'
                              : isCorrectAnswer
                                ? 'border-semantic-success/40 bg-semantic-success/10 text-semantic-success'
                                : isSelected
                                  ? 'border-brand-500 bg-brand-500/10 text-content-primary'
                                  : 'border-white/[0.08] bg-surface-deep/50 text-content-secondary'
                          }`}
                        >
                          <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            isWrong
                              ? 'bg-semantic-error/20 text-semantic-error'
                              : isCorrectAnswer
                                ? 'bg-semantic-success/20 text-semantic-success'
                                : isSelected
                                  ? 'bg-brand-500 text-brand-900'
                                  : 'bg-white/[0.06] text-content-secondary'
                          }`}>
                            {key.toUpperCase()}
                          </span>
                          {text !== key ? text : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className={`rounded-2xl border px-5 py-4 mb-4 ${
                  result.judgement === 'correct'
                    ? 'border-semantic-success/30 bg-semantic-success/10'
                    : result.judgement === 'partial'
                    ? 'border-semantic-warning/30 bg-semantic-warning/10'
                    : 'border-semantic-error-border bg-semantic-error-bg'
                }`}>
                  <p className={`text-base font-bold mb-1 ${
                    result.judgement === 'correct'
                      ? 'text-semantic-success'
                      : result.judgement === 'partial'
                      ? 'text-semantic-warning'
                      : 'text-semantic-error'
                  }`}>
                    {result.judgement === 'correct' ? '✓ 정답' : result.judgement === 'partial' ? '△ 부분 정답' : '✗ 오답'}
                  </p>
                  {!choiceOptions && (
                    <p className="text-sm text-content-secondary">
                      <span className="font-semibold text-content-primary">정답: </span>
                      {result.correct_answer}
                    </p>
                  )}
                  {result.explanation && (
                    <p className="mt-2 text-sm text-content-secondary leading-relaxed">{result.explanation}</p>
                  )}
                  {result.rationale && !result.explanation && (
                    <p className="mt-2 text-sm text-content-secondary leading-relaxed">{result.rationale}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full rounded-2xl bg-brand-500 px-4 py-[0.95rem] text-[0.98rem] font-bold text-brand-900 transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-600"
                >
                  {isLastQuestion ? '결과 보기' : '다음 문제'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
