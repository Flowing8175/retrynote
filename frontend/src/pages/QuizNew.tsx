import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { filesApi, quizApi } from '@/api';
import { LoadingSpinner, Modal, StatusBadge } from '@/components';
import { fileProcessingStatusLabels, isFileProcessingStatus } from '@/types/file';
import type { FileDetail } from '@/types';

const QUESTION_TYPES = [
  { value: 'multiple_choice', label: '객관식' },
  { value: 'ox', label: 'OX' },
  { value: 'short_answer', label: '단답형' },
  { value: 'fill_blank', label: '빈칸형' },
  { value: 'essay', label: '서술형' },
] as const;

const QUESTION_COUNT_PRESETS = [5, 10, 15];

const DIFFICULTY_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: 'easy', label: '쉬움' },
  { value: 'medium', label: '보통' },
  { value: 'hard', label: '어려움' },
];

function formatFileSource(sourceType: string) {
  switch (sourceType) {
    case 'upload':
      return '업로드 자료';
    case 'manual_text':
      return '직접 입력한 텍스트';
    case 'url':
      return '링크 자료';
    default:
      return '학습 자료';
  }
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '크기 정보 없음';
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileSupportCopy(file: FileDetail) {
  if (file.status === 'failed_partial') {
    return '일부 처리 완료';
  }

  if (file.status === 'ready') {
    return '';
  }

  if (isFileProcessingStatus(file.status)) {
    return '처리 중';
  }

  return '선택 불가';
}

export default function QuizNew() {
  const navigate = useNavigate();
  const [sourceMode, setSourceMode] = useState<'document_based' | 'no_source'>('document_based');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'normal' | 'exam'>('normal');
  const [questionCount, setQuestionCount] = useState(5);
  const [autoCount, setAutoCount] = useState(false);
  const [difficulty, setDifficulty] = useState('');
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<string[]>([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showNoSourceModal, setShowNoSourceModal] = useState(false);
  const [noSourceConfirmed, setNoSourceConfirmed] = useState(false);
  const [topic, setTopic] = useState('');
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['quiz-new-files'],
    queryFn: () => filesApi.listFiles(1, 100),
    refetchInterval: (query) =>
      query.state.data?.files.some((file) => isFileProcessingStatus(file.status)) ? 2000 : false,
  });

  const createQuizMutation = useMutation({
    mutationFn: () =>
      quizApi.createQuizSession({
        mode,
        selected_file_ids: sourceMode === 'document_based' ? selectedFileIds : [],
        manual_text: null,
        question_count: autoCount ? null : Math.max(1, Math.min(questionCount, 20)),
        difficulty: difficulty || null,
        question_types: selectedQuestionTypes,
        generation_priority: null,
        source_mode: sourceMode,
        topic: sourceMode === 'no_source' ? (topic.trim() || null) : null,
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: (response) => {
      navigate(`/quiz/${response.quiz_session_id}`);
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      setFormMessage(axiosError.response?.data?.detail || '퀴즈를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    },
  });

  const fileGroups = useMemo(() => {
    const allFiles = filesData?.files ?? [];
    const readyFiles = allFiles.filter((file) => file.is_quiz_eligible && (file.status === 'ready' || file.status === 'failed_partial'));
    const processingFiles = allFiles.filter((file) => file.is_quiz_eligible && isFileProcessingStatus(file.status));
    const unavailableFiles = allFiles.filter((file) => !file.is_quiz_eligible || (!isFileProcessingStatus(file.status) && file.status !== 'ready' && file.status !== 'failed_partial'));

    return { readyFiles, processingFiles, unavailableFiles };
  }, [filesData?.files]);

  const canSubmitDocumentBased = sourceMode === 'document_based' && selectedFileIds.length > 0;
  const primaryActionLabel = sourceMode === 'no_source' ? '자료 없이 퀴즈 만들기' : '퀴즈 만들기';

  const handleFileToggle = (fileId: string) => {
    setFormMessage(null);
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleQuestionTypeToggle = (questionType: string) => {
    setSelectedQuestionTypes((prev) =>
      prev.includes(questionType)
        ? prev.filter((value) => value !== questionType)
        : [...prev, questionType]
    );
  };

  const handleQuestionCountChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    setQuestionCount(Number.isNaN(parsed) ? 1 : parsed);
  };

  const handleSubmit = () => {
    setFormMessage(null);

    if (sourceMode === 'document_based' && selectedFileIds.length === 0) {
      setFormMessage('자료 기반 퀴즈를 만들려면 사용할 자료를 1개 이상 선택해 주세요.');
      return;
    }

    if (sourceMode === 'no_source') {
      setShowNoSourceModal(true);
      return;
    }

    createQuizMutation.mutate();
  };

  const handleConfirmNoSource = () => {
    if (!noSourceConfirmed) {
      setFormMessage('자료 없이 생성할 때는 결과의 근거가 약해질 수 있다는 점을 먼저 확인해 주세요.');
      return;
    }

    setShowNoSourceModal(false);
    createQuizMutation.mutate();
  };

  if (filesLoading) {
    return <LoadingSpinner message="생성할 퀴즈 구성을 준비 중" />;
  }

  return (
    <>
      <div className="space-y-8">
        <section>
          <div className="animate-fade-in-up space-y-5 px-1 py-2">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-4xl">
                  퀴즈 만들기
                </h1>
                <p className="mt-3 text-base leading-7 text-content-secondary">
                  자료를 고르고 풀이 흐름을 정한 뒤, 필요하면 세부 조건까지 맞춰 한 번에 생성합니다.
                </p>
              </div>

              <Link
                to="/quiz/history"
                className="inline-flex items-center gap-2 self-start rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover hover:text-content-primary md:self-auto"
              >
                <History className="h-4 w-4" />
                퀴즈 기록 보기
              </Link>
            </div>

          </div>
        </section>

        <section className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-7 md:px-8">
          <div className="space-y-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-content-muted">1. 생성 기준 고르기</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('document_based');
                    setFormMessage(null);
                  }}
                  className={`relative rounded-2xl border px-5 py-5 text-left transition-colors ${
                    sourceMode === 'document_based'
                      ? 'border-brand-500/40 bg-brand-500/15'
                      : 'border-white/[0.07] bg-surface-deep hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-content-primary">자료 기반</div>
                      <p className="mt-1 text-sm leading-6 text-content-secondary">업로드한 자료 내용에서 출제합니다.</p>
                    </div>
                    <div className={`mt-1 h-5 w-5 shrink-0 rounded-full border ${sourceMode === 'document_based' ? 'border-brand-400 bg-brand-400' : 'border-white/[0.07] bg-surface'}`} />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('no_source');
                    setFormMessage(null);
                  }}
                  className={`relative rounded-2xl border px-5 py-5 text-left transition-colors ${
                    sourceMode === 'no_source'
                      ? 'border-semantic-warning-border bg-semantic-warning-bg/60'
                      : 'border-white/[0.07] bg-surface-deep hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-content-primary">자료 없이 생성</div>
                      <p className="mt-1 text-sm leading-6 text-content-secondary">AI가 주제만 보고 자유롭게 출제합니다.</p>
                    </div>
                    <div className={`mt-1 h-5 w-5 shrink-0 rounded-full border ${sourceMode === 'no_source' ? 'border-semantic-warning bg-semantic-warning' : 'border-white/[0.07] bg-surface'}`} />
                  </div>
                </button>
              </div>
            </div>

            {sourceMode === 'document_based' && (
              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-content-muted">2. 사용할 자료 고르기</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/files')}
                    className="text-sm font-medium text-brand-300 transition-colors hover:text-brand-400"
                  >
                    자료 관리로 이동
                  </button>
                </div>

                {fileGroups.readyFiles.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
                    <div className="text-lg font-semibold text-content-primary">선택 가능한 자료가 없습니다.</div>
                  </div>
                ) : (
                  <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-surface-deep">
                    {fileGroups.readyFiles.map((file) => {
                      const isSelected = selectedFileIds.includes(file.id);

                      return (
                        <label
                          key={file.id}
                          className={`flex cursor-pointer items-start gap-4 border-b border-white/[0.07] px-5 py-5 last:border-b-0 transition-colors ${
                            isSelected ? 'bg-brand-500/10' : 'hover:bg-surface-hover'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleFileToggle(file.id)}
                            className="mt-1 h-4 w-4 accent-brand-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="text-base font-semibold text-content-primary break-words">
                                  {file.original_filename || '이름 없는 자료'}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
                                  <span className="rounded-full bg-surface px-3 py-1">{formatFileSource(file.source_type)}</span>
                                  <span>{formatFileSize(file.file_size_bytes)}</span>
                                  {file.status === 'failed_partial' && (
                                    <span className="rounded-full bg-semantic-warning-bg px-3 py-1 text-semantic-warning">
                                      일부 처리 완료
                                    </span>
                                  )}
                                </div>
                                {getFileSupportCopy(file) ? <p className="mt-3 text-sm leading-6 text-content-secondary">{getFileSupportCopy(file)}</p> : null}
                              </div>
                              <StatusBadge status={file.status} />
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {fileGroups.processingFiles.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
                    <div className="text-sm font-medium text-content-primary">아직 처리 중인 자료</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {fileGroups.processingFiles.map((file) => (
                        <div
                          key={file.id}
                          className="rounded-full border border-white/[0.07] bg-surface px-3 py-2 text-xs text-content-secondary"
                        >
                          {(file.original_filename || '이름 없는 자료')} · {fileProcessingStatusLabels[file.status] || file.status}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {sourceMode === 'no_source' && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-content-muted">2. 주제 입력 (선택)</p>
                <div className="mt-4 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
                  <label htmlFor="topic-input" className="text-sm font-medium text-content-primary">
                    어떤 주제로 출제할까요?
                  </label>
                  <input
                    id="topic-input"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="예: 한국사, 운영체제, 광합성, 미적분…"
                    maxLength={200}
                    className="mt-3 w-full rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-3 text-base text-content-primary placeholder:text-content-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                  />
                  <p className="mt-2 text-xs text-content-muted leading-relaxed">
                    입력하지 않으면 AI가 자유롭게 주제를 정해 출제합니다.
                  </p>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-content-muted">{sourceMode === 'document_based' ? '3. 풀이 방식 고르기' : '3. 풀이 방식 고르기'}</p>
              <div className="mt-4 inline-flex rounded-2xl bg-surface-deep p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setMode('normal')}
                  className={
                    mode === 'normal'
                      ? 'rounded-xl px-5 py-2.5 text-sm font-medium bg-surface text-content-primary shadow-sm'
                      : 'rounded-xl px-5 py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-hover'
                  }
                >
                  일반 모드
                </button>
                <button
                  type="button"
                  onClick={() => setMode('exam')}
                  className={
                    mode === 'exam'
                      ? 'rounded-xl px-5 py-2.5 text-sm font-medium bg-surface text-content-primary shadow-sm'
                      : 'rounded-xl px-5 py-2.5 text-sm font-medium text-content-secondary hover:bg-surface-hover'
                  }
                >
                  시험 모드
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-content-secondary">
                {mode === 'normal' ? '문제마다 바로 정답과 해설을 확인합니다.' : '모든 문제를 풀고 나서 한꺼번에 채점합니다.'}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-content-muted">{sourceMode === 'document_based' ? '4. 세트 크기 정하기' : '4. 세트 크기 정하기'}</p>

                <div className="mt-4 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
                  <label htmlFor="question-count" className="text-sm font-medium text-content-primary">
                    문제 수
                  </label>
                  <input
                    id="question-count"
                    type="number"
                    min={1}
                    max={20}
                    value={questionCount}
                    disabled={autoCount}
                    onChange={(e) => handleQuestionCountChange(e.target.value)}
                    className={`mt-3 w-32 rounded-2xl border border-white/[0.10] bg-surface-deep/90 px-4 py-3 text-base text-content-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-opacity ${autoCount ? 'opacity-30 cursor-not-allowed' : ''}`}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {QUESTION_COUNT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={autoCount}
                        onClick={() => setQuestionCount(preset)}
                        className={`rounded-full px-4 py-2 text-sm transition-colors ${
                          autoCount
                            ? 'bg-surface text-content-muted opacity-30 cursor-not-allowed'
                            : questionCount === preset
                              ? 'bg-brand-500/15 text-brand-300'
                              : 'bg-surface text-content-secondary hover:bg-surface-hover'
                        }`}
                      >
                        {preset}문제
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAutoCount((prev) => !prev)}
                      className={`rounded-full px-4 py-2 text-sm transition-colors ${
                        autoCount
                          ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
                          : 'bg-surface text-content-secondary hover:bg-surface-hover'
                      }`}
                    >
                      자동
                    </button>
                  </div>
                  {autoCount && (
                    <p className="mt-3 text-xs text-content-muted leading-relaxed">
                      업로드한 자료의 분량과 선택한 문제 유형을 고려해 AI가 적합한 문제 수를 결정합니다.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-content-muted">세부 설정</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedOptions((prev) => !prev)}
                    className="inline-flex items-center rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
                  >
                    {showAdvancedOptions ? '고급 옵션 접기' : '고급 옵션 열기'}
                  </button>
                </div>

                {showAdvancedOptions && (
                  <div className="mt-4 space-y-5 rounded-2xl border border-white/[0.07] bg-surface-deep px-5 py-5">
                    <div>
                      <div className="text-sm font-medium text-content-primary">난이도</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {DIFFICULTY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDifficulty(opt.value)}
                            className={
                              difficulty === opt.value
                                ? 'rounded-2xl border border-brand-500/25 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-300'
                                : 'rounded-2xl border border-white/[0.07] px-4 py-2 text-sm text-content-secondary hover:bg-surface-hover hover:border-white/[0.14]'
                            }
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-content-primary">문제 유형</div>
                      <div className="mt-3 space-y-1">
                        {QUESTION_TYPES.map((questionType) => {
                          const isSelected = selectedQuestionTypes.includes(questionType.value);

                          return (
                            <label
                              key={questionType.value}
                              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-hover"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleQuestionTypeToggle(questionType.value)}
                                className="h-4 w-4 accent-brand-500"
                              />
                              <span className="text-sm text-content-primary">{questionType.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {formMessage && (
              <div className="rounded-2xl border border-semantic-warning-border bg-semantic-warning-bg/70 px-5 py-4 text-sm leading-6 text-content-primary">
                {formMessage}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:justify-end">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="inline-flex items-center justify-center rounded-xl border border-white/[0.07] bg-surface-deep px-5 py-3 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={createQuizMutation.isPending || (sourceMode === 'document_based' && !canSubmitDocumentBased)}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-4 py-[0.95rem] text-[0.98rem] font-bold text-content-inverse hover:-translate-y-px hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 transition-[transform,background-color] duration-150"
                >
                  {createQuizMutation.isPending ? '퀴즈 준비 중...' : primaryActionLabel}
                </button>
              </div>
            </div>
          </div>
        </section>

        {fileGroups.unavailableFiles.length > 0 && sourceMode === 'document_based' && (
          <section className="rounded-3xl border border-white/[0.07] bg-surface px-6 py-6">
            <p className="text-sm font-medium text-content-secondary">선택할 수 없는 자료</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {fileGroups.unavailableFiles.map((file) => (
                <div
                  key={file.id}
                  className="rounded-full border border-white/[0.07] bg-surface-deep px-3 py-2 text-xs text-content-secondary"
                >
                  {(file.original_filename || '이름 없는 자료')} · {fileProcessingStatusLabels[file.status] || file.status}
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      <Modal
        isOpen={showNoSourceModal}
        onClose={() => {
          setShowNoSourceModal(false);
          setNoSourceConfirmed(false);
        }}
        title="자료 없이 퀴즈를 만들까요?"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-semantic-warning-border bg-semantic-warning-bg/70 px-4 py-4">
            <div className="text-sm font-medium text-content-primary">주의</div>
            <p className="mt-2 text-sm leading-6 text-content-secondary">
              자료 없이 생성한 문제는 정확도와 근거가 약할 수 있습니다.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/[0.07] bg-surface-deep px-4 py-4">
            <input
              type="checkbox"
              checked={noSourceConfirmed}
              onChange={(e) => setNoSourceConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4 accent-brand-500"
            />
            <span className="text-sm leading-6 text-content-secondary">
              이 한계를 이해하고 진행하겠습니다.
            </span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setShowNoSourceModal(false);
                setNoSourceConfirmed(false);
              }}
              className="inline-flex items-center justify-center rounded-xl border border-white/[0.07] bg-surface-deep px-4 py-3 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirmNoSource}
              disabled={!noSourceConfirmed || createQuizMutation.isPending}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-content-inverse hover:-translate-y-px hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 transition-[transform,background-color] duration-150"
            >
              {createQuizMutation.isPending ? '퀴즈 준비 중...' : '이 조건으로 생성'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
