import type { ReactNode } from 'react';

interface ErrorBoundaryShellProps {
  title: string;
  description: string;
  actions: ReactNode;
  children?: ReactNode;
}

export function ErrorBoundaryShell({
  title,
  description,
  actions,
  children,
}: ErrorBoundaryShellProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md w-full">
        <h2 className="text-xl font-semibold text-content-primary mb-2">{title}</h2>
        <p className="text-content-secondary mb-6 text-sm leading-relaxed">{description}</p>
        {children}
        <div className="flex gap-3 justify-center">{actions}</div>
      </div>
    </div>
  );
}
