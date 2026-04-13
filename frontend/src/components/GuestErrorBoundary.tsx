import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBoundaryShell } from './ErrorBoundaryShell';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class GuestErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundaryShell
          title="오류가 발생했습니다"
          description="예상치 못한 오류가 발생했습니다. 다시 시도해주세요."
          actions={
            <>
              <button
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
                className="px-4 py-2 rounded-xl bg-brand-500 text-brand-900 font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                다시 시도
              </button>
              <Link
                to="/try"
                className="px-4 py-2 rounded-xl border border-white/[0.12] text-content-secondary text-sm hover:text-content-primary transition-colors"
              >
                홈으로 돌아가기
              </Link>
            </>
          }
        />
      );
    }
    return this.props.children;
  }
}
