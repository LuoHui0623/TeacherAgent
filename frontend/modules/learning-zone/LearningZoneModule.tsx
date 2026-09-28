import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBook,
  faBold,
  faCircleInfo,
  faEraser,
  faHighlighter,
  faLightbulb,
  faList,
  faRotateLeft,
  faRotateRight,
  faStar,
  faStrikethrough,
  faTriangleExclamation,
  faUnderline,
} from '@fortawesome/free-solid-svg-icons';
import katex from 'katex';
import 'katex/dist/katex.min.css';

import { useWorkbenchStore } from '../../services/workbenchStore';
import {
  firstSectionId,
  getTextbookDocument,
} from '../../mocks/textbooks';
import { getReaderChapters, type ReaderChapter } from '../../services/textbook/chapterModel';
import type {
  CalloutBlock,
  ContentBlock,
  DividerBlock,
  FormulaBlock,
  HeadingBlock,
  HtmlBlock,
  InlineNode,
  ListBlock,
  MermaidBlock,
  ProseBlock,
  QuoteBlock,
  TableBlock,
  TextbookDocument,
  UnsupportedBlock,
} from '../../services/textbook/types';
import {parseMarkdownSection} from '../../services/textbook/markdown/parser';
import { domId } from '../../shared/ids';
import { toast } from '../../shared/ui';
import { CodeFenceBlock } from './SandboxBlock';
import { TutorDrawer } from './TutorDrawer';
import type {
  AnnotationStyle,
  HighlightColor,
  LocatedAnnotation,
  TextAnchor,
  TextAnnotation,
} from './annotations/annotationModel';
import {
  domRangeToTextAnchor,
  locateAnnotations,
} from './annotations/annotationRange';
import {
  annotationStyleForTool,
  applyAnnotation,
  eraseAnnotations,
} from './tools/readingToolModel';
import type { ReadingTool } from './tools/readingToolModel';
import './LearningZoneModule.css';

interface SelectionMenu {
  x: number;
  y: number;
  text: string;
  anchor: TextAnchor;
}

interface AnnotationHistory {
  past: TextAnnotation[][];
  future: TextAnnotation[][];
}

const calloutMeta = {
  info: { icon: faCircleInfo, label: '说明' },
  tip: { icon: faLightbulb, label: '提示' },
  warning: { icon: faTriangleExclamation, label: '注意' },
};

function annotationClassName(annotations: TextAnnotation[]) {
  return annotations
    .map((annotation) => `annotation-${annotation.style.type}`)
    .join(' ');
}

function renderAnnotatedText(
  text: string,
  absoluteStart: number,
  locatedAnnotations: LocatedAnnotation[],
): ReactNode[] {
  if (!text) return [];

  const absoluteEnd = absoluteStart + text.length;
  const intersections = locatedAnnotations.flatMap((item) => {
    const start = Math.max(item.start, absoluteStart);
    const end = Math.min(item.end, absoluteEnd);
    return start < end ? [{ ...item, start, end }] : [];
  });

  if (!intersections.length) return [text];

  const boundaries = Array.from(
    new Set([
      0,
      text.length,
      ...intersections.flatMap(({ start, end }) => [
        start - absoluteStart,
        end - absoluteStart,
      ]),
    ]),
  ).sort((left, right) => left - right);

  const nodes: ReactNode[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;

    const globalStart = absoluteStart + start;
    const globalEnd = absoluteStart + end;
    const activeByType = new Map<
      AnnotationStyle['type'],
      LocatedAnnotation
    >();
    intersections.forEach((item) => {
      if (item.start > globalStart || item.end < globalEnd) return;
      const current = activeByType.get(item.annotation.style.type);
      if (!current || item.order >= current.order) {
        activeByType.set(item.annotation.style.type, item);
      }
    });

    const value = text.slice(start, end);
    const activeAnnotations = Array.from(activeByType.values()).map(
      (item) => item.annotation,
    );
    if (!activeAnnotations.length) {
      nodes.push(value);
      continue;
    }

    const key = `${globalStart}-${globalEnd}-${activeAnnotations
      .map((annotation) => annotation.id)
      .join('-')}`;
    const className = annotationClassName(activeAnnotations);
    const highlight = activeAnnotations.find(
      (
        annotation,
      ): annotation is TextAnnotation & {
        style: Extract<AnnotationStyle, { type: 'highlight' }>;
      } => annotation.style.type === 'highlight',
    );

    nodes.push(
      highlight ? (
        <mark
          key={key}
          className={className}
          data-color={highlight.style.color}
        >
          {value}
        </mark>
      ) : (
        <span key={key} className={className}>
          {value}
        </span>
      ),
    );
  }

  return nodes;
}

