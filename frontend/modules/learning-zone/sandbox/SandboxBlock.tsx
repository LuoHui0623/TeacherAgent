import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheckCircle,
  faCircle,
  faCircleNotch,
  faClipboard,
  faCode,
  faFlask,
  faPlay,
  faRotateLeft,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';

import type { CodeBlock } from '../../../services/textbook/types';
import { domId } from '../../../shared/ids';
import { SegmentedControl, toast } from '../../../shared/ui';
import { highlightCode } from './languageRules';

type CodeFenceData = CodeBlock;
type CodeMode = 'fence' | 'sandbox';
type RunState = 'idle' | 'running' | 'success' | 'error';

interface WorkerMessage {
  type: 'result' | 'error';
  logs?: string[];
  message?: string;
}

const RUN_TIMEOUT_MS = 1500;
const PYTHON_RUN_TIMEOUT_MS = 60000;

function buildWorkerSource(code: string, runtimeId: string): string {
  if (runtimeId === 'python') {
    return `
let pyodidePromise;
let pyodide;

async function getPyodide() {
  if (!pyodidePromise) {
    const pyodideUrl = new URL('/pyodide/pyodide.mjs', self.location.origin).href;
    const indexURL = new URL('/pyodide/', self.location.origin).href;
    pyodidePromise = import(pyodideUrl).then(({ loadPyodide }) => loadPyodide({ indexURL }));
  }
  try {
    pyodide = await pyodidePromise;
    return pyodide;
  } catch (error) {
    pyodidePromise = undefined;
    throw error;
  }
}

self.onmessage = async (event) => {
  const logs = [];
  try {
    const runtime = await getPyodide();
    runtime.setStdout({ batched: (message) => logs.push(message) });
    runtime.setStderr({ batched: (message) => logs.push(message) });
    await runtime.runPythonAsync(event.data.code, { filename: 'main.py' });
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

function CodeEditorSurface({
  code,
  language,
  readOnly,
  onChange,
  onRun,
}: {
  code: string;
  language: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const highlighted = useMemo(() => highlightCode(code, language), [code, language]);
  const editable = !readOnly || focused;

  return (
    <div className={`code-fence__editor ${editable ? 'is-editable' : 'is-preview'}`}>
      <pre ref={highlightRef} className="code-fence__highlight type-role-code" aria-hidden="true">
        <code className="type-role-code">{highlighted}</code>
      </pre>
      <textarea
        ref={textareaRef}
        className="code-fence__input type-role-code"
        value={code}
        readOnly={!editable}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (readOnly) setFocused(false);
        }}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            onRun();
          }
        }}
        spellCheck={false}
        aria-label="代码编辑器"
      />
    </div>
  );
}

export function CodeFenceBlock({
  block,
  instanceId,
}: {
  block: CodeFenceData;
  instanceId: number;
}) {
  const starterCode = block.code;
  const caption = block.caption;
  const runnable = Boolean(block.runtime);

  const [mode, setMode] = useState<CodeMode>('fence');
  const [code, setCode] = useState(starterCode);
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
    if (runState === 'running') return;
    const runtimeId = block.runtime?.id ?? 'javascript';
    const isPython = runtimeId === 'python';
    if (!isPython) stopWorker();
    setOutput([]);
    setRunState('running');

    let worker = workerRef.current;
    if (!worker) {
      const objectUrl = URL.createObjectURL(
        new Blob([buildWorkerSource(code, runtimeId)], { type: 'text/javascript' }),
      );
      urlRef.current = objectUrl;
      worker = new Worker(objectUrl, { type: isPython ? 'module' : 'classic' });
      workerRef.current = worker;
    }

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      setOutput(message.logs ?? []);
      setRunState(message.type === 'result' ? 'success' : 'error');
      if (message.type === 'error' && message.message) {
        setOutput((current) => [...current, message.message ?? '运行失败']);
      }
      if (!isPython) stopWorker();
    };

    worker.onerror = (event) => {
      setOutput((current) => [...current, event.message || '沙盒运行失败']);
      setRunState('error');
      stopWorker();
    };

    const timeoutMs = isPython ? PYTHON_RUN_TIMEOUT_MS : RUN_TIMEOUT_MS;
    timeoutRef.current = window.setTimeout(() => {
      setOutput((current) => [...current, `运行超过 ${timeoutMs}ms，已停止。`]);
      setRunState('error');
      stopWorker();
    }, timeoutMs);

    worker.postMessage(isPython ? { code } : 'run');
  }

  function changeMode(nextMode: CodeMode) {
    if (nextMode === 'sandbox') {
      setMode('sandbox');
      return;
    }

    stopWorker();
    setMode('fence');
  }

  function reset() {
    stopWorker();
    setCode(starterCode);
    setOutput([]);
    setRunState('idle');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      toast('代码已复制', { variant: 'success' });
    } catch {
      toast('复制失败', { variant: 'error' });
    }
  }

  const statusLabel =
    runState === 'running'
      ? '运行中'
      : runState === 'success'
        ? '完成'
        : runState === 'error'
          ? '错误'
          : '等待运行';

  return (
    <section
      className={`code-fence ${mode === 'sandbox' ? 'is-sandbox' : ''}`}
      data-annotation-disabled="true"
    >
      <header className="code-fence__toolbar">
        <div className="code-fence__identity">
          <FontAwesomeIcon icon={faCode} style={{ fontSize: 15 }} />
          <span className="code-fence__language">{block.language}</span>
        </div>

        {runnable && (
          <SegmentedControl
            value={mode}
            onChange={changeMode}
            ariaLabel="代码工具栏"
            className="code-fence__mode-switch"
            options={[
              {
                value: 'fence',
                id: domId('learning', 'code', 'fence', instanceId),
                label: <FontAwesomeIcon icon={faCode} style={{ fontSize: 14 }} />,
                ariaLabel: 'Fence 模式',
                title: 'Fence 模式',
              },
              {
                value: 'sandbox',
                id: domId('learning', 'code', 'sandbox', instanceId),
                label: <FontAwesomeIcon icon={faFlask} style={{ fontSize: 14 }} />,
                ariaLabel: '沙盒模式',
                title: '沙盒模式',
              },
            ]}
          />
        )}
      </header>

      <div className="code-fence__content">
        <div className="code-fence__workbench">
          <CodeEditorSurface
            code={code}
            language={block.language}
            readOnly={mode === 'fence'}
            onChange={setCode}
            onRun={run}
          />
        </div>

        {mode === 'sandbox' && (
          <div className="code-fence__output">
            <div className="code-fence__pane-bar">
              <span>Output</span>
              <div className="code-fence__output-actions">
                <span
                  className={`code-fence__status is-${runState}`}
                  title={statusLabel}
                  aria-label={statusLabel}
                >
                  {runState === 'idle' && <FontAwesomeIcon icon={faCircle} style={{ fontSize: 13 }} />}
                  {runState === 'running' && (
                    <FontAwesomeIcon className="spin-soft" icon={faCircleNotch} style={{ fontSize: 13 }} />
                  )}
                  {runState === 'success' && (
                    <FontAwesomeIcon icon={faCheckCircle} style={{ fontSize: 13 }} />
                  )}
                  {runState === 'error' && (
                    <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 13 }} />
                  )}
                </span>
                <button
                  type="button"
                  id={domId('learning', 'code', 'reset', instanceId)}
                  className="code-fence__reset"
                  onClick={reset}
                  disabled={code === starterCode && output.length === 0 && runState === 'idle'}
                  title="重置代码和运行结果"
                  aria-label="重置代码和运行结果"
                >
                  <FontAwesomeIcon icon={faRotateLeft} />
                </button>
              </div>
            </div>
            <pre>
              {output.length > 0
                ? output.join('\n')
                : runState === 'idle'
                  ? '点击运行，查看输出。'
                  : '暂无输出。'}
            </pre>
          </div>
        )}

        <button
          type="button"
          id={domId(
            'learning',
            'code',
            mode === 'fence' ? 'copy' : 'run',
            instanceId,
          )}
          className="code-fence__content-action"
          onClick={mode === 'fence' ? copyCode : run}
          disabled={mode === 'sandbox' && runState === 'running'}
          title={mode === 'fence' ? '复制代码' : '执行代码'}
          aria-label={mode === 'fence' ? '复制代码' : '执行代码'}
        >
          {mode === 'fence' ? (
            <FontAwesomeIcon icon={faClipboard} style={{ fontSize: 14 }} />
          ) : (
            <FontAwesomeIcon icon={faPlay} style={{ fontSize: 14 }} />
          )}
        </button>
      </div>

      {caption && <footer className="code-fence__caption">{caption}</footer>}
    </section>
  );
}
