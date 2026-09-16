import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  BookOpenIcon,
  BooksIcon,
  CaretDownIcon,
  CaretRightIcon,
  ClockIcon,
  EraserIcon,
  HighlighterIcon,
  InfoIcon,
  LightbulbIcon,
  SparkleIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

import { useWorkbenchStore } from '../../services/workbenchStore';
import {
  firstSectionId,
  getTextbookDocument,
} from '../../mocks/textbooks';
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
  SectionKind,
  TableBlock,
  TextbookDocument,
  TextbookSection,
  UnsupportedBlock,
} from '../../services/textbook/types';
import {
  parseMarkdownSection,
} from '../../services/textbook/markdown/parser';
import { domId } from '../../shared/ids';
import { SegmentedControl, toast } from '../../shared/ui';
import { CodeFenceBlock } from './SandboxBlock';
import { TutorDrawer } from './TutorDrawer';
import './LearningZoneModule.css';

type HighlightColor = 'green' | 'yellow' | 'sky' | 'pink' | 'orange';
type AnnotationStyle =
  | { type: 'highlight'; color: HighlightColor }
  | { type: 'underline' | 'bold' | 'strike' };

interface SelectionMenu {
  x: number;
  y: number;
  text: string;
  blockId: string;
}

interface TextAnnotation {
  id: string;
  blockId: string;
  text: string;
  style: AnnotationStyle;
}

const sectionKindMeta: Record<SectionKind, { label: string; className: string }> = {
  lesson: { label: '正文', className: 'is-lesson' },
  sandbox: { label: '实验', className: 'is-sandbox' },
  practice: { label: '练习', className: 'is-practice' },
  review: { label: '复习', className: 'is-review' },
};

const calloutMeta = {
  info: { icon: InfoIcon, label: '说明' },
  tip: { icon: LightbulbIcon, label: '提示' },
  warning: { icon: WarningIcon, label: '注意' },
};

interface LocatedAnnotation {
  annotation: TextAnnotation;
  start: number;
  end: number;
  order: number;
}

