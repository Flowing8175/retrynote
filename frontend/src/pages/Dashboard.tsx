import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { dashboardApi } from '@/api';
import CoachingDisplay from '@/components/CoachingDisplay';
import DiagramModal from '@/components/DiagramModal';
import type { DashboardResponse, RetryLocationState } from '@/types';
import { formatPercent, formatQuestionType, formatDateTime } from '@/utils/formatters';

function DashboardSkeleton() {
  return (
    <div className="space-y-20 py-8 animate-pulse" aria-hidden="true">
      {/* Hero Section */}
      <section className="grid gap-12 lg:grid-cols-[1fr_300px] items-start">
        <div className="space-y-10">
          {/* Range picker */}
          <div className="skeleton h-8 w-48 rounded-md" />
          {/* Headline */}
          <div className="space-y-3">
            <div className="skeleton h-10 w-64 rounded-md" />
            <div className="skeleton h-5 w-96 max-w-full rounded-md" />
          </div>
          {/* Metrics */}
          <div className="pt-2 space-y-3">
            <div className="space-y-2">
              <div className="skeleton h-12 sm:h-20 w-24 sm:w-36 rounded-md" />
              <div className="skeleton h-3 w-20 rounded-md" />
            </div>
            <div className="skeleton h-4 w-48 rounded-md" />
          </div>
        </div>
        {/* Primary action card */}
        <div className="bg-surface-deep border border-white/[0.05] rounded-xl p-7 space-y-4">
          <div className="skeleton h-3 w-24 rounded-md" />
          <div className="skeleton h-6 w-40 rounded-md" />
          <div className="skeleton h-4 w-full rounded-md" />
          <div className="skeleton h-4 w-3/4 rounded-md" />
          <div className="skeleton h-12 w-full rounded-lg mt-4" />
        </div>
      </section>

      {/* Two-column content */}
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-1">
          <div className="skeleton h-3 w-32 mb-4 rounded-md" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-4 border-b border-white/[0.05]">
              <div className="space-y-1.5">
                <div className="skeleton h-4 w-48 rounded-md" />
                <div className="skeleton h-3 w-32 rounded-md" />
              </div>
              <div className="skeleton h-3 w-16 rounded-md" />
            </div>
          ))}
        </section>
        <section className="space-y-1">
          <div className="skeleton h-3 w-32 mb-4 rounded-md" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="py-4 border-b border-white/[0.05]">
              <div className="skeleton h-3 w-24 mb-2 rounded-md" />
              <div className="skeleton h-4 w-full mb-1 rounded-md" />
              <div className="skeleton h-3 w-28 rounded-md" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}



function getFallbackCoachingMessage(dashboardData: DashboardResponse) {
  if (dashboardData.retry_recommendations.length > 0) {
    return '반복된 오답 개념부터 다시 복습해 보세요.';
  }

  if (dashboardData.recent_wrong_notes.length > 0) {
    return '최근에 막힌 문제부터 다시 풀어보세요.';
  }

  return '좋은 흐름입니다. 꾸준히 학습을 이어가세요.';
}

function getHeadline(dashboardData: DashboardResponse) {
  if (dashboardData.retry_recommendations.length > 0) {
    return '약점을 보완할 시간';
  }
  if (dashboardData.recent_wrong_notes.length > 0) {
    return '오답에서 배웁니다';
  }
  return '꾸준히 성장 중';
}

function getPrimaryAction(dashboardData: DashboardResponse) {
  if (dashboardData.retry_recommendations.length > 0) {
    return {
      to: '/retry',
      eyebrow: '다음 추천 학습',
      title: '재도전부터 시작하기',
      description: `${dashboardData.retry_recommendations.length}개의 추천 복습이 준비되어 있습니다.`,
      buttonLabel: '재도전 시작',
    };
  }

  return {
    to: '/quiz/new',
    eyebrow: '다음 추천 학습',
    title: '새 퀴즈로 이어가기',
    description: '새로운 퀴즈를 풀며 실력을 점검해 보세요.',
    buttonLabel: '새 퀴즈 만들기',
  };
}

