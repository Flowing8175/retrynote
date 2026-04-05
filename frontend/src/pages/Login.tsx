import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { authApi } from '@/api';

const INPUT_CLASS = "w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-[0.95rem] text-base text-content-primary placeholder:text-content-secondary transition-[border-color,box-shadow] duration-150 hover:border-white/[0.15] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

export default function Login() {
  const navigate = useNavigate();
  const { setUser, setTokens } = useAuthStore();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authApi.login({ username_or_email: usernameOrEmail, password });
      setUser(response.user);
      setTokens(response.access_token, response.refresh_token);
      navigate('/');
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { detail?: string } } };
      const status = axiosError.response?.status;
      if (status === 401) {
        setError('사용자명 또는 비밀번호가 올바르지 않습니다.');
      } else if (status === 403) {
        setError('계정이 비활성화되었습니다. 관리자에게 문의하세요.');
      } else if (status === 429) {
        setError('로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.');
      } else if (!status || status >= 500) {
        setError('내부 오류가 발생하였습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError('로그인에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 sm:p-8">
      <div className="w-full max-w-[74rem] overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-surface/95 to-surface-deep/98 shadow-2xl shadow-black/50 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(31rem,1.1fr)]">

        <section className="hidden lg:flex flex-col justify-center border-r border-white/[0.06] bg-gradient-to-b from-surface to-surface-deep/90 p-[3.25rem]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">퀴즈 매니저</p>
          <h1 className="mt-3 text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-content-primary">
            학습 흐름을 이어가세요.
          </h1>
          <p className="mt-5 text-base leading-[1.8] text-content-secondary">
            업로드한 자료로 AI가 문제를 만들고, 오답을 분석해 약점을 짚어드립니다.
          </p>
        </section>

        {/* Form panel */}
        <section className="flex flex-col justify-center p-8 lg:p-[3.25rem]">
          <div className="w-full max-w-[30rem] mx-auto">
            <p className="text-[0.77rem] font-bold uppercase tracking-[0.18em] text-brand-300">로그인</p>
            <h2 className="mt-3 text-[clamp(1.85rem,3.2vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-content-primary">
              학습 기록으로 돌아가기
            </h2>

            <form className="mt-8 grid gap-[1.1rem]" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-2xl border border-semantic-error-border bg-semantic-error-bg px-4 py-3 text-sm leading-relaxed text-semantic-error">
                  {error}
                </div>
              )}

              <div className="grid gap-[0.55rem]">
                <label htmlFor="username-or-email" className="text-[0.92rem] font-semibold text-content-primary">
                  사용자명 또는 이메일
                </label>
                <input
                  id="username-or-email"
                  name="usernameOrEmail"
                  type="text"
                  required
                  placeholder="student@school.edu 또는 사용자명"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-4 py-[0.95rem] text-[0.98rem] font-bold text-content-inverse transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '로그인 중…' : '로그인'}
              </button>

              <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 mt-1">
                <Link to="/password-reset" className="text-sm font-semibold text-brand-300 hover:text-brand-400">
                  비밀번호 재설정
                </Link>
                <Link to="/signup" className="text-sm font-semibold text-brand-300 hover:text-brand-400">
                  새 계정 만들기
                </Link>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
