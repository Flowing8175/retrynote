import type { UseMutationResult } from '@tanstack/react-query';

interface AdminLoginGateProps {
  masterPassword: string;
  setMasterPassword: (v: string) => void;
  verifyError: string | null;
  setVerifyError: (v: string | null) => void;
  verifyMutation: UseMutationResult<{ verified: boolean; admin_token?: string }, unknown, void>;
}

export default function AdminLoginGate({
  masterPassword,
  setMasterPassword,
  verifyError,
  setVerifyError,
  verifyMutation,
}: AdminLoginGateProps) {
  return (
    <div className="mx-auto max-w-3xl pt-8">
      <section className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-7 md:px-8 md:py-8">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
          <div>
            <p className="text-sm font-medium text-brand-300">관리자 인증</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-content-primary">운영 화면에 들어가기 전에 한 번 더 확인합니다.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-content-secondary">
              관리자 영역은 학습자 화면과 다른 권한을 다루므로 마스터 비밀번호로 한 번 더 인증합니다. 인증 후에는 사용자 상태와 운영 로그를 같은 흐름에서 확인할 수 있어요.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
            <label className="block text-sm font-medium text-content-primary" htmlFor="master-password">
              마스터 비밀번호
            </label>
            <input
              id="master-password"
              type="password"
              value={masterPassword}
              onChange={(e) => { setMasterPassword(e.target.value); setVerifyError(null); }}
              placeholder="비밀번호 입력"
              className="mt-3 w-full rounded-2xl border border-white/[0.10] bg-surface px-4 py-3 text-content-primary placeholder-content-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <p className="mt-3 text-sm leading-6 text-content-secondary">공용 환경이라면 인증 후 로그아웃을 먼저 확인해 주세요.</p>
            <button
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending || !masterPassword}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-content-inverse transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {verifyMutation.isPending ? '인증 중…' : '관리자 화면 열기'}
            </button>
            {verifyError && (
              <p className="mt-3 text-sm text-semantic-error">{verifyError}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
