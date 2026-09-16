import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  CaretDoubleRightIcon,
  PaperPlaneTiltIcon,
  SparkleIcon,
  UserCircleIcon,
} from '@phosphor-icons/react';

interface TutorContext {
  sectionTitle?: string;
  blockId?: string;
  selectedText?: string;
}

interface TutorDrawerProps {
  open: boolean;
  width: number;
  context: TutorContext | null;
  draft: string;
  onOpenChange: (open: boolean) => void;
  onWidthChange: (width: number) => void;
  onDraftChange: (value: string) => void;
}

interface ChatMessage {
  id: number;
  role: 'tutor' | 'user';
  content: string;
}

let messageId = 1;

export function TutorDrawer({
  open,
  width,
  context,
  draft,
  onOpenChange,
  onWidthChange,
  onDraftChange,
}: TutorDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: messageId++,
      role: 'tutor',
      content: '我会结合当前教材章节和选中内容，帮你解释概念、检查理解或分析代码。',
    },
  ]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const handleMove = (moveEvent: PointerEvent) => {
      onWidthChange(Math.min(560, Math.max(320, startWidth + startX - moveEvent.clientX)));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  function send() {
    const content = draft.trim();
    if (!content) return;
    setMessages((current) => [
      ...current,
      { id: messageId++, role: 'user', content },
      {
        id: messageId++,
        role: 'tutor',
        content: 'Tutor 流式接口尚未接入，当前先保留前端交互和上下文结构。',
      },
    ]);
    onDraftChange('');
  }

  return (
    <aside className={`tutor-drawer ${open ? 'is-open' : 'is-collapsed'}`}>
      <button
        type="button"
        id="learning-tutor-avatar"
        className={`tutor-drawer__avatar ${open ? '' : 'button button--icon-ghost'}`}
        aria-expanded={open}
        aria-label={open ? '收回 Tutor' : '展开 Tutor'}
        title={open ? '收回 Tutor' : '展开 Tutor'}
        onClick={() => onOpenChange(!open)}
      >
        <SparkleIcon size={17} weight="fill" />
      </button>

      <div
        className="tutor-drawer__panel"
        id="learning-tutor-panel"
        aria-hidden={!open}
        inert={!open}
      >
        <div
          className="tutor-drawer__resize"
          role="separator"
          aria-label="调整 Tutor 抽屉宽度"
          onPointerDown={startResize}
        />

        <header className="tutor-drawer__header">
          <div>
            <span className="tutor-drawer__avatar-slot" aria-hidden="true" />
            <div>
              <strong>Tutor</strong>
              <small>Teacher Agent</small>
            </div>
          </div>
          <button
            type="button"
            id="learning-tutor-collapse"
            className="button button--icon-ghost"
            aria-label="收回 Tutor"
            title="收回 Tutor"
            onClick={() => onOpenChange(false)}
          >
            <CaretDoubleRightIcon size={15} weight="bold" />
          </button>
        </header>

      <div className="tutor-drawer__messages">
        {messages.map((message) => (
          <div key={message.id} className={`tutor-message is-${message.role}`}>
            <span>
              {message.role === 'tutor' ? (
                <SparkleIcon size={14} weight="fill" />
              ) : (
                <UserCircleIcon size={14} weight="fill" />
              )}
            </span>
            <p>{message.content}</p>
          </div>
        ))}
      </div>

      <div className="tutor-drawer__composer">
        {context && (
          <div className="tutor-context-chips">
            {context.sectionTitle && <span>{context.sectionTitle}</span>}
            {context.blockId && <span>{context.blockId}</span>}
            {context.selectedText && (
              <span title={context.selectedText}>“{context.selectedText}”</span>
            )}
          </div>
        )}
        <textarea
          id="learning-tutor-input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              send();
            }
          }}
          placeholder="向 Tutor 提问…"
          aria-label="Tutor 输入框"
        />
        <div className="tutor-drawer__composer-actions">
          <span>Ctrl / Cmd + Enter</span>
          <button
            type="button"
            id="learning-tutor-send"
            className="button button--primary button--sm"
            disabled={!draft.trim()}
            onClick={send}
          >
            <PaperPlaneTiltIcon size={14} weight="fill" />
            发送
          </button>
        </div>
      </div>
      </div>
    </aside>
  );
}
