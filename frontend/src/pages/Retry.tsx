import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { BookOpen, Sparkles, ChevronRight, AlertTriangle, NotebookPen } from 'lucide-react';
import { retryApi, wrongNotesApi } from '@/api';
import { OptionGroup } from '@/components/ui';
import DiagramModal from '@/components/DiagramModal';
import type { RetryLocationState } from '@/types';
import { getDetailMessage } from '@/utils/errorMessages';

const QUESTION_COUNT_PRESETS = [5, 10, 15];

export default function Retry() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as RetryLocationState | null;

  const hasSelectedConcepts =
    locationState != null &&
    Array.isArray(locationState.conceptKeys) &&
    locationState.conceptKeys.length > 0;

  const selectedConceptKeys = useMemo(
    () => (hasSelectedConcepts ? locationState!.conceptKeys : []),
    [hasSelectedConcepts, locationState]
  );
  const selectedConceptLabels = useMemo(
    () => (hasSelectedConcepts ? locationState!.conceptLabels : {}),
    [hasSelectedConcepts, locationState]
  );
  const selectedCount = selectedConceptKeys.length;

  const [conceptMode, setConceptMode] = useState<'manual' | 'ai'>('ai');
  const [questionCount, setQuestionCount] = useState(5);
  const [autoCount, setAutoCount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditError, setCreditError] = useState(false);
  const [selectedManualConceptKey, setSelectedManualConceptKey] = useState('');
  const [selectedFileGroup, setSelectedFileGroup] = useState<string | null>(null);
  const [diagramModal, setDiagramModal] = useState<{ conceptKey: string; conceptLabel: string } | null>(null);

  const { data: wrongNotesData } = useQuery({
    queryKey: ['wrongNotes-manual-options'],
    queryFn: () => wrongNotesApi.listWrongNotes('concept', undefined, undefined, undefined, undefined, 1, 100),
  });

  const wrongNotesTotal = wrongNotesData?.total;

  const manualConceptOptions = useMemo(() => {
    if (hasSelectedConcepts) {
      return selectedConceptKeys.map((key) => ({
        key,
        label: selectedConceptLabels[key] || key,
      }));
    }

    const conceptMap = new Map<string, string>();

    for (const item of wrongNotesData?.items ?? []) {
      if (!item.concept_key) continue;
      conceptMap.set(item.concept_key, item.concept_label || item.concept_key);
    }

    return Array.from(conceptMap.entries()).map(([key, label]) => ({ key, label }));
  }, [hasSelectedConcepts, selectedConceptKeys, selectedConceptLabels, wrongNotesData?.items]);

  const fileGroupsForConcepts = useMemo(() => {
    const items = wrongNotesData?.items ?? [];
    const groups = new Map<string, {
      fileId: string | null;
      fileName: string;
      concepts: Map<string, { key: string; label: string; count: number }>;
    }>();

    for (const item of items) {
      if (!item.concept_key) continue;
      const groupKey = item.file_id ?? '__ai__';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          fileId: item.file_id,
          fileName: item.original_filename ?? 'AI 출제 퀴즈',
          concepts: new Map(),
        });
      }
      const group = groups.get(groupKey)!;
      const existing = group.concepts.get(item.concept_key);
      if (existing) {
        existing.count++;
      } else {
        group.concepts.set(item.concept_key, {
          key: item.concept_key,
          label: item.concept_label ?? item.concept_key,
          count: 1,
        });
      }
    }

    return Array.from(groups.values()).map((g) => ({
      ...g,
      mainConcept: [...g.concepts.values()].sort((a, b) => b.count - a.count)[0]?.label ?? '',
      conceptList: [...g.concepts.values()].sort((a, b) => b.count - a.count),
    }));
  }, [wrongNotesData?.items]);

  useEffect(() => {
    if (fileGroupsForConcepts.length === 0) {
      setSelectedFileGroup(null);
      return;
    }
    const stillValid = fileGroupsForConcepts.some(
      (g) => (g.fileId ?? '__ai__') === selectedFileGroup
    );
    if (!stillValid) {
      setSelectedFileGroup(fileGroupsForConcepts[0].fileId ?? '__ai__');
    }
  }, [fileGroupsForConcepts, selectedFileGroup]);

  const fileGroupConcepts = useMemo(() => {
    if (hasSelectedConcepts) return manualConceptOptions;
    const group = fileGroupsForConcepts.find((g) => (g.fileId ?? '__ai__') === selectedFileGroup);
    return group?.conceptList.map(({ key, label }) => ({ key, label })) ?? [];
  }, [fileGroupsForConcepts, selectedFileGroup, hasSelectedConcepts, manualConceptOptions]);

  useEffect(() => {
    if (fileGroupConcepts.length === 0) {
      if (selectedManualConceptKey !== '') {
        setSelectedManualConceptKey('');
      }
      return;
    }

    const hasSelectedOption = fileGroupConcepts.some(({ key }) => key === selectedManualConceptKey);

    if (!hasSelectedOption) {
      setSelectedManualConceptKey(fileGroupConcepts[0].key);
    }
  }, [fileGroupConcepts, selectedManualConceptKey]);

  const createRetryMutation = useMutation({
    mutationFn: () => {
      const source =
        conceptMode === 'ai'
          ? 'dashboard_recommendation'
          : selectedManualConceptKey
            ? 'concept_manual'
            : 'wrong_notes';

      return retryApi.createRetrySet({
        source,
        concept_keys: conceptMode === 'manual' && selectedManualConceptKey ? [selectedManualConceptKey] : null,
        size: autoCount ? null : Math.max(1, Math.min(questionCount, 20)),
      });
    },
    onSuccess: (response) => {
      navigate(`/quiz/${response.quiz_session_id}`);
    },
    onError: (mutationError: unknown) => {
      if (isAxiosError(mutationError) && mutationError.response?.status === 402) {
        setCreditError(true);
        return;
      }
      const axiosError = mutationError as { response?: { data?: { detail?: unknown } } };
      setError(getDetailMessage(axiosError.response?.data?.detail, '재도전 세트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'));
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-10 py-8 animate-fade-in">
      <section className="animate-fade-in-up space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">재도전 문제 만들기</h1>
            <p className="text-base text-content-secondary max-w-xl leading-relaxed">
              틀린 개념을 바탕으로 유사 문제를 다시 풀어볼 수 있습니다.
            </p>
          </div>
          <Link
            to="/wrong-notes"
            className="group flex items-center gap-2 bg-surface-deep border border-white/[0.05] px-4 py-2.5 rounded-xl text-sm font-medium text-white hover:bg-surface-hover transition-colors"
          >
            <NotebookPen size={16} className="text-brand-300" />
            오답노트 보기
          </Link>
        </div>
      </section>

      <section className="animate-fade-in-up stagger-1 space-y-8" data-tour="retry-source">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-300 font-semibold text-sm">
            1
          </div>
          <h2 className="text-xl font-semibold text-white">개념 선택</h2>
        </div>

        <OptionGroup
          options={[
            {
              value: 'manual' as const,
              label: '내가 고른 개념',
              description: '오답노트에서 직접 개념을 선택하여 재도전합니다',
              icon: <BookOpen size={20} />,
            },
            {
              value: 'ai' as const,
              label: 'AI 추천 개념',
              description: '반복 오답 패턴을 분석해 취약한 개념을 자동으로 선택합니다',
              icon: <Sparkles size={20} />,
            },
          ]}
          value={conceptMode}
          onChange={(v) => setConceptMode(v as 'manual' | 'ai')}
          size="lg"
          layout="grid-2"
        />

        <div key={conceptMode} className="animate-mode-switch">
        {conceptMode === 'manual' ? (
          <div className="space-y-6 bg-surface rounded-3xl p-6 md:p-8 border border-white/[0.05]">
            {hasSelectedConcepts ? (
              <p className="text-sm text-content-secondary">
                선택된 오답노트 {selectedCount}건에서 재도전할 개념을 골라 주세요.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <OptionGroup
                  options={[
                    { value: '__all__', label: '전체' },
                    ...fileGroupsForConcepts.map((g) => ({
                      value: g.fileId ?? '__ai__',
                      label: g.mainConcept || g.fileName.replace(/\.[^.]+$/, '').slice(0, 20),
                      title: g.fileName,
                    })),
                  ]}
                  value={selectedFileGroup ?? '__all__'}
                  onChange={(v) => {
                    const sv = v as string;
                    setSelectedFileGroup(
                      sv === '__all__' ? (fileGroupsForConcepts[0]?.fileId ?? '__ai__') : sv
                    );
                    setSelectedManualConceptKey('');
                  }}
                  size="sm"
                  layout="wrap"
                />
                <Link
                  to="/wrong-notes"
                  className="inline-flex items-center py-2 px-2 text-xs font-medium text-brand-300 hover:text-white transition-colors"
                >
                  오답노트 →
                </Link>
              </div>
            )}

            <div className="space-y-2">
              {fileGroupConcepts.length > 0 ? (
                fileGroupConcepts.map((concept) => {
                  const isSelected = selectedManualConceptKey === concept.key;
                  return (
                    <div
                      key={concept.key}
                      className={`group flex items-center gap-4 px-5 py-4 rounded-2xl transition-colors border cursor-pointer ${
                        isSelected
                          ? 'bg-brand-500/5 border-brand-500/30'
                          : 'bg-surface-deep border-white/[0.05] hover:bg-surface-hover'
                      }`}
                      onClick={() => setSelectedManualConceptKey(concept.key)}
                    >
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm font-medium truncate transition-colors ${
                            isSelected ? 'text-brand-300' : 'text-white group-hover:text-brand-300'
                          }`}
                        >
                          {concept.label}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDiagramModal({ conceptKey: concept.key, conceptLabel: concept.label });
                        }}
                        className="shrink-0 text-xs font-medium text-content-muted hover:text-brand-300 transition-colors px-2 py-1 rounded-lg hover:bg-brand-500/10"
                      >
                        개념 설명 보기
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 text-sm text-content-muted bg-surface-deep rounded-2xl border border-white/[0.05]">
                  {wrongNotesTotal !== undefined && wrongNotesTotal > 0
                    ? '개념 정보가 있는 오답노트를 찾지 못했습니다.'
                    : '오답노트를 먼저 만든 뒤 내가 고른 개념으로 재도전할 수 있습니다.'}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4 px-2">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
              <Sparkles size={16} className="text-brand-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-content-primary">AI가 개념을 자동으로 선택합니다</p>
              <p className="mt-1 text-sm leading-6 text-content-muted">
                반복 오답 패턴을 분석해 지금 가장 취약한 개념 위주로 문제를 구성합니다.
              </p>
            </div>
          </div>
        )}
        </div>
      </section>

      <section className="animate-fade-in-up stagger-2 space-y-8" data-tour="retry-options">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-300 font-semibold text-sm">
            2
          </div>
          <h2 className="text-xl font-semibold text-white">문제 수 설정</h2>
        </div>
        <div className="bg-surface border border-white/[0.05] rounded-3xl p-6 md:p-8 space-y-4">
          <OptionGroup
            options={[
              ...QUESTION_COUNT_PRESETS.map((p) => ({ value: String(p), label: String(p) })),
              { value: 'auto', label: 'AI 결정', description: 'AI가 분량에 맞게 자동 선택' },
            ]}
            value={autoCount ? 'auto' : String(questionCount)}
            onChange={(v) => {
              if (v === 'auto') {
                setAutoCount(true);
              } else {
                setAutoCount(false);
                setQuestionCount(Number(v));
              }
            }}
            size="md"
            layout="wrap"
          />
          {autoCount && (
            <p className="text-sm leading-relaxed text-content-muted">
              틀린 개념의 수와 오답 패턴을 고려해 AI가 적합한 문제 수를 결정합니다.
            </p>
          )}
        </div>
      </section>

      <section className="animate-fade-in-up stagger-3 pt-8">
        {creditError && (
          <div className="mb-8 bg-semantic-error/10 border border-semantic-error/20 p-4 rounded-2xl flex items-center gap-3">
            <AlertTriangle size={20} className="text-semantic-error shrink-0" />
            <p className="text-sm font-medium text-white">
              재도전을 위한 크레딧이 부족합니다.{' '}
              <Link to="/pricing" className="underline underline-offset-2 hover:text-white transition-colors">
                플랜 업그레이드
              </Link>
            </p>
          </div>
        )}
        {error && (
          <div className="mb-8 bg-semantic-error/10 border border-semantic-error/20 p-4 rounded-2xl flex items-center gap-3">
            <AlertTriangle size={20} className="text-semantic-error shrink-0" />
            <p className="text-sm font-medium text-white">{error}</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-end">
          <button
            onClick={() => navigate('/wrong-notes')}
            className="text-sm font-medium text-content-secondary hover:text-white px-6 py-4 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCreditError(false);
              createRetryMutation.mutate();
            }}
            disabled={createRetryMutation.isPending}
            className="group relative w-full sm:w-auto bg-brand-500 text-brand-900 px-10 py-4 rounded-2xl text-base font-semibold transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <div className="flex items-center justify-center gap-2">
              {createRetryMutation.isPending ? '재도전 세트 준비 중…' : '재도전 세트 만들기'}
              {!createRetryMutation.isPending && (
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              )}
            </div>
          </button>
        </div>
      </section>

      <DiagramModal
        isOpen={!!diagramModal}
        onClose={() => setDiagramModal(null)}
        conceptKey={diagramModal?.conceptKey ?? ''}
        conceptLabel={diagramModal?.conceptLabel ?? ''}
      />
    </div>
  );
}
