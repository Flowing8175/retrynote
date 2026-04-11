import { type ErrorInfo, type ReactNode, Component } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
  componentStack: string | null;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
    componentStack: null,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true, errorMessage: null, componentStack: null };
  }

  static isChunkLoadError(error: Error): boolean {
    return (
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed') ||
      error.name === 'ChunkLoadError'
    );
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppErrorBoundary caught an error', error, errorInfo);

    if (AppErrorBoundary.isChunkLoadError(error)) {
      const key = 'chunk_reload_attempted';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return;
      }
    }

    this.setState({
      errorMessage: error.message || '알 수 없는 오류가 발생했습니다.',
      componentStack: errorInfo.componentStack || null,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-content-primary flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/[0.07] bg-surface/90 p-6 text-center shadow-2xl shadow-black/40">
            <h1 className="text-xl font-semibold">문제가 발생했습니다</h1>
            <p className="mt-3 text-sm leading-relaxed text-content-secondary">
              페이지를 다시 불러오면 대부분의 일시적인 문제가 해결됩니다.
            </p>
            {import.meta.env.DEV && this.state.errorMessage && (
              <div className="mt-4 rounded-2xl border border-white/[0.07] bg-background/60 p-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-content-muted">Error</p>
                <p className="mt-2 break-words text-sm text-semantic-error">{this.state.errorMessage}</p>
                {this.state.componentStack && (
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-content-secondary">{this.state.componentStack}</pre>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-400 focus:outline-none"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
