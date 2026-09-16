import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  CodeIcon,
  CopyIcon,
  FlaskIcon,
  PlayIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import type { CodeBlock } from '../../services/textbook/types';
import { domId } from '../../shared/ids';
import { SegmentedControl, toast } from '../../shared/ui';

type CodeFenceData = CodeBlock;
type CodeMode = 'fence' | 'sandbox';
type RunState = 'idle' | 'running' | 'success' | 'error';

interface WorkerMessage {
  type: 'result' | 'error';
  logs?: string[];
  message?: string;
}

const RUN_TIMEOUT_MS = 1500;
const JAVASCRIPT_KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'of',
  'return',
  'switch',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'while',
  'yield',
]);
const CODE_TOKEN_PATTERN =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b/g;

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

function highlightCode(code: string, language: string): ReactNode[] {
  if (!['javascript', 'js', 'typescript', 'ts'].includes(language.toLowerCase())) {
    return [code];
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of code.matchAll(CODE_TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const token = match[0];
    if (index > lastIndex) nodes.push(code.slice(lastIndex, index));

    let className = '';
    if (token.startsWith('//') || token.startsWith('/*')) {
      className = 'code-token--comment';
    } else if (
      token.startsWith('`') ||
      token.startsWith("'") ||
      token.startsWith('"')
    ) {
      className = 'code-token--string';
    } else if (/^\d/.test(token)) {
      className = 'code-token--number';
    } else if (JAVASCRIPT_KEYWORDS.has(token)) {
      className = 'code-token--keyword';
    } else if (/^\s*\(/.test(code.slice(index + token.length))) {
      className = 'code-token--function';
    } else if (/^[A-Z]/.test(token)) {
      className = 'code-token--type';
    }

    nodes.push(
      className ? (
        <span key={`${index}-${token}`} className={className}>
          {token}
        </span>
      ) : (
        token
      ),
    );
    lastIndex = index + token.length;
  }
  if (lastIndex < code.length) nodes.push(code.slice(lastIndex));
  return nodes;
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
      <pre ref={highlightRef} className="code-fence__highlight" aria-hidden="true">
        <code>{highlighted}</code>
      </pre>
      <textarea
        ref={textareaRef}
        className="code-fence__input"
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

  function changeMode(nextMode: CodeMode) {
    if (nextMode === 'sandbox') {
      setMode('sandbox');
      return;
    }

    stopWorker();
    setMode('fence');
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
          <CodeIcon size={15} weight="bold" />
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
                label: <CodeIcon size={14} weight="bold" />,
                ariaLabel: 'Fence 模式',
                title: 'Fence 模式',
              },
              {
                value: 'sandbox',
                id: domId('learning', 'code', 'sandbox', instanceId),
                label: <FlaskIcon size={14} weight="bold" />,
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
              <span
                className={`code-fence__status is-${runState}`}
                title={statusLabel}
                aria-label={statusLabel}
              >
                {runState === 'idle' && <CircleIcon size={13} weight="bold" />}
                {runState === 'running' && (
                  <CircleNotchIcon className="spin-soft" size={13} weight="bold" />
                )}
                {runState === 'success' && (
                  <CheckCircleIcon size={13} weight="fill" />
                )}
                {runState === 'error' && (
                  <WarningCircleIcon size={13} weight="fill" />
                )}
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
            <CopyIcon size={14} weight="bold" />
          ) : (
            <PlayIcon size={14} weight="fill" />
          )}
        </button>
      </div>

      {caption && <footer className="code-fence__caption">{caption}</footer>}
    </section>
  );
}
