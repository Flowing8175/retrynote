import { useState, useEffect, useRef, useCallback } from 'react';
import { dashboardApi } from '@/api';
import { PillShimmer } from './LoadingSpinner';

type StreamPhase = 'loading' | 'streaming' | 'done' | 'error';

const STREAM_TIMEOUT_MS = 15_000;

interface CoachingStreamProps {
  range: string;
  fileId?: string | null;
  categoryTag?: string | null;
  hasData: boolean;
  fallbackMessage: string;
}

export default function CoachingStream({
  range,
  fileId,
  categoryTag,
  hasData,
  fallbackMessage,
}: CoachingStreamProps) {
  const [phase, setPhase] = useState<StreamPhase>('loading');
  const [segments, setSegments] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStreamTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    timeoutRef.current = setTimeout(() => {
      cancelRef.current?.();
      setPhase((prev) => (prev === 'streaming' ? 'done' : prev));
    }, STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout]);

  const startStream = useCallback(() => {
    cancelRef.current?.();
    clearStreamTimeout();
    setPhase('loading');
    setSegments([]);

    if (!hasData) {
      setSegments(fallbackMessage.split(/(\s+)/));
      setPhase('done');
      return;
    }

    resetStreamTimeout();

    const cancel = dashboardApi.streamCoaching(
      range,
      fileId,
      categoryTag,
      (chunk) => {
        setPhase('streaming');
        setSegments((prev) => [...prev, chunk]);
        resetStreamTimeout();
      },
      () => {
        clearStreamTimeout();
        setPhase('done');
      },
      () => {
        clearStreamTimeout();
        setSegments(fallbackMessage.split(/(\s+)/));
        setPhase('error');
      },
    );

    cancelRef.current = cancel;
  }, [range, fileId, categoryTag, hasData, fallbackMessage, resetStreamTimeout, clearStreamTimeout]);

  useEffect(() => {
    startStream();
    return () => {
      cancelRef.current?.();
      clearStreamTimeout();
    };
  }, [startStream, clearStreamTimeout]);

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-3 h-6">
        <PillShimmer width={160} height={8} />
        <PillShimmer width={100} height={8} delay={0.3} opacity={0.5} />
      </div>
    );
  }

  return (
    <p className="text-base text-content-secondary leading-relaxed max-w-xl">
      {segments.map((seg, i) => (
        <span
          key={i}
          className="coaching-word-fade"
          style={{ animationDelay: `${Math.min(i * 40, 800)}ms` }}
        >
          {seg}
        </span>
      ))}
    </p>
  );
}
