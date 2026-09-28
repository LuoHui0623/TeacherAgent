import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBook,
  faChevronRight,
  faList,
  faArrowUp,
  faStar,
  faUserCircle,
} from '@fortawesome/free-solid-svg-icons';

interface TutorContext {
  sectionTitle?: string;
  blockId?: string;
  selectedText?: string;
}

interface TutorDrawerProps {
  open: boolean;
  activePanel: 'tutor' | 'contents' | 'article';
  width: number;
  context: TutorContext | null;
  draft: string;
  children?: ReactNode;
  onPanelChange: (panel: 'tutor' | 'contents' | 'article') => void;
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
  activePanel,
  width,
  draft,
  children,
  onPanelChange,
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
          <nav className="tutor-drawer__tabs" aria-label="学习区导航">
            <button
              type="button"
              id="learning-tutor-tab"
              className={`tutor-drawer__tab ${activePanel === 'tutor' ? 'is-active' : ''}`}
              aria-label="导师"
              aria-pressed={activePanel === 'tutor'}
              onClick={() => onPanelChange('tutor')}
            >
              <FontAwesomeIcon icon={faStar} />
              <span>导师</span>
            </button>
            <button
              type="button"
              id="learning-contents-tab"
              className={`tutor-drawer__tab ${activePanel === 'contents' ? 'is-active' : ''}`}
              aria-label="目录"
              aria-pressed={activePanel === 'contents'}
              onClick={() => onPanelChange('contents')}
            >
              <FontAwesomeIcon icon={faBook} />
              <span>目录</span>
            </button>
            <button
              type="button"
              id="learning-article-tab"
              className={`tutor-drawer__tab ${activePanel === 'article' ? 'is-active' : ''}`}
              aria-label="大纲"
              aria-pressed={activePanel === 'article'}
              onClick={() => onPanelChange('article')}
            >
              <FontAwesomeIcon icon={faList} />
              <span>大纲</span>
            </button>
          </nav>
          <button
            type="button"
            id="learning-tutor-collapse"
            className="button button--icon-ghost"
            aria-label="收回 Tutor"
            title="收回 Tutor"
            onClick={() => onOpenChange(false)}
          >
            <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 15 }} />
          </button>
        </header>

        {activePanel === 'tutor' ? (
          <div className="tutor-drawer__body">
            <div className="tutor-drawer__messages">
              {messages.map((message) => (
                <div key={message.id} className={`tutor-message is-${message.role}`}>
                  <span>
                    {message.role === 'tutor' ? (
                      <FontAwesomeIcon icon={faStar} style={{ fontSize: 14 }} />
                    ) : (
                      <FontAwesomeIcon icon={faUserCircle} style={{ fontSize: 14 }} />
                    )}
                  </span>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>

            <div className="tutor-drawer__composer">
              <textarea
                id="learning-tutor-input"
                rows={1}
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
                <button
                  type="button"
                  id="learning-tutor-send"
                  className="button button--primary tutor-drawer__send"
                  disabled={!draft.trim()}
                  aria-label="发送问题"
                  title="发送问题"
                  onClick={send}
                >
                  <FontAwesomeIcon icon={faArrowUp} style={{ fontSize: 16 }} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="tutor-drawer__body">{children}</div>
        )}
      </div>
    </aside>
  );
}
