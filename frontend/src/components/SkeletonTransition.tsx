import { useEffect, useRef, useState } from 'react';

/**
 * Crossfades from a skeleton to content instead of cutting abruptly.
 * The skeleton fades out while content renders beneath it and plays its own animations.
 */

const CROSSFADE_MS = 600;

type Phase = 'skeleton' | 'crossfade' | 'content';

export function SkeletonTransition({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>(loading ? 'skeleton' : 'content');
  const frozenSkeleton = useRef<React.ReactNode>(skeleton);

  // Keep frozen skeleton in sync while still loading
  if (loading) frozenSkeleton.current = skeleton;

  useEffect(() => {
    if (!loading && phase === 'skeleton') {
      setPhase('crossfade');
      const id = window.setTimeout(() => setPhase('content'), CROSSFADE_MS);
      return () => window.clearTimeout(id);
    }
    if (loading && phase !== 'skeleton') {
      setPhase('skeleton');
    }
  }, [loading, phase]);

  // Fast path: data was already available (e.g. cached), no crossfade needed
  if (phase === 'content') return <>{children}</>;

  const isCrossfading = phase === 'crossfade';

  return (
    <div className="grid">
      {/* Content layer: underneath, plays its own entrance animations */}
      {isCrossfading && children && (
        <div className="[grid-area:1/1]">{children}</div>
      )}

      {/* Skeleton layer: on top, fades out during crossfade */}
      <div
        className="[grid-area:1/1]"
        aria-hidden={isCrossfading}
        style={{
          transition: `opacity ${CROSSFADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          opacity: isCrossfading ? 0 : 1,
          pointerEvents: isCrossfading ? 'none' : undefined,
        }}
      >
        {frozenSkeleton.current}
      </div>
    </div>
  );
}
