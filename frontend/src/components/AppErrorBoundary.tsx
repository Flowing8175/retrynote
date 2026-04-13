import { type ErrorInfo, type ReactNode, Component } from 'react';
import { ErrorBoundaryShell } from './ErrorBoundaryShell';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  isChunkError: boolean;
  errorMessage: string | null;
  componentStack: string | null;
}

const RELOAD_KEY = 'chunk_reload_ts';
const RELOAD_COOLDOWN_MS = 10_000;

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    isChunkError: false,
    errorMessage: null,
    componentStack: null,
  };

  static isChunkLoadError(error: Error): boolean {
    return (
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed') ||
      error.message?.includes('error loading dynamically imported module') ||
      error.name === 'ChunkLoadError'
    );
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    const isChunk = AppErrorBoundary.isChunkLoadError(error);
    return {
      hasError: true,
      isChunkError: isChunk,
      errorMessage: null,
      componentStack: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppErrorBoundary caught an error', error, errorInfo);

    if (AppErrorBoundary.isChunkLoadError(error)) {
      const last = sessionStorage.getItem(RELOAD_KEY);
      const canReload = !last || Date.now() - Number(last) > RELOAD_COOLDOWN_MS;
      if (canReload) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return;
      }
    }

    this.setState({
      isChunkError: false,
      errorMessage: error.message || '알 수 없는 오류가 발생했습니다.',
      componentStack: errorInfo.componentStack || null,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError && this.state.isChunkError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <p className="text-sm text-content-secondary">업데이트 적용 중...</p>
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <ErrorBoundaryShell
          title="문제가 발생했습니다"
          description="페이지를 다시 불러오면 대부분의 일시적인 문제가 해결됩니다."
          actions={
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-400 focus:outline-none"
            >
              새로고침
            </button>
          }
        >
          {import.meta.env.DEV && this.state.errorMessage && (
            <div className="mb-6 rounded-2xl border border-white/[0.07] bg-background/60 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-content-muted">Error</p>
              <p className="mt-2 break-words text-sm text-semantic-error">{this.state.errorMessage}</p>
              {this.state.componentStack && (
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-content-secondary">{this.state.componentStack}</pre>
              )}
            </div>
          )}
        </ErrorBoundaryShell>
      );
    }

    return this.props.children;
  }
}
