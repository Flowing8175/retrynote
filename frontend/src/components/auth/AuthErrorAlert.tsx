import React from 'react';

interface AuthErrorAlertProps {
  error: string;
  children?: React.ReactNode;
}

export function AuthErrorAlert({ error, children }: AuthErrorAlertProps) {
  if (!error) return null;
  return (
    <div className="rounded-2xl border border-semantic-error-border bg-semantic-error-bg px-4 py-3 text-sm leading-relaxed text-semantic-error">
      {error}
      {children}
    </div>
  );
}
