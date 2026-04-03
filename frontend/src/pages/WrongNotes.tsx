import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { wrongNotesApi } from '@/api';
import { EmptyState, LoadingSpinner, Pagination, StatusBadge } from '@/components';
import type { WrongNoteItem } from '@/types';

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
    case 'concept_confusion':
      return '개념 혼동';
    case 'missing_keyword':
      return '핵심 키워드 누락';
    case 'expression_mismatch':
      return '표현 불일치';
    case 'careless_mistake':
      return '실수';
    case 'ambiguous_question':
      return '문제 모호함';
    case 'insufficient_source':
      return '자료 부족';
    case 'reasoning_error':
      return '추론 오류';
    case 'no_response':
      return '무응답';
    default:
      return type;
  }
}

function resolveAnswer(
  answer: string | null,
  options: Record<string, unknown> | null,
  questionType: string
): string {
  if (!answer) return '없음';
  if (questionType !== 'multiple_choice' || !options) return answer;
  const optionText = options[answer];
  if (typeof optionText === 'string') return `${answer.toUpperCase()}. ${optionText}`;
  return answer;
}

export default function WrongNotes() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('concept');
  const [judgementFilter, setJudgementFilter] = useState<string[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

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

  const handleNoteToggle = (noteId: string) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  const handleRetry = () => {
    if (selectedNoteIds.size === 0) {
      navigate('/retry');
      return;
    }

    const selectedNotes = (data?.items ?? []).filter((item) => selectedNoteIds.has(item.id));
    const conceptMap = new Map<string, string>();
    for (const note of selectedNotes) {
      if (note.concept_key) {
        conceptMap.set(note.concept_key, note.concept_label || note.concept_key);
      }
    }

    navigate('/retry', {
      state: {
        conceptKeys: Array.from(conceptMap.keys()),
        conceptLabels: Object.fromEntries(conceptMap.entries()),
        selectedCount: selectedNoteIds.size,
      },
    });
  };

  const selectedCount = selectedNoteIds.size;

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
          {data.items.map((item: WrongNoteItem) => (
            <article
              key={item.id}
              onClick={() => handleNoteToggle(item.id)}
              className={`cursor-pointer rounded-2xl border bg-surface px-6 py-6 transition-colors ${
                selectedNoteIds.has(item.id)
                  ? 'border-brand-500/30 bg-brand-500/5'
                  : 'border-white/[0.07] hover:bg-surface-hover'
              }`}
            >
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedNoteIds.has(item.id)}
                    onChange={() => handleNoteToggle(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 h-4 w-4 shrink-0 accent-brand-500"
                  />
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
                </div>
                <StatusBadge status={item.judgement} />
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4 text-sm leading-7">
                  <span className="text-content-secondary">내 답: </span>
                  <span className="font-medium text-content-primary">
                    {resolveAnswer(item.user_answer_raw, item.options as Record<string, unknown> | null, item.question_type)}
                  </span>
                </div>
                <div className="rounded-2xl border border-semantic-success-border bg-semantic-success-bg px-4 py-4 text-sm leading-7">
                  <span className="text-content-secondary">정답: </span>
                  <span className="font-medium text-semantic-success">
                    {item.correct_answer?.answer != null
                      ? resolveAnswer(
                          String(item.correct_answer.answer),
                          item.options as Record<string, unknown> | null,
                          item.question_type
                        )
                      : '-'}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                {item.error_type && (
                  <div className="rounded-2xl border border-semantic-warning-border bg-semantic-warning-bg px-4 py-3">
                    <span className="text-content-secondary">틀린 이유: </span>
                    <span className="font-medium text-semantic-warning">{formatErrorType(item.error_type)}</span>
                  </div>
                )}
                {item.explanation && (
                  <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4 leading-7 text-content-secondary">
                    {item.explanation}
                  </div>
                )}
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

      {selectedCount > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-3xl flex-col items-stretch gap-3 rounded-2xl border border-white/[0.07] bg-surface px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-content-primary">
            <span className="font-semibold">{selectedCount}개</span> 선택됨
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedNoteIds(new Set())}
              className="rounded-xl border border-white/[0.07] px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
            >
              선택 해제
            </button>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-brand-600"
            >
              재도전
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
