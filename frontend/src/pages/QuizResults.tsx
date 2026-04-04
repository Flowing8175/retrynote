import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { quizApi, retryApi } from '@/api';
import { objectionsApi } from '@/api/objections';
import { StatusBadge, LoadingSpinner } from '@/components';
import type { QuizItemResponse } from '@/types';
import { Trophy, ChevronRight, RotateCcw, AlertTriangle, FileText, LayoutDashboard } from 'lucide-react';

function formatMode(mode: string) {
  return mode === 'exam' ? '시험 모드' : '일반 모드';
}

function formatDifficulty(difficulty: string | null) {
  if (!difficulty) return '난이도 무관';
  const difficultyMap: Record<string, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
  return difficultyMap[difficulty] || difficulty;
}

function getPerformanceTier(scorePercentage: number) {
  if (scorePercentage >= 90) {
    return {
      badge: '탁월한 성취',
      colorClass: 'text-semantic-success',
      bgClass: 'bg-semantic-success/10',
      borderClass: 'border-semantic-success/30',
      headline: '안정적인 정답률을 기록했습니다.',
      message: '이 도메인의 핵심 개념을 잘 이해하고 있습니다. 이제 난이도를 높이거나 다른 범위를 학습할 준비가 되었습니다.',
      primaryAction: { label: '새 퀴즈 시작하기', to: '/quiz/new' }
    };
  }
  if (scorePercentage >= 70) {
    return {
      badge: '안정적인 흐름',
      colorClass: 'text-brand-300',
      bgClass: 'bg-brand-500/10',
      borderClass: 'border-brand-500/30',
      headline: '좋은 기반이 다져지고 있습니다.',
      message: '일부 사소한 오답만 보완한다면 개념을 완벽히 마스터할 수 있습니다. 오답노트를 확인해보세요.',
      primaryAction: { label: '오답노트 복습하기', to: '/wrong-notes' }
    };
  }
  return {
    badge: '복습 권장',
    colorClass: 'text-semantic-warning',
    bgClass: 'bg-semantic-warning/10',
    borderClass: 'border-semantic-warning/30',
    headline: '핵심 개념의 복습이 필요합니다.',
    message: '부분적으로 혼동이 있는 개념들이 발견되었습니다. 해설을 읽어보고 다시 한 번 도전해 보세요.',
    primaryAction: { label: '오답노트 확인하기', to: '/wrong-notes' }
  };
}

