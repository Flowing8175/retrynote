import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { History, ChevronRight, AlertTriangle, BookOpen, Sparkles } from 'lucide-react';
import { filesApi, quizApi } from '@/api';
import { Modal, StatusBadge, SkeletonTransition } from '@/components';
import { isFileProcessingStatus } from '@/types/file';
import { getDetailMessage } from '@/utils/errorMessages';
import { formatFileSize, formatFileSource } from '@/utils/formatters';

const QUESTION_TYPES = [
  { value: 'multiple_choice', label: '객관식' },
  { value: 'ox', label: 'OX' },
  { value: 'short_answer', label: '단답형' },
  { value: 'fill_blank', label: '빈칸형' },
  { value: 'essay', label: '서술형' },
] as const;

const QUESTION_COUNT_PRESETS = [5, 10, 15];

const MODEL_TIER_LABELS: Record<string, string> = {
  ECO: 'ECO',
  BALANCED: 'BALANCED',
  PERFORMANCE: 'PERFORMANCE',
};

const MODEL_TIER_COSTS: Record<string, number> = {
  ECO: 1,
  BALANCED: 3,
  PERFORMANCE: 5,
};

const DIFFICULTY_OPTIONS = [
  { value: '', label: '난이도 무관' },
  { value: 'easy', label: '쉬움' },
  { value: 'medium', label: '보통' },
  { value: 'hard', label: '어려움' },
];

function QuizNewSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-16 py-8 animate-pulse" aria-hidden="true">
      <section className="space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <div className="skeleton h-9 w-36 rounded-md" />
            <div className="skeleton h-4 w-72 rounded-md" />
          </div>
          <div className="skeleton h-10 w-36 rounded-xl" />
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-7 w-20 rounded-md" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="skeleton h-32 rounded-3xl" />
          <div className="skeleton h-32 rounded-3xl" />
        </div>
        <div className="bg-surface border border-white/[0.05] rounded-3xl p-6 md:p-8 space-y-4">
          <div className="flex gap-2">
            <div className="skeleton h-8 w-14 rounded-xl" />
            <div className="skeleton h-8 w-24 rounded-xl" />
            <div className="skeleton h-8 w-20 rounded-xl" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-7 w-20 rounded-md" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="skeleton h-52 rounded-3xl" />
          <div className="skeleton h-52 rounded-3xl" />
        </div>
      </section>
    </div>
  );
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
  const [preferredTier, setPreferredTierState] = useState<string | null>(
    () => localStorage.getItem('quiz_preferred_tier')
  );
  const setPreferredTier = (tier: string | null) => {
    if (tier === null) {
      localStorage.removeItem('quiz_preferred_tier');
    } else {
      localStorage.setItem('quiz_preferred_tier', tier);
    }
    setPreferredTierState(tier);
  };
  const [showNoSourceModal, setShowNoSourceModal] = useState(false);
  const [noSourceConfirmed, setNoSourceConfirmed] = useState(false);
  const [topic, setTopic] = useState('');
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: quizConfig } = useQuery({
    queryKey: ['quiz-config'],
    queryFn: () => quizApi.getQuizConfig(),
    staleTime: Infinity,
  });

  const generationModelOptions = Array.isArray(quizConfig?.generation_model_options)
    ? quizConfig.generation_model_options.filter(
        (option): option is { tier: string; value: string; label: string; is_default: boolean; is_trial?: boolean } =>
          typeof option?.tier === 'string' &&
          typeof option?.value === 'string' &&
          typeof option?.label === 'string' &&
          typeof option?.is_default === 'boolean'
      )
    : [];

  const defaultModel = typeof quizConfig?.default_generation_model === 'string'
    ? quizConfig.default_generation_model
    : null;
  const defaultTier =
    generationModelOptions.find((o) => o.is_default)?.tier ??
    generationModelOptions.find((o) => o.value === defaultModel)?.tier ??
    null;
  const validPreferredTier =
    preferredTier && generationModelOptions.some((o) => o.tier === preferredTier)
      ? preferredTier
      : null;
  const activeTier = validPreferredTier ?? defaultTier;
  const activeModel =
    generationModelOptions.find((o) => o.tier === activeTier)?.value ?? defaultModel;

  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => filesApi.listFolders(),
  });

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['quiz-new-files'],
    queryFn: () => filesApi.listFiles(1, 100),
    refetchInterval: (query) =>
      (query.state.data?.files ?? []).some((file) => isFileProcessingStatus(file.status)) ? 2000 : false,
  });

  const folders = useMemo(() => (Array.isArray(foldersData) ? foldersData : []), [foldersData]);
  const allFiles = useMemo(() => (Array.isArray(filesData?.files) ? filesData.files : []), [filesData?.files]);

  const createQuizMutation = useMutation({
    mutationFn: () => {
      abortControllerRef.current = new AbortController();
      return quizApi.createQuizSession(
        {
          mode,
          selected_file_ids: sourceMode === 'document_based' ? selectedFileIds : [],
          manual_text: null,
          question_count: autoCount ? null : Math.max(1, Math.min(questionCount, 20)),
          difficulty: difficulty || null,
          question_types: selectedQuestionTypes,
          generation_priority: null,
          preferred_model: activeModel,
          source_mode: sourceMode,
          topic: sourceMode === 'no_source' ? (topic.trim() || null) : null,
          idempotency_key: crypto.randomUUID(),
        },
        abortControllerRef.current.signal
      );
    },
  });

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
    createQuizMutation.reset();
    resetNoSourceModal();
    setFormMessage(null);
  };

  const fileGroups = useMemo(() => {
    const visibleFiles = allFiles.filter(
      (file) => selectedFolderId === null || file.folder_id === selectedFolderId
    );
    const readyFiles = visibleFiles.filter((file) => file.is_quiz_eligible && (file.status === 'ready' || file.status === 'failed_partial'));
    const processingFiles = visibleFiles.filter((file) => isFileProcessingStatus(file.status));
    const unavailableFiles = visibleFiles.filter((file) => !file.is_quiz_eligible && !isFileProcessingStatus(file.status));

    return { readyFiles, processingFiles, unavailableFiles };
  }, [allFiles, selectedFolderId]);

  const canSubmitDocumentBased = sourceMode === 'document_based' && selectedFileIds.length > 0;
  const primaryActionLabel = createQuizMutation.isPending ? '생성 중...' : '퀴즈 생성하기';

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

  const resetNoSourceModal = () => {
    setShowNoSourceModal(false);
    setNoSourceConfirmed(false);
  };

  const createQuiz = async () => {
    setFormMessage(null);

    try {
      const response = await createQuizMutation.mutateAsync();

      if (!response?.quiz_session_id) {
        throw new Error('Missing quiz session id');
      }

      if (sourceMode === 'no_source') {
        resetNoSourceModal();
      }

      navigate(`/quiz/${response.quiz_session_id}`);
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: unknown } } };
      setFormMessage(getDetailMessage(axiosError.response?.data?.detail, '퀴즈 생성에 실패했습니다.'));
    }
  };

  const handleSubmit = () => {
    setFormMessage(null);
    if (sourceMode === 'document_based' && selectedFileIds.length === 0) {
      setFormMessage('최소 하나의 학습 자료를 선택해 주세요.');
      return;
    }
    if (sourceMode === 'no_source') {
      setShowNoSourceModal(true);
      return;
    }
    void createQuiz();
  };

  const handleConfirmNoSource = () => {
    if (!noSourceConfirmed) {
      setFormMessage('경고 사항을 확인해 주세요.');
      return;
    }

    void createQuiz();
  };

  return (
    <SkeletonTransition loading={filesLoading} skeleton={<QuizNewSkeleton />}>
    {filesLoading ? null : (
    <div className="max-w-4xl mx-auto space-y-16 py-8 animate-fade-in">
      {/* Header Section */}
      <section className="animate-fade-in-up space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">새 퀴즈 시작</h1>
            <p className="text-base text-content-secondary max-w-xl leading-relaxed">
              학습할 자료와 설정을 선택하여 맞춤형 퀴즈를 생성합니다.
            </p>
          </div>
          
          <Link
            to="/quiz/history"
            className="group flex items-center gap-2 bg-surface-deep border border-white/[0.05] px-4 py-2.5 rounded-xl text-sm font-medium text-white hover:bg-surface-hover transition-colors"
          >
            <History size={16} className="text-brand-300" />
            이전 기록 보기
          </Link>
        </div>
      </section>

      {/* Source Selection Section */}
      <section className="animate-fade-in-up stagger-1 space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-300 font-semibold text-sm">
            1
          </div>
          <h2 className="text-xl font-semibold text-white">자료 선택</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => setSourceMode('document_based')}
            className={`group relative text-left p-6 rounded-3xl transition-all border ${
              sourceMode === 'document_based'
                ? 'bg-brand-500/5 border-brand-500/30'
                : 'bg-surface border-white/[0.05] hover:bg-surface-hover'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <BookOpen size={20} className={sourceMode === 'document_based' ? 'text-brand-300' : 'text-content-muted'} />
              <h3 className={`text-lg font-semibold ${sourceMode === 'document_based' ? 'text-white' : 'text-content-secondary'}`}>내 자료에서 출제</h3>
            </div>
            <p className="text-sm text-content-secondary leading-relaxed">
              업로드한 문서나 PDF를 바탕으로 퀴즈를 만듭니다. 가장 정확하고 권장되는 방식입니다.
            </p>
          </button>

          <button
            onClick={() => setSourceMode('no_source')}
            className={`group relative text-left p-6 rounded-3xl transition-all border ${
              sourceMode === 'no_source'
                ? 'bg-brand-500/5 border-brand-500/30'
                : 'bg-surface border-white/[0.05] hover:bg-surface-hover'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <Sparkles size={20} className={sourceMode === 'no_source' ? 'text-brand-300' : 'text-content-muted'} />
              <h3 className={`text-lg font-semibold ${sourceMode === 'no_source' ? 'text-white' : 'text-content-secondary'}`}>AI 배경지식 출제</h3>
            </div>
            <p className="text-sm text-content-secondary leading-relaxed">
              자료 없이 AI가 가진 지식만으로 주제를 선택해 퀴즈를 냅니다.
            </p>
          </button>
        </div>

        {sourceMode === 'document_based' ? (
          <div className="space-y-6 animate-fade-in-up bg-surface border border-white/[0.05] rounded-3xl p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setSelectedFolderId(null); setSelectedFileIds([]); }}
                  className={`text-xs font-medium px-4 py-2 rounded-xl transition-colors border ${
                    selectedFolderId === null 
                      ? 'bg-surface-raised text-white border-white/[0.1]' 
                      : 'bg-transparent text-content-secondary border-transparent hover:bg-white/5'
                  }`}
                >
                  전체
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => { setSelectedFolderId(folder.id); setSelectedFileIds([]); }}
                    className={`text-xs font-medium px-4 py-2 rounded-xl transition-colors border ${
                      selectedFolderId === folder.id 
                        ? 'bg-surface-raised text-white border-white/[0.1]' 
                        : 'bg-transparent text-content-secondary border-transparent hover:bg-white/5'
                    }`}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
              <Link to="/files" className="inline-flex items-center py-2 px-2 text-xs font-medium text-brand-300 hover:text-white transition-colors">
                자료 관리 →
              </Link>
            </div>

            <div className="space-y-3">
              {fileGroups.readyFiles.map((file) => {
                const isSelected = selectedFileIds.includes(file.id);
                return (
                  <label
                    key={file.id}
                    className={`group flex items-center gap-4 px-5 py-4 cursor-pointer rounded-2xl transition-colors border ${
                      isSelected 
                        ? 'bg-brand-500/5 border-brand-500/30' 
                        : 'bg-surface-deep border-white/[0.05] hover:bg-surface-hover'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleFileToggle(file.id)}
                      className="w-5 h-5 rounded border-white/[0.1] bg-surface text-brand-500 focus:ring-brand-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate group-hover:text-brand-300 transition-colors mb-1">
                        {file.original_filename || '제목 없는 자료'}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-content-muted">{formatFileSource(file.source_type)}</span>
                        <span className="text-xs text-content-muted">{formatFileSize(file.file_size_bytes)}</span>
                      </div>
                    </div>
                    <StatusBadge status={file.status} />
                  </label>
                );
              })}
              {fileGroups.processingFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-surface-deep border border-white/[0.05] opacity-60 cursor-not-allowed"
                >
                  <div className="w-5 h-5 rounded border border-white/20 bg-surface shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate mb-1">
                      {file.original_filename || '제목 없는 자료'}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-content-muted">{formatFileSource(file.source_type)}</span>
                    </div>
                  </div>
                  <StatusBadge status={file.status} />
                </div>
              ))}
              {fileGroups.readyFiles.length === 0 && fileGroups.processingFiles.length === 0 && (
                <div className="text-center py-10 text-sm text-content-muted bg-surface-deep rounded-2xl border border-white/[0.05]">
                  사용 가능한 자료가 없습니다.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in-up bg-surface border border-white/[0.05] rounded-3xl p-6 md:p-8">
            <label htmlFor="topic-input" className="block text-sm font-medium text-content-primary">
              학습하고 싶은 주제를 입력하세요
            </label>
            <input
              id="topic-input"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="예: 양자역학, 서양미술사, 파이썬 기초..."
              className="w-full bg-surface-deep border border-white/[0.05] rounded-xl text-base px-5 py-4 placeholder:text-content-muted focus:ring-2 focus:ring-brand-500 focus:outline-none transition-shadow"
            />
            <p className="text-xs text-content-muted">주제를 비워두면 무작위로 흥미로운 상식 퀴즈가 생성됩니다.</p>
          </div>
        )}
      </section>

      {/* Configuration Section */}
      <section className="animate-fade-in-up stagger-2 space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-300 font-semibold text-sm">
            2
          </div>
          <h2 className="text-xl font-semibold text-white">학습 설정</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Mode & Count */}
          <div className="bg-surface border border-white/[0.05] rounded-3xl p-6 md:p-8 space-y-8">
            <div className="space-y-4">
              <div className="text-sm font-medium text-content-primary">피드백 방식</div>
              <div className="flex gap-3">
                {(['normal', 'exam'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all border ${
                      mode === m 
                        ? 'bg-surface-raised text-white border-white/[0.1] shadow-sm' 
                        : 'bg-transparent text-content-secondary border-white/[0.05] hover:bg-white/5'
                    }`}
                  >
                    {m === 'normal' ? '한 문제씩 확인' : '전체 풀이 후 확인'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-content-primary">문제 수</div>
                {autoCount && <span className="text-xs text-brand-300">AI가 분량에 맞게 조절</span>}
              </div>
              <div className="flex flex-wrap gap-3">
                {QUESTION_COUNT_PRESETS.map((p) => (
                  <button
                    key={p}
                    disabled={autoCount}
                    onClick={() => setQuestionCount(p)}
                    className={`w-14 h-14 flex items-center justify-center text-base font-semibold rounded-xl transition-all border ${
                      !autoCount && questionCount === p 
                        ? 'bg-brand-500/10 text-brand-300 border-brand-500/30' 
                        : 'bg-transparent text-content-secondary border-white/[0.05] hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setAutoCount(!autoCount)}
                  className={`flex-1 min-w-[100px] h-14 text-sm font-medium rounded-xl transition-all border ${
                    autoCount 
                      ? 'bg-brand-500/10 text-brand-300 border-brand-500/30' 
                      : 'bg-transparent text-content-secondary border-white/[0.05] hover:bg-white/5'
                  }`}
                >
                  자동 조절
                </button>
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <div className="bg-surface border border-white/[0.05] rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-content-primary">상세 설정</div>
              <button
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="text-xs font-medium text-brand-300 hover:text-white transition-colors"
              >
                {showAdvancedOptions ? '닫기' : '열기'}
              </button>
            </div>

            {showAdvancedOptions ? (
              <div className="animate-fade-in-up space-y-8">
                <div className="space-y-4">
                  <div className="text-xs font-medium text-content-muted">AI 모델</div>
                  <div className="grid grid-cols-2 gap-2">
                    {generationModelOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setPreferredTier(option.tier)}
                        className={`text-left px-4 py-3 rounded-xl transition-colors border ${
                          activeTier === option.tier
                            ? 'bg-brand-500/10 text-brand-300 border-brand-500/30'
                            : 'bg-transparent text-content-secondary border-white/[0.05] hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold">
                            {MODEL_TIER_LABELS[option.tier] ?? option.tier}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                            activeTier === option.tier
                              ? 'bg-brand-500/20 text-brand-300'
                              : 'bg-white/[0.06] text-content-muted'
                          }`}>
                            ×{MODEL_TIER_COSTS[option.tier] ?? 1}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-content-muted">{option.value}</div>
                      </button>
                    ))}
                  </div>

                </div>

                <div className="space-y-4">
                  <div className="text-xs font-medium text-content-muted">난이도</div>
                  <div className="flex flex-wrap gap-2">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setDifficulty(opt.value)}
                        className={`text-xs font-medium px-4 py-2 rounded-xl transition-colors border ${
                          difficulty === opt.value 
                            ? 'bg-surface-raised text-white border-white/[0.1]' 
                            : 'bg-transparent text-content-secondary border-white/[0.05] hover:bg-white/5'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-medium text-content-muted">문제 유형</div>
                  <div className="grid grid-cols-2 gap-2">
                    {QUESTION_TYPES.map((qt) => {
                      const isSelected = selectedQuestionTypes.includes(qt.value);
                      return (
                        <label
                          key={qt.value}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors border ${
                            isSelected 
                              ? 'bg-brand-500/5 border-brand-500/30' 
                              : 'bg-surface-deep border-transparent hover:bg-surface-hover'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleQuestionTypeToggle(qt.value)}
                            className="w-4 h-4 rounded border-white/[0.1] bg-surface text-brand-500 focus:ring-brand-500"
                          />
                          <span className="text-sm text-white">{qt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 bg-surface-deep rounded-2xl border border-white/[0.05]">
                <p className="text-sm text-content-muted">기본 설정으로 최적화되어 있습니다.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Submit Section */}
      <section className="animate-fade-in-up stagger-3 pt-8">
        {formMessage && (
          <div className="mb-8 bg-semantic-error/10 border border-semantic-error/20 p-4 rounded-2xl flex items-center gap-3">
            <AlertTriangle size={20} className="text-semantic-error shrink-0" />
            <p className="text-sm font-medium text-white">{formMessage}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-4 justify-end">
          {createQuizMutation.isPending ? (
            <button
              type="button"
              onClick={handleCancelGeneration}
              className="text-sm font-medium underline underline-offset-2 transition-colors px-6 py-4"
              style={{ color: '#A0AEC0' }}
            >
              취소하고 돌아가기
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              className="text-sm font-medium text-content-secondary hover:text-white px-6 py-4 transition-colors"
            >
              취소
            </button>
          )}
          
          <button
            onClick={handleSubmit}
            disabled={createQuizMutation.isPending || (sourceMode === 'document_based' && !canSubmitDocumentBased)}
            className="group relative w-full sm:w-auto bg-brand-500 text-brand-900 px-10 py-4 rounded-2xl text-base font-semibold transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <div className="flex items-center justify-center gap-2">
              {primaryActionLabel}
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      </section>

      {/* No Source Confirmation Modal */}
      <Modal
        isOpen={showNoSourceModal}
        onClose={() => {
          if (createQuizMutation.isPending) {
            return;
          }

          resetNoSourceModal();
        }}
        title="AI 배경지식 퀴즈 안내"
      >
        <div className="space-y-6">
          <div className="bg-surface-deep p-5 rounded-2xl border border-white/[0.05] space-y-3">
            <p className="text-sm text-content-secondary leading-relaxed">
              자료 없이 생성할 경우, AI가 학습한 일반적인 배경지식을 바탕으로 문제를 출제합니다. 최신 정보가 아니거나 원하시는 맥락과 정확히 일치하지 않을 수 있습니다.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={noSourceConfirmed}
              onChange={(e) => setNoSourceConfirmed(e.target.checked)}
              className="w-5 h-5 rounded border-white/[0.1] bg-surface text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm font-medium text-white">
              안내 사항을 확인했습니다.
            </span>
          </label>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => {
                if (createQuizMutation.isPending) {
                  handleCancelGeneration();
                  return;
                }
                resetNoSourceModal();
              }}
              className="flex-1 py-3 text-sm font-medium text-content-secondary border border-white/[0.05] bg-surface rounded-xl hover:bg-surface-hover transition-colors"
            >
              {createQuizMutation.isPending ? '취소하고 돌아가기' : '취소'}
            </button>
            <button
              onClick={handleConfirmNoSource}
              disabled={!noSourceConfirmed || createQuizMutation.isPending}
              className="flex-1 bg-brand-500 text-brand-900 py-3 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
            >
              {createQuizMutation.isPending ? '생성 중...' : '이대로 진행하기'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
    )}
    </SkeletonTransition>
  );
}
