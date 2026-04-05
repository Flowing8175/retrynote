import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { searchApi } from '@/api';
import { EmptyState, LoadingSpinner } from '@/components';
import type { SearchResultItem } from '@/types/search';

export default function Search() {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'files' | 'wrong_notes' | 'quiz_history'>('all');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', debouncedQuery, scope],
    queryFn: () => searchApi.search(debouncedQuery, scope),
    enabled: debouncedQuery.length > 0,
  });

  const getResultTypeLabel = (type: string): string => {
    switch (type) {
      case 'file':
        return '자료';
      case 'wrong_note':
        return '오답노트';
      case 'quiz_session':
        return '퀴즈 세션';
      case 'quiz_item':
        return '퀴즈 문항';
      default:
        return type;
    }
  };

  const getResultLink = (result: SearchResultItem): string | null => {
    switch (result.result_type) {
      case 'quiz_session':
        return `/quiz/${result.source_id}/results`;
      case 'wrong_note':
        return '/wrong-notes';
      case 'file':
        return '/files';
      default:
        return null;
    }
  };

  const hasQuery = debouncedQuery.trim().length > 0;
  const resultCount = data?.results.length ?? 0;

  return (
    <div className="space-y-8">
      <section className="animate-fade-in-up px-1 pt-4 pb-2">
        <h1 className="text-xl font-semibold text-content-muted mb-6">검색</h1>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 분수, 중간고사 정리, 3/4 + 1/4"
            className="w-full rounded-2xl border border-white/[0.10] bg-surface-deep px-5 py-4 text-lg text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors"
          />
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'all' | 'files' | 'wrong_notes' | 'quiz_history')}
            className="w-full rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60 transition-colors"
          >
            <option value="all">전체 기록</option>
            <option value="files">자료만</option>
            <option value="wrong_notes">오답노트만</option>
            <option value="quiz_history">퀴즈 기록만</option>
          </select>
        </div>
      </section>

      {isLoading ? (
        <LoadingSpinner message="검색 결과 정리 중" />
      ) : !hasQuery ? (
        <EmptyState
          icon={<SearchIcon size={28} />}
          eyebrow="통합 검색"
          title="검색어를 입력하세요"
          message="개념명, 파일명, 문제 문장 등을 입력하면 자료·오답노트·퀴즈 기록을 한 번에 찾아줍니다."
        />
      ) : isError ? (
        <EmptyState
          title="검색 중 오류가 발생했습니다"
          message="잠시 후 다시 시도해 주세요."
        />
      ) : resultCount === 0 ? (
        <EmptyState
          title={`"${debouncedQuery}" 결과가 없어요`}
          message="다른 검색어로 다시 시도해 보세요."
        />
      ) : (
        <section className="space-y-4">
          <p className="px-1 text-sm text-content-secondary">
            <span className="font-medium text-content-primary">{debouncedQuery}</span> 결과 {resultCount}개
          </p>

          <div className="space-y-4">
            {data?.results.map((result, index) => {
              const link = getResultLink(result);
              const cardContent = (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
                      {getResultTypeLabel(result.result_type)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-content-primary">{result.title}</h3>
                  {result.snippet ? (
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-content-secondary">{result.snippet}</p>
                  ) : null}
                </>
              );

              if (link) {
                return (
                  <Link
                    key={`${result.result_type}-${index}`}
                    to={link}
                    className="block rounded-2xl border border-white/[0.07] bg-surface px-6 py-5 cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    {cardContent}
                  </Link>
                );
              }

              return (
                <article
                  key={`${result.result_type}-${index}`}
                  className="rounded-2xl border border-white/[0.07] bg-surface px-6 py-5 cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  {cardContent}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
