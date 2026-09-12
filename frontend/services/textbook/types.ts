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

export interface ProseBlock {
  id: string;
  type: 'prose';
  paragraphs: string[];
}

export interface HeadingBlock {
  id: string;
  type: 'heading';
  level: 2 | 3;
  title: string;
}

export interface CalloutBlock {
  id: string;
  type: 'callout';
  tone: 'info' | 'tip' | 'warning';
  title: string;
  body: string;
}

export interface FormulaBlock {
  id: string;
  type: 'formula';
  expression: string;
  caption: string;
}

export interface CodeBlock {
  id: string;
  type: 'code';
  language: string;
  code: string;
  caption: string;
}

export interface SandboxBlock {
  id: string;
  type: 'sandbox';
  title: string;
  description: string;
  language: 'javascript';
  entry: string;
  starterCode: string;
}

export type ContentBlock =
  | HeadingBlock
  | ProseBlock
  | CalloutBlock
  | FormulaBlock
  | CodeBlock
  | SandboxBlock;

export interface TextbookSection {
  id: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  kind: SectionKind;
  objectives: string[];
  knowledgePoints: string[];
  blocks: ContentBlock[];
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
