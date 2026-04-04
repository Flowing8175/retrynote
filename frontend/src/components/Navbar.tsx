import { Link } from 'react-router-dom';
import { GraduationCap, Settings, LogOut, User } from 'lucide-react';
import { useAuthStore } from '@/stores';
import AdminBanner from './AdminBanner';

export default function Navbar() {
  const { user, logout } = useAuthStore();

  return (
    <>
      <AdminBanner />
      <nav className="sticky top-0 z-50 bg-background border-b border-white/[0.05] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1600px] h-16 items-center justify-between px-6 lg:px-10">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center bg-brand-500/10 text-brand-300 rounded-xl transition-colors group-hover:bg-brand-500/20">
              <GraduationCap size={24} strokeWidth={2} />
            </div>
            <div className="text-xl font-bold tracking-tight text-white">
              retrynote
            </div>
          </Link>

          <div className="flex items-center gap-4">
            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2.5 bg-white/5 px-3 py-1.5 rounded-lg border border-white/[0.05]">
                  <User size={14} className="text-content-muted" />
                  <span className="text-xs font-medium text-white">{user.username}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  {user.role === 'admin' || user.role === 'super_admin' ? (
                    <Link
                      to="/admin"
                      className="px-3 py-2 text-xs font-medium text-brand-300 hover:text-white transition-colors"
                    >
                      관리자
                    </Link>
                  ) : null}
                  <Link
                    to="/settings"
                    className="p-2 text-content-muted hover:text-white transition-colors"
                    title="설정"
                  >
                    <Settings size={18} />
                  </Link>
                  <button
                    onClick={logout}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-destructive hover:text-white transition-colors"
                  >
                    <LogOut size={16} />
                    <span className="hidden md:inline">로그아웃</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <Link
                  to="/login"
                  className="px-4 py-2 text-xs font-medium text-content-secondary hover:text-white transition-colors"
                >
                  로그인
                </Link>
                <Link
                  to="/signup"
                  className="bg-brand-500 text-brand-900 px-5 py-2 text-xs font-semibold rounded-xl hover:-translate-y-0.5 transition-transform"
                >
                  회원가입
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
