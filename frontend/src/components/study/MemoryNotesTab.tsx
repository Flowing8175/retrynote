import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  BookOpen,
  AlertCircle,
  Sparkles,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  useStudyStatus,
  useStudyConceptNotes,
  useContentVersions,
  useConceptNotesVersion,
} from '@/api/study';
import type { ConceptNoteItem } from '@/types/study';
import { VersionNavigator } from './VersionNavigator';
import { useStudyStreaming } from '@/hooks/useStudyStreaming';
import { StudyThinkingView } from './StudyThinkingView';

interface MemoryNotesTabProps {
  fileId: string;
}

function MemoryNotesSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="border border-surface-border rounded-xl p-4">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-surface-raised rounded w-2/5" />
            <div className="h-5 bg-surface-raised rounded-full w-14" />
          </div>
          <div className="flex gap-1.5 mt-2">
            <div className="h-4 bg-surface-raised rounded w-12" />
            <div className="h-4 bg-surface-raised rounded w-16" />
            <div className="h-4 bg-surface-raised rounded w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: ConceptNoteItem['difficulty'] }) {
  const config: Record<ConceptNoteItem['difficulty'], { label: string; className: string }> = {
    easy: { label: '쉬움', className: 'bg-semantic-success-bg text-semantic-success border border-semantic-success-border' },
    medium: { label: '보통', className: 'bg-semantic-warning-bg text-semantic-warning border border-semantic-warning-border' },
    hard: { label: '어려움', className: 'bg-semantic-error-bg text-semantic-error border border-semantic-error-border' },
  };
  const { label, className } = config[difficulty];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

interface ConceptItemProps {
  concept: ConceptNoteItem;
  isOpen: boolean;
  onToggle: () => void;
  hideMode: boolean;
  isRevealed: boolean;
  onReveal: () => void;
}

