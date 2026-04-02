import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '@/api';

export default function Signup() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authApi.signup({ username, email, password });
      navigate('/login');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail || '회원가입에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 sm:p-8">
      <div className="w-full max-w-[74rem] overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-surface/95 to-surface-deep/98 shadow-2xl shadow-black/50 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(31rem,1.1fr)]">

        <section className="hidden lg:flex flex-col justify-center border-r border-white/[0.06] bg-gradient-to-b from-surface to-surface-deep/90 p-[3.25rem]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">회원가입</p>
          <h1 className="mt-3 text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-content-primary">
            개인 학습 공간을 시작하세요.
          </h1>
          <p className="mt-5 text-base leading-[1.8] text-content-secondary">
            AI가 문제를 만들고 오답을 분석해 약점을 짚어드립니다.
          </p>
        </section>

        <section className="flex flex-col justify-center p-8 lg:p-[3.25rem]">
          <div className="w-full max-w-[30rem] mx-auto">
            <p className="text-[0.77rem] font-bold uppercase tracking-[0.18em] text-brand-300">회원가입</p>
            <h2 className="mt-3 text-[clamp(1.85rem,3.2vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-content-primary">
              계정 만들기
            </h2>

            <form className="mt-8 grid gap-[1.1rem]" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-2xl border border-semantic-error-border bg-semantic-error-bg px-4 py-3 text-sm leading-relaxed text-semantic-error">
                  {error}
                </div>
              )}

              <div className="grid gap-[0.55rem]">
                <label htmlFor="username" className="text-[0.92rem] font-semibold text-content-primary">
                  사용자명
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  placeholder="사용자명"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-[0.95rem] text-base text-content-primary placeholder:text-content-muted/50 transition-[border-color,box-shadow] duration-150 hover:border-white/[0.15] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
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
                  placeholder="이메일"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-[0.95rem] text-base text-content-primary placeholder:text-content-muted/50 transition-[border-color,box-shadow] duration-150 hover:border-white/[0.15] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
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
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-[0.95rem] text-base text-content-primary placeholder:text-content-muted/50 transition-[border-color,box-shadow] duration-150 hover:border-white/[0.15] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
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
          </div>
        </section>
      </div>
    </div>
  );
}
