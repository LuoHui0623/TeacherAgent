import { useCallback, useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBook,
  faChevronRight,
  faList,
  faArrowUp,
  faChalkboardUser,
  faUserCircle,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';

import {
  chatRoleLabels,
  chatTypeLabels,
  fetchChatMessages,
  postChatMessage,
  sendTutorTurn,
  type ChatMessage,
} from '../../services/chat';
import { createWorkflowRun } from '../../services/content-pipeline/runs';
import { CONTENT_PIPELINE_WORKFLOW_ID } from '../../services/content-pipeline/workflowSource';
import { useWorkbenchStore } from '../../services/workbenchStore';
import { toast } from '../../shared/ui';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [historyError, setHistoryError] = useState('');
  const [sending, setSending] = useState(false);
  const [startedRuns, setStartedRuns] = useState<Record<string, string>>({});

  const reloadHistory = useCallback(async (): Promise<void> => {
    try {
      setMessages(await fetchChatMessages());
      setHistoryState('ready');
      setHistoryError('');
    } catch (error) {
      setHistoryState('error');
      setHistoryError(error instanceof Error ? error.message : '后端接口不可用。');
    }
  }, []);

  useEffect(() => {
    void reloadHistory();
  }, [reloadHistory]);

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

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await sendTutorTurn(content);
      onDraftChange('');
    } catch (error) {
      toast('Tutor 没答上来', {
        description: error instanceof Error ? error.message : '后端接口不可用。',
        variant: 'error',
      });
    } finally {
      setSending(false);
      await reloadHistory();
    }
  }

  /** 发起一次教材生产：先写下提议这条消息，再由它创建运行。 */
  async function propose() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const proposal = await postChatMessage({
        role: 'user',
        type: 'proposal',
        content,
      });
      const started = await createWorkflowRun(CONTENT_PIPELINE_WORKFLOW_ID, proposal.messageId);
      setStartedRuns((current) => ({ ...current, [proposal.messageId]: started.runId }));
      onDraftChange('');
      toast('已发起教材生产', {
        description: `运行 ${started.runId} 已创建，去教材生产线看进度。`,
      });
      useWorkbenchStore.getState().setActive('content-pipeline');
    } catch (error) {
      toast('发起失败', {
        description: error instanceof Error ? error.message : '后端接口不可用。',
        variant: 'error',
      });
    } finally {
      setSending(false);
      await reloadHistory();
    }
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
              <FontAwesomeIcon icon={faChalkboardUser} />
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
                <div
                  key={message.messageId}
                  className={`tutor-message is-${message.role} ${message.type === 'proposal' ? 'is-proposal' : ''}`}
                >
                  <span className="tutor-message__avatar">
                    {message.role === 'assistant' ? (
                      <FontAwesomeIcon icon={faChalkboardUser} style={{ fontSize: 14 }} />
                    ) : (
                      <FontAwesomeIcon icon={faUserCircle} style={{ fontSize: 14 }} />
                    )}
                  </span>
                  <div className="tutor-message__body">
                    <span className="tutor-message__meta">
                      {chatRoleLabels[message.role]}
                      {message.type === 'proposal' && ` · ${chatTypeLabels[message.type]}`}
                    </span>
                    <p>{message.content}</p>
                    {startedRuns[message.messageId] && (
                      <small className="tutor-message__run">
                        已发起运行 {startedRuns[message.messageId]}
                      </small>
                    )}
                  </div>
                </div>
              ))}
              {historyState === 'loading' && messages.length === 0 && (
                <p className="tutor-drawer__empty">正在读取对话…</p>
              )}
              {historyState === 'error' && (
                <p className="tutor-drawer__empty">{historyError}</p>
              )}
              {historyState === 'ready' && messages.length === 0 && (
                <p className="tutor-drawer__empty">
                  还没有对话。问一个问题，或者直接把你的需求发出去 —— 提议会创建一次教材生产。
                </p>
              )}
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
                    void send();
                  }
                }}
                placeholder="向 Tutor 提问…"
                aria-label="Tutor 输入框"
              />
              <div className="tutor-drawer__composer-actions">
                <button
                  type="button"
                  id="learning-tutor-propose"
                  className="button button--secondary tutor-drawer__propose"
                  disabled={!draft.trim() || sending}
                  aria-label="发起教材生产"
                  title="把这句需求作为教学提议，发起一次教材生产"
                  onClick={() => void propose()}
                >
                  <FontAwesomeIcon icon={faWandMagicSparkles} style={{ fontSize: 15 }} />
                </button>
                <button
                  type="button"
                  id="learning-tutor-send"
                  className="button button--primary tutor-drawer__send"
                  disabled={!draft.trim() || sending}
                  aria-label="发送问题"
                  title="发送问题"
                  onClick={() => void send()}
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
