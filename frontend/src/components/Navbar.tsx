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
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/" className="flex min-w-0 items-center gap-3 text-content-primary transition-opacity hover:opacity-80">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-brand-300">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold tracking-tight">퀴즈 매니저</div>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <div className="hidden rounded-2xl border border-white/[0.06] bg-surface-deep px-3 py-2 text-right sm:block">
                  <div className="text-sm font-medium text-content-primary">{user.username}</div>
                </div>
                {user.role === 'admin' || user.role === 'super_admin' ? (
                  <Link
                    to="/admin"
                    className="inline-flex items-center justify-center rounded-xl border border-white/[0.06] bg-surface-deep px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
                  >
                    관리자
                  </Link>
                ) : null}
                <button
                  onClick={logout}
                  className="inline-flex items-center justify-center rounded-xl border border-white/[0.06] bg-surface-deep px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/[0.06] bg-surface-deep px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
                >
                  로그인
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-600"
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
