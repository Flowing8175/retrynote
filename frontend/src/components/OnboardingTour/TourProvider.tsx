import React from 'react';

export function TourProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useTour() {
  return {
    restartTour: () => {},
  };
}
