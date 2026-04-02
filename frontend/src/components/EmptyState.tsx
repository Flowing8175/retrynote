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
    <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-surface to-surface-deep/90">
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-12 text-center sm:px-10 sm:py-14">
        {icon && (
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-surface-raised text-content-secondary">
            {icon}
          </div>
        )}
        {eyebrow && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-300">{eyebrow}</p>
        )}
        <h3 className="text-xl font-semibold tracking-tight text-content-primary sm:text-2xl">{title}</h3>
        <p className="mt-3 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">{message}</p>
        {actions && <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      </div>
    </section>
  );
}
