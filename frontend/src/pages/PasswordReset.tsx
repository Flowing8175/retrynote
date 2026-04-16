import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api';
import { getDetailMessage } from '@/utils/errorMessages';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { AuthErrorAlert } from '@/components/auth/AuthErrorAlert';
import { AuthPageShell } from '@/components/auth/AuthPageShell';

export default function PasswordReset() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get('token');
  const [step, setStep] = useState<'request' | 'confirm'>(urlToken ? 'confirm' : 'request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(urlToken ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [success, setSuccess] = useState('');
  const { loading, error, setError, run } = useAsyncAction();

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      try {
        await authApi.passwordResetRequest({ email });
        setSuccess('재설정 안내를 이메일로 보냈습니다. 메일을 확인해 다음 단계로 진행하세요.');
      } catch (err: unknown) {
        const axiosError = err as { response?: { data?: { detail?: unknown } } };
        setError(getDetailMessage(axiosError.response?.data?.detail, '요청에 실패했습니다.'));
      }
    });
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      try {
        await authApi.passwordResetConfirm({ token, new_password: newPassword });
        setSuccess('비밀번호가 성공적으로 변경되었습니다.');
        setTimeout(() => navigate('/login'), 2000);
      } catch (err: unknown) {
        const axiosError = err as { response?: { data?: { detail?: unknown } } };
        setError(getDetailMessage(axiosError.response?.data?.detail, '비밀번호 변경에 실패했습니다.'));
      }
    });
  };

  const inputClass = "w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-[0.95rem] text-base text-content-primary placeholder:text-content-muted/50 transition-[border-color,box-shadow] duration-150 hover:border-white/[0.15] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";
  const btnClass = "mt-1 inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-4 py-[0.95rem] text-[0.98rem] font-bold text-content-inverse transition-[transform,background-color] duration-150 hover:-translate-y-px hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <AuthPageShell>
      <section className="hidden lg:flex flex-col justify-center border-r border-white/[0.06] bg-gradient-to-b from-surface to-surface-deep/90 p-[3.25rem]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-300">계정 복구</p>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-content-primary">
          비밀번호를 다시 설정하세요.
        </h1>
        <p className="mt-5 text-base leading-[1.8] text-content-secondary">
          가입한 이메일로 재설정 안내를 보내드립니다.
        </p>
      </section>

      <section className="flex flex-col justify-center p-8 lg:p-[3.25rem]">
        <div className="w-full max-w-[30rem] mx-auto">
          <p className="text-[0.77rem] font-bold uppercase tracking-[0.18em] text-brand-300">비밀번호 재설정</p>
          <h2 className="mt-3 text-[clamp(1.85rem,3.2vw,2.6rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-content-primary">
            {step === 'request' ? '이메일로 안내 받기' : '새 비밀번호 설정'}
          </h2>

          <div className="mt-8 grid gap-[1.1rem]">
            {success && (
              <div className="rounded-2xl border border-semantic-success-border bg-semantic-success-bg px-4 py-3 text-sm leading-relaxed text-semantic-success">
                {success}
              </div>
            )}
            <AuthErrorAlert error={error} />
          </div>

          {step === 'request' && (
            <form className="mt-4 grid gap-[1.1rem]" onSubmit={handleRequest}>
              <div className="grid gap-[0.55rem]">
                <label htmlFor="email" className="text-[0.92rem] font-semibold text-content-primary">이메일</label>
                <input
                  id="email" name="email" type="email" required
                  placeholder="가입한 이메일"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={loading} className={btnClass}>
                {loading ? '안내 보내는 중…' : '안내 보내기'}
              </button>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-2">
                <button type="button" onClick={() => setStep('confirm')} className="text-sm font-semibold text-brand-300 hover:text-brand-400 bg-transparent border-none p-0 cursor-pointer">
                  토큰 직접 입력
                </button>
                <Link to="/login" className="text-sm font-semibold text-brand-300 hover:text-brand-400">
                  로그인으로 돌아가기
                </Link>
              </div>
            </form>
          )}

          {step === 'confirm' && (
            <form className="mt-4 grid gap-[1.1rem]" onSubmit={handleConfirm}>
              <div className="grid gap-[0.55rem]">
                <label htmlFor="token" className="text-[0.92rem] font-semibold text-content-primary">재설정 토큰</label>
                <input
                  id="token" name="token" type="text" required
                  placeholder="이메일의 토큰 입력"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid gap-[0.55rem]">
                <label htmlFor="newPassword" className="text-[0.92rem] font-semibold text-content-primary">새 비밀번호</label>
                <input
                  id="newPassword" name="newPassword" type="password" required
                  placeholder="새 비밀번호"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={loading} className={btnClass}>
                {loading ? '비밀번호 바꾸는 중…' : '새 비밀번호 저장'}
              </button>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-2">
                <button type="button" onClick={() => setStep('request')} className="text-sm font-semibold text-brand-300 hover:text-brand-400 bg-transparent border-none p-0 cursor-pointer">
                  이메일 안내로 돌아가기
                </button>
                <Link to="/login" className="text-sm font-semibold text-brand-300 hover:text-brand-400">
                  로그인으로 돌아가기
                </Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </AuthPageShell>
  );
}