function ConceptItem({
  concept,
  isOpen,
  onToggle,
  hideMode,
  isRevealed,
  onReveal,
}: ConceptItemProps) {
  const effectiveOpen = hideMode || isOpen;
  const isBlurred = hideMode && !isRevealed;

  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={hideMode ? undefined : onToggle}
        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
          hideMode ? 'cursor-default' : 'hover:bg-surface-raised cursor-pointer'
        }`}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-sm font-semibold text-content-primary">
              {concept.name}
            </span>
            <DifficultyBadge difficulty={concept.difficulty} />
          </div>
          {concept.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {concept.keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-block px-1.5 py-0.5 rounded text-xs bg-surface-raised text-content-muted border border-surface-border"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
        {!hideMode && (
          <ChevronDown
            className={`w-4 h-4 text-content-muted flex-shrink-0 mt-0.5 transition-transform duration-300 ease-out ${
              effectiveOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          effectiveOpen ? '[grid-template-rows:1fr]' : '[grid-template-rows:0fr]'
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-4 pb-4 pt-2 border-t border-surface-border">
            <div
              style={{
                filter: isBlurred ? 'blur(5px)' : 'none',
                userSelect: isBlurred ? 'none' : 'text',
                transition: 'filter 0.2s ease-out',
              }}
            >
              <p className="text-sm leading-7 text-content-secondary">
                {concept.explanation}
              </p>
              {concept.key_points.length > 0 && (
                <ul className="mt-2 list-disc pl-5 space-y-1.5">
                  {concept.key_points.map((point, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-content-secondary leading-relaxed"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {hideMode && (
              <button
                type="button"
                onClick={onReveal}
                className="mt-3 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:text-content-primary bg-surface-raised hover:bg-surface-hover border border-surface-border rounded-lg transition-all"
              >
                {isRevealed ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    가리기
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    보이기
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MemoryNotesTab({ fileId }: MemoryNotesTabProps) {
  const queryClient = useQueryClient();
  const { data: statusData } = useStudyStatus(fileId);
  const conceptNotesStatus = statusData?.concept_notes_status ?? 'not_generated';

  const { data: conceptNotes, isLoading } = useStudyConceptNotes(fileId, {
    enabled: conceptNotesStatus === 'completed',
  });
  const streaming = useStudyStreaming(fileId, 'concept-notes');

  const { data: versionsData } = useContentVersions(fileId, 'concept-notes', {
    enabled: conceptNotesStatus === 'completed',
  });
  const versions = versionsData?.versions ?? [];
  const [versionIndex, setVersionIndex] = useState<number | null>(null);

  const pendingRegenRef = useRef(false);
  const prevVersionsLengthRef = useRef(0);

  const isViewingOldVersion =
    versionIndex !== null &&
    versions.length > 0 &&
    versionIndex < versions.length - 1;
  const selectedVersionId = isViewingOldVersion
    ? (versions[versionIndex]?.id ?? null)
    : null;

  const { data: oldVersionData } = useConceptNotesVersion(fileId, selectedVersionId);

  useEffect(() => {
    setVersionIndex(null);
    pendingRegenRef.current = false;
  }, [fileId]);

  useEffect(() => {
    if (versions.length > 0 && versionIndex === null) {
      setVersionIndex(versions.length - 1);
    }
  }, [versions.length, versionIndex]);

  useEffect(() => {
    if (pendingRegenRef.current && versions.length > prevVersionsLengthRef.current) {
      setVersionIndex(versions.length - 1);
      pendingRegenRef.current = false;
    }
    prevVersionsLengthRef.current = versions.length;
  }, [versions.length]);

  useEffect(() => {
    if (conceptNotesStatus === 'completed') {
      void queryClient.invalidateQueries({
        queryKey: ['study', 'concept-notes', fileId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['study', 'versions', fileId, 'concept-notes'],
      });
    }
  }, [conceptNotesStatus, fileId, queryClient]);

  const handleRegenerate = useCallback(() => {
    pendingRegenRef.current = true;
    streaming.startStreaming();
    setVersionIndex(null);
  }, [streaming]);

  const displayData = isViewingOldVersion ? oldVersionData : conceptNotes;
  const concepts = displayData?.concepts ?? [];

  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const [hideMode, setHideMode] = useState(false);
  const [revealedSet, setRevealedSet] = useState<Set<string>>(new Set());

  const toggleConcept = useCallback((id: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleRevealConcept = useCallback((id: string) => {
    setRevealedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleHideMode = useCallback(() => {
    setHideMode((prev) => !prev);
    setRevealedSet(new Set());
  }, []);

  useEffect(() => {
    setOpenSet(new Set());
    setHideMode(false);
    setRevealedSet(new Set());
  }, [fileId]);

  const isShowingLoader =
    conceptNotesStatus === 'generating' ||
    (conceptNotesStatus === 'completed' && isLoading);
  const canRegenerate =
    !streaming.state.isStreaming && (conceptNotesStatus === 'completed' || conceptNotesStatus === 'failed');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-sm font-medium text-content-primary">암기노트</span>
          {(conceptNotesStatus === 'generating' || streaming.state.isStreaming) && (
            <span className="text-xs text-content-muted">생성 중...</span>
          )}
        </div>
        {canRegenerate && (
          <div className="flex items-center gap-2">
            <VersionNavigator
              current={(versionIndex ?? versions.length - 1) + 1}
              total={versions.length}
              onPrev={() =>
                setVersionIndex((i) => Math.max(0, (i ?? versions.length - 1) - 1))
              }
              onNext={() =>
                setVersionIndex((i) =>
                  Math.min(versions.length - 1, (i ?? versions.length - 1) + 1),
                )
              }
            />
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={streaming.state.isStreaming}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:text-content-primary bg-surface-raised hover:bg-surface-hover border border-surface-border rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 ${streaming.state.isStreaming ? 'animate-spin' : ''}`} />
              다시 생성
            </button>
          </div>
        )}
      </div>

      {streaming.state.isStreaming ? (
        <div className="flex-1 overflow-hidden">
          <StudyThinkingView state={streaming.state} onCancel={streaming.cancelStreaming} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isShowingLoader && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-content-secondary">
                <Sparkles className="w-4 h-4 text-brand-400 animate-pulse flex-shrink-0" />
                <span>암기노트를 생성하고 있습니다...</span>
              </div>
              <MemoryNotesSkeleton />
            </div>
          )}

          {!isShowingLoader && conceptNotesStatus === 'not_generated' && (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-center space-y-4 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10">
                <BookOpen className="w-5 h-5 text-brand-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-content-primary">
                  암기노트가 생성되지 않았습니다
                </p>
                <p className="text-xs text-content-muted">
                  아래 버튼을 눌러 AI 암기노트를 생성하세요
                </p>
              </div>
              <button
                type="button"
                onClick={() => streaming.startStreaming()}
                disabled={streaming.state.isStreaming}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-content-inverse bg-brand-500 hover:bg-brand-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className={`w-4 h-4 ${streaming.state.isStreaming ? 'animate-spin' : ''}`} />
                생성하기
              </button>
            </div>
          )}

          {!isShowingLoader && conceptNotesStatus === 'failed' && (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-center space-y-4 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-semantic-error-bg">
                <AlertCircle className="w-5 h-5 text-semantic-error" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-content-primary">
                  암기노트 생성에 실패했습니다
                </p>
                <p className="text-xs text-content-muted">잠시 후 다시 시도해주세요</p>
              </div>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={streaming.state.isStreaming}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-content-inverse bg-brand-500 hover:bg-brand-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${streaming.state.isStreaming ? 'animate-spin' : ''}`} />
                다시 생성
              </button>
            </div>
          )}

          {!isShowingLoader && conceptNotesStatus === 'completed' && (
            <>
              {concepts.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-center space-y-3 py-8">
                  <BookOpen className="w-8 h-8 text-content-muted" />
                  <p className="text-sm text-content-muted">추출된 개념이 없습니다</p>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={streaming.state.isStreaming}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-content-secondary hover:text-content-primary bg-surface-raised hover:bg-surface-hover border border-surface-border rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-4 h-4 ${streaming.state.isStreaming ? 'animate-spin' : ''}`} />
                    다시 생성
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-content-muted">
                      총 {concepts.length}개 개념
                    </span>
                    <button
                      type="button"
                      onClick={toggleHideMode}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        hideMode
                          ? 'bg-brand-500/10 text-brand-400 border-brand-500/30 hover:bg-brand-500/20'
                          : 'bg-surface-raised text-content-secondary border-surface-border hover:bg-surface-hover hover:text-content-primary'
                      }`}
                    >
                      {hideMode ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          가리기 ON
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          가리기 모드
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    {concepts.map((concept) => (
                      <ConceptItem
                        key={concept.id}
                        concept={concept}
                        isOpen={openSet.has(concept.id)}
                        onToggle={() => toggleConcept(concept.id)}
                        hideMode={hideMode}
                        isRevealed={revealedSet.has(concept.id)}
                        onReveal={() => toggleRevealConcept(concept.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default MemoryNotesTab;
