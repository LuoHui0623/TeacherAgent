import { useEffect, useRef, useState } from 'react';
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CodeIcon,
  PlayIcon,
  TerminalWindowIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import type { SandboxBlock as SandboxBlockData } from '../../services/textbook/types';
import { domId } from '../../shared/ids';

type RunState = 'idle' | 'running' | 'success' | 'error';

interface WorkerMessage {
  type: 'result' | 'error';
  logs?: string[];
  message?: string;
}

const RUN_TIMEOUT_MS = 1500;

function buildWorkerSource(code: string): string {
  return `
self.onmessage = () => {
  const logs = [];
  const format = (value) => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };
  const console = {
    log: (...args) => logs.push(args.map(format).join(' ')),
    error: (...args) => logs.push('[error] ' + args.map(format).join(' ')),
  };

  try {
    ${code}
    self.postMessage({ type: 'result', logs });
  } catch (error) {
    self.postMessage({
      type: 'error',
      logs,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};`;
}

export function SandboxBlock({
  scopeId,
  block,
}: {
  scopeId: string;
  block: SandboxBlockData;
}) {
  const [code, setCode] = useState(block.starterCode);
  const [output, setOutput] = useState<string[]>([]);
  const [runState, setRunState] = useState<RunState>('idle');
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);

  function stopWorker() {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  useEffect(() => stopWorker, []);

  function run() {
    stopWorker();
    setOutput([]);
    setRunState('running');

    const objectUrl = URL.createObjectURL(
      new Blob([buildWorkerSource(code)], { type: 'text/javascript' }),
    );
    urlRef.current = objectUrl;
    const worker = new Worker(objectUrl);
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      setOutput(message.logs ?? []);
      setRunState(message.type === 'result' ? 'success' : 'error');
      if (message.type === 'error' && message.message) {
        setOutput((current) => [...current, message.message ?? '运行失败']);
      }
      stopWorker();
    };

    worker.onerror = (event) => {
      setOutput((current) => [...current, event.message || '沙盒运行失败']);
      setRunState('error');
      stopWorker();
    };

    timeoutRef.current = window.setTimeout(() => {
      setOutput((current) => [...current, `运行超过 ${RUN_TIMEOUT_MS}ms，已停止。`]);
      setRunState('error');
      stopWorker();
    }, RUN_TIMEOUT_MS);

    worker.postMessage('run');
  }

  function reset() {
    stopWorker();
    setCode(block.starterCode);
    setOutput([]);
    setRunState('idle');
  }

  return (
    <section className="sandbox-block">
      <header className="sandbox-block__header">
        <div className="sandbox-block__identity">
          <span className="sandbox-block__icon">
            <CodeIcon size={18} weight="bold" />
          </span>
          <div>
            <span>Sandbox</span>
            <h4>{block.title}</h4>
          </div>
        </div>
        <span className="sandbox-block__runtime">{block.language}</span>
      </header>

      <p className="sandbox-block__description">{block.description}</p>

      <div className="sandbox-workbench">
        <div className="sandbox-editor">
          <div className="sandbox-pane__bar">
            <span>{block.entry}</span>
            <button
              type="button"
              id={domId('learning', 'sandbox-reset', `${scopeId}-${block.id}`)}
              className="sandbox-tool"
              onClick={reset}
              title="重置代码"
              aria-label="重置代码"
            >
              <ArrowCounterClockwiseIcon size={14} />
            </button>
          </div>
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                run();
              }
            }}
            spellCheck={false}
            aria-label={`${block.title} 代码`}
          />
        </div>

        <div className="sandbox-output">
          <div className="sandbox-pane__bar">
            <span>Output</span>
            <span className={`sandbox-run-state is-${runState}`}>
              {runState === 'running' && '运行中'}
              {runState === 'success' && (
                <>
                  <CheckCircleIcon size={13} weight="fill" />
                  完成
                </>
              )}
              {runState === 'error' && (
                <>
                  <WarningCircleIcon size={13} weight="fill" />
                  错误
                </>
              )}
              {runState === 'idle' && '等待运行'}
            </span>
          </div>
          <pre>
            {output.length > 0
              ? output.join('\n')
              : runState === 'idle'
                ? '点击运行，查看输出。'
                : '暂无输出。'}
          </pre>
        </div>
      </div>

      <footer className="sandbox-block__footer">
        <span>
          <TerminalWindowIcon size={14} />
          Ctrl / Cmd + Enter 运行
        </span>
        <button
          type="button"
          id={domId('learning', 'sandbox-run', `${scopeId}-${block.id}`)}
          className="button button--primary"
          onClick={run}
          disabled={runState === 'running'}
        >
          <PlayIcon size={14} weight="fill" />
          {runState === 'running' ? '运行中' : '运行代码'}
        </button>
      </footer>
    </section>
  );
}