function renderKatex(source: string, displayMode: boolean) {
  try {
    return {
      html: katex.renderToString(source, {
        displayMode,
        output: 'htmlAndMathml',
        strict: false,
        throwOnError: true,
        trust: false,
      }),
      error: '',
    };
  } catch (error) {
    return {
      html: '',
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

function InlineMathView({ value }: { value: string }) {
  const result = renderKatex(value, false);
  if (result.error) {
    return <code className="reader-inline-math is-error">${value}$</code>;
  }
  return (
    <span
      className="reader-inline-math"
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}

function renderInlineNodes(
  nodes: InlineNode[],
  locatedAnnotations: LocatedAnnotation[],
  keyPrefix: string,
  cursor: { offset: number },
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text': {
        const start = cursor.offset;
        cursor.offset += node.value.length;
        return (
          <span key={key}>
            {renderAnnotatedText(node.value, start, locatedAnnotations)}
          </span>
        );
      }
      case 'strong':
        return (
          <strong key={key}>
            {renderInlineNodes(node.children, locatedAnnotations, key, cursor)}
          </strong>
        );
      case 'emphasis':
        return (
          <em key={key}>
            {renderInlineNodes(node.children, locatedAnnotations, key, cursor)}
          </em>
        );
      case 'delete':
        return (
          <del key={key}>
            {renderInlineNodes(node.children, locatedAnnotations, key, cursor)}
          </del>
        );
      case 'inlineCode': {
        const start = cursor.offset;
        cursor.offset += node.value.length;
        return (
          <code key={key} className="reader-inline-code">
            {renderAnnotatedText(node.value, start, locatedAnnotations)}
          </code>
        );
      }
      case 'link':
        return (
          <a
            key={key}
            href={node.url}
            title={node.title}
            rel="noreferrer"
            target={node.url.startsWith('#') ? undefined : '_blank'}
          >
            {renderInlineNodes(node.children, locatedAnnotations, key, cursor)}
          </a>
        );
      case 'image':
        return (
          <img
            key={key}
            className="reader-inline-image"
            src={node.url}
            alt={node.alt}
            title={node.title}
            loading="lazy"
          />
        );
      case 'math':
        cursor.offset += node.value.length + 2;
        return <InlineMathView key={key} value={node.value} />;
      case 'break':
        cursor.offset += 1;
        return <br key={key} />;
      case 'html':
        cursor.offset += node.value.length;
        return (
          <code key={key} className="reader-inline-html">
            {node.value}
          </code>
        );
    }
  });
}

function ProseBlockView({
  block,
  annotations,
}: {
  block: ProseBlock;
  annotations: TextAnnotation[];
}) {
  const locatedAnnotations = locateAnnotations(block.plainText, annotations);
  return (
    <div className="reader-prose">
      <p>
        {renderInlineNodes(
          block.children,
          locatedAnnotations,
          block.id,
          { offset: 0 },
        )}
      </p>
    </div>
  );
}

function HeadingBlockView({ block }: { block: HeadingBlock }) {
  const id = domId('learning', 'content-heading', block.id);
  return block.level === 2 ? (
    <h3 id={id} className="reader-heading is-level-2">
      {block.title}
    </h3>
  ) : (
    <h4 id={id} className="reader-heading is-level-3">
      {block.title}
    </h4>
  );
}

function CalloutBlockView({ block }: { block: CalloutBlock }) {
  const meta = calloutMeta[block.tone];
  const Icon = meta.icon;
  return (
    <aside className={`reader-callout is-${block.tone}`}>
      <span className="reader-callout__icon">
        <FontAwesomeIcon icon={Icon} style={{ fontSize: 18 }} />
      </span>
      <div>
        <span>{meta.label}</span>
        <h4>{block.title}</h4>
        <p>
          {renderInlineNodes(block.body, [], block.id, { offset: 0 })}
        </p>
      </div>
    </aside>
  );
}

