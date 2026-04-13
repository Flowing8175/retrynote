import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Turnstile } from '@marsidev/react-turnstile';
import { authApi } from '@/api';
import { getDetailMessage } from '@/utils/errorMessages';
import { useAuthStore } from '@/stores/authStore';
import { useGuestStore } from '@/stores/guestStore';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { AuthErrorAlert } from '@/components/auth/AuthErrorAlert';
import { AuthPageShell } from '@/components/auth/AuthPageShell';

const INPUT_CLASS = "w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-[0.95rem] text-base text-content-primary placeholder:text-content-secondary transition-[border-color,box-shadow] duration-150 hover:border-white/[0.15] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const guestSessionId = searchParams.get('guest_session_id');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const { loading, error, setError, run } = useAsyncAction();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      try {
        if (guestSessionId) {
          const result = await authApi.convertGuest({
            username,
            email,
            password,
            guest_session_id: guestSessionId,
            turnstile_token: turnstileToken,
          });
          const { setUser, setTokens } = useAuthStore.getState();
          setUser(result.user);
          setTokens(result.access_token, result.refresh_token);
          useGuestStore.getState().clearGuestData();
          navigate('/dashboard');
        } else {
          await authApi.signup({ username, email, password, turnstile_token: turnstileToken });
          setSignupSuccess(true);
        }
      } catch (err: unknown) {
        const axiosError = err as { response?: { status?: number; data?: { detail?: unknown } } };
        const status = axiosError.response?.status;
        const detail = axiosError.response?.data?.detail;
        const message = getDetailMessage(detail, '회원가입에 실패했습니다.');

        if (status === 409) {
          setError('이미 사용 중인 이메일입니다.');
        } else if (status === 400 && typeof detail === 'string' && detail.includes('이메일 도메인')) {
          setError('해당 이메일 도메인은 사용할 수 없습니다.');
        } else if (status === 400 && typeof detail === 'string' && detail.includes('보안 인증')) {
          setError('보안 인증에 실패했습니다. 페이지를 새로고침하세요.');
        } else if (status === 429) {
          setError('너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.');
        } else {
          setError(message);
        }
      }
    });
  };

  return (
    <AuthPageShell>
      <section className="hidden lg:flex flex-col justify-center border-r border-white/[0.06] bg-gradient-to-b from-surface to-surface-deep/90 p-[3.25rem]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">회원가입</p>
        {guestSessionId ? (
          <>
            <h1 className="mt-3 text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-content-primary">
              가입하면 대시보드 &gt; 퀴즈 기록에 자동 저장됩니다!
            </h1>
            <p className="mt-5 text-base leading-[1.8] text-content-secondary">
              오답을 추적하고 약점을 집중적으로 복습하세요.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-content-primary">
              개인 학습 공간을 시작하세요.
            </h1>
            <p className="mt-5 text-base leading-[1.8] text-content-secondary">
              AI가 문제를 만들고 오답을 분석해 약점을 짚어드립니다.
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col justify-center p-8 lg:p-[3.25rem]">
        <div className="w-full max-w-[30rem] mx-auto">
          <p className="text-[0.77rem] font-bold uppercase tracking-[0.18em] text-brand-300">회원가입</p>
          <h2 className="mt-3 text-[clamp(1.85rem,3.2vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-content-primary">
            계정 만들기
          </h2>

          {signupSuccess ? (
            <div className="mt-8 text-center">
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 px-6 py-5">
                <p className="text-lg font-semibold text-brand-300">이메일을 확인하여 계정을 활성화하세요.</p>
                <p className="mt-2 text-sm text-content-secondary">
                  입력하신 이메일로 인증 링크를 보냈습니다.
                </p>
              </div>
              <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-brand-300 hover:text-brand-400">
                로그인으로 이동
              </Link>
            </div>
          ) : (
            <form className="mt-8 grid gap-[1.1rem]" onSubmit={handleSubmit}>
              <AuthErrorAlert error={error} />

              <div className="grid gap-[0.55rem]">
                <label htmlFor="username" className="text-[0.92rem] font-semibold text-content-primary">
                  사용자명
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  placeholder="영문, 숫자 조합"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid gap-[0.55rem]">
                <label htmlFor="email" className="text-[0.92rem] font-semibold text-content-primary">
                  이메일
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="student@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid gap-[0.55rem]">
                <label htmlFor="password" className="text-[0.92rem] font-semibold text-content-primary">
                  비밀번호
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="영문+숫자 조합, 8자 이상"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  className={INPUT_CLASS}
                />
                {isPasswordFocused && (
                  <p className="text-xs mt-0.5 text-content-secondary">
                    영문 + 숫자 조합, 8자 이상
                  </p>
                )}
              </div>

              <Turnstile
                siteKey={import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken('')}
              />

              <button
                type="submit"
                disabled={loading || !turnstileToken}
                className="mt-1 inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-4 py-[0.95rem] text-[0.98rem] font-bold text-content-inverse transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '계정 만드는 중…' : '계정 만들기'}
              </button>

              <div className="flex justify-end mt-1">
                <Link to="/login" className="text-sm font-semibold text-brand-300 hover:text-brand-400">
                  로그인으로 이동
                </Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </AuthPageShell>
  );
}
