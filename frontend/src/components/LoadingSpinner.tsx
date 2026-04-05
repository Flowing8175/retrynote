import { useState, useEffect } from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

const loadingPhrases = [
  '퀴즈 로딩 중',
  '자료 꼼꼼히 읽는 중',
  '핵심 개념 정리 중',
  '문제 만드는 중',
  '정답 검토 중',
  '거의 다 됐어요!',
];

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  const [currentPhrase, setCurrentPhrase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPhrase((prev) => (prev + 1) % loadingPhrases.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-14 text-center" role="status" aria-live="polite">
      <div className="relative h-16 w-16" style={{ filter: 'drop-shadow(0 0 6px rgba(0, 193, 154, 0.4))' }}>
        <div className="absolute inset-0 rounded-full border-4 border-white/[0.08]"></div>
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
        <div className="absolute inset-[0.9rem] rounded-full bg-surface"></div>
      </div>
      <div className="mt-5 text-center">
        <p className="text-lg font-semibold" style={{ color: '#A0AEC0' }}>
          {message || loadingPhrases[currentPhrase]}
        </p>
      </div>
    </div>
  );
}
