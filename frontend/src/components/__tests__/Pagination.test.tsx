import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from '@/components/Pagination';

describe('Pagination', () => {
  it('renders page info text', () => {
    render(<Pagination currentPage={2} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByText('5페이지 중 2페이지')).toBeInTheDocument();
  });

  it('previous button is disabled on page 1', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);
    const prevBtn = screen.getByRole('button', { name: /이전/i });
    expect(prevBtn).toBeDisabled();
  });

  it('next button is disabled on last page', () => {
    render(<Pagination currentPage={5} totalPages={5} onPageChange={() => {}} />);
    const nextBtn = screen.getByRole('button', { name: /다음/i });
    expect(nextBtn).toBeDisabled();
  });

  it('calls onPageChange with correct page number', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination currentPage={3} totalPages={10} onPageChange={onPageChange} />);

    const nextBtn = screen.getByRole('button', { name: /다음/i });
    await user.click(nextBtn);
    expect(onPageChange).toHaveBeenCalledWith(4);

    const prevBtn = screen.getByRole('button', { name: /이전/i });
    await user.click(prevBtn);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  describe('getPageWindow (via rendering)', () => {
    it('total <= 7 returns all pages', () => {
      render(<Pagination currentPage={1} totalPages={5} onPageChange={() => {}} />);
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
      }
      expect(screen.queryByText('…')).not.toBeInTheDocument();
    });

    it('current near start shows ellipsis only at end', () => {
      render(<Pagination currentPage={2} totalPages={10} onPageChange={() => {}} />);
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
      const ellipses = screen.getAllByText('…');
      expect(ellipses).toHaveLength(1);
    });

    it('current near end shows ellipsis only at start', () => {
      render(<Pagination currentPage={9} totalPages={10} onPageChange={() => {}} />);
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '8' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '9' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
      const ellipses = screen.getAllByText('…');
      expect(ellipses).toHaveLength(1);
    });

    it('current in middle shows both ellipses', () => {
      render(<Pagination currentPage={5} totalPages={10} onPageChange={() => {}} />);
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '6' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
      const ellipses = screen.getAllByText('…');
      expect(ellipses).toHaveLength(2);
    });
  });
});
