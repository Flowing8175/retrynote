import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import { authApi } from '@/api/auth';
import { guestApi } from '@/api/guest';
import { useAuthStore } from '@/stores/authStore';
import { useGuestStore } from '@/stores/guestStore';

const INPUT_CLASS =
  'w-full rounded-xl border border-[oklch(0.28_0.01_250)] bg-[oklch(0.18_0.01_250)] px-4 py-3 text-sm text-[oklch(0.92_0.01_250)] placeholder:text-[oklch(0.40_0.01_250)] focus:border-[oklch(0.65_0.15_175)] focus:ring-2 focus:ring-[oklch(0.65_0.15_175)]/20 focus:outline-none transition-all';

interface Props {
  onClose: () => void;
  topic: string;
}

export default function SignupGateModal({ onClose, topic }: Props) {
  const navigate = useNavigate();
  const { setUser, setTokens } = useAuthStore();
  const { questions, clearGuestQuiz } = useGuestStore();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'form' | 'email-sent'>('form');
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authApi.signup({ username, email, password, turnstile_token: turnstileToken });

      const loginRes = await authApi.login({ username_or_email: email, password });
      setUser(loginRes.user);
      setTokens(loginRes.access_token, loginRes.refresh_token);

      if (questions.length > 0) {
        try {
          await guestApi.migrateSession({ topic, questions });
        } catch {
          // migration failure is non-fatal
        }
        clearGuestQuiz();
      }

      navigate('/');
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { detail?: unknown } } };
      const status = axiosError.response?.status;
      const detail = axiosError.response?.data?.detail;

      if (status === 409) {
        setError(typeof detail === 'string' ? detail : '이미 사용 중인 이메일 또는 사용자명입니다.');
      } else if (status === 403) {
        setPhase('email-sent');
        return;
      } else if (status === 429) {
        setError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError(typeof detail === 'string' ? detail : '회원가입에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[oklch(0.28_0.01_250)] bg-[oklch(0.17_0.01_250)] shadow-2xl shadow-black/60 overflow-hidden">
        <div className="px-6 pt-6 pb-2 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[oklch(0.65_0.15_175)]">
              무료 가입
            </p>
            <h2 className="mt-1 text-xl font-bold text-[oklch(0.95_0.01_250)]">
              결과를 저장하고 오답을 추적하세요
            </h2>
            <p className="mt-1 text-xs text-[oklch(0.50_0.01_250)]">
              방금 풀어본 <span className="text-[oklch(0.65_0.15_175)]">{topic}</span> 문제가 대시보드에 바로 저장됩니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 mt-0.5 text-[oklch(0.45_0.01_250)] hover:text-[oklch(0.70_0.01_250)] transition-colors text-lg leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {phase === 'email-sent' ? (
          <div className="px-6 py-8 text-center">
            <p className="text-2xl mb-3">📬</p>
            <p className="font-semibold text-[oklch(0.88_0.01_250)]">이메일을 확인해주세요</p>
            <p className="mt-2 text-sm text-[oklch(0.50_0.01_250)]">
              인증 링크를 보냈습니다. 확인 후 로그인하면 문제가 저장됩니다.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-4 flex flex-col gap-3">
            {error && (
              <div className="rounded-xl border border-[oklch(0.65_0.18_15)]/30 bg-[oklch(0.65_0.18_15)]/10 px-4 py-3 text-xs text-[oklch(0.65_0.18_15)]">
                {error}
              </div>
            )}

            <input
              type="text"
              required
              placeholder="사용자명 (영문, 숫자)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={INPUT_CLASS}
              autoFocus
            />
            <input
              type="email"
              required
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
            <input
              type="password"
              required
              placeholder="비밀번호 (8자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
            />

            <div className="scale-90 origin-left">
              <Turnstile
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken('')}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !turnstileToken}
              className="w-full py-3 rounded-xl bg-[oklch(0.65_0.15_175)] text-[oklch(0.12_0.01_250)] font-bold text-sm hover:bg-[oklch(0.70_0.15_175)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
            >
              {loading ? '가입 중…' : '무료로 가입하기'}
            </button>

            <p className="text-center text-xs text-[oklch(0.45_0.01_250)]">
              이미 계정이 있으신가요?{' '}
              <a href="/login" className="text-[oklch(0.65_0.15_175)] hover:underline">
                로그인
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
