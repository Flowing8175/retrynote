import { useState, useEffect } from 'react';

const loadingPhrases = [
  '퀴즈 로딩 중',
  '자료 꼼꼼히 읽는 중',
  '핵심 개념 정리 중',
  '문제 만드는 중',
  '정답 검토 중',
  '거의 다 됐어요!',
];

interface PillShimmerProps {
  width: number;
  height?: number;
  delay?: number;
  opacity?: number;
}

export function PillShimmer({ width, height = 10, delay = 0, opacity = 1 }: PillShimmerProps) {
  return (
    <div
      className="relative overflow-hidden rounded-full"
      style={{
        width,
        height,
        backgroundColor: 'oklch(0.22 0.022 190)',
        opacity,
      }}
    >
      <div
        className="pill-shimmer-wave absolute inset-0"
        style={delay > 0 ? { animationDelay: `${delay}s` } : undefined}
      />
    </div>
  );
}

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  const [currentPhrase, setCurrentPhrase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPhrase((prev) => (prev + 1) % loadingPhrases.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-14" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-2.5">
        <PillShimmer width={200} />
        <PillShimmer width={140} delay={0.4} opacity={0.65} />
        <PillShimmer width={88} delay={0.75} opacity={0.38} />
      </div>
      <p className="mt-5 text-sm font-medium text-content-muted text-center">
        {message || loadingPhrases[currentPhrase]}
      </p>
    </div>
  );
}
