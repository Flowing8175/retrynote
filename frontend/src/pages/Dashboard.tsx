import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardApi } from '@/api';
import type { DashboardResponse } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

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

function formatDateTime(value: string | null) {
  if (!value) {
    return '기록 시각 없음';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getCoachingMessage(dashboardData: DashboardResponse) {
  if (dashboardData.coaching_summary) {
    return dashboardData.coaching_summary;
  }

  if (dashboardData.retry_recommendations.length > 0) {
    return '반복된 개념부터 다시 보세요.';
  }

  if (dashboardData.recent_wrong_notes.length > 0) {
    return '막힌 문제부터 다시 보세요.';
  }

  return '지금 흐름을 유지해 보세요.';
}

function getPrimaryAction(dashboardData: DashboardResponse) {
  if (dashboardData.retry_recommendations.length > 0) {
    return {
      to: '/retry',
      eyebrow: '최근 기록 기준',
      title: '재도전부터 시작',
      description: `${dashboardData.retry_recommendations.length}개 추천이 있어요.`,
      buttonLabel: '재도전 시작',
    };
  }

  return {
    to: '/quiz/new',
    eyebrow: '다음 추천',
    title: '새 퀴즈로 이어가기',
    description: '새 문제를 한 세트 더 풀어보세요.',
    buttonLabel: '새 퀴즈 만들기',
  };
}

export default function Dashboard() {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedCategoryTag, setSelectedCategoryTag] = useState<string | null>(null);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard', range, selectedFileId, selectedCategoryTag],
    queryFn: () => dashboardApi.getDashboard(range, selectedFileId, selectedCategoryTag),
  });

  if (isLoading) {
    return <LoadingSpinner message="대시보드 불러오는 중" />;
  }

  if (!dashboardData) {
    return null;
  }

  const hasData = dashboardData.learning_volume > 0;
  const coachingMessage = getCoachingMessage(dashboardData);
  const retryRecommendations = dashboardData.retry_recommendations.slice(0, 3);
  const recentWrongNotes = dashboardData.recent_wrong_notes.slice(0, 4);
  const weakConcepts = dashboardData.weak_concepts.slice(0, 5);
  const primaryAction = getPrimaryAction(dashboardData);
  const rangeLabel = range === '7d' ? '최근 7일' : range === '30d' ? '최근 30일' : '전체 기간';

  if (!hasData) {
    return (
      <div className="space-y-8">
        <div className="py-4 animate-fade-in-up">
          <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">
            자료를 올리거나 첫 퀴즈를 시작하세요.
          </h1>
          <p className="mt-3 text-base text-content-secondary">
            학습 기록이 쌓이면 여기서 흐름을 확인할 수 있습니다.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            to="/files"
            className="rounded-2xl border border-brand-500/25 bg-brand-500/10 p-6 transition-colors hover:bg-brand-500/15"
          >
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-300">시작하기</div>
            <h2 className="text-xl font-semibold text-content-primary">자료 올리기</h2>
            <p className="mt-2 text-sm leading-6 text-content-secondary">PDF, 문서 등을 올리면 내용 기반으로 퀴즈를 만들 수 있습니다.</p>
          </Link>

          <Link
            to="/quiz/new"
            className="rounded-2xl border border-white/[0.07] bg-surface-raised p-6 transition-colors hover:bg-surface-hover"
          >
            <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-content-muted">바로 시작</div>
            <h2 className="text-xl font-semibold text-content-primary">퀴즈 시작</h2>
            <p className="mt-2 text-sm leading-6 text-content-secondary">자료 없이도 바로 퀴즈를 시작할 수 있습니다.</p>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="animate-fade-in-up space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-300">{rangeLabel}</span>
              {dashboardData.retry_recommendations.length > 0 && (
                <Link
                  to="/retry"
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-500/15"
                >
                  재도전 {dashboardData.retry_recommendations.length}개 대기 중
                </Link>
              )}
              {recentWrongNotes.length > 0 && (
                <Link
                  to="/wrong-notes"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-surface-deep px-3 py-1 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-hover"
                >
                  오답 {recentWrongNotes.length}건 미확인
                </Link>
              )}
            </div>

            <div className="flex gap-1.5">
              {(['7d', '30d', 'all'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    range === item
                      ? 'bg-brand-500/15 text-brand-300'
                      : 'bg-surface-deep text-content-secondary hover:bg-surface-hover'
                  }`}
                >
                  {item === '7d' ? '7일' : item === '30d' ? '30일' : '전체'}
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">
              지금 이어서 볼 학습 흐름
            </h1>
            <p className="mt-3 text-lg leading-8 text-content-secondary">{coachingMessage}</p>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-white/[0.07] pt-5 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-content-primary">{dashboardData.learning_volume}</span>
              <span className="text-content-secondary">문제 풀이</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-content-primary">{formatPercent(dashboardData.overall_accuracy)}</span>
              <span className="text-content-secondary">정답률</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-content-primary">{formatPercent(dashboardData.score_rate)}</span>
              <span className="text-content-secondary">점수율</span>
            </div>
            {dashboardData.retry_recommendations.length > 0 && (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-brand-300">{dashboardData.retry_recommendations.length}</span>
                <span className="text-content-secondary">재도전 추천</span>
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-3xl border border-white/[0.07] border-l-4 border-l-brand-500 bg-surface-raised px-6 py-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">{primaryAction.eyebrow}</p>
          <h2 className="mt-3 text-2xl font-semibold text-content-primary">{primaryAction.title}</h2>
          {primaryAction.description && (
            <p className="mt-3 text-sm leading-6 text-content-secondary">{primaryAction.description}</p>
          )}

          <Link
            to={primaryAction.to}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            {primaryAction.buttonLabel}
          </Link>

          <div className="mt-8 grid gap-2 border-t border-white/[0.07] pt-6 text-sm text-content-secondary">
            <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
              <span>오답 기록</span>
              <span className="font-medium text-content-primary">{dashboardData.recent_wrong_notes.length}건</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
              <span>취약 개념</span>
              <span className="font-medium text-content-primary">{dashboardData.weak_concepts.length}건</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
              <span>재도전 추천</span>
              <span className="font-medium text-brand-300">{dashboardData.retry_recommendations.length}건</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="mt-2 text-2xl font-semibold text-content-primary">다시 볼 개념</h2>
            <Link to="/retry" className="text-sm font-medium text-brand-300 hover:text-brand-400">
              재도전 보기
            </Link>
          </div>

          {retryRecommendations.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5 text-sm leading-6 text-content-secondary">지금 바로 권할 재도전은 많지 않아요.</div>
          ) : (
            <div className="mt-6 divide-y divide-white/[0.07] rounded-2xl border border-white/[0.07] bg-surface-deep">
              {retryRecommendations.map((concept) => (
                <div key={concept.concept_key} className="px-5 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-medium text-brand-300">
                          {concept.category_tag || '복습 추천'}
                        </span>
                        <span className="text-xs text-content-secondary">
                          오답 {concept.wrong_count}회 · 부분정답 {concept.partial_count}회
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-content-primary break-words">
                        {concept.concept_label}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-content-secondary break-words">
                        {concept.recommended_action || '이 개념을 한 번 더 확인해 보세요.'}
                      </p>
                    </div>
                    <Link
                      to="/retry"
                      className="inline-flex items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-500/15"
                    >
                      바로 복습
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-7">
          <h2 className="mt-2 text-2xl font-semibold text-content-primary">흔들린 문제</h2>

          {recentWrongNotes.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5 text-sm leading-6 text-content-secondary">
              최근 오답 기록이 없어요.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {recentWrongNotes.map((note, index) => (
                <div
                  key={`${note.concept_key}-${index}`}
                  className="rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-content-secondary">
                    <span className="rounded-full bg-semantic-warning-bg px-3 py-1 text-semantic-warning">
                      {note.judgement === 'incorrect' ? '오답 기록' : '부분정답 기록'}
                    </span>
                    <span>{formatDateTime(note.graded_at)}</span>
                  </div>
                  <div className="mt-3 text-base font-medium leading-7 text-content-primary break-words">
                    {note.question_text}
                  </div>
                  <div className="mt-2 text-sm text-content-secondary break-words">
                    {note.concept_label || '개념 정보 없음'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold text-content-primary">세부 지표</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCategoryTag ?? ''}
              onChange={(e) => setSelectedCategoryTag(e.target.value || null)}
              className="rounded-xl border border-white/[0.07] bg-surface-deep px-3 py-2 text-sm text-content-primary transition-colors hover:bg-surface-hover focus:outline-none"
            >
              <option value="">과목별 전체</option>
              {[...new Set(dashboardData.accuracy_by_subject.map((s) => s.category_tag))].map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <select
              value={selectedFileId ?? ''}
              onChange={(e) => setSelectedFileId(e.target.value || null)}
              className="rounded-xl border border-white/[0.07] bg-surface-deep px-3 py-2 text-sm text-content-primary transition-colors hover:bg-surface-hover focus:outline-none"
            >
              <option value="">자료별 전체</option>
              {dashboardData.accuracy_by_file.map((f) => (
                <option key={f.file_id} value={f.file_id}>{f.filename}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[28rem_minmax(0,1fr)]">
          <section className="rounded-3xl border border-white/[0.07] bg-surface px-7 py-8">
            <h3 className="text-xl font-semibold text-content-primary">핵심 지표</h3>
            <div className="mt-8 space-y-7">
              <div>
                <div className="flex items-end justify-between gap-4">
                  <span className="text-sm text-content-secondary">전체 정답률</span>
                  <span className="text-3xl font-semibold tabular-nums text-content-primary">{formatPercent(dashboardData.overall_accuracy)}</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-deep">
                  <div
                    className="h-full rounded-full bg-brand-500 animate-progress-fill"
                    style={{ width: `${Math.min(dashboardData.overall_accuracy * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-end justify-between gap-4">
                  <span className="text-sm text-content-secondary">점수율</span>
                  <span className="text-3xl font-semibold tabular-nums text-content-primary">{formatPercent(dashboardData.score_rate)}</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-deep">
                  <div
                    className="h-full rounded-full bg-brand-400 animate-progress-fill"
                    style={{ width: `${Math.min(dashboardData.score_rate * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
                <div className="text-sm text-content-secondary">학습량</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tabular-nums text-content-primary">{dashboardData.learning_volume}</span>
                  <span className="text-sm text-content-secondary">문제 풀이</span>
                </div>
              </div>
            </div>
          </section>

          <div className="grid auto-rows-fr gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <section className="rounded-3xl border border-white/[0.07] bg-surface-deep px-6 py-7">
              <h3 className="text-lg font-semibold text-content-primary">취약 개념 상위</h3>
              {weakConcepts.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-surface px-4 py-4 text-sm text-content-secondary">
                  아직 집계할 취약 개념이 없습니다.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {weakConcepts.map((concept) => (
                    <div key={concept.concept_key} className="rounded-xl border border-white/[0.07] bg-surface px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-content-primary break-words">
                            {concept.concept_label}
                          </div>
                          <div className="mt-1 text-xs text-content-secondary">
                            오답 {concept.wrong_count}회 · 부분정답 {concept.partial_count}회
                          </div>
                        </div>
                        <Link to="/retry" className="shrink-0 text-xs font-medium text-brand-300 hover:text-brand-400">
                          재도전
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-white/[0.07] bg-surface-deep px-6 py-7">
              <h3 className="text-lg font-semibold text-content-primary">문제 유형별 흐름</h3>
              {dashboardData.accuracy_by_type.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-surface px-4 py-4 text-sm text-content-secondary">
                  아직 유형별로 보기엔 데이터가 충분하지 않습니다.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {dashboardData.accuracy_by_type.map((item, index) => (
                    <div key={`${item.question_type}-${index}`} className="space-y-2">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-content-primary break-words">{formatQuestionType(item.question_type)}</span>
                        <span className="whitespace-nowrap font-medium text-content-primary">
                          {formatPercent(item.accuracy)} · {item.count}문제
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${Math.max(0, Math.min(item.accuracy * 100, 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-white/[0.07] bg-surface-deep px-6 py-7">
              <h3 className="text-lg font-semibold text-content-primary">자료별 정확도</h3>
              {dashboardData.accuracy_by_file.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-surface px-4 py-4 text-sm text-content-secondary">
                  아직 자료별 집계가 없습니다.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {dashboardData.accuracy_by_file.map((item) => (
                    <div key={item.file_id} className="space-y-2">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="truncate text-content-primary">{item.filename}</span>
                        <span className="whitespace-nowrap font-medium text-content-primary">
                          {formatPercent(item.accuracy)} · {item.count}문제
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${Math.max(0, Math.min(item.accuracy * 100, 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        </div>
      </section>

    </div>
  );
}