export default function Dashboard() {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedCategoryTag, setSelectedCategoryTag] = useState<string | null>(null);
  const [diagramModal, setDiagramModal] = useState<{ conceptKey: string; conceptLabel: string } | null>(null);

  const navigate = useNavigate();
  const handleStartQuiz = () => navigate('/quiz/new');

  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: ['dashboard', range, selectedFileId, selectedCategoryTag],
    queryFn: () => dashboardApi.getDashboard(range, selectedFileId, selectedCategoryTag),
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError || !dashboardData) {
    return (
      <div className="max-w-4xl mx-auto py-32 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-white">대시보드를 불러오지 못했습니다</h1>
        <p className="text-base text-content-secondary">잠시 후 다시 시도해 주세요.</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center bg-surface-raised text-white border border-white/[0.1] px-6 h-12 rounded-lg text-sm font-semibold"
        >
          새로고침
        </button>
      </div>
    );
  }

  const hasData = dashboardData.learning_volume > 0;
  const fallbackCoaching = getFallbackCoachingMessage(dashboardData);
  const headline = getHeadline(dashboardData);
  const retryRecommendations = dashboardData.retry_recommendations.slice(0, 3);
  const recentWrongNotes = dashboardData.recent_wrong_notes.slice(0, 4);
  const weakConcepts = dashboardData.weak_concepts.slice(0, 5);
  const primaryAction = getPrimaryAction(dashboardData);
  const rangeLabel = range === '7d' ? '최근 7일' : range === '30d' ? '최근 30일' : '전체 기간';

  const allRetryState: RetryLocationState = {
    conceptKeys: dashboardData.retry_recommendations.map((r) => r.concept_key),
    conceptLabels: Object.fromEntries(dashboardData.retry_recommendations.map((r) => [r.concept_key, r.concept_label])),
  };

  if (!hasData) {
    return (
      <div className="max-w-4xl mx-auto space-y-16 py-20">
        <div className="animate-fade-in-up">
          <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl leading-tight">
            성장의 첫 걸음,<br />자료를 올려보세요.
          </h1>
          <p className="mt-6 text-lg text-content-secondary max-w-2xl leading-relaxed">
            학습 자료를 업로드하면 AI가 핵심 개념을 분석하여 당신만의 맞춤형 퀴즈를 생성합니다.
          </p>
        </div>

        <div className="space-y-6">
          <Link to="/files" className="group flex items-start gap-5 rounded-xl bg-surface p-6 border border-white/[0.05] hover:bg-surface-hover transition-colors">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-300 text-sm font-bold">1</div>
            <div>
              <h2 className="text-lg font-semibold text-white">자료 업로드</h2>
              <p className="mt-1 text-sm text-content-secondary">PDF, Word, 이미지 등 학습 자료를 올려주세요.</p>
            </div>
          </Link>
          <button type="button" onClick={handleStartQuiz} className="group w-full flex items-start gap-5 rounded-xl bg-surface p-6 border border-white/[0.05] hover:bg-surface-hover transition-colors text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-300 text-sm font-bold">2</div>
            <div>
              <h2 className="text-lg font-semibold text-white">퀴즈 생성</h2>
              <p className="mt-1 text-sm text-content-secondary">AI가 자료를 분석해 핵심 문제를 만들어줍니다.</p>
            </div>
          </button>
          <div className="flex items-start gap-5 rounded-xl bg-surface-deep/50 p-6 border border-white/[0.05] opacity-60">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-content-muted text-sm font-bold">3</div>
            <div>
              <h2 className="text-lg font-semibold text-content-muted">오답 분석 & 재도전</h2>
              <p className="mt-1 text-sm text-content-muted">틀린 문제를 복습하고 약점을 보완하세요.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-20 py-8">
      {/* Hero Section */}
      <section className="grid gap-12 lg:grid-cols-[1fr_300px] items-start">
        <div className="animate-fade-in-up space-y-10">
          {/* Range picker — squared down, no pill shapes */}
          <div className="flex items-center gap-4">
            <div className="flex gap-px bg-surface-deep p-1 rounded-md border border-white/[0.05]">
              {(['7d', '30d', 'all'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={`text-xs font-medium uppercase tracking-widest transition-all px-3 py-1.5 rounded-sm ${
                    range === item
                      ? 'bg-surface text-white shadow-sm'
                      : 'text-content-muted hover:text-content-secondary'
                  }`}
                >
                  {item === '7d' ? '7일' : item === '30d' ? '30일' : '전체'}
                </button>
              ))}
            </div>
            <span className="text-xs text-content-muted">{rangeLabel}</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-white leading-tight">
              {headline}
            </h1>
            <CoachingDisplay
              message={dashboardData.coaching_summary}
              fallbackMessage={fallbackCoaching}
            />
          </div>

          <div className="pt-2 space-y-3">
            <div>
              <div className="text-5xl sm:text-7xl font-semibold tabular-nums text-brand-300 leading-none">
                {formatPercent(dashboardData.overall_accuracy)}
              </div>
              <div className="mt-2 text-xs font-medium uppercase tracking-widest text-content-muted">전체 정답률</div>
            </div>
            <div className="flex items-center gap-3 text-sm text-content-muted">
              <span>{dashboardData.learning_volume}문제 학습</span>
              <span>·</span>
              <span>점수율 {formatPercent(dashboardData.score_rate)}</span>
            </div>
          </div>
        </div>

        {/* Primary action — kept as a contained block but sharper */}
        <div className="bg-surface-deep border border-white/[0.05] rounded-xl p-7 animate-fade-in-up stagger-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-300 mb-3">{primaryAction.eyebrow}</div>
          <h2 className="text-xl font-semibold text-white mb-2">{primaryAction.title}</h2>
          <p className="text-content-secondary text-sm leading-relaxed mb-7">
            {primaryAction.description}
          </p>
          <Link
            to={primaryAction.to}
            state={primaryAction.to === '/retry' ? allRetryState : undefined}
            className="w-full inline-flex items-center justify-center bg-brand-500 text-brand-900 rounded-lg px-6 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            {primaryAction.buttonLabel}
          </Link>
        </div>
      </section>

      {/* Main content — list-based, no card grids */}
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        {/* Left: Retry Recommendations */}
        <section>
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted">복습이 필요한 개념</h2>
            <Link to="/retry" state={allRetryState} className="text-xs font-medium text-brand-300 hover:text-brand-400">
              전체 보기
            </Link>
          </div>

          {retryRecommendations.length === 0 ? (
            <div className="text-sm text-content-muted py-10">
              현재 복습이 시급한 개념은 없습니다.
            </div>
          ) : (
            <div>
              {retryRecommendations.map((concept) => (
                <div key={concept.concept_key} className="group flex items-center justify-between gap-4 py-4 border-b border-white/[0.05] last:border-0">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium text-content-primary group-hover:text-brand-300 transition-colors truncate">
                      {concept.concept_label}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-content-muted">
                      {concept.category_tag && !concept.category_tag.includes('_') && (
                        <>
                          <span className="text-brand-300/60">{concept.category_tag}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>오답 {concept.wrong_count}</span>
                      <span>·</span>
                      <span>부분정답 {concept.partial_count}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setDiagramModal({ conceptKey: concept.concept_key, conceptLabel: concept.concept_label })}
                    className="shrink-0 text-xs font-medium text-content-muted hover:text-white transition-colors"
                  >
                    복습하기 →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: Recent Wrong Notes */}
        <section>
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted">최근 오답 노트</h2>
            <Link to="/wrong-notes" className="text-xs font-medium text-brand-300 hover:text-brand-400">
              전체 보기
            </Link>
          </div>

          {recentWrongNotes.length === 0 ? (
            <div className="text-sm text-content-muted py-10">
              최근에 틀린 문제가 없습니다.
            </div>
          ) : (
            <div>
              {recentWrongNotes.map((note, index) => (
                <div
                  key={`${note.concept_key}-${index}`}
                  className="py-4 border-b border-white/[0.05] last:border-0"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-medium ${note.judgement === 'incorrect' ? 'text-semantic-error' : 'text-semantic-warning'}`}>
                      {note.judgement === 'incorrect' ? '오답' : '부분정답'}
                    </span>
                    <span className="text-xs text-content-muted">· {formatDateTime(note.graded_at)}</span>
                  </div>
                  <div className="text-sm font-medium text-content-primary line-clamp-2 mb-1">
                    {note.question_text}
                  </div>
                  <div className="text-xs text-content-muted">
                    {note.concept_label || '미분류 개념'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Detailed metrics */}
      <section className="pt-8 border-t border-white/[0.05]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-content-muted">세부 학습 지표</h2>

          <div className="flex flex-wrap gap-2">
            <select
              value={selectedCategoryTag ?? ''}
              onChange={(e) => setSelectedCategoryTag(e.target.value || null)}
              className="bg-surface-deep border border-white/[0.05] rounded-md text-xs px-3 py-2 text-content-secondary focus:ring-1 focus:ring-brand-500 focus:outline-none"
            >
              <option value="">전체 주제</option>
              {[...new Set(dashboardData.accuracy_by_subject.map((s) => s.category_tag))].map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <select
              value={selectedFileId ?? ''}
              onChange={(e) => setSelectedFileId(e.target.value || null)}
              className="bg-surface-deep border border-white/[0.05] rounded-md text-xs px-3 py-2 text-content-secondary focus:ring-1 focus:ring-brand-500 focus:outline-none"
            >
              <option value="">전체 자료</option>
              {dashboardData.accuracy_by_file.map((f) => (
                <option key={f.file_id} value={f.file_id}>{f.filename}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-content-muted mb-5">취약점 분석</h3>
            {weakConcepts.length === 0 ? (
              <div className="text-sm text-content-muted">분석할 취약 데이터가 충분하지 않습니다.</div>
            ) : (
              <div>
                {weakConcepts.map((concept, i) => (
                  <div key={concept.concept_key} className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.05] last:border-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-content-primary truncate">{concept.concept_label}</div>
                      <div className="text-xs text-content-muted mt-0.5">
                        오답 {concept.wrong_count} · 부분정답 {concept.partial_count}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-content-muted">#{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-content-muted mb-5">유형별 정답률</h3>
            <div className="space-y-5">
              {dashboardData.accuracy_by_type.map((item, index) => (
                <div key={`${item.question_type}-${index}`} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-content-secondary">{formatQuestionType(item.question_type)}</span>
                    <span className="font-semibold tabular-nums text-content-primary">{formatPercent(item.accuracy)}</span>
                  </div>
                  <div className="h-px bg-surface-deep overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${Math.max(0, Math.min(item.accuracy * 100, 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
    <DiagramModal
      isOpen={diagramModal !== null}
      onClose={() => setDiagramModal(null)}
      conceptKey={diagramModal?.conceptKey ?? ''}
      conceptLabel={diagramModal?.conceptLabel ?? ''}
    />
    </>
  );
}
