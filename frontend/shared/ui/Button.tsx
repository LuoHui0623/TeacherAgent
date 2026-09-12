import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'text-ghost'
  | 'icon-ghost'
  | 'ghost'
  | 'accent'
  | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  id: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  loading = false,
  children,
  className = '',
  disabled,
  id,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [
    'button',
    `button--${variant}`,
    size === 'sm' ? 'button--sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button id={id} className={classes} disabled={disabled || loading} type={type} {...props}>
      {loading ? <span className="button__spinner" aria-hidden="true" /> : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
