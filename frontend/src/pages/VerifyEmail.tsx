import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { authApi } from '@/api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'verified' | 'already_verified' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('인증 토큰이 없습니다.');
      return;
    }

    authApi.verifyEmail(token)
      .then((res) => {
        setStatus(res.status === 'already_verified' ? 'already_verified' : 'verified');
      })
      .catch((err) => {
        setStatus('error');
        const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
        if (detail === 'Token expired') {
          setErrorMessage('인증 링크가 만료되었습니다. 새 인증 메일을 요청하세요.');
        } else {
          setErrorMessage('유효하지 않은 인증 링크입니다.');
        }
      });
  }, [token]);

  const handleResend = async () => {
    if (!resendEmail) return;
    setResendStatus('sending');
    try {
      await authApi.resendVerification(resendEmail);
      setResendStatus('sent');
    } catch {
      setResendStatus('idle');
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 sm:p-8">
      <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-gradient-to-b from-surface/95 to-surface-deep/98 shadow-2xl shadow-black/50 p-8">
        {status === 'loading' && (
          <div className="text-center">
            <p className="text-lg text-content-secondary">인증 처리 중…</p>
          </div>
        )}

        {(status === 'verified' || status === 'already_verified') && (
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-content-primary">
              {status === 'already_verified' ? '이미 인증되었습니다' : '이메일 인증이 완료되었습니다.'}
            </h2>
            <p className="mt-3 text-sm text-content-secondary">
              이제 로그인하여 서비스를 이용할 수 있습니다.
            </p>
            <Link
              to="/login?verified=true"
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-brand-500 px-6 py-3 text-sm font-bold text-content-inverse transition hover:-translate-y-px hover:bg-brand-600"
            >
              로그인하기
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-content-primary">인증 실패</h2>
            <div className="mt-4 rounded-2xl border border-semantic-error-border bg-semantic-error-bg px-4 py-3 text-sm text-semantic-error">
              {errorMessage}
            </div>

            {resendStatus === 'sent' ? (
              <p className="mt-4 text-sm text-brand-300">인증 메일을 다시 보냈습니다. 받은 편지함을 확인하세요.</p>
            ) : (
              <div className="mt-6 grid gap-3">
                <input
                  type="email"
                  placeholder="이메일 주소를 입력하세요"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-3 text-base text-content-primary placeholder:text-content-secondary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                />
                <button
                  onClick={handleResend}
                  disabled={!resendEmail || resendStatus === 'sending'}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-content-inverse transition hover:-translate-y-px hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resendStatus === 'sending' ? '전송 중…' : '인증 메일 재전송'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
