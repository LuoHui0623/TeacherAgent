import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { domId } from '../ids';
import { Button } from './Button';

interface ModalProps {
  id: string;
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({
  id,
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = domId(id, 'title');

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ui-overlay" role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ui-overlay__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <Button
            type="button"
            id={domId(id, 'close')}
            variant="primary"
            className="ui-close-button"
            onClick={onClose}
            aria-label="关闭弹窗"
            title="关闭"
          >
            <XIcon size={17} weight="bold" />
          </Button>
        </header>
        <div className="ui-modal__body">{children}</div>
        {footer ? <footer className="ui-overlay__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
