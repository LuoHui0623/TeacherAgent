import { useState } from 'react';
import {
  CaretDownIcon,
  CheckCircleIcon,
  CircleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import {
  promptRoleLabel,
  sortPromptMapCalls,
  type PromptMapCall,
  type PromptMapCallStatus,
} from '../../services/content-pipeline/promptMap';

function statusLabel(status: PromptMapCallStatus) {
  if (status === 'running') return '执行中';
  if (status === 'error') return '失败';
  return '完成';
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

function StatusIcon({ status }: { status: PromptMapCallStatus }) {
  if (status === 'error') return <WarningCircleIcon size={14} weight="fill" />;
  if (status === 'running') return <CircleIcon size={10} weight="fill" />;
  return <CheckCircleIcon size={14} weight="fill" />;
}

export function PromptMapPanel({ calls }: { calls: PromptMapCall[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const orderedCalls = sortPromptMapCalls(calls);
  const runningCount = orderedCalls.filter((call) => call.status === 'running').length;

  function toggleCall(callId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(callId)) next.delete(callId);
      else next.add(callId);
      return next;
    });
  }

  return (
    <section className="card prompt-map" aria-labelledby="prompt-map-title">
      <header className="prompt-map__header">
        <div>
          <span className="pipeline-section-label">Debug Trace</span>
          <strong id="prompt-map-title">提示词地图</strong>
          <p>按调用时间查看当前提示词、实际输入和模型产出。</p>
        </div>
        <span className={`prompt-map__count ${runningCount > 0 ? 'is-live' : ''}`}>
          {runningCount > 0 ? `${runningCount} 个执行中` : `${orderedCalls.length} 次调用`}
        </span>
      </header>

      <div className="prompt-map__list" role="list" aria-label="LLM 调用时间流">
        {orderedCalls.length === 0 && (
          <p className="pipeline-empty">暂无 LLM 调用记录</p>
        )}
        {orderedCalls.map((call) => {
          const expanded = expandedIds.has(call.id);
          return (
            <div key={call.id} className={`prompt-map__item is-${call.status}`} role="listitem">
              <button
                type="button"
                id={`content-pipeline-prompt-call-${call.id}`}
                className="prompt-map__summary"
                aria-expanded={expanded}
                onClick={() => toggleCall(call.id)}
              >
                <CaretDownIcon
                  className={`prompt-map__caret ${expanded ? 'is-expanded' : ''}`}
                  size={14}
                  weight="bold"
                />
                <span className="prompt-map__summary-main">
                  <strong>{promptRoleLabel(call.role)}</strong>
                  <small>{formatTime(call.createdAt)} · {call.model}</small>
                </span>
                <span className="prompt-map__summary-meta">
                  <span className="prompt-map__status">
                    <StatusIcon status={call.status} />
                    {statusLabel(call.status)}
                  </span>
                  <span>{call.totalTokens.toLocaleString()} tokens</span>
                  <span>{formatDuration(call.durationMs)}</span>
                </span>
              </button>

              {expanded && (
                <div className="prompt-map__details">
                  <div className="prompt-map__detail">
                    <span className="prompt-map__detail-label">模板</span>
                    <pre>{call.template}</pre>
                  </div>
                  <div className="prompt-map__detail">
                    <span className="prompt-map__detail-label">实际提示词</span>
                    <pre>{call.inputText || '（空）'}</pre>
                  </div>
                  <div className="prompt-map__detail">
                    <span className="prompt-map__detail-label">输出结果</span>
                    <pre>{call.outputText || (call.status === 'running' ? '等待模型输出…' : '（空）')}</pre>
                    {call.error && <p className="prompt-map__error">{call.error}</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}


