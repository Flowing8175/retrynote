import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  message: string;
  actions?: ReactNode;
}

export default function EmptyState({ icon, eyebrow, title, message, actions }: EmptyStateProps) {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center rounded-3xl border border-white/[0.05] bg-surface/30">
      <div className="max-w-sm mx-auto px-6 space-y-6">
        {icon && (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
            {icon}
          </div>
        )}
        
        <div className="space-y-2">
          {eyebrow && (
            <div className="text-xs font-medium uppercase tracking-widest text-brand-300">{eyebrow}</div>
          )}
           <h3 className="text-xl font-semibold text-content-primary">{title}</h3>
          <p className="text-sm text-content-secondary leading-relaxed">
            {message}
          </p>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
