import React from 'react';

interface AuthPageShellProps {
  children: React.ReactNode;
  title?: string;
}

export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <div className="min-h-screen grid place-items-center p-4 sm:p-8">
      <div className="w-full max-w-[74rem] overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-surface/95 to-surface-deep/98 shadow-2xl shadow-black/50 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(31rem,1.1fr)]">
        {children}
      </div>
    </div>
  );
}
