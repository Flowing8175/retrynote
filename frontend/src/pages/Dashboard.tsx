import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { dashboardApi } from '@/api';
import type { DashboardResponse, RetryLocationState } from '@/types';
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
    return '반복된 오답 개념부터 다시 복습해 보세요.';
  }

  if (dashboardData.recent_wrong_notes.length > 0) {
    return '최근에 막힌 문제부터 다시 풀어보세요.';
  }

  return '좋은 흐름입니다. 꾸준히 학습을 이어가세요.';
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

  const navigate = useNavigate();
  const handleStartQuiz = () => navigate('/quiz/new');

  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: ['dashboard', range, selectedFileId, selectedCategoryTag],
    queryFn: () => dashboardApi.getDashboard(range, selectedFileId, selectedCategoryTag),
  });

  if (isLoading) {
    return <LoadingSpinner message="학습 데이터를 불러오는 중입니다" />;
  }

  if (isError || !dashboardData) {
    return (
      <div className="max-w-4xl mx-auto py-32 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-white">대시보드를 불러오지 못했습니다</h1>
        <p className="text-base text-content-secondary">잠시 후 다시 시도해 주세요.</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center bg-surface-raised text-white border border-white/[0.1] px-6 h-12 rounded-xl text-sm font-semibold"
        >
          새로고침
        </button>
      </div>
    );
  }

  const hasData = dashboardData.learning_volume > 0;
  const coachingMessage = getCoachingMessage(dashboardData);
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
          <h1 className="text-3xl font-medium tracking-tight text-content-primary md:text-4xl leading-tight">
            성장의 첫 걸음,<br />자료를 올려보세요.
          </h1>
          <p className="mt-6 text-lg text-content-secondary max-w-2xl leading-relaxed">
            학습 자료를 업로드하면 AI가 핵심 개념을 분석하여 당신만의 맞춤형 퀴즈를 생성합니다.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Link
            to="/files"
            className="group relative overflow-hidden rounded-3xl bg-surface p-10 transition-all hover:bg-surface-hover border border-white/[0.05]"
          >
            <div className="relative z-10">
              <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-brand-300">시작하기</div>
              <h2 className="text-2xl font-semibold text-white">자료 올리기</h2>
              <p className="mt-3 text-sm leading-relaxed text-content-secondary">PDF나 문서 파일을 분석하여 학습 맵을 구성합니다.</p>
            </div>
          </Link>

          <button
            type="button"
            onClick={handleStartQuiz}
            className="group relative overflow-hidden rounded-3xl bg-brand-500/10 p-10 text-left transition-all hover:bg-brand-500/15 border border-brand-500/20"
          >
            <div className="relative z-10">
              <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-brand-300">바로 시작</div>
              <h2 className="text-2xl font-semibold text-white">퀴즈 시작</h2>
              <p className="mt-3 text-sm leading-relaxed text-content-secondary">자료 없이도 AI와 함께 바로 학습을 시작할 수 있습니다.</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-20 py-8">
      {/* Hero Section: Coaching & Action */}
      <section className="grid gap-12 lg:grid-cols-[1fr_360px] items-start">
        <div className="animate-fade-in-up space-y-8">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-300 bg-brand-500/10 px-3 py-1.5 rounded-full">{rangeLabel}</span>
            <div className="flex gap-2 p-1 bg-surface-deep rounded-full border border-white/[0.05]">
              {(['7d', '30d', 'all'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRange(item)}
                  className={`text-xs font-medium uppercase tracking-widest transition-all px-4 py-1.5 rounded-full ${
                    range === item
                      ? 'bg-surface text-white shadow-sm'
                      : 'text-content-muted hover:text-content-secondary'
                  }`}
                >
                  {item === '7d' ? '7일' : item === '30d' ? '30일' : '전체'}
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-4xl space-y-4">
            <h1 className="text-2xl font-medium tracking-tight text-content-primary lg:text-3xl leading-snug">
              {coachingMessage}
            </h1>
          </div>

          <div className="flex flex-wrap gap-8 pt-8">
            <div className="bg-surface border border-white/[0.05] rounded-3xl p-6 flex-1 min-w-[140px]">
              <div className="text-xs font-medium uppercase tracking-widest text-content-muted mb-2">학습량</div>
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-medium tabular-nums text-content-primary">{dashboardData.learning_volume}</div>
                <div className="text-sm font-medium text-content-secondary">문제</div>
              </div>
            </div>
            <div className="bg-surface border border-white/[0.05] rounded-3xl p-6 flex-1 min-w-[140px]">
              <div className="text-xs font-medium uppercase tracking-widest text-content-muted mb-2">정답률</div>
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-medium tabular-nums text-brand-300">{formatPercent(dashboardData.overall_accuracy)}</div>
              </div>
            </div>
            <div className="bg-surface border border-white/[0.05] rounded-3xl p-6 flex-1 min-w-[140px]">
              <div className="text-xs font-medium uppercase tracking-widest text-content-muted mb-2">점수율</div>
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-medium tabular-nums text-content-primary">{formatPercent(dashboardData.score_rate)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-deep border border-white/[0.05] rounded-3xl p-8 animate-fade-in-up stagger-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-300 mb-4">{primaryAction.eyebrow}</div>
          <h2 className="text-2xl font-semibold text-white mb-3">{primaryAction.title}</h2>
          <p className="text-content-secondary text-sm leading-relaxed mb-8">
            {primaryAction.description}
          </p>
          <Link
            to={primaryAction.to}
            state={primaryAction.to === '/retry' ? allRetryState : undefined}
            className="w-full inline-flex items-center justify-center bg-brand-500 text-brand-900 rounded-2xl px-6 py-4 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            {primaryAction.buttonLabel}
          </Link>
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        {/* Left: Retry Recommendations */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
            <h2 className="text-2xl font-semibold text-content-primary">복습이 필요한 개념</h2>
            <Link to="/retry" state={allRetryState} className="text-sm font-medium text-brand-300 hover:text-brand-400">
              전체 보기
            </Link>
          </div>

          {retryRecommendations.length === 0 ? (
            <div className="text-sm text-content-muted py-8 text-center bg-surface-deep rounded-3xl border border-white/[0.05]">
              현재 복습이 시급한 개념은 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {retryRecommendations.map((concept) => (
                <div key={concept.concept_key} className="bg-surface border border-white/[0.05] rounded-3xl p-6 group transition-colors hover:bg-surface-hover">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-brand-300 bg-brand-500/10 px-2.5 py-1 rounded-md">
                          {concept.category_tag || '개념'}
                        </span>
                        <span className="text-xs text-content-muted">
                          오답 {concept.wrong_count} · 부분정답 {concept.partial_count}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-white group-hover:text-brand-300 transition-colors">
                        {concept.concept_label}
                      </h3>
                      <p className="text-sm text-content-secondary line-clamp-1">
                        {concept.recommended_action || '이 개념을 한 번 더 확인해 보세요.'}
                      </p>
                    </div>
                    <Link
                      to="/retry"
                      state={{ conceptKeys: [concept.concept_key], conceptLabels: { [concept.concept_key]: concept.concept_label } } satisfies RetryLocationState}
                      className="shrink-0 inline-flex items-center justify-center bg-surface-deep border border-white/[0.05] rounded-xl px-4 py-2 text-sm font-medium text-white hover:bg-white/5 transition-colors"
                    >
                      복습하기
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: Recent Errors */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
            <h2 className="text-2xl font-semibold text-white">최근 오답 노트</h2>
            <Link to="/wrong-notes" className="text-sm font-medium text-brand-300 hover:text-brand-400">
              전체 보기
            </Link>
          </div>

          {recentWrongNotes.length === 0 ? (
            <div className="text-sm text-content-muted py-8 text-center bg-surface-deep rounded-3xl border border-white/[0.05]">
              최근에 틀린 문제가 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {recentWrongNotes.map((note, index) => (
                <div
                  key={`${note.concept_key}-${index}`}
                  className="bg-surface border border-white/[0.05] rounded-3xl p-6"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${note.judgement === 'incorrect' ? 'bg-semantic-error/10 text-semantic-error' : 'bg-semantic-warning/10 text-semantic-warning'}`}>
                      {note.judgement === 'incorrect' ? '오답' : '부분정답'}
                    </span>
                    <span className="text-xs text-content-muted">
                      {formatDateTime(note.graded_at)}
                    </span>
                  </div>
                  <div className="text-base font-medium text-white mb-2 line-clamp-2">
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

      {/* Metrics Section */}
      <section className="pt-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-8">
          <h2 className="text-2xl font-semibold text-white">세부 학습 지표</h2>
          
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedCategoryTag ?? ''}
              onChange={(e) => setSelectedCategoryTag(e.target.value || null)}
              className="bg-surface border border-white/[0.05] rounded-xl text-sm px-4 py-2 text-content-primary focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="">전체 주제</option>
              {[...new Set(dashboardData.accuracy_by_subject.map((s) => s.category_tag))].map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <select
              value={selectedFileId ?? ''}
              onChange={(e) => setSelectedFileId(e.target.value || null)}
              className="bg-surface border border-white/[0.05] rounded-xl text-sm px-4 py-2 text-content-primary focus:ring-2 focus:ring-brand-500 focus:outline-none"
            >
              <option value="">전체 자료</option>
              {dashboardData.accuracy_by_file.map((f) => (
                <option key={f.file_id} value={f.file_id}>{f.filename}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-surface border border-white/[0.05] rounded-3xl p-8 space-y-6">
            <h3 className="text-sm font-semibold text-content-secondary">취약점 분석</h3>
            {weakConcepts.length === 0 ? (
              <div className="text-sm text-content-muted">분석할 취약 데이터가 충분하지 않습니다.</div>
            ) : (
              <div className="space-y-4">
                {weakConcepts.map((concept) => (
                  <div key={concept.concept_key} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{concept.concept_label}</div>
                      <div className="text-xs text-content-muted mt-1">
                        {concept.wrong_count}회 오답 · {concept.partial_count}회 부분정답
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-white/[0.05] rounded-3xl p-8 space-y-6">
            <h3 className="text-sm font-semibold text-content-secondary">유형별 정답률</h3>
            <div className="space-y-5">
              {dashboardData.accuracy_by_type.map((item, index) => (
                <div key={`${item.question_type}-${index}`} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-content-primary">{formatQuestionType(item.question_type)}</span>
                    <span className="font-medium text-white">{formatPercent(item.accuracy)}</span>
                  </div>
                  <div className="h-1.5 bg-surface-deep rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full"
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
  );
}
