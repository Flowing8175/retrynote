import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, AlertTriangle, BookOpen, Sparkles, PenLine, History } from 'lucide-react';
import { filesApi } from '@/api';
import { StatusBadge, SkeletonTransition } from '@/components';
import { StudyHistoryPanel } from '@/components/study/StudyHistoryPanel';
import { OptionGroup } from '@/components/ui';
import { isFileProcessingStatus } from '@/types/file';
import { formatFileSize, formatFileSource } from '@/utils/formatters';

type UISourceMode = 'document_based' | 'no_source' | 'topic_based';

function StudyListSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-16 py-8 animate-pulse" aria-hidden="true">
      <section className="space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <div className="skeleton h-9 w-36 rounded-md" />
            <div className="skeleton h-4 w-72 rounded-md" />
          </div>
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
    </div>
  );
}

export default function StudyList() {
  const navigate = useNavigate();

  const [sourceMode, setSourceMode] = useState<UISourceMode>('document_based');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => filesApi.listFolders(),
  });

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['study-list-files'],
    queryFn: () => filesApi.listFiles(1, 100),
    refetchInterval: (query) =>
      (query.state.data?.files ?? []).some((file) => isFileProcessingStatus(file.status)) ? 2000 : false,
  });

  const folders = useMemo(() => (Array.isArray(foldersData) ? foldersData : []), [foldersData]);
  const allFiles = useMemo(() => (Array.isArray(filesData?.files) ? filesData.files : []), [filesData?.files]);

  const handleSourceModeChange = (v: UISourceMode) => {
    setSourceMode(v);
    setFileError(null);
    setFormMessage(null);
  };

  const handleFileToggle = (fileId: string) => {
    setFormMessage(null);
    setFileError(null);
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const fileGroups = useMemo(() => {
    const visibleFiles = allFiles.filter(
      (file) => selectedFolderId === null || file.folder_id === selectedFolderId
    );
    const readyFiles = visibleFiles.filter((file) => file.is_quiz_eligible && (file.status === 'ready' || file.status === 'failed_partial'));
    const processingFiles = visibleFiles.filter((file) => isFileProcessingStatus(file.status));

    return { readyFiles, processingFiles };
  }, [allFiles, selectedFolderId]);

  const canSubmitDocumentBased = sourceMode === 'document_based' && selectedFileIds.length > 0;

  const visibleReadyIds = useMemo(
    () => fileGroups.readyFiles.map((f) => f.id),
    [fileGroups.readyFiles]
  );
  const selectedVisibleCount = useMemo(
    () => visibleReadyIds.filter((id) => selectedFileIds.includes(id)).length,
    [visibleReadyIds, selectedFileIds]
  );
  const allVisibleSelected =
    visibleReadyIds.length > 0 && selectedVisibleCount === visibleReadyIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleReadyIds.length;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const handleSelectAllToggle = () => {
    setFormMessage(null);
    setFileError(null);
    if (allVisibleSelected) {
      setSelectedFileIds((prev) => prev.filter((id) => !visibleReadyIds.includes(id)));
    } else {
      setSelectedFileIds((prev) => {
        const merged = new Set(prev);
        visibleReadyIds.forEach((id) => merged.add(id));
        return Array.from(merged);
      });
    }
  };

  const handleSubmit = () => {
    setFormMessage(null);
    if (sourceMode !== 'document_based') {
      setFormMessage('학습은 업로드한 자료로만 시작할 수 있습니다. "내 자료에서 출제"를 선택해 주세요.');
      return;
    }
    if (selectedFileIds.length === 0) {
      setFormMessage('최소 하나의 학습 자료를 선택해 주세요.');
      return;
    }
    navigate(`/study/${selectedFileIds[0]}`);
  };

  return (
    <SkeletonTransition loading={filesLoading} skeleton={<StudyListSkeleton />}>
    {filesLoading ? null : (
    <div className="max-w-4xl mx-auto space-y-16 py-8 animate-fade-in">
      <section className="animate-fade-in-up space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between border-b border-white/[0.05] pb-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">학습 시작</h1>
            <p className="text-base text-content-secondary max-w-xl leading-relaxed">
              학습할 자료를 선택하여 요약, 플래시카드, 마인드맵으로 학습을 시작합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="group inline-flex items-center gap-2 self-start px-4 py-2.5 bg-surface-raised hover:bg-surface-hover text-content-secondary hover:text-white text-sm font-medium rounded-xl border border-white/[0.05] hover:border-white/[0.1] transition-colors lg:self-end"
          >
            <History size={16} className="transition-transform group-hover:-translate-x-0.5" />
            학습 기록
          </button>
        </div>
      </section>

      <section className="animate-fade-in-up stagger-1 space-y-8" data-tour="study-list">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-300 font-semibold text-sm">
            1
          </div>
          <h2 className="text-xl font-semibold text-white">자료 선택</h2>
        </div>

        <OptionGroup
          options={[
            { value: 'document_based' as const, label: '내 자료에서 학습', description: '업로드한 문서나 PDF를 바탕으로 학습 콘텐츠를 생성합니다. 가장 정확하고 권장되는 방식입니다.', icon: <BookOpen size={20} /> },
            { value: 'topic_based' as const, label: '주제 직접 입력하기', description: '원하는 주제나 URL을 직접 입력해 학습 콘텐츠를 만듭니다.', icon: <PenLine size={20} /> },
            { value: 'no_source' as const, label: 'AI 배경지식 학습', description: '자료 없이 AI가 흥미로운 주제를 무작위로 골라 학습 콘텐츠를 제공합니다.', icon: <Sparkles size={20} /> },
          ]}
          value={sourceMode}
          onChange={(v) => handleSourceModeChange(v as UISourceMode)}
          size="lg"
          layout="grid-3"
        />

        <div className="relative grid transition-[grid-template-rows] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ gridTemplateRows: '1fr' }}>
          <div
            aria-hidden={sourceMode !== 'document_based'}
            className={`transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              sourceMode === 'document_based'
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 -translate-y-1 pointer-events-none absolute inset-x-0 top-0'
            }`}
          >
            <div className={`space-y-6 bg-surface rounded-3xl p-6 md:p-8 ${fileError ? 'border border-semantic-error' : 'border border-white/[0.05]'}`}>
              {fileError && (
                <p className="text-xs text-semantic-error -mb-2">{fileError}</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <OptionGroup
                  options={[
                    { value: '__all__', label: '전체' },
                    ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
                  ]}
                  value={selectedFolderId ?? '__all__'}
                  onChange={(v) => { const sv = v as string; setSelectedFolderId(sv === '__all__' ? null : sv); setSelectedFileIds([]); }}
                  size="sm"
                  layout="wrap"
                />
                <Link to="/files" className="inline-flex items-center py-2 px-2 text-xs font-medium text-brand-300 hover:text-white transition-colors">
                  자료 관리 →
                </Link>
              </div>

              {fileGroups.readyFiles.length > 0 && (
                <label className="flex items-center gap-4 px-5 py-2 cursor-pointer select-none">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleSelectAllToggle}
                    className="w-5 h-5 rounded border-white/[0.1] bg-surface text-brand-500 focus:ring-brand-500"
                    aria-label={allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                  />
                  <span className="text-xs font-medium text-content-secondary">
                    {allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-content-muted">
                    {selectedVisibleCount} / {visibleReadyIds.length}
                  </span>
                </label>
              )}
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
          </div>

          <div
            aria-hidden={sourceMode !== 'topic_based'}
            className={`transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              sourceMode === 'topic_based'
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 translate-y-1 pointer-events-none absolute inset-x-0 top-0'
            }`}
          >
            <div className="space-y-4 bg-surface border border-white/[0.05] rounded-3xl p-6 md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
                  <PenLine size={20} />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="text-sm font-semibold text-white">주제 기반 학습은 준비 중입니다</h3>
                  <p className="text-xs text-content-secondary leading-relaxed">
                    현재 학습 기능은 업로드한 자료로만 제공됩니다. "내 자료에서 학습"을 선택해 주세요.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            aria-hidden={sourceMode !== 'no_source'}
            className={`transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              sourceMode === 'no_source'
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 translate-y-1 pointer-events-none absolute inset-x-0 top-0'
            }`}
          >
            <div className="bg-surface border border-white/[0.05] rounded-3xl p-6 md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
                  <Sparkles size={20} />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="text-sm font-semibold text-white">AI 배경지식 학습은 준비 중입니다</h3>
                  <p className="text-xs text-content-secondary leading-relaxed">
                    현재 학습 기능은 업로드한 자료로만 제공됩니다. "내 자료에서 학습"을 선택해 주세요.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="animate-fade-in-up stagger-3 pt-8">
        {formMessage && (
          <div className="mb-8 bg-semantic-error/10 border border-semantic-error/20 p-4 rounded-2xl flex items-center gap-3">
            <AlertTriangle size={20} className="text-semantic-error shrink-0" />
            <p className="text-sm font-medium text-white">{formMessage}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-4 justify-end">
          <button
            onClick={() => navigate('/')}
            className="text-sm font-medium text-content-secondary hover:text-white px-6 py-4 transition-colors"
          >
            취소
          </button>

          <button
            onClick={handleSubmit}
            disabled={!canSubmitDocumentBased}
            className="group relative w-full sm:w-auto bg-brand-500 text-brand-900 px-10 py-4 rounded-2xl text-base font-semibold transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <div className="flex items-center justify-center gap-2">
              학습 시작하기
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      </section>
      <StudyHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
    )}
    </SkeletonTransition>
  );
}
