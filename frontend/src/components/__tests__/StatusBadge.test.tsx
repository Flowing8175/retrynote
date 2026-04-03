import { render, screen } from '@testing-library/react';
import StatusBadge from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders known status with correct Korean label', () => {
    render(<StatusBadge status="ready" />);
    expect(screen.getByText('준비 완료')).toBeInTheDocument();
  });

  it('renders failed_terminal with error label', () => {
    const { container } = render(<StatusBadge status="failed_terminal" />);
    expect(screen.getByText('처리 실패')).toBeInTheDocument();
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain('semantic-error');
  });

  it('renders unknown status with fallback formatted label', () => {
    render(<StatusBadge status="some_custom_status" />);
    expect(screen.getByText('Some Custom Status')).toBeInTheDocument();
  });

  it('formatFallbackLabel converts hyphens to spaces and capitalizes', () => {
    render(<StatusBadge status="my-new-status" />);
    expect(screen.getByText('My New Status')).toBeInTheDocument();
  });

  it('renders with pulse animation for processing statuses', () => {
    const { container } = render(<StatusBadge status="parsing" />);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('does not render pulse for non-processing statuses', () => {
    const { container } = render(<StatusBadge status="ready" />);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot?.className).not.toContain('animate-pulse');
  });

  it.each([
    'uploaded', 'parsing', 'parsed', 'ready',
    'failed_partial', 'failed_terminal', 'deleted',
    'draft', 'generating', 'in_progress', 'graded',
  ])('renders status "%s" without errors', (status) => {
    expect(() => render(<StatusBadge status={status} />)).not.toThrow();
  });
});
