import { useState, useEffect } from 'react';
import { PillShimmer } from '@/components';
import { generatingPhrases } from '@/utils/quizConstants';

interface QuizGeneratingScreenProps {
  variant?: 'embedded' | 'fullscreen';
  onCancel?: () => void;
}

export default function QuizGeneratingScreen({
  variant = 'embedded',
  onCancel,
}: QuizGeneratingScreenProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhraseIndex((i) => (i + 1) % generatingPhrases.length), 3000);
    return () => clearInterval(id);
  }, []);

  if (variant === 'fullscreen') {
    return (
      <div className="min-h-screen bg-surface-deep flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <span className="text-lg font-bold text-content-primary">RetryNote</span>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 animate-fade-in">
            <div className="flex flex-col items-center gap-2.5 animate-fade-in-up stagger-1">
              <PillShimmer width={220} />
              <PillShimmer width={160} delay={0.3} opacity={0.75} />
              <PillShimmer width={200} delay={0.55} opacity={0.55} />
              <PillShimmer width={120} delay={0.8} opacity={0.38} />
              <PillShimmer width={80} delay={1.0} opacity={0.22} />
            </div>
            <p key={phraseIndex} className="text-content-secondary text-base animate-fade-in">
              {generatingPhrases[phraseIndex]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-32 text-center space-y-8 animate-fade-in">
      <div className="flex flex-col items-center gap-2.5 mx-auto animate-fade-in-up stagger-1">
        <PillShimmer width={220} />
        <PillShimmer width={160} delay={0.3} opacity={0.75} />
        <PillShimmer width={200} delay={0.55} opacity={0.55} />
        <PillShimmer width={120} delay={0.8} opacity={0.38} />
        <PillShimmer width={80} delay={1.0} opacity={0.22} />
      </div>
      <div className="space-y-4 animate-fade-in-up stagger-3">
        <h1 key={phraseIndex} className="text-3xl font-semibold text-white animate-fade-in">
          {generatingPhrases[phraseIndex]}
        </h1>
        <p className="text-base text-content-secondary leading-relaxed animate-fade-in-up stagger-4">
          AI가 학습 자료를 분석하여 문항을 설계하고 있습니다.<br />잠시만 기다려 주세요.
        </p>
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 text-sm text-content-muted underline underline-offset-2 transition-colors hover:text-white animate-fade-in-up stagger-5"
        >
          취소하고 돌아가기
        </button>
      )}
    </div>
  );
}
