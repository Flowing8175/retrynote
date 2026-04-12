import { Check } from 'lucide-react';

export interface OptionItem<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}

export interface OptionGroupProps<T extends string> {
  options: OptionItem<T>[];
  value: T | T[];
  onChange: (value: T | T[]) => void;
  multiple?: boolean;
  layout?: 'row' | 'grid-2' | 'grid-3' | 'wrap';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const LAYOUT_CLASS: Record<string, string> = {
  row: 'flex gap-2',
  'grid-2': 'grid grid-cols-2 gap-2',
  'grid-3': 'grid grid-cols-3 gap-2',
  wrap: 'flex flex-wrap gap-2',
};

export default function OptionGroup<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
  layout = 'row',
  size = 'md',
  className = '',
}: OptionGroupProps<T>) {
  const selected = Array.isArray(value) ? value : [value];

  const handleClick = (optValue: T) => {
    if (multiple) {
      const current = selected as T[];
      const next = current.includes(optValue)
        ? current.filter((v) => v !== optValue)
        : [...current, optValue];
      onChange(next as T & T[]);
    } else {
      onChange(optValue as T & T[]);
    }
  };

  return (
    <div className={`${LAYOUT_CLASS[layout] ?? LAYOUT_CLASS.row} ${className}`}>
      {options.map((opt) => {
        const isActive = selected.includes(opt.value);
        const isDisabled = opt.disabled ?? false;

        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleClick(opt.value)}
            disabled={isDisabled}
            className={buttonClass(size, isActive, isDisabled, opt.description != null || opt.icon != null || opt.badge != null)}
          >
            {multiple && (
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  isActive
                    ? 'border-brand-500/50 bg-brand-500/20 text-brand-300'
                    : 'border-white/[0.12] bg-transparent text-transparent'
                }`}
              >
                <Check size={10} strokeWidth={3} />
              </span>
            )}

            {opt.icon && (
              <span className={isActive ? 'text-brand-300' : 'text-content-muted'}>
                {opt.icon}
              </span>
            )}

            {opt.description ? (
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span className={`${size === 'lg' ? 'text-sm font-semibold' : 'text-xs font-medium'}`}>
                  {opt.label}
                </span>
                <span className={`text-[10px] font-normal leading-tight ${isActive ? 'text-brand-400' : 'text-content-muted'}`}>
                  {opt.description}
                </span>
              </span>
            ) : (
              <span>{opt.label}</span>
            )}

            {opt.badge && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-brand-500/20 text-brand-300'
                    : 'bg-white/[0.06] text-content-muted'
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function buttonClass(
  size: 'sm' | 'md' | 'lg',
  isActive: boolean,
  isDisabled: boolean,
  hasContent: boolean,
): string {
  const base = 'transition-colors border';

  let sizeClass: string;
  if (size === 'sm') {
    sizeClass = 'rounded-xl px-3 py-1.5 text-xs font-medium';
  } else if (size === 'lg') {
    sizeClass = `rounded-2xl p-5 text-sm font-medium ${hasContent ? 'flex items-start gap-3 text-left' : 'flex items-center justify-center gap-2'}`;
  } else {
    sizeClass = hasContent
      ? 'rounded-xl px-4 py-2.5 text-sm font-medium flex items-start gap-2 text-left'
      : 'rounded-xl h-10 px-4 text-sm font-semibold flex items-center justify-center gap-2';
  }

  const stateClass = isActive
    ? 'bg-brand-500/10 text-brand-300 border-brand-500/30'
    : 'bg-transparent text-content-secondary border-white/[0.05] hover:bg-white/[0.05]';

  const disabledClass = isDisabled ? 'opacity-30 cursor-not-allowed' : '';

  return `${base} ${sizeClass} ${stateClass} ${disabledClass}`;
}
