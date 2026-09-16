import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import { toString } from 'mdast-util-to-string';
import type { ContainerDirective } from 'mdast-util-directive';
import type { Math as MathMdastNode } from 'mdast-util-math';
import type {
  Blockquote,
  Code,
  Heading,
  List,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
} from 'mdast';

import type {
  CalloutBlock,
  CodeBlock,
  ContentBlock,
  DividerBlock,
  FormulaBlock,
  HeadingBlock,
  HtmlBlock,
  InlineNode,
  ListBlock,
  MermaidBlock,
  ParseSectionResult,
  ParseWarning,
  ProseBlock,
  QuoteBlock,
  SourceRange,
  TableBlock,
  UnsupportedBlock,
} from '../types';
import { getCodeRuntimeCapability } from './runtime';

type UnknownNode = RootContent & Record<PropertyKey, unknown>;

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkDirective);

function getRange(node: RootContent | PhrasingContent): SourceRange {
  const start = node.position?.start.offset ?? 0;
  const end = node.position?.end.offset ?? start;
  return { start, end };
}

function getSource(source: string, node: RootContent) {
  const range = getRange(node);
  return source.slice(range.start, range.end);
}

function createId(sectionId: string, index: number) {
  return `${sectionId}-block-${index}`;
}

function textNode(value: string): InlineNode {
  return { type: 'text', value };
}

function mapInlineChildren(children: PhrasingContent[]): InlineNode[] {
  return children.flatMap(mapInlineNode);
}

function mapInlineNode(node: PhrasingContent): InlineNode[] {
  switch (node.type) {
    case 'text':
      return [textNode(node.value)];
    case 'strong':
    case 'emphasis':
    case 'delete':
      return [{ type: node.type, children: mapInlineChildren(node.children) }];
    case 'inlineCode':
      return [{ type: 'inlineCode', value: node.value }];
    case 'link':
      return [
        {
          type: 'link',
          url: node.url,
          title: node.title ?? undefined,
          children: mapInlineChildren(node.children),
        },
      ];
    case 'image':
      return [
        {
          type: 'image',
          url: node.url,
          alt: node.alt ?? '',
          title: node.title ?? undefined,
        },
      ];
    case 'break':
      return [{ type: 'break' }];
    case 'inlineMath':
      return [{ type: 'math', value: node.value }];
    case 'html':
      return [{ type: 'html', value: node.value }];
    default:
      return [textNode(toString(node))];
  }
}

export function inlinePlainText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'inlineCode':
          return node.value;
        case 'math':
          return `$${node.value}$`;
        case 'html':
          return '';
        case 'image':
          return '';
        case 'break':
          return '\n';
        default:
          return inlinePlainText(node.children);
      }
    })
    .join('');
}

function mapTable(node: Table): TableBlock {
  const mapCell = (cell: TableCell) => mapInlineChildren(cell.children);
  return {
    id: '',
    source: '',
    range: { start: 0, end: 0 },
    type: 'table',
    align: node.align ?? [],
    header: node.children[0]?.children.map(mapCell) ?? [],
    rows: node.children.slice(1).map((row) => row.children.map(mapCell)),
  };
}

