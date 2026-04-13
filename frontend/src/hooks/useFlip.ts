import { useLayoutEffect, useRef } from 'react';

export function useFlip<T extends HTMLElement>(
  duration = 400,
  easing = 'cubic-bezier(0.16, 1, 0.3, 1)',
) {
  const ref = useRef<T>(null);
  const capturedY = useRef<number | null>(null);

  const capture = () => {
    if (ref.current) {
      capturedY.current = ref.current.getBoundingClientRect().top;
    }
  };

  // No dep array: runs after every render but bails immediately unless
  // capture() was called, keeping the per-render cost to a null-check.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || capturedY.current === null) return;

    const delta = capturedY.current - el.getBoundingClientRect().top;
    capturedY.current = null;

    if (Math.abs(delta) < 1) return;

    el.style.transition = 'none';
    el.style.transform = `translateY(${delta}px)`;

    // Double rAF: guarantees the browser paints the inverted frame before playing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${duration}ms ${easing}`;
        el.style.transform = 'translateY(0)';
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          el.style.transform = '';
        }, { once: true });
      });
    });
  });

  return { ref, capture };
}