export default function QuizResults() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [selectedItemIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['quizSession', sessionId],
    queryFn: () => quizApi.getQuizSession(sessionId || ''),
    enabled: !!sessionId,
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['quizItems', sessionId],
    queryFn: () => quizApi.getQuizItems(sessionId || ''),
    enabled: !!sessionId,
  });

  const { data: answerLogs } = useQuery({
    queryKey: ['quizAnswerLogs', sessionId],
    queryFn: () => quizApi.getAnswerLogs(sessionId || ''),
    enabled: !!sessionId,
  });

  const scorePercentage = session?.score_rate ? session.score_rate * 100 : 0;
  const tier = getPerformanceTier(scorePercentage);

  if (sessionLoading || itemsLoading || !session) {
    return <LoadingSpinner message="결과를 분석하고 있습니다" />;
  }

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-16">
      {/* Score Hero */}
      <section className="animate-fade-in-up">
        <div className="bg-surface border border-white/[0.05] rounded-3xl p-10 sm:p-16 flex flex-col items-center text-center space-y-8">
          <div className="relative">
            <svg className="w-48 h-48 sm:w-56 sm:h-56 transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/[0.05]" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={`${Math.max(0, scorePercentage * 2.827)} 282.7`}
                className={`${tier.colorClass} transition-all duration-1000 ease-out`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl sm:text-6xl font-semibold tabular-nums text-white tracking-tight">{Math.round(scorePercentage)}</span>
              <span className="text-sm font-medium text-content-muted mt-1">점</span>
            </div>
          </div>

          <div className="space-y-4 max-w-xl">
            <div className="flex justify-center">
              <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-md border ${tier.borderClass} ${tier.bgClass} ${tier.colorClass}`}>
                {tier.badge}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white leading-snug">
              {tier.headline}
            </h1>
            <p className="text-base text-content-secondary leading-relaxed">
              {tier.message}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto pt-4">
            <Link
              to={tier.primaryAction.to}
              className="bg-brand-500 text-brand-900 px-8 py-3.5 rounded-xl text-sm font-semibold hover:-translate-y-0.5 transition-transform"
            >
              {tier.primaryAction.label}
            </Link>
            <Link
              to="/"
              className="bg-surface-deep text-white border border-white/[0.05] px-8 py-3.5 rounded-xl text-sm font-medium hover:bg-surface-hover transition-colors"
            >
              대시보드로 돌아가기
            </Link>
          </div>
        </div>
      </section>

      {/* Metrics Split */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="bg-surface border border-white/[0.05] rounded-2xl p-6 space-y-2 text-center sm:text-left">
          <div className="text-xs font-medium text-content-muted">학습량</div>
          <div className="text-3xl font-semibold text-white">{session.learning_volume} <span className="text-sm font-medium text-content-secondary ml-1">문제</span></div>
        </div>
        <div className="bg-surface border border-white/[0.05] rounded-2xl p-6 space-y-2 text-center sm:text-left">
          <div className="text-xs font-medium text-content-muted">정답률</div>
          <div className="text-3xl font-semibold text-brand-300">{(session.overall_accuracy * 100).toFixed(1)}<span className="text-2xl ml-0.5">%</span></div>
        </div>
        <div className="bg-surface border border-white/[0.05] rounded-2xl p-6 space-y-2 text-center sm:text-left">
          <div className="text-xs font-medium text-content-muted">학습 모드</div>
          <div className="text-xl font-medium text-white pt-1">{formatMode(session.mode)}</div>
        </div>
      </section>

      {/* Detailed Analysis */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
          <h2 className="text-2xl font-semibold text-white">문항별 풀이 결과</h2>
        </div>

        <div className="space-y-4">
          {items?.map((item, index) => {
            const log = answerLogs?.find(l => l.quiz_item_id === item.id);
            const isCorrect = log?.judgement === 'correct';

            return (
              <article key={item.id} className="bg-surface border border-white/[0.05] rounded-3xl p-6 sm:p-8 space-y-6 transition-all hover:bg-surface-hover">
                <div className="flex items-start gap-4 sm:gap-6">
                  <div className="w-8 h-8 shrink-0 rounded-full bg-surface-deep flex items-center justify-center text-sm font-semibold text-content-muted">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={log?.judgement || 'pending'} />
                      <span className="text-xs font-medium text-content-muted">{item.concept_label || '개념'}</span>
                    </div>

                    <h3 className="text-lg font-medium text-white leading-relaxed">
                      {item.question_text}
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-content-muted">제출한 답안</div>
                        <div className={`p-4 rounded-xl text-sm font-medium border ${isCorrect ? 'bg-brand-500/5 border-brand-500/30 text-brand-300' : 'bg-surface-deep border-white/[0.05] text-white'}`}>
                          {log?.user_answer || '미응답'}
                        </div>
                      </div>
                      {!isCorrect && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium text-brand-300">정답</div>
                          <div className="p-4 bg-brand-500 text-brand-900 rounded-xl text-sm font-medium">
                            {String(item.correct_answer?.answer || '알 수 없음')}
                          </div>
                        </div>
                      )}
                    </div>

                    {log?.explanation && (
                      <div className="text-sm text-content-secondary leading-relaxed bg-surface-deep rounded-2xl p-5 border border-white/[0.05]">
                        {log.explanation}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Footer Actions */}
      <footer className="pt-8 border-t border-white/[0.05] flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="text-sm text-content-muted text-center sm:text-left">
          충분히 검토하셨다면 다음 학습을 준비하세요.
        </div>
        <Link
          to="/quiz/new"
          className="w-full sm:w-auto bg-surface-raised text-white border border-white/[0.1] px-8 py-3.5 rounded-xl text-sm font-semibold hover:-translate-y-0.5 transition-transform flex items-center justify-center gap-2"
        >
          새 퀴즈 만들기 <ChevronRight size={16} className="opacity-50" />
        </Link>
      </footer>
    </div>
  );
}
