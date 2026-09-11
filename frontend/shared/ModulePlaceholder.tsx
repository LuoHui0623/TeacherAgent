import type { ReactNode } from 'react';

interface ModulePlaceholderProps {
  title: string;
  description: string;
  children?: ReactNode;
}

/* 模块骨架占位：统一 minimalist-ui 卡片风格 */
export function ModulePlaceholder({ title, description, children }: ModulePlaceholderProps) {
  return (
    <section className="card reveal is-visible p-8">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm" style={{ color: 'var(--ink-secondary)' }}>
        {description}
      </p>
      {children}
    </section>
  );
}