function ListBlockView({ block }: { block: ListBlock }) {
  const List = block.ordered ? 'ol' : 'ul';
  return (
    <List className="reader-list" start={block.ordered ? block.start : undefined}>
      {block.items.map((item, index) => (
        <li key={`${block.id}-item-${index}`}>
          {renderInlineNodes(item, [], `${block.id}-${index}`, { offset: 0 })}
        </li>
      ))}
    </List>
  );
}

function QuoteBlockView({ block }: { block: QuoteBlock }) {
  return (
    <blockquote className="reader-quote">
      {block.children.map((paragraph, index) => (
        <p key={`${block.id}-quote-${index}`}>
          {renderInlineNodes(
            paragraph,
            [],
            `${block.id}-quote-${index}`,
            { offset: 0 },
          )}
        </p>
      ))}
    </blockquote>
  );
}

function TableBlockView({ block }: { block: TableBlock }) {
  const align = (index: number) => block.align[index] ?? 'left';
  return (
    <div className="reader-table-wrap">
      <table className="reader-table">
        <thead>
          <tr>
            {block.header.map((cell, index) => (
              <th key={`${block.id}-head-${index}`} style={{ textAlign: align(index) }}>
                {renderInlineNodes(cell, [], `${block.id}-head-${index}`, {
                  offset: 0,
                })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={`${block.id}-row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`${block.id}-row-${rowIndex}-${cellIndex}`}
                  style={{ textAlign: align(cellIndex) }}
                >
                  {renderInlineNodes(
                    cell,
                    [],
                    `${block.id}-row-${rowIndex}-${cellIndex}`,
                    { offset: 0 },
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormulaBlockView({ block }: { block: FormulaBlock }) {
  const result = renderKatex(block.expression, block.displayMode);
  return (
    <figure className="reader-formula">
      {result.error ? (
        <code className="reader-formula__source">{block.source}</code>
      ) : (
        <div
          className="reader-formula__math"
          dangerouslySetInnerHTML={{ __html: result.html }}
        />
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
      {result.error && (
        <p className="reader-formula__error" role="alert">
          公式渲染失败：{result.error}
        </p>
      )}
    </figure>
  );
}

function MermaidBlockView({ block }: { block: MermaidBlock }) {
  return (
    <figure className="reader-mermaid" data-annotation-disabled="true">
      <pre>
        <code>{block.code}</code>
      </pre>
      <figcaption>Mermaid 渲染器待接入，当前保留源码。</figcaption>
    </figure>
  );
}

function HtmlBlockView({ block }: { block: HtmlBlock }) {
  return (
    <div
      className="reader-html"
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
}

function UnsupportedBlockView({ block }: { block: UnsupportedBlock }) {
  return (
    <aside className="reader-unsupported" role="status">
      <strong>{block.reason}</strong>
      <pre>
        <code>{block.source}</code>
      </pre>
    </aside>
  );
}

function DividerBlockView({ block }: { block: DividerBlock }) {
  return <hr id={domId('learning', 'divider', block.id)} className="reader-divider" />;
}

function ContentBlockView({
  block,
  blockIndex,
  annotations,
}: {
  block: ContentBlock;
  blockIndex: number;
  annotations: TextAnnotation[];
}) {
  let content: ReactNode;
  switch (block.type) {
    case 'heading':
      content = <HeadingBlockView block={block} />;
      break;
    case 'prose':
      content = <ProseBlockView block={block} annotations={annotations} />;
      break;
    case 'callout':
      content = <CalloutBlockView block={block} />;
      break;
    case 'list':
      content = <ListBlockView block={block} />;
      break;
    case 'quote':
      content = <QuoteBlockView block={block} />;
      break;
    case 'table':
      content = <TableBlockView block={block} />;
      break;
    case 'formula':
      content = <FormulaBlockView block={block} />;
      break;
    case 'code':
      content = <CodeFenceBlock block={block} instanceId={blockIndex} />;
      break;
    case 'mermaid':
      content = <MermaidBlockView block={block} />;
      break;
    case 'html':
      content = <HtmlBlockView block={block} />;
      break;
    case 'unsupported':
      content = <UnsupportedBlockView block={block} />;
      break;
    case 'divider':
      content = <DividerBlockView block={block} />;
      break;
  }
  return (
    <div className="reader-block" data-block-id={block.id}>
      {content}
    </div>
  );
}
function SectionHeading({ section }: { section: ReaderChapter }) {
  return (
    <header className="reader-section-heading">
      <h2 id={domId('learning', 'section-title', section.id)}>{section.title}</h2>
      <p>{section.summary}</p>
    </header>
  );
}

function TextbookReader({
  textbook,
  onOpenBookshelf,
}: {
  textbook: TextbookDocument;
  onOpenBookshelf: () => void;
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const outlineRef = useRef<HTMLElement | null>(null);

  /* 右侧抽屉状态：目录 / 大纲 / Tutor 共用一个抽屉。 */
  const [drawerPanel, setDrawerPanel] = useState<
    'contents' | 'article' | 'tutor' | null
  >(null);
  const [asidePinned, setAsidePinned] = useState(false);

  const asidePanel = drawerPanel === 'contents' || drawerPanel === 'article'
    ? drawerPanel
    : null;
  const chapters = getReaderChapters(textbook);
  const [selectedSectionId, setSelectedSectionId] = useState(firstSectionId(textbook));
  const selectedIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === selectedSectionId),
  );
  const selected = chapters[selectedIndex];
  const readingToolLabels: Record<ReadingTool, string> = {
    read: '阅读',
    highlight: '高亮',
    underline: '下划线',
    strike: '删除线',
    bold: '加粗',
    eraser: '擦除标记',
  };
  const readingToolShortcuts: Record<ReadingTool, string> = {
    read: '1',
    highlight: '2',
    underline: '3',
    strike: '4',
    bold: '5',
    eraser: '6',
  };
  const tutorOpen = drawerPanel === 'tutor';
  const [tutorWidth, setTutorWidth] = useState(380);
  const [tutorDraft, setTutorDraft] = useState('');
  const [tutorContext, setTutorContext] = useState<{
    sectionTitle?: string;
    blockId?: string;
    selectedText?: string;
  } | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null);
  const [highlightPaletteOpen, setHighlightPaletteOpen] = useState(false);
  const [selectionClosing, setSelectionClosing] = useState(false);
  const [highlightPaletteClosing, setHighlightPaletteClosing] = useState(false);
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
  const [readingTool, setReadingTool] = useState<ReadingTool>('read');
  const [keepReadingTool, setKeepReadingTool] = useState(false);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('yellow');
  const [annotationHistory, setAnnotationHistory] = useState<AnnotationHistory>({
    past: [],
    future: [],
  });
  const [readerToolsCenter, setReaderToolsCenter] = useState<number | null>(null);

  useLayoutEffect(() => {
    const updateReaderToolsPosition = () => {
      const article = articleRef.current;
      if (!article) return;
      const rect = article.getBoundingClientRect();
      setReaderToolsCenter(rect.left + rect.width / 2);
    };

    updateReaderToolsPosition();
    const resizeObserver = new ResizeObserver(updateReaderToolsPosition);
    if (articleRef.current) resizeObserver.observe(articleRef.current);
    window.addEventListener('resize', updateReaderToolsPosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateReaderToolsPosition);
    };
  }, [asidePanel, selected?.id, tutorOpen, tutorWidth]);
  const parsedSection = selected
    ? parseMarkdownSection(selected.id, selected.markdown)
    : { blocks: [], warnings: [] };
  const articleOutline = selected
    ? [
        {
          id: domId('learning', 'section-title', selected.id),
          title: selected.title,
          level: 1,
        },
        ...parsedSection.blocks.flatMap((block) =>
          block.type === 'heading'
            ? [
                {
                  id: domId('learning', 'content-heading', block.id),
                  title: block.title,
                  level: block.level,
                },
              ]
            : [],
        ),
      ]
    : [];

  function openAsidePanel(panel: 'contents' | 'article') {
    setDrawerPanel(panel);
    setAsidePinned(true);
  }

  function closeAsidePanel() {
    setDrawerPanel(null);
    setAsidePinned(false);
  }

  function handleUtilityAction(action: 'tutor' | 'contents' | 'article') {
    if (action === 'tutor') {
      setAsidePinned(false);
      setDrawerPanel((current) => (current === 'tutor' ? null : 'tutor'));
      return;
    }

    if (asidePanel === action) {
      closeAsidePanel();
      return;
    }

    openAsidePanel(action);
  }

  function scrollToHeading(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function closeSelectionMenu() {
    setSelectionClosing(true);
    setHighlightPaletteClosing(true);
    window.setTimeout(() => {
      setSelectionMenu(null);
      setHighlightPaletteOpen(false);
      setSelectionClosing(false);
      setHighlightPaletteClosing(false);
    }, 160);
  }

  function closeHighlightPalette() {
    setHighlightPaletteClosing(true);
    window.setTimeout(() => {
      setHighlightPaletteOpen(false);
      setHighlightPaletteClosing(false);
    }, 160);
  }

  useEffect(() => {
    if (!selectionMenu) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (highlightPaletteOpen) {
        closeHighlightPalette();
      } else {
        setSelectionClosing(true);
        window.setTimeout(() => {
          setSelectionMenu(null);
          setSelectionClosing(false);
        }, 160);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [highlightPaletteOpen, selectionMenu]);

  useEffect(() => {
    function undoFromKeyboard() {
      const previous = annotationHistory.past.at(-1);
      if (!previous) return;
      setAnnotationHistory((current) => ({
        past: current.past.slice(0, -1),
        future: [...current.future, annotations],
      }));
      setAnnotations(previous);
      toast('已撤销阅读标记');
    }

    function redoFromKeyboard() {
      const next = annotationHistory.future.at(-1);
      if (!next) return;
      setAnnotationHistory((current) => ({
        past: [...current.past, annotations],
        future: current.future.slice(0, -1),
      }));
      setAnnotations(next);
      toast('已恢复阅读标记');
    }

    function handleReadingShortcut(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.matches('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setReadingTool('read');
        setKeepReadingTool(false);
        closeSelectionMenu();
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) {
            redoFromKeyboard();
          } else {
            undoFromKeyboard();
          }
        } else if (event.key.toLowerCase() === 'y') {
          event.preventDefault();
          redoFromKeyboard();
        }
        return;
      }

      const toolByKey: Partial<Record<string, ReadingTool>> = {
        '1': 'read',
        '2': 'highlight',
        '3': 'underline',
        '4': 'strike',
        '5': 'bold',
        '6': 'eraser',
        r: 'read',
        h: 'highlight',
        u: 'underline',
        s: 'strike',
        b: 'bold',
        e: 'eraser',
      };
      const tool = toolByKey[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        setReadingTool(tool);
        setKeepReadingTool(false);
        closeSelectionMenu();
      }
    }

    window.addEventListener('keydown', handleReadingShortcut);
    return () => window.removeEventListener('keydown', handleReadingShortcut);
  }, [annotationHistory, annotations]);

  /* Escape 关闭浮窗辅助面板；点击外部关闭非 pinned 面板 */
  useEffect(() => {
    if (!asidePanel) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeAsidePanel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [asidePanel]);

  useEffect(() => {
    if (!asidePanel || asidePinned) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('.reader-aside-panel') ||
        target.closest('.reader-utility-rail')
      ) {
        return;
      }
      closeAsidePanel();
    }
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [asidePanel, asidePinned]);

  function commitAnnotations(next: TextAnnotation[]) {
    if (next === annotations) return;
    setAnnotationHistory((current) => ({
      past: [...current.past, annotations],
      future: [],
    }));
    setAnnotations(next);
  }

  function undoAnnotations() {
    const previous = annotationHistory.past.at(-1);
    if (!previous) return;
    setAnnotationHistory((current) => ({
      past: current.past.slice(0, -1),
      future: [...current.future, annotations],
    }));
    setAnnotations(previous);
    toast('已撤销阅读标记');
  }

  function redoAnnotations() {
    const next = annotationHistory.future.at(-1);
    if (!next) return;
    setAnnotationHistory((current) => ({
      past: [...current.past, annotations],
      future: current.future.slice(0, -1),
    }));
    setAnnotations(next);
    toast('已恢复阅读标记');
  }

  function applyToolToSelection(anchor: TextAnchor) {
    if (readingTool === 'eraser') {
      commitAnnotations(eraseAnnotations(annotations, anchor));
      toast('已清理选区标记');
    } else {
      const style = annotationStyleForTool(readingTool, highlightColor);
      if (!style) return;
      commitAnnotations(
        applyAnnotation(annotations, anchor, style, Date.now()),
      );
      toast('已更新阅读标记', { variant: 'success' });
    }
    if (!keepReadingTool) {
      setReadingTool('read');
    }
    window.getSelection()?.removeAllRanges();
  }

  function handleTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element =
      container instanceof Element ? container : container.parentElement;
    const article = element?.closest('.reader-article');
    if (element?.closest('[data-annotation-disabled="true"]')) return;
    const block = element?.closest<HTMLElement>('[data-block-id]');
    if (!article || !block?.dataset.blockId) return;
    const anchor = domRangeToTextAnchor(range, block);
    if (!anchor) return;
    if (readingTool !== 'read') {
      applyToolToSelection(anchor);
      return;
    }
    const rect = range.getBoundingClientRect();
    setSelectionMenu({
      x: Math.min(window.innerWidth - 300, Math.max(16, rect.left)),
      y: Math.max(12, rect.top - 52),
      text,
      anchor,
    });
    setSelectionClosing(false);
    setHighlightPaletteOpen(false);
    setHighlightPaletteClosing(false);
  }

  function askTutor() {
    if (!selectionMenu) return;
    setTutorContext({
      sectionTitle: selected?.title,
      blockId: selectionMenu.anchor.blockId,
      selectedText: selectionMenu.text,
    });
    setTutorDraft(`请结合当前章节解释这段内容：\n\n“${selectionMenu.text}”`);
    setDrawerPanel('tutor');
    closeSelectionMenu();
    window.getSelection()?.removeAllRanges();
  }

  function addAnnotation(style: AnnotationStyle) {
    if (!selectionMenu) return;
    const { anchor } = selectionMenu;
    commitAnnotations(applyAnnotation(annotations, anchor, style, Date.now()));
    toast('已更新阅读标记', { variant: 'success' });
  }

  function clearAnnotations() {
    if (!selectionMenu) return;
    const { anchor } = selectionMenu;
    commitAnnotations(eraseAnnotations(annotations, anchor));
    closeSelectionMenu();
    window.getSelection()?.removeAllRanges();
    toast('已取消阅读标记');
  }

  const outlineContent = asidePanel === 'contents' ? (
    <nav
      id="learning-aside-panel-contents"
      ref={outlineRef}
      className="reader-aside-panel__content"
      role="tabpanel"
      aria-label="教材目录"
    >
      {chapters.map((chapter) => (
        <div className="outline-chapter" key={chapter.id}>
          <button
            type="button"
            id={domId('learning', 'outline-chapter', chapter.id)}
            className={`outline-section ${chapter.id === selectedSectionId ? 'is-active' : ''}`}
            aria-current={chapter.id === selectedSectionId ? 'page' : undefined}
            onClick={() => {
              setSelectedSectionId(chapter.id);
              closeAsidePanel();
            }}
          >
            <span>{chapter.title}</span>
          </button>
        </div>
      ))}
    </nav>
  ) : (
    <div
      id="learning-aside-panel-article"
      className="reader-aside-panel__content reader-article-outline"
      role="tabpanel"
      aria-label="本章大纲"
    >
      <ul>
        {articleOutline.map((item) => (
          <li key={item.id} className={`is-level-${item.level}`}>
            <button
              type="button"
              id={domId('learning', 'article-outline', item.id)}
              onClick={() => {
                scrollToHeading(item.id);
                if (!asidePinned) {
                  window.setTimeout(() => closeAsidePanel(), 220);
                }
              }}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  if (!selected) {
    return (
      <section className="reader-empty">
        <FontAwesomeIcon icon={faBook} style={{ fontSize: 32 }} />
        <h2>教材内容尚未生成</h2>
        <button
          type="button"
          id="learning-bookshelf-open-empty"
          className="button button--secondary"
          onClick={onOpenBookshelf}
        >
          返回书架
        </button>
      </section>
    );
  }

  return (
    <section className="reader-page">
      <div
        className="reader-workspace"
        style={{
          '--tutor-width': drawerPanel ? `${tutorWidth}px` : '0px',
          '--reader-drawer-width': drawerPanel ? `${tutorWidth}px` : '0px',
        } as CSSProperties}
      >
        <article
          ref={articleRef}
          className={`card reader-article motion-enter motion-delay-2 is-tool-${readingTool}`}
          onMouseDown={() => {
            if (selectionMenu) closeSelectionMenu();
          }}
          onMouseUp={handleTextSelection}
          onPointerUp={handleTextSelection}
          onKeyUp={handleTextSelection}
        >
          <div
            className="reader-tools"
            aria-label="阅读工具"
            style={readerToolsCenter === null ? undefined : { left: readerToolsCenter }}
          >
            <span className="reader-tools__label">工具</span>
            {(['highlight', 'underline', 'strike', 'bold', 'eraser'] as ReadingTool[]).map(
              (tool) => (
                <button
                  key={tool}
                  type="button"
                  id={`learning-tool-${tool}`}
                  className={`button button--secondary reader-tool is-${tool}`}
                  aria-label={readingToolLabels[tool]}
                  aria-pressed={readingTool === tool}
                  title={`${readingToolLabels[tool]} (${readingToolShortcuts[tool]})`}
                  onClick={() => {
                    setReadingTool(tool);
                    setKeepReadingTool(false);
                    closeSelectionMenu();
                  }}
                >
                  {tool === 'highlight' ? <FontAwesomeIcon icon={faHighlighter} /> : null}
                  {tool === 'eraser' ? <FontAwesomeIcon icon={faEraser} /> : null}
                  {tool === 'underline' ? <FontAwesomeIcon icon={faUnderline} /> : null}
                  {tool === 'bold' ? <FontAwesomeIcon icon={faBold} /> : null}
                  {tool === 'strike' ? <FontAwesomeIcon icon={faStrikethrough} /> : null}
                </button>
              ),
            )}
            <button
              type="button"
              id="learning-tool-keep"
              className="button button--secondary reader-tool reader-tool--keep"
              aria-label="持续保持工具"
              aria-pressed={keepReadingTool}
              title={`持续保持工具 (${keepReadingTool ? '已开启' : '点击开启'})`}
              onClick={() => setKeepReadingTool((current) => !current)}
            >
              keep
            </button>
            <span className="reader-tools__divider" aria-hidden="true" />
            <button
              type="button"
              id="learning-annotation-undo"
              className="button button--secondary reader-tool"
              aria-label="撤销标记"
              title="撤销标记 (Ctrl/Cmd+Z)"
              disabled={!annotationHistory.past.length}
              onClick={undoAnnotations}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
            </button>
            <button
              type="button"
              id="learning-annotation-redo"
              className="button button--secondary reader-tool"
              aria-label="重做标记"
              title="重做标记 (Ctrl/Cmd+Shift+Z)"
              disabled={!annotationHistory.future.length}
              onClick={redoAnnotations}
            >
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
            {readingTool === 'highlight' && (
              <div className="reader-tools__colors" aria-label="高亮颜色">
                {(['green', 'yellow', 'sky', 'pink', 'orange'] as HighlightColor[]).map(
                  (color) => (
                    <button
                      key={color}
                      type="button"
                      id={`learning-tool-color-${color}`}
                      className={`button selection-color is-${color} ${highlightColor === color ? 'is-selected' : ''}`}
                      aria-label={`${color} 高亮颜色`}
                      aria-pressed={highlightColor === color}
                      title={`${color} 高亮颜色`}
                      onClick={() => setHighlightColor(color)}
                    />
                  ),
                )}
              </div>
            )}
          </div>

          <SectionHeading section={selected} />

          <div className="reader-blocks">
            {parsedSection.blocks.map((block, blockIndex) => (
              <ContentBlockView
                key={block.id}
                block={block}
                blockIndex={blockIndex}
                annotations={annotations.filter(
                  (annotation) => annotation.anchor.blockId === block.id,
                )}
              />
            ))}
          </div>
          {parsedSection.warnings.length > 0 && (
            <div className="reader-parse-warnings" role="status">
              {parsedSection.warnings.map((warning, index) => (
                <p key={`${warning.rule}-${index}`}>{warning.message}</p>
              ))}
            </div>
          )}

        </article>

        {/* 右上角垂直工具列：导师 / 目录 / 大纲 */}
        <div
          className={`reader-utility-rail${drawerPanel ? ' is-hidden' : ''}`}
          role="toolbar"
          aria-label="学习区导航"
        >
          <button
            type="button"
            id="learning-tutor-toggle"
            className={`reader-utility-button${
              tutorOpen ? ' is-active' : ''
            }`}
            aria-label="导师"
            aria-expanded={tutorOpen}
            aria-controls="learning-tutor-panel"
            title="导师"
            onClick={() => handleUtilityAction('tutor')}
          >
            <FontAwesomeIcon icon={faStar} style={{ fontSize: 18 }} />
            <span>导师</span>
          </button>
          <button
            type="button"
            id="learning-aside-toggle-contents"
            className={`reader-utility-button${
              asidePanel === 'contents' ? ' is-active' : ''
            }`}
            aria-label="教材目录"
            aria-expanded={asidePanel === 'contents'}
            aria-controls="learning-aside-panel-contents"
            title="教材目录"
            onClick={() => handleUtilityAction('contents')}
          >
            <FontAwesomeIcon icon={faBook} style={{ fontSize: 18 }} />
            <span>目录</span>
          </button>
          <button
            type="button"
            id="learning-aside-toggle-article"
            className={`reader-utility-button${
              asidePanel === 'article' ? ' is-active' : ''
            }`}
            aria-label="本章大纲"
            aria-expanded={asidePanel === 'article'}
            aria-controls="learning-aside-panel-article"
            title="本章大纲"
            onClick={() => handleUtilityAction('article')}
          >
            <FontAwesomeIcon icon={faList} style={{ fontSize: 18 }} />
            <span>大纲</span>
          </button>
        </div>

        <TutorDrawer
          open={drawerPanel !== null}
          activePanel={drawerPanel ?? 'tutor'}
          width={tutorWidth}
          context={tutorContext}
          draft={tutorDraft}
          children={asidePanel ? outlineContent : undefined}
          onPanelChange={handleUtilityAction}
          onOpenChange={(open) => setDrawerPanel(open ? 'tutor' : null)}
          onWidthChange={setTutorWidth}
          onDraftChange={setTutorDraft}
        />
      </div>

      {selectionMenu && (
        <div
          className={`floating-surface selection-toolbar ${
            selectionClosing ? 'is-closing' : ''
          }`}
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            id="learning-selection-ask-ai"
            className="button button--secondary selection-toolbar__button"
            aria-label="询问 AI"
            title="询问 AI"
            onClick={askTutor}
          >
            <FontAwesomeIcon icon={faStar} style={{ fontSize: 15 }} />
          </button>
          <button
            type="button"
            id="learning-selection-highlight"
            className="button button--secondary selection-toolbar__button"
            aria-label="文字高亮"
            title="文字高亮"
            aria-expanded={highlightPaletteOpen}
            onClick={() => {
              if (highlightPaletteOpen) {
                closeHighlightPalette();
              } else {
                setHighlightPaletteOpen(true);
              }
            }}
          >
            <FontAwesomeIcon icon={faHighlighter} style={{ fontSize: 15 }} />
          </button>

          {highlightPaletteOpen && (
            <div
              className={`floating-surface selection-toolbar__palette ${
                highlightPaletteClosing ? 'is-closing' : ''
              }`}
            >
              {(['green', 'yellow', 'sky', 'pink', 'orange'] as HighlightColor[]).map(
                (color) => (
                  <button
                    key={color}
                    type="button"
                    id={`learning-annotation-highlight-${color}`}
                    className={`button button--secondary selection-color is-${color}`}
                    aria-label={`${color} 高亮`}
                    title={`${color} 高亮`}
                    onClick={() => {
                      setHighlightColor(color);
                      addAnnotation({ type: 'highlight', color });
                    }}
                  />
                ),
              )}
            </div>
          )}

          <button
            type="button"
            id="learning-annotation-underline"
            className="button button--secondary selection-format"
            onClick={() => addAnnotation({ type: 'underline' })}
          >
            U
          </button>
          <button
            type="button"
            id="learning-annotation-bold"
            className="button button--secondary selection-format is-bold"
            onClick={() => addAnnotation({ type: 'bold' })}
          >
            B
          </button>
          <button
            type="button"
            id="learning-annotation-strike"
            className="button button--secondary selection-format is-strike"
            onClick={() => addAnnotation({ type: 'strike' })}
          >
            S
          </button>
          <button
            type="button"
            id="learning-annotation-anchor"
            className="button button--secondary selection-format"
            onClick={() => {
              toast('Anchor 交互模型后续讨论');
              closeSelectionMenu();
            }}
          >
            #
          </button>
          <button
            type="button"
            id="learning-annotation-clear"
            className="button button--secondary selection-format"
            aria-label="取消标注"
            title="取消标注"
            onClick={clearAnnotations}
          >
            <FontAwesomeIcon icon={faEraser} style={{ fontSize: 15 }} />
          </button>
        </div>
      )}
    </section>
  );
}

export function LearningZoneModule() {
  const activeTextbookId = useWorkbenchStore((state) => state.activeTextbookId);
  const setActive = useWorkbenchStore((state) => state.setActive);
  const textbook = getTextbookDocument(activeTextbookId);

  return (
    <TextbookReader
      key={textbook.id}
      textbook={textbook}
      onOpenBookshelf={() => setActive('bookshelf')}
    />
  );
}
