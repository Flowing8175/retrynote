import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { retryApi, wrongNotesApi } from '@/api';

const sizePresets = [5, 8, 12];

export default function Retry() {
  const navigate = useNavigate();
  const [source, setSource] = useState<'wrong_notes' | 'dashboard_recommendation'>('wrong_notes');
  const [size, setSize] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const { data: wrongNotesData } = useQuery({
    queryKey: ['wrongNotes-count'],
    queryFn: () => wrongNotesApi.listWrongNotes('date', undefined, undefined, undefined, undefined, 1),
  });

  const createRetryMutation = useMutation({
    mutationFn: () =>
      retryApi.createRetrySet({
        source,
        concept_keys: null,
        size,
      }),
    onSuccess: (response) => {
      navigate(`/quiz/${response.quiz_session_id}`);
    },
    onError: (mutationError: unknown) => {
      const axiosError = mutationError as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail || '재도전 세트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    },
  });

  const wrongNotesTotal = wrongNotesData?.total;
  const hasNoWrongNotes = wrongNotesTotal === 0;

  return (
    <div className="space-y-8">
      <section className="animate-fade-in-up px-1 py-2">
        <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">
          재도전
        </h1>
        <p className="mt-3 text-base leading-7 text-content-secondary">
          틀린 개념을 바탕으로 유사 문제를 다시 풀어볼 수 있습니다.
        </p>
      </section>

      <section className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-7 md:px-8">
        <div className="space-y-8">
          <div className="text-sm text-content-secondary">
            오답노트{' '}
            <span className="font-semibold text-content-primary">
              {wrongNotesTotal !== undefined ? `${wrongNotesTotal}건` : '?건'}
            </span>{' '}
            기준 · 최근 기록부터
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-content-muted">1. 복습 기준 고르기</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => setSource('wrong_notes')}
                disabled={hasNoWrongNotes}
                className={`relative rounded-2xl border px-5 py-5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  source === 'wrong_notes'
                    ? 'border-brand-500/25 bg-brand-500/10'
                    : 'border-white/[0.07] bg-surface-deep hover:bg-surface-hover'
                }`}
              >
                {source === 'wrong_notes' && (
                  <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] text-white">✓</span>
                )}
                <div className="text-lg font-semibold text-content-primary">오답노트 기준</div>
                <p className="mt-1 text-sm leading-6 text-content-secondary">내가 틀린 문제를 바탕으로 유사 문제를 다시 출제합니다.</p>
                {hasNoWrongNotes && (
                  <p className="mt-3 text-xs leading-5 text-content-muted">아직 오답 기록이 없습니다. 퀴즈를 풀고 나서 재도전하세요.</p>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSource('dashboard_recommendation')}
                className={`relative rounded-2xl border px-5 py-5 text-left transition-colors ${
                  source === 'dashboard_recommendation'
                    ? 'border-brand-500/25 bg-brand-500/10'
                    : 'border-white/[0.07] bg-surface-deep hover:bg-surface-hover'
                }`}
              >
                {source === 'dashboard_recommendation' && (
                  <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] text-white">✓</span>
                )}
                <div className="text-lg font-semibold text-content-primary">대시보드 추천 기준</div>
                <p className="mt-1 text-sm leading-6 text-content-secondary">반복 오답 패턴을 분석해 AI가 추천한 문제입니다.</p>
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-content-muted">2. 세트 크기 정하기</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {sizePresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSize(preset)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    size === preset
                      ? 'border-brand-500 bg-brand-500 text-content-inverse'
                      : 'border-white/[0.07] bg-surface-deep text-content-primary hover:bg-surface-hover'
                  }`}
                >
                  {preset}문제
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-semantic-error-border bg-semantic-error-bg px-4 py-3 text-sm leading-6 text-semantic-error">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => {
                setError(null);
                createRetryMutation.mutate();
              }}
              disabled={createRetryMutation.isPending}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-5 py-3 text-sm font-bold text-content-inverse transition-colors hover:bg-brand-600 hover:-translate-y-px disabled:opacity-50"
            >
              {createRetryMutation.isPending ? '재도전 세트 준비 중…' : '재도전 세트 만들기'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/wrong-notes')}
              className="inline-flex items-center justify-center rounded-xl border border-white/[0.07] bg-surface-deep px-5 py-3 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
            >
              오답노트 다시 보기
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
