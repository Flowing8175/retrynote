import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { wrongNotesApi } from '@/api';
import { EmptyState, LoadingSpinner, Pagination, StatusBadge } from '@/components';

function formatQuestionType(type: string) {
  switch (type) {
    case 'multiple_choice':
      return '객관식';
    case 'ox':
      return 'OX';
    case 'short_answer':
      return '단답형';
    case 'fill_blank':
      return '빈칸형';
    case 'essay':
      return '서술형';
    default:
      return type;
  }
}

function formatErrorType(type: string) {
  switch (type) {
    case 'calculation':
      return '계산 실수';
    case 'missing_point':
      return '핵심 포인트 누락';
    case 'concept_mismatch':
      return '개념 혼동';
    default:
      return type;
  }
}

export default function WrongNotes() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('concept');
  const [judgementFilter, setJudgementFilter] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['wrongNotes', page, sort, judgementFilter],
    queryFn: () =>
      wrongNotesApi.listWrongNotes(
        sort,
        judgementFilter.length > 0 ? judgementFilter : undefined,
        undefined,
        undefined,
        undefined,
        page
      ),
  });

  const handleRetry = (_conceptKey: string) => {
    navigate('/retry');
  };

  if (isLoading) {
    return <LoadingSpinner message="오답 기록 불러오는 중" />;
  }

  return (
    <div className="space-y-8">
      <section className="animate-fade-in-up px-1">
        <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">오답노트</h1>
        <p className="mt-2 text-base leading-7 text-content-secondary">
          틀린 문제와 부분정답을 개념별로 정리합니다.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm text-content-primary"
          >
            <option value="concept">개념순</option>
            <option value="date">날짜순</option>
            <option value="question">문제순</option>
          </select>
          <label className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2.5 text-sm text-content-primary">
            <input
              type="checkbox"
              checked={judgementFilter.includes('incorrect')}
              onChange={(e) => {
                if (e.target.checked) {
                  setJudgementFilter([...judgementFilter, 'incorrect']);
                } else {
                  setJudgementFilter(judgementFilter.filter((j) => j !== 'incorrect'));
                }
              }}
            />
            오답만 보기
          </label>
        </div>
      </section>

      {!data || data.items.length === 0 ? (
        <EmptyState
          title="오답노트가 없습니다"
          message="퀴즈를 풀고 나면 틀린 문제가 여기에 정리됩니다."
          actions={
            <button
              onClick={() => navigate('/quiz/new')}
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600"
            >
              첫 퀴즈 만들기
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/[0.07] bg-surface px-6 py-6">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-content-secondary">
                    <span className="rounded-full border border-white/[0.07] bg-surface-deep px-3 py-1">
                      {formatQuestionType(item.question_type)}
                    </span>
                    <span>{item.concept_label || '개념 분류 없음'}</span>
                  </div>
                  <div className="mt-3 text-xl font-semibold leading-8 text-content-primary">
                    {item.question_text}
                  </div>
                </div>
                <StatusBadge status={item.judgement} />
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4 text-sm leading-7">
                  <span className="text-content-secondary">내 답: </span>
                  <span className="font-medium text-content-primary">
                    {item.user_answer_raw || '없음'}
                  </span>
                </div>
                <div className="rounded-2xl border border-semantic-success-border bg-semantic-success-bg px-4 py-4 text-sm leading-7">
                  <span className="text-content-secondary">정답: </span>
                  <span className="font-medium text-semantic-success">
                    {item.correct_answer?.answer ? String(item.correct_answer.answer) : '-'}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                {item.error_type && (
                  <div className="rounded-2xl border border-semantic-warning-border bg-semantic-warning-bg px-4 py-3">
                    <span className="text-content-secondary">오류 유형: </span>
                    <span className="font-medium text-semantic-warning">{formatErrorType(item.error_type)}</span>
                  </div>
                )}
                {item.explanation && (
                  <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4 leading-7 text-content-secondary">
                    {item.explanation}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <button
                  onClick={() => handleRetry(item.concept_key || '')}
                  className="inline-flex items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-2.5 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-500/10 hover:text-brand-300"
                >
                  이 개념으로 재도전
                </button>
              </div>
            </article>
          ))}

          {data && data.total > data.size && (
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(data.total / data.size)}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  );
}
