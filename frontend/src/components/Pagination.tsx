import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function getPageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pageWindow = getPageWindow(currentPage, totalPages);

  return (
    <div
      className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      aria-label="페이지 네비게이션"
    >
      <p className="text-sm text-content-secondary">
        {totalPages}페이지 중 {currentPage}페이지
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] px-3 py-1.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" />
          이전
        </button>
        {pageWindow.map((page, idx) =>
          page === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-sm text-content-muted">
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-current={currentPage === page ? 'page' : undefined}
              className={`inline-flex min-w-9 items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                currentPage === page
                  ? 'border-brand-500/40 bg-brand-500/15 text-brand-300'
                  : 'border-white/[0.06] text-content-secondary hover:bg-surface-hover'
              }`}
            >
              {page}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] px-3 py-1.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          다음
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
