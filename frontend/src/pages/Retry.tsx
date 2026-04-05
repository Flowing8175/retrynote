import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { retryApi, wrongNotesApi } from '@/api';
import type { RetryLocationState } from '@/types';

const QUESTION_COUNT_PRESETS = [5, 10, 15];

export default function Retry() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as RetryLocationState | null;

  const hasSelectedConcepts =
    locationState != null &&
    Array.isArray(locationState.conceptKeys) &&
    locationState.conceptKeys.length > 0;

  const selectedConceptKeys = hasSelectedConcepts ? locationState!.conceptKeys : [];
  const selectedConceptLabels = hasSelectedConcepts ? locationState!.conceptLabels : {};
  const selectedCount = selectedConceptKeys.length;

  const [conceptMode, setConceptMode] = useState<'manual' | 'ai'>('manual');
  const [questionCount, setQuestionCount] = useState(5);
  const [autoCount, setAutoCount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: wrongNotesData } = useQuery({
    queryKey: ['wrongNotes-count'],
    queryFn: () => wrongNotesApi.listWrongNotes('date', undefined, undefined, undefined, undefined, 1),
  });

  const wrongNotesTotal = wrongNotesData?.total;

  const createRetryMutation = useMutation({
    mutationFn: () => {
      const source =
        conceptMode === 'ai'
          ? 'dashboard_recommendation'
          : hasSelectedConcepts
            ? 'concept_manual'
            : 'wrong_notes';

      return retryApi.createRetrySet({
        source,
        concept_keys: conceptMode === 'manual' && hasSelectedConcepts ? selectedConceptKeys : null,
        size: autoCount ? null : Math.max(1, Math.min(questionCount, 20)),
      });
    },
    onSuccess: (response) => {
      navigate(`/quiz/${response.quiz_session_id}`);
    },
    onError: (mutationError: unknown) => {
      const axiosError = mutationError as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail || '재도전 세트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    },
  });

  const handleQuestionCountChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    setQuestionCount(Number.isNaN(parsed) ? 1 : parsed);
  };

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

      <section className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-8 md:px-8">
        <div className="space-y-10">

          {/* 개념 선택 모드 토글 */}
          <div>
            <div className="inline-flex rounded-2xl bg-surface-deep p-1 gap-1">
              <button
                type="button"
                onClick={() => setConceptMode('manual')}
                className={
                  conceptMode === 'manual'
                    ? 'rounded-xl px-5 py-2.5 text-sm font-medium bg-surface text-content-primary shadow-sm'
                    : 'rounded-xl px-5 py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-hover'
                }
              >
                내가 고른 개념
              </button>
              <button
                type="button"
                onClick={() => setConceptMode('ai')}
                className={
                  conceptMode === 'ai'
                    ? 'rounded-xl px-5 py-2.5 text-sm font-medium bg-surface text-content-primary shadow-sm'
                    : 'rounded-xl px-5 py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-hover'
                }
              >
                AI 추천 개념
              </button>
            </div>

            <div className="mt-6">
              {conceptMode === 'manual' ? (
                hasSelectedConcepts ? (
                  <div>
                    <p className="text-sm font-medium text-content-secondary">선택된 오답노트</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-content-primary">
                      {selectedCount}건
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedConceptKeys.map((key) => (
                        <span
                          key={key}
                          className="rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-300"
                        >
                          {selectedConceptLabels[key] || key}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-content-secondary">오답노트 전체 기준</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-content-primary">
                      {wrongNotesTotal !== undefined ? `${wrongNotesTotal}건` : '—'}
                    </p>
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
                  <p className="text-base font-medium text-content-primary">AI가 개념을 선택합니다</p>
                  <p className="mt-2 text-sm leading-6 text-content-secondary">
                    반복 오답 패턴을 분석해 지금 가장 취약한 개념 위주로 문제를 구성합니다.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 문제 수 정하기 */}
          <div className="border-t border-white/[0.07] pt-8">
            <p className="text-lg font-semibold text-content-primary">문제 수 정하기</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <input
                id="retry-question-count"
                type="number"
                min={1}
                max={20}
                value={questionCount}
                disabled={autoCount}
                onChange={(e) => handleQuestionCountChange(e.target.value)}
                className={`w-24 rounded-xl border border-white/[0.10] bg-surface-deep px-4 py-2.5 text-xl font-semibold text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-opacity ${autoCount ? 'opacity-30 cursor-not-allowed' : ''}`}
              />
              <span className={`text-base text-content-secondary transition-opacity ${autoCount ? 'opacity-30' : ''}`}>문제</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {QUESTION_COUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={autoCount}
                  onClick={() => setQuestionCount(preset)}
                  className={`rounded-full px-5 py-2 text-base font-medium transition-colors ${
                    autoCount
                      ? 'cursor-not-allowed opacity-30 bg-surface-deep text-content-muted'
                      : questionCount === preset
                        ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
                        : 'bg-surface-deep text-content-secondary hover:bg-surface-hover'
                  }`}
                >
                  {preset}문제
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAutoCount((prev) => !prev)}
                className={`rounded-full px-5 py-2 text-base font-medium transition-colors ${
                  autoCount
                    ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
                    : 'bg-surface-deep text-content-secondary hover:bg-surface-hover'
                }`}
              >
                AI 결정
              </button>
            </div>
            {autoCount && (
              <p className="mt-3 text-sm leading-relaxed text-content-muted">
                틀린 개념의 수와 오답 패턴을 고려해 AI가 적합한 문제 수를 결정합니다.
              </p>
            )}
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
