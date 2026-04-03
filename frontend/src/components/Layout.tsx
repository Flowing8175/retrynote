import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, CircleHelp, History, TriangleAlert, RefreshCw, Search, Menu } from 'lucide-react';
import Navbar from './Navbar';

interface LayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    path: '/',
    label: '대시보드',
    icon: <LayoutDashboard className="w-5 h-5" />,
  },
  {
    path: '/files',
    label: '자료 관리',
    icon: <FolderOpen className="w-5 h-5" />,
  },
  {
    path: '/quiz/new',
    label: '퀴즈 생성',
    icon: <CircleHelp className="w-5 h-5" />,
  },
  {
    path: '/quiz/history',
    label: '퀴즈 기록',
    icon: <History className="w-5 h-5" />,
  },
  {
    path: '/wrong-notes',
    label: '오답노트',
    icon: <TriangleAlert className="w-5 h-5" />,
  },
  {
    path: '/retry',
    label: '재도전',
    icon: <RefreshCw className="w-5 h-5" />,
  },
  {
    path: '/search',
    label: '검색',
    icon: <Search className="w-5 h-5" />,
  },
];

export default function Layout({ children, showSidebar = true }: LayoutProps) {
  const location = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeNavItem = navItems.find((item) => location.pathname === item.path);

  return (
    <div className="min-h-screen bg-surface-deep text-content-primary">
      <Navbar />
      <div className="mx-auto flex w-full max-w-[1600px]">
        {showSidebar && (
          <>
            <div className={`fixed inset-0 z-40 lg:hidden ${mobileMenuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
              <div
                className={`absolute inset-0 bg-black/60 transition-opacity ${mobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                aria-hidden="true"
                onClick={() => setMobileMenuOpen(false)}
              />
              <aside
                className={`absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-white/[0.05] bg-surface-deep/95 backdrop-blur-sm transition-transform duration-200 ${
                  mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
                aria-label="모바일 메뉴"
              >
                <div className="border-b border-white/[0.05] px-4 py-4">
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="메뉴 닫기"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-surface-border-subtle bg-surface-deep/80 px-3 py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
                  >
                    <Menu className="h-4 w-4" />
                    메뉴 닫기
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <nav aria-label="메인 메뉴" className="space-y-2">
                    {navItems.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          aria-label={item.label}
                          title={item.label}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 rounded-2xl px-3 py-3.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-brand-500/12 text-content-primary shadow-[inset_0_0_0_1px_rgba(113,239,211,0.16)]'
                              : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
                          }`}
                        >
                          <span aria-hidden="true" className={`shrink-0 ${isActive ? 'text-brand-300' : ''}`}>{item.icon}</span>
                          <span className="block font-medium">{item.label}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </aside>
            </div>

            <aside
              className={`sticky top-16 hidden min-h-[calc(100vh-4rem)] border-r border-white/[0.05] bg-surface-deep/95 backdrop-blur-sm transition-all duration-200 lg:block ${
                sidebarExpanded ? 'w-[18rem]' : 'w-[5.5rem]'
              }`}
            >
              <div className="border-b border-white/[0.05] px-4 py-4">
                <button
                  type="button"
                  onClick={() => setSidebarExpanded(!sidebarExpanded)}
                  aria-label={sidebarExpanded ? '사이드바 접기' : '사이드바 펼치기'}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-surface-border-subtle bg-surface-deep/80 px-3 py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary"
                >
                  {sidebarExpanded ? (
                    <span className="flex items-center gap-2">
                      <Menu className="h-4 w-4" />
                      메뉴
                    </span>
                  ) : (
                    <Menu className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="flex max-h-[calc(100vh-8.5rem)] min-h-[calc(100vh-8.5rem)] flex-col overflow-y-auto">
                <nav aria-label="메인 메뉴" className="space-y-2 p-4">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        aria-label={item.label}
                        title={item.label}
                        className={`flex items-center gap-3 whitespace-nowrap rounded-2xl px-3 py-3 text-sm transition-colors ${
                          isActive
                            ? 'bg-brand-500/12 text-content-primary shadow-[inset_0_0_0_1px_rgba(113,239,211,0.16)]'
                            : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
                        }`}
                      >
                        <span aria-hidden="true" className={`shrink-0 ${isActive ? 'text-brand-300' : ''}`}>{item.icon}</span>
                        {sidebarExpanded && <span className="block font-medium">{item.label}</span>}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </aside>
          </>
        )}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 xl:px-10">
          {showSidebar && (
            <div className="mb-4 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/[0.07] bg-surface px-4 py-2.5 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
              >
                <Menu className="h-4 w-4" />
                <span>{activeNavItem?.label ?? '메뉴'}</span>
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