function parseMeta(meta: string | null | undefined) {
  const result: Record<string, string> = {};
  if (!meta) return result;

  for (const match of meta.matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    result[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function mapCode(node: Code): CodeBlock | MermaidBlock {
  const language = node.lang?.trim() || 'text';
  const meta = parseMeta(node.meta);
  const range = getRange(node);
  const source = node.value;

  if (language.toLowerCase() === 'mermaid') {
    return {
      id: '',
      source,
      range,
      type: 'mermaid',
      code: node.value,
    };
  }

  const runtime = getCodeRuntimeCapability(language, meta.entry);

  return {
    id: '',
    source,
    range,
    type: 'code',
    language,
    code: node.value,
    caption: meta.caption || undefined,
    runtime,
  };
}

function mapList(node: List): ListBlock {
  return {
    id: '',
    source: '',
    range: getRange(node),
    type: 'list',
    ordered: node.ordered ?? false,
    start: node.start ?? undefined,
    items: node.children.map((item) => {
      const paragraph = item.children.find(
        (child): child is Paragraph => child.type === 'paragraph',
      );
      return paragraph ? mapInlineChildren(paragraph.children) : [textNode(toString(item))];
    }),
  };
}

function mapQuote(node: Blockquote): QuoteBlock {
  return {
    id: '',
    source: '',
    range: getRange(node),
    type: 'quote',
    children: node.children.flatMap((child) =>
      child.type === 'paragraph' ? [mapInlineChildren(child.children)] : [],
    ),
  };
}

function mapDirective(
  node: ContainerDirective,
  warnings: ParseWarning[],
): CalloutBlock | UnsupportedBlock {
  const name = node.name.toLowerCase();
  if (!['info', 'tip', 'warning'].includes(name)) {
    const range = getRange(node);
    warnings.push({
      rule: 'markdown.unknown-directive',
      message: `未知 directive：${node.name}`,
      range,
    });
    return {
      id: '',
      source: '',
      range,
      type: 'unsupported',
      reason: `未知 directive：${node.name}`,
    };
  }

  return {
    id: '',
    source: '',
    range: getRange(node),
    type: 'callout',
    tone: name as CalloutBlock['tone'],
    title: node.attributes?.title ?? name,
    body: [textNode(toString(node))],
  };
}

function mapTopLevelNode(
  node: RootContent,
  sectionId: string,
  index: number,
  source: string,
  warnings: ParseWarning[],
): ContentBlock {
  const id = createId(sectionId, index);
  const range = getRange(node);
  const rawSource = getSource(source, node);
  const base = { id, source: rawSource, range };

  switch (node.type) {
    case 'heading': {
      const heading = node as Heading;
      return {
        ...base,
        type: 'heading',
        level: heading.depth <= 2 ? 2 : 3,
        title: toString(heading),
      } satisfies HeadingBlock;
    }
    case 'paragraph': {
      const paragraph = node as Paragraph;
      const children = mapInlineChildren(paragraph.children);
      return {
        ...base,
        type: 'prose',
        children,
        plainText: inlinePlainText(children),
      } satisfies ProseBlock;
    }
    case 'list':
      return { ...mapList(node as List), ...base } satisfies ListBlock;
    case 'blockquote':
      return { ...mapQuote(node as Blockquote), ...base } satisfies QuoteBlock;
    case 'table':
      return { ...mapTable(node as Table), ...base } satisfies TableBlock;
    case 'math': {
      const formula = node as MathMdastNode;
      return {
        ...base,
        type: 'formula',
        expression: formula.value,
        displayMode: true,
      } satisfies FormulaBlock;
    }
    case 'code':
      return { ...mapCode(node as Code), ...base } satisfies CodeBlock | MermaidBlock;
    case 'html':
      return {
        ...base,
        type: 'html',
        html: node.value,
      } satisfies HtmlBlock;
    case 'thematicBreak':
      return {
        ...base,
        type: 'divider',
      } satisfies DividerBlock;
    case 'containerDirective':
      return { ...mapDirective(node as ContainerDirective, warnings), ...base } satisfies
        | CalloutBlock
        | UnsupportedBlock;
    default: {
      const unknown = node as UnknownNode;
      warnings.push({
        rule: 'markdown.unsupported-node',
        message: `暂不支持 Markdown 节点：${unknown.type}`,
        range,
      });
      return {
        ...base,
        type: 'unsupported',
        reason: `暂不支持 Markdown 节点：${unknown.type}`,
      } satisfies UnsupportedBlock;
    }
  }
}

export function parseMarkdownSection(
  sectionId: string,
  markdown: string,
): ParseSectionResult {
  try {
    const tree = processor.parse(markdown) as Root;
    const warnings: ParseWarning[] = [];
    const blocks = tree.children.map((node, index) =>
      mapTopLevelNode(node, sectionId, index, markdown, warnings),
    );

    return { blocks, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    const range = { start: 0, end: markdown.length };
    return {
      blocks: [
        {
          id: `${sectionId}-block-0`,
          source: markdown,
          range,
          type: 'unsupported',
          reason: `Markdown 解析失败：${message}`,
        },
      ],
      warnings: [
        {
          rule: 'markdown.parse-error',
          message,
          range,
        },
      ],
    };
  }
}

export const markdownProcessor = processor;
