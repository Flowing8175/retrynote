import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useAuthStore } from '@/stores';
import AdminBanner from './AdminBanner';

export default function Navbar() {
  const { user, logout } = useAuthStore();

    return (
    <>
      <AdminBanner />
      <nav className="sticky top-0 z-40 border-b border-white/[0.05] bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:h-16 sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-0 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link to="/" className="flex min-w-0 items-center gap-3 text-content-primary transition-opacity hover:opacity-80">
              <div aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-brand-300 sm:h-10 sm:w-10">
                <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold tracking-tight sm:text-lg">퀴즈 매니저</div>
              </div>
            </Link>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {user ? (
              <>
                <div className="hidden rounded-2xl border border-white/[0.06] bg-surface-deep px-3 py-2 text-right md:block">
                  <div className="text-sm font-medium text-content-primary">{user.username}</div>
                </div>
                {user.role === 'admin' || user.role === 'super_admin' ? (
                  <Link
                    to="/admin"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.06] bg-surface-deep px-3 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover sm:px-4"
                  >
                    관리자
                  </Link>
                ) : null}
                <button
                  onClick={logout}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.06] bg-surface-deep px-3 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary sm:px-4"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.06] bg-surface-deep px-3 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover sm:px-4"
                >
                  로그인
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-600 sm:px-4"
                >
                  회원가입
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
