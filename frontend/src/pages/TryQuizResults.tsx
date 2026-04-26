import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { guestApi } from '@/api/guestClient';
import { useGuestStore } from '@/stores/guestStore';
import type { GuestQuizResults } from '@/types/guest';

export default function TryQuizResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const guestSessionId = useGuestStore((s) => s.guestSessionId);

  const [results, setResults] = useState<GuestQuizResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      try {
        const data = await guestApi.getQuizResults(sessionId);
        setResults(data);
      } catch {
        setError('결과를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionId]);

  const scorePercent =
    results && results.max_score > 0
      ? Math.round((results.total_score / results.max_score) * 100)
      : 0;

  const correctCount = results
    ? results.items.filter((i) => i.judgement === 'correct').length
    : 0;

  const performanceMessage =
    scorePercent >= 80
      ? '훌륭합니다! 🎉'
      : scorePercent >= 60
      ? '잘 하셨습니다! 계속 연습하세요.'
      : '복습이 필요합니다. 포기하지 마세요!';

  const signupHref = guestSessionId
    ? `/signup?guest_session_id=${guestSessionId}`
    : '/signup';

  return (
    <div className="min-h-screen bg-surface-deep flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
        <Link to="/" className="text-lg font-bold text-content-primary hover:text-brand-300 transition-colors">
          RetryNote
        </Link>
        <Link to="/login" className="text-sm font-semibold text-brand-300 hover:text-brand-400 transition-colors">
          로그인
        </Link>
      </header>

      <main className="flex-1 px-4 py-10">
        <div className="w-full max-w-2xl mx-auto space-y-8">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl border border-semantic-error-border bg-semantic-error-bg px-5 py-4 text-sm text-semantic-error">
              <p>{error}</p>
              <Link
                to="/try"
                className="mt-3 inline-block font-semibold text-brand-300 hover:text-brand-400 transition-colors"
              >
                새 퀴즈 만들기
              </Link>
            </div>
          )}

          {results && !loading && (
            <>
              {/* Score summary */}
              <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 sm:p-8 text-center">
                <p className="text-3xl sm:text-4xl font-bold text-content-primary mb-1">
                  {results.max_score}문제 중 {correctCount}문제 정답!
                </p>
                <p className="text-lg text-brand-300 font-semibold mb-4">({scorePercent}%)</p>

                {/* Progress bar */}
                <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden mb-4">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>

                <p className="text-base text-content-secondary">{performanceMessage}</p>
              </div>

              {/* Per-question breakdown */}
              <div className="space-y-4">
                <h2 className="text-base font-bold text-content-primary">문제별 결과</h2>
                {results.items.map((item, idx) => {
                  const isCorrect = item.judgement === 'correct';
                  const correctAnswerDisplay = item.correct_answer_json
                    ? Object.values(item.correct_answer_json).join(', ')
                    : '—';
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/[0.08] bg-surface p-5"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <p className="text-sm font-semibold text-content-secondary">문제 {idx + 1}</p>
                        <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isCorrect
                            ? 'bg-semantic-success/10 text-semantic-success'
                            : 'bg-semantic-error-bg text-semantic-error'
                        }`}>
                          {isCorrect ? '✓ 정답' : '✗ 오답'}
                        </span>
                      </div>
                      <p className="text-sm text-content-primary leading-relaxed mb-3">
                        {item.question_text}
                      </p>
                      <div className="space-y-1 text-xs text-content-secondary">
                        {item.user_answer && (
                          <p>
                            <span className="font-semibold text-content-primary">내 답변: </span>
                            {item.user_answer}
                          </p>
                        )}
                        <p>
                          <span className="font-semibold text-content-primary">정답: </span>
                          {correctAnswerDisplay}
                        </p>
                      </div>
                      {item.explanation_text && (
                        <p className="mt-3 text-xs text-content-secondary leading-relaxed border-t border-white/[0.06] pt-3">
                          {item.explanation_text}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Signup CTA */}
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-6 sm:p-8">
                <h2 className="text-lg font-bold text-content-primary mb-3">
                  결과 저장 + 오답 추적하려면 가입하세요
                </h2>
                <ul className="space-y-2 mb-6 text-sm text-content-secondary">
                   <li>✓ 방금 풀었던 퀴즈 결과가 자동 저장됩니다</li>
                   <li>✓ 틀린 문제만 모아서 다시 풀 수 있습니다</li>
                   <li>✓ 매달 무료 5 크레딧</li>
                 </ul>
                <div className="flex flex-col gap-3">
                  <Link
                    to={signupHref}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-4 py-[0.95rem] text-[0.98rem] font-bold text-brand-900 transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-600"
                  >
                    무료로 시작하기
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-white/[0.10] px-4 py-[0.9rem] text-sm font-semibold text-content-secondary hover:border-white/[0.20] hover:text-content-primary transition-colors duration-150"
                  >
                    로그인 (기존 회원)
                  </Link>
                  <Link
                    to="/try"
                    className="text-center text-sm font-semibold text-brand-300 hover:text-brand-400 transition-colors py-1"
                  >
                    새 퀴즈 만들기
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
