import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { wrongNotesApi } from '@/api';
import { EmptyState, Pagination, StatusBadge, SkeletonTransition } from '@/components';
import type { WrongNoteItem } from '@/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

const errorTypeDefinitions: Record<string, string> = {
  'concept_confusion': '핵심 개념을 잘못 이해했습니다',
  'missing_keyword': '필수 키워드나 용어를 놓쳤습니다',
  'expression_mismatch': '답은 맞지만 표현·용어가 달랐습니다',
  'careless_mistake': '단순 계산·기입 실수입니다',
  'ambiguous_question': '문제의 의도가 명확하지 않았습니다',
  'insufficient_source': '주어진 자료가 부족했습니다',
  'reasoning_error': '개념은 알지만 풀이 과정에서 실수했습니다',
  'no_response': '응답을 제공하지 않았습니다',
};

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

function WrongNotesSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 py-10 animate-pulse" aria-hidden="true">
      <section className="space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <div className="skeleton h-10 w-32 rounded-md" />
            <div className="skeleton h-4 w-80 rounded-md" />
          </div>
          <div className="flex gap-3">
            <div className="skeleton h-11 w-36 rounded-xl" />
            <div className="skeleton h-11 w-36 rounded-xl" />
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-3xl border border-white/[0.05] bg-surface px-5 sm:px-8 py-6">
            <div className="flex items-start gap-4 sm:gap-6">
              <div className="skeleton h-5 w-5 rounded mt-1 shrink-0" />
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <div className="skeleton h-6 w-14 rounded-md" />
                  <div className="skeleton h-5 w-24 rounded-md" />
                  <div className="skeleton h-5 w-14 rounded-full" />
                </div>
                <div className="skeleton h-6 w-full rounded-md" />
                <div className="skeleton h-5 w-3/4 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WrongNotes() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('concept');
  const [judgementFilter, setJudgementFilter] = useState<string[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Map<string, { concept_key: string | null; concept_label: string | null }>>(new Map());
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

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

  const handleNoteToggle = (note: WrongNoteItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedNotes((prev) => {
      const next = new Map(prev);
      if (next.has(note.id)) {
        next.delete(note.id);
      } else {
        next.set(note.id, { concept_key: note.concept_key, concept_label: note.concept_label });
      }
      return next;
    });
  };

  const handleExpandToggle = (noteId: string) => {
    setExpandedNoteId(expandedNoteId === noteId ? null : noteId);
  };

  const handleRetry = () => {
    if (selectedNotes.size === 0) {
      navigate('/retry');
      return;
    }

    const conceptMap = new Map<string, string>();
    for (const [, noteData] of selectedNotes) {
      if (noteData.concept_key) {
        conceptMap.set(noteData.concept_key, noteData.concept_label || noteData.concept_key);
      }
    }

    navigate('/retry', {
      state: {
        conceptKeys: Array.from(conceptMap.keys()),
        conceptLabels: Object.fromEntries(conceptMap.entries()),
        selectedCount: selectedNotes.size,
      },
    });
  };

  const selectedCount = selectedNotes.size;

  return (
    <SkeletonTransition loading={isLoading} skeleton={<WrongNotesSkeleton />}>
    {isLoading ? null : (
    <div className="max-w-4xl mx-auto space-y-12 py-10 animate-fade-in">
      <section className="animate-fade-in-up space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">오답노트</h1>
            <p className="text-base text-content-secondary max-w-xl leading-relaxed">
              틀린 문제와 부분정답을 개념별로 정리하여 약점을 보완합니다.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="w-full sm:w-auto bg-surface border border-white/[0.05] rounded-xl text-sm font-medium px-4 py-2.5 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="concept">개념순 정렬</option>
              <option value="date">날짜순 정렬</option>
              <option value="question">문제순 정렬</option>
            </select>
            <label className="flex items-center gap-2 w-full sm:w-auto bg-surface border border-white/[0.05] rounded-xl px-4 py-2.5 cursor-pointer hover:bg-surface-hover transition-colors">
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
                className="w-4 h-4 rounded border-white/[0.1] bg-surface-deep text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm font-medium text-white">오답만 보기</span>
            </label>
          </div>
        </div>
      </section>

      {!data || data.items.length === 0 ? (
        <EmptyState
          title="오답노트가 비어있습니다"
          message="퀴즈를 풀고 나면 틀린 문제가 여기에 자동으로 정리됩니다."
          actions={
            <button
              onClick={() => navigate('/quiz/new')}
              className="bg-brand-500 text-brand-900 rounded-2xl px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            >
              퀴즈 풀고 오답 모으기
            </button>
          }
        />
       ) : (
         <div className="space-y-4" data-tour="wrong-notes-list">
           {data.items.map((item: WrongNoteItem, index: number) => (
             <article
               key={item.id}
               className={`group relative rounded-3xl border transition-all ${
                 selectedNotes.has(item.id) ? 'border-brand-500/30 bg-brand-500/5' : 'border-white/[0.05] bg-surface hover:bg-surface-hover'
               }`}
               data-tour={index === 0 ? 'wrong-notes-item' : undefined}
             >
              <div 
                className="flex items-start gap-4 sm:gap-6 px-5 sm:px-8 py-6 cursor-pointer"
                onClick={() => handleExpandToggle(item.id)}
              >
                <div className="pt-1">
                  <input
                    type="checkbox"
                    checked={selectedNotes.has(item.id)}
                    onChange={() => handleNoteToggle(item)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-5 h-5 rounded border-white/[0.1] bg-surface-deep text-brand-500 focus:ring-brand-500 cursor-pointer"
                  />
                </div>

                <div className="flex-1 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium text-brand-300 bg-brand-500/10 px-2 py-1 rounded-md">
                      {formatQuestionType(item.question_type)}
                    </span>
                    <span className="text-xs font-medium text-content-muted">
                      {item.concept_label || '미분류 개념'}
                    </span>
                    <StatusBadge status={item.judgement} />
                  </div>

                  <h2 className="text-xl font-medium leading-relaxed text-white group-hover:text-brand-300 transition-colors">
                    {item.question_text}
                  </h2>

                  {expandedNoteId === item.id && (
                    <div className="animate-fade-in-up space-y-6 pt-4 mt-4 border-t border-white/[0.05]">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-content-muted">내 답변</div>
                          <div className="text-sm text-white bg-surface-deep rounded-xl p-4 border border-white/[0.05]">
                            {resolveAnswer(item.user_answer_raw, item.options as Record<string, unknown> | null, item.question_type)}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-brand-300">정답</div>
                          <div className="text-sm font-medium text-brand-900 bg-brand-500 rounded-xl p-4">
                            {item.correct_answer?.answer != null
                              ? resolveAnswer(
                                  String(item.correct_answer.answer),
                                  item.options as Record<string, unknown> | null,
                                  item.question_type
                                )
                              : '-'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {item.error_type && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-semantic-warning bg-semantic-warning/10 px-2.5 py-1 rounded-md">틀린 이유</span>
                            <span className="text-sm text-white" title={errorTypeDefinitions[item.error_type] || ''}>{formatErrorType(item.error_type)}</span>
                          </div>
                        )}
                        {item.explanation && (
                          <div className="text-sm leading-relaxed text-content-secondary bg-surface-deep rounded-2xl p-5 border border-white/[0.05]">
                            {item.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-1 text-content-muted group-hover:text-white transition-colors shrink-0">
                  {expandedNoteId === item.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {data && data.total > data.size && (
        <div className="flex justify-center pt-8">
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(data.total / data.size)}
            onPageChange={setPage}
          />
        </div>
      )}

      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 animate-fade-in-up">
          <div className="max-w-4xl mx-auto mb-6 px-4">
            <div className="bg-surface border border-white/[0.1] rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between shadow-2xl shadow-black/50 backdrop-blur-xl gap-4">
              <div className="text-white flex items-center gap-2">
                <span className="text-xl font-semibold">{selectedCount}</span>
                <span className="text-sm text-content-secondary">개 선택됨</span>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedNotes(new Map())}
                  className="flex-1 sm:flex-none text-content-secondary px-4 py-2 text-sm font-medium border border-white/[0.1] rounded-xl hover:bg-white/5 transition-all"
                >
                  선택 해제
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex-1 sm:flex-none bg-brand-500 text-brand-900 px-6 py-2 text-sm font-semibold rounded-xl hover:-translate-y-0.5 transition-transform"
                >
                  재도전 시작
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    )}
    </SkeletonTransition>
  );
}
