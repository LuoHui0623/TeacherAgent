import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { domId } from '../ids';
import { Button } from './Button';

interface DrawerProps {
  id: string;
  open: boolean;
  title: string;
  side?: 'left' | 'right';
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({
  id,
  open,
  title,
  side = 'right',
  onClose,
  children,
  footer,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ui-overlay ui-overlay--drawer" role="presentation" onMouseDown={onClose}>
      <aside
        className={`ui-drawer ui-drawer--${side}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ui-overlay__header">
          <h2>{title}</h2>
          <Button
            type="button"
            id={domId(id, 'close')}
            variant="primary"
            className="ui-close-button"
            onClick={onClose}
            aria-label="关闭抽屉"
            title="关闭"
          >
            <XIcon size={17} weight="bold" />
          </Button>
        </header>
        <div className="ui-drawer__body">{children}</div>
        {footer ? <footer className="ui-overlay__footer">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}
