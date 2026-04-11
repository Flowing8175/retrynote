import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { guestApi } from '@/api/guest';
import { useGuestStore, type GuestQuestion } from '@/stores/guestStore';
import { useAuthStore } from '@/stores/authStore';
import SignupGateModal from '@/components/SignupGateModal';
import { getDetailMessage } from '@/utils/errorMessages';

const QUESTION_TYPE_LABEL: Record<string, string> = {
  multiple_choice: '객관식',
  ox: 'OX',
  short_answer: '단답형',
  fill_blank: '빈칸',
  essay: '서술형',
};

const EXAMPLE_TOPICS = ['TCP/IP 4계층', '광합성 과정', '한국사 근현대사', '미적분 기초'];

function QuestionCard({ q, index, revealed, onReveal }: {
  q: GuestQuestion;
  index: number;
  revealed: boolean;
  onReveal: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[oklch(0.28_0.01_250)] bg-[oklch(0.20_0.01_250)] overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(0.65_0.15_175)]/15 text-[oklch(0.65_0.15_175)]">
          {QUESTION_TYPE_LABEL[q.question_type] ?? q.question_type}
        </span>
        <span className="ml-auto text-xs text-[oklch(0.45_0.01_250)]">Q{index + 1}</span>
      </div>

      <div className="px-5 pb-4">
        <p className="text-sm text-[oklch(0.88_0.01_250)] leading-relaxed mb-4">{q.question_text}</p>

        {q.options && (
          <ul className="space-y-2 mb-4">
            {Object.entries(q.options).map(([key, val]) => (
              <li key={key} className="text-xs text-[oklch(0.70_0.01_250)] flex gap-2">
                <span className="font-mono text-[oklch(0.55_0.01_250)]">{key.toUpperCase()}.</span>
                <span>{val}</span>
              </li>
            ))}
          </ul>
        )}

        {revealed ? (
          <div className="border-t border-[oklch(0.28_0.01_250)] pt-3 space-y-1">
            <p className="text-xs text-[oklch(0.72_0.18_160)] font-medium">
              정답: {Object.values(q.correct_answer).join(', ')}
            </p>
            <p className="text-xs text-[oklch(0.55_0.01_250)] leading-relaxed">{q.explanation}</p>
          </div>
        ) : (
          <button
            onClick={onReveal}
            className="text-xs text-[oklch(0.65_0.15_175)] hover:text-[oklch(0.75_0.12_175)] transition-colors"
          >
            정답 보기 →
          </button>
        )}
      </div>
    </div>
  );
}

