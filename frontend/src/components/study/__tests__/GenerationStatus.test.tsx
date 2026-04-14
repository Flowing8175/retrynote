import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenerationStatus } from '../GenerationStatus';

describe('GenerationStatus', () => {
  const defaultProps = {
    contentType: '요약',
    onGenerate: vi.fn(),
    onRegenerate: vi.fn(),
  };

  afterEach(() => vi.clearAllMocks());

  it('renders nothing when status is completed', () => {
    const { container } = render(
      <GenerationStatus {...defaultProps} status="completed" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows spinner and generating text when generating', () => {
    render(<GenerationStatus {...defaultProps} status="generating" />);
    expect(screen.getByText('생성 중...')).toBeInTheDocument();
  });

  it('shows failure message and retry button when failed', () => {
    render(<GenerationStatus {...defaultProps} status="failed" />);
    expect(screen.getByText('생성에 실패했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('calls onRegenerate when retry button is clicked', async () => {
    const onRegenerate = vi.fn();
    const user = userEvent.setup();
    render(
      <GenerationStatus
        {...defaultProps}
        status="failed"
        onRegenerate={onRegenerate}
      />,
    );
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('shows content label and generate button when not_generated', () => {
    render(<GenerationStatus {...defaultProps} status="not_generated" />);
    expect(screen.getByText('요약 콘텐츠가 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '요약 생성하기' })).toBeInTheDocument();
  });

  it('calls onGenerate when generate button is clicked', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(
      <GenerationStatus
        {...defaultProps}
        status="not_generated"
        onGenerate={onGenerate}
      />,
    );
    await user.click(screen.getByRole('button', { name: '요약 생성하기' }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it('shows contentType in the generate button label', () => {
    render(
      <GenerationStatus
        {...defaultProps}
        contentType="플래시카드"
        status="not_generated"
      />,
    );
    expect(screen.getByRole('button', { name: '플래시카드 생성하기' })).toBeInTheDocument();
  });
});
