import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useJoyride, STATUS } from 'react-joyride';
import type { EventData } from 'react-joyride';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import TourTooltip from './TourTooltip';
import { getTourSteps } from './tourSteps';
import { seedTourMockData, cleanupTourMockData } from './tourMockData';

interface TourContextValue {
  restartTour: () => void;
}

const TourContext = createContext<TourContextValue>({ restartTour: () => {} });

export function useTour(): TourContextValue {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tourActiveRef = useRef(false);

  const handleEvent = useCallback(
    (data: EventData) => {
      const { status } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        tourActiveRef.current = false;
        cleanupTourMockData(queryClient);
        localStorage.setItem('rn-tour-completed', 'true');
      }
    },
    [queryClient],
  );

  const { Tour, controls } = useJoyride({
    steps: getTourSteps(navigate),
    tooltipComponent: TourTooltip,
    continuous: true,
    options: {
      blockTargetInteraction: true,
      targetWaitTimeout: 3000,
      overlayColor: 'rgba(0,0,0,0.6)',
      zIndex: 10000,
    },
    onEvent: handleEvent,
  });

  useEffect(() => {
    const shouldStart =
      !localStorage.getItem('rn-tour-completed') && window.innerWidth >= 768;

    if (!shouldStart) return;

    seedTourMockData(queryClient);
    tourActiveRef.current = true;

    const timer = setTimeout(() => {
      controls.start();
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (tourActiveRef.current) {
        cleanupTourMockData(queryClient);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restartTour = useCallback(() => {
    localStorage.removeItem('rn-tour-completed');
    seedTourMockData(queryClient);
    navigate('/dashboard');
    tourActiveRef.current = true;
    setTimeout(() => {
      controls.start(0);
    }, 300);
  }, [controls, navigate, queryClient]);

  return (
    <TourContext.Provider value={{ restartTour }}>
      {children}
      {Tour}
    </TourContext.Provider>
  );
}