function locateAnnotations(
  plainText: string,
  annotations: TextAnnotation[],
): LocatedAnnotation[] {
  return annotations.flatMap((annotation, order) => {
    const start = plainText.indexOf(annotation.text);
    return start < 0
      ? []
      : [{ annotation, start, end: start + annotation.text.length, order }];
  });
}

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
        <Icon size={18} weight="duotone" />
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
function SectionHeading({ section }: { section: TextbookSection }) {
  const kind = sectionKindMeta[section.kind];
  return (
    <header className="reader-section-heading">
      <div className="reader-section-heading__meta">
        <span className={`section-kind ${kind.className}`}>{kind.label}</span>
        <span>
          <ClockIcon size={13} />
          {section.estimatedMinutes} 分钟
        </span>
      </div>
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
  const outlineRef = useRef<HTMLElement | null>(null);
  const outlineSpacerRef = useRef<HTMLDivElement | null>(null);
  const pendingOutlineAnchorRef = useRef<{
    id: string;
    scrollTop: number;
    scrollHeight: number;
  } | null>(null);
  const [activeOutlinePanel, setActiveOutlinePanel] = useState<'contents' | 'article'>(
    'contents',
  );
  const [selectedSectionId, setSelectedSectionId] = useState(firstSectionId(textbook));

  const sections = textbook.chapters.flatMap((chapter) =>
    chapter.sections.map((section) => ({ chapter, section })),
  );
  const selectedIndex = Math.max(
    0,
    sections.findIndex((item) => item.section.id === selectedSectionId),
  );
  const selected = sections[selectedIndex];
  const [collapsedChapterIds, setCollapsedChapterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tutorOpen, setTutorOpen] = useState(true);
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
  const parsedSection = selected
    ? parseMarkdownSection(selected.section.id, selected.section.markdown)
    : { blocks: [], warnings: [] };
  const articleOutline = selected
    ? [
        {
          id: domId('learning', 'section-title', selected.section.id),
          title: selected.section.title,
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

  function toggleChapter(chapterId: string) {
    const container = outlineRef.current;
    const chapterButton = document.getElementById(
      domId('learning', 'outline-chapter', chapterId),
    );
    if (container && chapterButton) {
      pendingOutlineAnchorRef.current = {
        id: chapterButton.id,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
      };
    }

    setCollapsedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  useLayoutEffect(() => {
    const container = outlineRef.current;
    const pendingAnchor = pendingOutlineAnchorRef.current;
    if (!container || !pendingAnchor) return;

    const spacer = outlineSpacerRef.current;
    if (spacer) spacer.style.height = '0px';

    const baseScrollHeight = container.scrollHeight;
    if (spacer) {
      spacer.style.height = `${Math.max(
        0,
        pendingAnchor.scrollHeight - baseScrollHeight,
      )}px`;
    }

    container.scrollTop = pendingAnchor.scrollTop;
    pendingOutlineAnchorRef.current = null;
  }, [collapsedChapterIds]);

  function switchOutlinePanel(panel: 'contents' | 'article') {
    if (outlineSpacerRef.current) outlineSpacerRef.current.style.height = '0px';
    setActiveOutlinePanel(panel);
    outlineRef.current?.scrollTo({ top: 0 });
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
    const rect = range.getBoundingClientRect();
    setSelectionMenu({
      x: Math.min(window.innerWidth - 300, Math.max(16, rect.left)),
      y: Math.max(12, rect.top - 52),
      text,
      blockId: block.dataset.blockId,
    });
    setSelectionClosing(false);
    setHighlightPaletteOpen(false);
    setHighlightPaletteClosing(false);
  }

  function askTutor() {
    if (!selectionMenu) return;
    setTutorContext({
      sectionTitle: selected?.section.title,
      blockId: selectionMenu.blockId,
      selectedText: selectionMenu.text,
    });
    setTutorDraft(`请结合当前章节解释这段内容：\n\n“${selectionMenu.text}”`);
    setTutorOpen(true);
    closeSelectionMenu();
    window.getSelection()?.removeAllRanges();
  }

  function addAnnotation(style: AnnotationStyle) {
    if (!selectionMenu) return;
    const { blockId, text } = selectionMenu;
    setAnnotations((current) => [
      ...current.filter(
        (annotation) =>
          annotation.blockId !== blockId ||
          annotation.text !== text ||
          annotation.style.type !== style.type,
      ),
      {
        id: `annotation-${Date.now()}-${current.length}`,
        blockId,
        text,
        style,
      },
    ]);
    toast('已更新阅读标记', { variant: 'success' });
  }

  function clearAnnotations() {
    if (!selectionMenu) return;
    const { blockId, text } = selectionMenu;
    setAnnotations((current) =>
      current.filter(
        (annotation) =>
          annotation.blockId !== blockId || annotation.text !== text,
      ),
    );
    closeSelectionMenu();
    window.getSelection()?.removeAllRanges();
    toast('已取消阅读标记');
  }

  if (!selected) {
    return (
      <section className="reader-empty">
        <BooksIcon size={32} weight="duotone" />
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
    <section className={`reader-page book-cover--${textbook.theme}`}>
      <header className="reader-header motion-enter">
        <div className={`reader-book-mark book-cover--${textbook.theme}`}>
          <BookOpenIcon size={19} weight="duotone" />
        </div>
        <div className="reader-header__identity">
          <span>
            {textbook.category} · {textbook.code}
          </span>
          <h1>{textbook.title}</h1>
          <p>{textbook.subtitle}</p>
        </div>
        <div className="reader-header__progress">
          <span>整体进度</span>
          <strong>{textbook.progress}%</strong>
          <span className="reader-progress">
            <span style={{ width: `${textbook.progress}%` }} />
          </span>
        </div>
        <button
          type="button"
          id="learning-bookshelf-open"
          className="button button--secondary reader-back"
          onClick={onOpenBookshelf}
        >
          <BooksIcon size={15} />
          书架
        </button>
      </header>

      <div
        className="reader-workspace"
        style={
          {
            '--tutor-width': tutorOpen ? `${tutorWidth}px` : '58px',
          } as CSSProperties
        }
      >
        <div className="reader-layout">
        <aside
          ref={outlineRef}
          className="card reader-outline motion-enter motion-delay-1"
        >
          <SegmentedControl
            value={activeOutlinePanel}
            onChange={switchOutlinePanel}
            ariaLabel="阅读导航"
            className="reader-outline__tabs"
            options={[
              {
                value: 'contents',
                id: 'learning-outline-tab-contents',
                label: '目录',
              },
              {
                value: 'article',
                id: 'learning-outline-tab-article',
                label: '大纲',
              },
            ]}
          />

          {activeOutlinePanel === 'contents' ? (
            <nav
              id="learning-outline-panel-contents"
              className="reader-outline__panel"
              role="tabpanel"
              aria-labelledby="learning-outline-tab-contents"
              aria-label="教材目录"
            >
              {textbook.chapters.map((chapter) => (
                <div className="outline-chapter" key={chapter.id}>
                  <button
                    type="button"
                    id={domId('learning', 'outline-chapter', chapter.id)}
                    className="outline-chapter__title"
                    aria-expanded={!collapsedChapterIds.has(chapter.id)}
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <span className="outline-chapter__caret">
                      {collapsedChapterIds.has(chapter.id) ? (
                        <CaretRightIcon size={12} weight="bold" />
                      ) : (
                        <CaretDownIcon size={12} weight="bold" />
                      )}
                    </span>
                    <span>{chapter.title}</span>
                  </button>
                  {!collapsedChapterIds.has(chapter.id) && (
                    <ul>
                      {chapter.sections.map((section) => {
                        const active = section.id === selectedSectionId;
                        return (
                          <li key={section.id}>
                            <button
                              type="button"
                              id={domId('learning', 'outline-section', section.id)}
                              className={`outline-section ${active ? 'is-active' : ''}`}
                              aria-current={active ? 'page' : undefined}
                              onClick={() => setSelectedSectionId(section.id)}
                            >
                              <span>{section.title}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
              <div
                ref={outlineSpacerRef}
                className="reader-outline__scroll-spacer"
                aria-hidden="true"
              />
            </nav>
          ) : (
            <div
              id="learning-outline-panel-article"
              className="reader-outline__panel reader-article-outline"
              role="tabpanel"
              aria-labelledby="learning-outline-tab-article"
            >
            <ul>
              {articleOutline.map((item) => (
                <li key={item.id} className={`is-level-${item.level}`}>
                  <button
                    type="button"
                    id={domId('learning', 'article-outline', item.id)}
                    onClick={() => scrollToHeading(item.id)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
            </div>
          )}
        </aside>

        <article
          className="card reader-article motion-enter motion-delay-2"
          onMouseDown={() => {
            if (selectionMenu) closeSelectionMenu();
          }}
          onMouseUp={handleTextSelection}
          onPointerUp={handleTextSelection}
          onKeyUp={handleTextSelection}
        >
          <div className="reader-breadcrumb">
            <span>{selected.chapter.title}</span>
            <span>/</span>
            <span>{selected.section.title}</span>
          </div>

          <SectionHeading section={selected.section} />

          <div className="reader-objectives">
            <span>学习目标</span>
            <ul className="objective-list">
              {selected.section.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </div>

          <div className="reader-blocks">
            {parsedSection.blocks.map((block, blockIndex) => (
              <ContentBlockView
                key={block.id}
                block={block}
                blockIndex={blockIndex}
                annotations={annotations.filter(
                  (annotation) => annotation.blockId === block.id,
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
        </div>

        <TutorDrawer
          open={tutorOpen}
          width={tutorWidth}
          context={tutorContext}
          draft={tutorDraft}
          onOpenChange={setTutorOpen}
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
            <SparkleIcon size={15} weight="duotone" />
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
            <HighlighterIcon size={15} weight="fill" />
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
                    onClick={() => addAnnotation({ type: 'highlight', color })}
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
            <EraserIcon size={15} weight="bold" />
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

  useEffect(() => {
    const state = useWorkbenchStore.getState();
    if (!state.sidebarCollapsed) state.toggleSidebar();
  }, []);

  return (
    <TextbookReader
      key={textbook.id}
      textbook={textbook}
      onOpenBookshelf={() => setActive('bookshelf')}
    />
  );
}
