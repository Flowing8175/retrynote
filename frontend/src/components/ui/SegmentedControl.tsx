export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentedControlProps<T>) {
  const isSm = size === 'sm';

  return (
    <div
      className={`inline-flex ${
        isSm
          ? 'rounded-lg bg-surface-deep p-0.5 gap-px border border-white/[0.05]'
          : 'rounded-2xl bg-surface-deep p-1 gap-1'
      } ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              isSm
                ? `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-surface text-white shadow-sm'
                      : 'text-content-muted hover:text-content-secondary'
                  }`
                : `rounded-xl px-5 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-surface text-content-primary shadow-sm'
                      : 'text-content-secondary hover:text-content-primary'
                  }`
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