export default function GuestTry() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setGuestQuiz } = useGuestStore();

  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<'input' | 'loading' | 'result'>('input');
  const [questions, setQuestions] = useState<GuestQuestion[]>([]);
  const [revealedSet, setRevealedSet] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [showGate, setShowGate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async (overrideTopic?: string) => {
    const t = (overrideTopic ?? topic).trim();
    if (!t) return;
    setTopic(t);
    setError('');
    setPhase('loading');

    try {
      const res = await guestApi.generateQuiz(t);
      setQuestions(res.questions);
      setGuestQuiz(t, res.questions);
      setPhase('result');
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { detail?: unknown } } };
      const status = axiosError.response?.status;
      if (status === 429) {
        setError('문제 생성 횟수를 초과했습니다. 1시간 후 다시 시도하거나 가입하면 더 많이 사용할 수 있어요.');
      } else {
        setError(getDetailMessage(axiosError.response?.data?.detail, '문제 생성에 실패했습니다. 다시 시도해 주세요.'));
      }
      setPhase('input');
    }
  };

  const reveal = (i: number) => setRevealedSet((prev) => new Set(prev).add(i));

  const handleSaveOrContinue = () => {
    if (isAuthenticated) {
      navigate('/');
    } else {
      setShowGate(true);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[oklch(0.15_0.01_250)] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-[oklch(0.65_0.15_175)] border-t-transparent animate-spin" />
        <p className="text-sm text-[oklch(0.55_0.01_250)]">
          <span className="text-[oklch(0.65_0.15_175)] font-medium">{topic}</span> 문제를 생성하는 중…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[oklch(0.15_0.01_250)] text-[oklch(0.92_0.01_250)]">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[oklch(0.28_0.01_250)]">
        <Link to="/" className="text-base font-semibold text-[oklch(0.65_0.15_175)]">
          RetryNote
        </Link>
        {!isAuthenticated && (
          <Link
            to="/signup"
            className="text-sm px-4 py-2 rounded-xl bg-[oklch(0.65_0.15_175)] text-[oklch(0.12_0.01_250)] font-medium hover:bg-[oklch(0.70_0.15_175)] transition-colors"
          >
            회원가입
          </Link>
        )}
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {phase === 'input' && (
          <div className="flex flex-col items-center text-center gap-8">
            <div>
              <h1 className="text-2xl font-bold text-[oklch(0.95_0.01_250)] mb-2">
                무엇을 공부하고 있나요?
              </h1>
              <p className="text-sm text-[oklch(0.55_0.01_250)]">
                주제를 입력하면 AI가 바로 문제 4개를 만들어드립니다
              </p>
            </div>

            <div className="w-full flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder="예: TCP/IP 4계층, 한국사 근현대사…"
                className="flex-1 rounded-2xl border border-[oklch(0.28_0.01_250)] bg-[oklch(0.20_0.01_250)] px-4 py-3 text-sm text-[oklch(0.92_0.01_250)] placeholder:text-[oklch(0.40_0.01_250)] focus:border-[oklch(0.65_0.15_175)] focus:ring-2 focus:ring-[oklch(0.65_0.15_175)]/20 focus:outline-none transition-all"
                autoFocus
              />
              <button
                onClick={() => handleGenerate()}
                disabled={!topic.trim()}
                className="px-5 py-3 rounded-2xl bg-[oklch(0.65_0.15_175)] text-[oklch(0.12_0.01_250)] font-semibold text-sm hover:bg-[oklch(0.70_0.15_175)] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                생성
              </button>
            </div>

            {error && (
              <p className="text-sm text-[oklch(0.65_0.18_15)]">{error}</p>
            )}

            <div className="flex flex-wrap gap-2 justify-center">
              {EXAMPLE_TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleGenerate(t)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[oklch(0.28_0.01_250)] text-[oklch(0.55_0.01_250)] hover:border-[oklch(0.65_0.15_175)] hover:text-[oklch(0.65_0.15_175)] transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[oklch(0.95_0.01_250)]">{topic}</h2>
                <p className="text-xs text-[oklch(0.45_0.01_250)] mt-0.5">문제 {questions.length}개 생성됨</p>
              </div>
              <button
                onClick={() => { setPhase('input'); setRevealedSet(new Set()); }}
                className="text-xs text-[oklch(0.55_0.01_250)] hover:text-[oklch(0.75_0.01_250)] transition-colors"
              >
                다시 입력
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((q, i) => (
                <QuestionCard
                  key={i}
                  q={q}
                  index={i}
                  revealed={revealedSet.has(i)}
                  onReveal={() => reveal(i)}
                />
              ))}
            </div>

            <div className="rounded-2xl border border-[oklch(0.65_0.15_175)]/30 bg-[oklch(0.65_0.15_175)]/5 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-[oklch(0.88_0.01_250)]">
                  결과 저장 + 오답 추적하려면 가입하세요
                </p>
                <p className="text-xs text-[oklch(0.50_0.01_250)] mt-1">
                  가입 후 대시보드 &gt; 퀴즈 기록에 자동 저장됩니다
                </p>
              </div>
              <button
                onClick={handleSaveOrContinue}
                className="shrink-0 px-5 py-2.5 rounded-xl bg-[oklch(0.65_0.15_175)] text-[oklch(0.12_0.01_250)] font-semibold text-sm hover:bg-[oklch(0.70_0.15_175)] transition-colors active:scale-[0.98]"
              >
                {isAuthenticated ? '대시보드로 이동' : '무료로 가입하기'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showGate && (
        <SignupGateModal onClose={() => setShowGate(false)} topic={topic} />
      )}
    </div>
  );
}
