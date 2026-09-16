import type { ReactNode } from 'react';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
  id: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  function selectFromKeyboard(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();

    const direction = event.key === 'ArrowRight' ? 1 : -1;
    let nextIndex = currentIndex;
    for (let offset = 0; offset < options.length; offset += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length;
      if (!options[nextIndex].disabled) break;
    }

    const next = options[nextIndex];
    onChange(next.value);
    document.getElementById(next.id)?.focus();
  }

  return (
    <div
      className={`ui-segmented-control ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            id={option.id}
            type="button"
            role="tab"
            className={`ui-segmented-control__item ${active ? 'is-active' : ''}`}
            aria-selected={active}
            aria-label={option.ariaLabel}
            title={option.title}
            tabIndex={active ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => selectFromKeyboard(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
