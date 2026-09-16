export type CoverTheme =
  | 'jade'
  | 'navy'
  | 'coral'
  | 'amber'
  | 'plum'
  | 'slate'
  | 'sky'
  | 'indigo';

export type BookStatus = 'learning' | 'ready' | 'queued';
export type SectionKind = 'lesson' | 'sandbox' | 'practice' | 'review';

export interface TextbookSummary {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  code: string;
  edition: string;
  chapterCount: number;
  progress: number;
  status: BookStatus;
  theme: CoverTheme;
}

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'emphasis'; children: InlineNode[] }
  | { type: 'delete'; children: InlineNode[] }
  | { type: 'inlineCode'; value: string }
  | {
      type: 'link';
      url: string;
      title?: string;
      children: InlineNode[];
    }
  | { type: 'image'; url: string; alt: string; title?: string }
  | { type: 'math'; value: string }
  | { type: 'break' }
  | { type: 'html'; value: string };

export interface SourceRange {
  start: number;
  end: number;
}

export interface MarkdownBlockBase {
  id: string;
  source: string;
  range: SourceRange;
}

export interface ProseBlock extends MarkdownBlockBase {
  type: 'prose';
  children: InlineNode[];
  plainText: string;
}

export interface HeadingBlock extends MarkdownBlockBase {
  type: 'heading';
  level: 2 | 3;
  title: string;
}

export interface CalloutBlock extends MarkdownBlockBase {
  type: 'callout';
  tone: 'info' | 'tip' | 'warning';
  title: string;
  body: InlineNode[];
}

export interface ListBlock extends MarkdownBlockBase {
  type: 'list';
  ordered: boolean;
  start?: number;
  items: InlineNode[][];
}

export interface QuoteBlock extends MarkdownBlockBase {
  type: 'quote';
  children: InlineNode[][];
}

export interface TableBlock extends MarkdownBlockBase {
  type: 'table';
  align: Array<'left' | 'center' | 'right' | null>;
  header: InlineNode[][];
  rows: InlineNode[][][];
}

export interface FormulaBlock extends MarkdownBlockBase {
  type: 'formula';
  expression: string;
  displayMode: boolean;
  caption?: string;
}

export interface CodeRuntimeCapability {
  id: 'javascript';
  label: string;
  entry: string;
}

export interface CodeBlock extends MarkdownBlockBase {
  type: 'code';
  language: string;
  code: string;
  caption?: string;
  runtime?: CodeRuntimeCapability;
}

export interface MermaidBlock extends MarkdownBlockBase {
  type: 'mermaid';
  code: string;
}

export interface HtmlBlock extends MarkdownBlockBase {
  type: 'html';
  html: string;
}

export interface UnsupportedBlock extends MarkdownBlockBase {
  type: 'unsupported';
  reason: string;
}

export interface DividerBlock extends MarkdownBlockBase {
  type: 'divider';
}

export type ContentBlock =
  | HeadingBlock
  | ProseBlock
  | CalloutBlock
  | ListBlock
  | QuoteBlock
  | TableBlock
  | FormulaBlock
  | CodeBlock
  | MermaidBlock
  | HtmlBlock
  | UnsupportedBlock
  | DividerBlock;

export interface ParseWarning {
  rule: string;
  message: string;
  range: SourceRange;
}

export interface ParseSectionResult {
  blocks: ContentBlock[];
  warnings: ParseWarning[];
}

export interface TextbookSection {
  id: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  kind: SectionKind;
  objectives: string[];
  knowledgePoints: string[];
  markdown: string;
}

export interface TextbookChapter {
  id: string;
  title: string;
  summary: string;
  sections: TextbookSection[];
}

export interface TextbookDocument extends TextbookSummary {
  version: string;
  chapters: TextbookChapter[];
}
