import { useEffect, useId, useRef, useState } from 'react';
import { CaretRightIcon } from '@phosphor-icons/react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

import { domId } from '../ids';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}

function FieldShell({
  label,
  hint,
  error,
  htmlFor,
  className = '',
  children,
}: FieldShellProps) {
  return (
    <label
      className={`ui-field ${error ? 'has-error' : ''} ${className}`.trim()}
      htmlFor={htmlFor}
    >
      <span className="ui-field__label">{label}</span>
      {children}
      {error ? <span className="ui-field__error">{error}</span> : null}
      {!error && hint ? <span className="ui-field__hint">{hint}</span> : null}
    </label>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({
  label,
  hint,
  error,
  id,
  className = '',
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={fieldId}
      className={className}
    >
      <input
        id={fieldId}
        className="ui-input"
        aria-invalid={Boolean(error)}
        {...props}
      />
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function SelectField({
  label,
  hint,
  error,
  options,
  id,
  className = '',
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={fieldId}
      className={className}
    >
      <select
        id={fieldId}
        className="ui-input ui-select"
        aria-invalid={Boolean(error)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface SelectButtonProps {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function SelectButton({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = '请选择',
  hint,
  error,
  disabled = false,
  className,
}: SelectButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const menuId = domId(id, 'menu');

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={id}
      className={className}
    >
      <div ref={rootRef} className="select-button">
        <button
          id={id}
          type="button"
          className={`button button--select ${open ? 'is-open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="button--select__label">{selected?.label ?? placeholder}</span>
          <span className="button--select__arrow-wrap">
            <CaretRightIcon size={14} weight="bold" className="button--select__arrow" />
          </span>
        </button>

        {open ? (
          <div id={menuId} className="select-button__menu" role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                id={domId(id, 'option', option.value)}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`select-button__option ${
                  option.value === value ? 'is-selected' : ''
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}
