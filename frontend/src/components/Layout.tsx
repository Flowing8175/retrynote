import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, CircleHelp, History, TriangleAlert, RefreshCw, Search, Menu, X, CreditCard, BookOpen } from 'lucide-react';
import AnnouncementBanner from './AnnouncementBanner';
import StorageWarningBanner from './StorageWarningBanner';
import Navbar from './Navbar';
import UsageBar from './UsageBar';
import { TourProvider } from '@/components/OnboardingTour';

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
  { path: '/dashboard', label: '대시보드', icon: <LayoutDashboard size={18} /> },
  { path: '/files', label: '자료 관리', icon: <FolderOpen size={18} /> },
  { path: '/study', label: '학습', icon: <BookOpen size={18} /> },
  { path: '/quiz/new', label: '퀴즈 생성', icon: <CircleHelp size={18} /> },
  { path: '/quiz/history', label: '퀴즈 기록', icon: <History size={18} /> },
  { path: '/wrong-notes', label: '오답노트', icon: <TriangleAlert size={18} /> },
  { path: '/retry', label: '재도전', icon: <RefreshCw size={18} /> },
  { path: '/search', label: '검색', icon: <Search size={18} /> },
  { path: '/pricing', label: '요금제', icon: <CreditCard size={18} /> },
];

export default function Layout({ children, showSidebar = true }: LayoutProps) {
  const location = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeNavItem = navItems.find((item) => location.pathname === item.path);

  return (
    <TourProvider>
    <div className="min-h-screen bg-background text-foreground font-sans pt-16">
      <Navbar />
      <div className="mx-auto flex w-full max-w-[1600px] items-start">
        {showSidebar && (
          <>
            {/* Mobile Menu Backdrop */}
            <div className={`fixed inset-0 z-[60] lg:hidden bg-background/80 backdrop-blur-sm transition-opacity duration-300 ${mobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setMobileMenuOpen(false)} />
            
            {/* Mobile Menu */}
            <aside className={`fixed inset-y-0 left-0 z-[70] w-72 bg-surface border-r border-white/[0.05] transition-transform duration-300 lg:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-content-secondary">메뉴</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="text-content-muted hover:text-white transition-colors">
                    <X size={24} />
                  </button>
                </div>
                <nav className="space-y-2">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-4 px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                          isActive ? 'bg-brand-500/10 text-brand-300' : 'text-content-secondary hover:text-white hover:bg-surface-hover'
                        }`}
                      >
                        <span className={isActive ? 'text-brand-300' : 'text-content-muted'}>{item.icon}</span>
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
                <UsageBar expanded={true} />
              </div>
            </aside>

            {/* Desktop Sidebar */}
            <aside className={`fixed top-16 left-0 z-40 hidden h-[calc(100vh-4rem)] border-r border-white/[0.05] transition-all duration-300 lg:block ${sidebarExpanded ? 'w-64' : 'w-20'}`} data-tour="sidebar-nav">
              <div className="flex flex-col h-full bg-surface-deep/30">
                <div className="p-4 border-b border-white/[0.05]">
                  <button
                    onClick={() => setSidebarExpanded(!sidebarExpanded)}
                    aria-label={sidebarExpanded ? '사이드바 접기' : '사이드바 펼치기'}
                    className="flex w-full items-center justify-center bg-surface border border-white/[0.05] py-2.5 rounded-xl text-content-secondary hover:text-white hover:bg-surface-hover transition-colors"
                  >
                    <Menu size={18} />
                  </button>
                </div>
                <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-1">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-4 px-4 py-3 text-sm font-medium rounded-xl transition-all relative group ${
                          isActive ? 'text-brand-300 bg-brand-500/5 border border-brand-500/10' : 'text-content-secondary border border-transparent hover:text-white hover:bg-surface-hover'
                        }`}
                      >
                        <span className={`shrink-0 transition-transform ${isActive ? 'text-brand-300' : 'text-content-muted group-hover:text-content-primary'}`}>
                          {item.icon}
                        </span>
                        {sidebarExpanded && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
                <UsageBar expanded={sidebarExpanded} />
              </div>
            </aside>
          </>
        )}
        
        <main className={`flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-12 lg:py-10 ${showSidebar ? (sidebarExpanded ? 'lg:ml-64' : 'lg:ml-20') : ''}`}>
          {showSidebar && (
            <div className="mb-6 lg:hidden">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="flex items-center gap-3 bg-surface border border-white/[0.05] rounded-xl px-4 py-2.5 text-sm font-medium text-white hover:bg-surface-hover transition-colors"
              >
                <Menu size={18} className="text-content-muted" />
                {activeNavItem?.label ?? '메뉴'}
              </button>
            </div>
          )}
          <AnnouncementBanner />
          <StorageWarningBanner />
          <div className="animate-fade-in stagger-1">
            {children}
          </div>
        </main>
      </div>
    </div>
    </TourProvider>
  );
}
