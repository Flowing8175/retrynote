import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Layers, AlertCircle, Clock } from 'lucide-react';
import { useStudyFlashcards, useGenerateContent } from '@/api/study';

interface FlashcardTabProps {
  fileId: string;
}

export function FlashcardTab({ fileId }: FlashcardTabProps) {
  const { data, isLoading, error } = useStudyFlashcards(fileId);
  const generateMutation = useGenerateContent(fileId);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const cards = data?.cards ?? [];
  const status = data?.status ?? 'not_generated';
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

  const handleGenerate = () => {
    generateMutation.mutate('flashcards');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-sm">불러오는 중…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-gray-400">
        <div className="relative">
          <Layers className="w-14 h-14 text-blue-500 opacity-40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-gray-300">플래시카드 생성 중…</p>
          <p className="text-sm text-gray-500 mt-1">잠시만 기다려 주세요.</p>
        </div>
      </div>
    );
  }

  if (status === 'not_generated') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-gray-400">
        <div className="p-4 bg-gray-800 rounded-full">
          <Layers className="w-12 h-12 text-gray-500" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-gray-300">플래시카드가 없습니다</p>
          <p className="text-sm text-gray-500 mt-1">AI가 이 자료로 플래시카드를 생성합니다.</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {generateMutation.isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
      <div className="flex flex-col items-center justify-center h-full gap-6 text-gray-400">
        <div className="p-4 bg-red-900/30 rounded-full">
          <AlertCircle className="w-12 h-12 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-gray-300">생성 실패</p>
          <p className="text-sm text-gray-500 mt-1">플래시카드 생성 중 오류가 발생했습니다.</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {generateMutation.isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
        <Clock className="w-10 h-10 text-gray-500" />
        <p className="text-sm">생성된 카드가 없습니다.</p>
        <button
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
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
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-400 whitespace-nowrap tabular-nums">
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
              className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gray-700 border border-gray-600 rounded-2xl shadow-xl cursor-pointer hover:border-blue-500/50 transition-colors"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4">
                질문
              </span>
              <p className="text-xl font-semibold text-white text-center leading-relaxed">
                {currentCard?.front}
              </p>
              <span className="text-xs text-gray-500 mt-6">
                스페이스바 또는 클릭하여 뒤집기
              </span>
            </div>

            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gray-800 border border-blue-500/40 rounded-2xl shadow-xl cursor-pointer"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400 mb-4">
                답변
              </span>
              <p className="text-lg text-gray-100 text-center leading-relaxed">
                {currentCard?.back}
              </p>
              {currentCard?.hint && (
                <p className="text-xs text-gray-500 mt-4 italic text-center">
                  힌트: {currentCard.hint}
                </p>
              )}
            </div>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={goToPrev}
          disabled={currentIndex === 0}
          aria-label="이전 카드"
          className="flex items-center justify-center w-11 h-11 rounded-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 transition-colors disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          aria-label="다시 생성"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-gray-400 hover:text-gray-200 text-xs transition-colors"
        >
          <RotateCw className={`w-3.5 h-3.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
          재생성
        </button>

        <button
          onClick={goToNext}
          disabled={currentIndex === total - 1}
          aria-label="다음 카드"
          className="flex items-center justify-center w-11 h-11 rounded-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 transition-colors disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <p className="text-xs text-gray-600">
        ← → 이동 &nbsp;·&nbsp; 스페이스바 뒤집기
      </p>
    </div>
  );
}
