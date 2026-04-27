import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RotateCw, Layers, AlertCircle, Clock } from 'lucide-react';
import { useStudyStatus, useStudyFlashcards, useGenerateContent, useContentVersions, useFlashcardsVersion } from '@/api/study';
import { useStudyStreaming } from '@/hooks/useStudyStreaming';
import { VersionNavigator } from './VersionNavigator';
import { StudyThinkingView } from './StudyThinkingView';

interface FlashcardTabProps {
  fileId: string;
}

export function FlashcardTab({ fileId }: FlashcardTabProps) {
  const queryClient = useQueryClient();
  const { data: statusData } = useStudyStatus(fileId);
  const flashcardsStatus = statusData?.flashcards_status ?? 'not_generated';

  const { data, isLoading } = useStudyFlashcards(fileId, {
    enabled: flashcardsStatus === 'completed',
  });
  const generateMutation = useGenerateContent(fileId);

  const { data: versionsData } = useContentVersions(fileId, 'flashcards', {
    enabled: flashcardsStatus === 'completed',
  });
  const versions = versionsData?.versions ?? [];
  const [versionIndex, setVersionIndex] = useState<number | null>(null);

  const streaming = useStudyStreaming(fileId, 'flashcards');

  const pendingRegenRef = useRef(false);
  const prevVersionsLengthRef = useRef(0);

  const isViewingOldVersion = versionIndex !== null && versions.length > 0 && versionIndex < versions.length - 1;
  const selectedVersionId = isViewingOldVersion ? versions[versionIndex]?.id ?? null : null;

  const { data: oldVersionData } = useFlashcardsVersion(fileId, selectedVersionId);

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
    if (flashcardsStatus === 'completed') {
      void queryClient.invalidateQueries({ queryKey: ['study', 'flashcards', fileId] });
      void queryClient.invalidateQueries({ queryKey: ['study', 'versions', fileId, 'flashcards'] });
    }
  }, [flashcardsStatus, fileId, queryClient]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const displayData = isViewingOldVersion ? oldVersionData : data;
  const cards = displayData?.cards ?? [];
  const status = flashcardsStatus;
  const total = cards.length;
  const currentCard = cards[currentIndex];

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, total]);

  const flipCard = useCallback(() => {
    setIsFlipped((f) => !f);
  }, []);

  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [fileId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        flipCard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, flipCard]);

  const handleGenerate = useCallback(() => {
    pendingRegenRef.current = true;
    streaming.startStreaming();
    setVersionIndex(null);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [streaming]);

  if (streaming.state.isStreaming) {
    return (
      <div className="h-full">
        <StudyThinkingView state={streaming.state} onCancel={streaming.cancelStreaming} />
      </div>
    );
  }

  if (status === 'generating' || (status === 'completed' && isLoading)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-content-muted">
        <div className="relative">
          <Layers className="w-14 h-14 text-brand-500 opacity-40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-content-secondary">플래시카드 생성 중…</p>
          <p className="text-sm text-content-muted mt-1">잠시만 기다려 주세요.</p>
        </div>
      </div>
    );
  }

  if (status === 'not_generated') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-content-muted">
        <div className="p-4 bg-surface-raised rounded-full">
          <Layers className="w-12 h-12 text-content-muted" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-content-secondary">플래시카드가 없습니다</p>
          <p className="text-sm text-content-muted mt-1">AI가 이 자료로 플래시카드를 생성합니다.</p>
        </div>
        <button
           onClick={handleGenerate}
           disabled={generateMutation.isPending || streaming.state.isStreaming}
           className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-content-inverse text-sm font-medium rounded-xl transition-colors"
         >
           {generateMutation.isPending || streaming.state.isStreaming ? (
             <>
               <div className="w-4 h-4 border-2 border-content-inverse border-t-transparent rounded-full animate-spin" />
               생성 중…
             </>
           ) : (
             <>
               <Layers className="w-4 h-4" />
               플래시카드 생성
             </>
           )}
         </button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-content-muted">
        <div className="p-4 bg-semantic-error-bg rounded-full">
          <AlertCircle className="w-12 h-12 text-semantic-error" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-content-secondary">생성 실패</p>
          <p className="text-sm text-content-muted mt-1">플래시카드 생성 중 오류가 발생했습니다.</p>
        </div>
        <button
           onClick={handleGenerate}
           disabled={generateMutation.isPending || streaming.state.isStreaming}
           className="flex items-center gap-2 px-5 py-2.5 bg-surface-raised hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-content-secondary text-sm font-medium rounded-xl transition-colors border border-white/[0.05]"
         >
           {generateMutation.isPending || streaming.state.isStreaming ? (
             <>
               <div className="w-4 h-4 border-2 border-content-secondary border-t-transparent rounded-full animate-spin" />
               생성 중…
             </>
           ) : (
             <>
               <RotateCw className="w-4 h-4" />
               다시 생성
             </>
           )}
         </button>
      </div>
    );
  }

  if (status === 'completed' && total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-content-muted">
        <Clock className="w-10 h-10 text-content-muted" />
        <p className="text-sm">생성된 카드가 없습니다.</p>
        <button
           onClick={handleGenerate}
           disabled={generateMutation.isPending || streaming.state.isStreaming}
           className="flex items-center gap-2 px-4 py-2 bg-surface-raised hover:bg-surface-hover text-content-secondary text-sm rounded-xl transition-colors border border-white/[0.05]"
         >
           <RotateCw className="w-4 h-4" />
           다시 생성
         </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-between h-full py-6 px-4 gap-6 select-none">
      <div className="flex items-center gap-3 w-full max-w-lg">
        <div className="flex-1 h-1.5 bg-surface-raised rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
          />
        </div>
        <span className="text-sm font-medium text-content-secondary whitespace-nowrap tabular-nums">
          {currentIndex + 1} / {total}
        </span>
      </div>

      <div
        className="flex-1 flex items-center justify-center w-full"
        style={{ perspective: '1000px' }}
      >
        <button
          onClick={flipCard}
          aria-label={isFlipped ? '앞면 보기' : '뒷면 보기'}
          className="w-full max-w-lg focus:outline-none"
          style={{
            height: '260px',
            transformStyle: 'preserve-3d',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-surface border border-white/[0.05] rounded-3xl shadow-xl cursor-pointer hover:border-brand-500/30 transition-colors"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <p className="text-xl font-semibold text-content-primary text-center leading-relaxed">
                {currentCard?.front}
              </p>
              <span className="text-xs text-content-muted mt-6">
                스페이스바 또는 클릭하여 뒤집기
              </span>
            </div>

            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-surface border border-brand-500/20 rounded-3xl shadow-xl cursor-pointer"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <p className="text-lg text-content-primary text-center leading-relaxed">
                {currentCard?.back}
              </p>
              {currentCard?.hint && (
                <p className="text-xs text-content-muted mt-4 italic text-center">
                  힌트: {currentCard.hint}
                </p>
              )}
            </div>
          </div>
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-4">
          <button
            onClick={goToPrev}
            disabled={currentIndex === 0}
            aria-label="이전 카드"
            className="flex items-center justify-center w-11 h-11 rounded-full bg-surface-raised hover:bg-surface-hover disabled:bg-surface disabled:text-content-muted text-content-secondary transition-colors disabled:cursor-not-allowed border border-white/[0.05]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

           <button
             onClick={handleGenerate}
             disabled={generateMutation.isPending || streaming.state.isStreaming}
             aria-label="다시 생성"
             className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-content-muted hover:text-content-primary text-xs transition-colors border border-white/[0.05]"
           >
             <RotateCw className={`w-3.5 h-3.5 ${generateMutation.isPending || streaming.state.isStreaming ? 'animate-spin' : ''}`} />
             재생성
           </button>

          <button
            onClick={goToNext}
            disabled={currentIndex === total - 1}
            aria-label="다음 카드"
            className="flex items-center justify-center w-11 h-11 rounded-full bg-surface-raised hover:bg-surface-hover disabled:bg-surface disabled:text-content-muted text-content-secondary transition-colors disabled:cursor-not-allowed border border-white/[0.05]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <VersionNavigator
          current={(versionIndex ?? versions.length - 1) + 1}
          total={versions.length}
          onPrev={() => {
            setVersionIndex((i) => Math.max(0, (i ?? versions.length - 1) - 1));
            setCurrentIndex(0);
            setIsFlipped(false);
          }}
          onNext={() => {
            setVersionIndex((i) => Math.min(versions.length - 1, (i ?? versions.length - 1) + 1));
            setCurrentIndex(0);
            setIsFlipped(false);
          }}
        />
      </div>

      <p className="text-xs text-content-muted">
        ← → 이동 &nbsp;·&nbsp; 스페이스바 뒤집기
      </p>
    </div>
  );
}
