import type {
  SectionKind,
  TextbookChapter,
  TextbookDocument,
  TextbookSection,
} from './types';

export interface ReaderChapter {
  id: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  kind: SectionKind;
  objectives: string[];
  knowledgePoints: string[];
  markdown: string;
}

const defaultChapterMeta = {
  estimatedMinutes: 0,
  kind: 'lesson' as SectionKind,
  objectives: [] as string[],
  knowledgePoints: [] as string[],
};

function fromSection(section: TextbookSection): ReaderChapter {
  return section;
}

function fromChapter(chapter: TextbookChapter): ReaderChapter | null {
  if (typeof chapter.markdown === 'string') {
    return {
      ...defaultChapterMeta,
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      markdown: chapter.markdown,
    };
  }

  return null;
}

/**
 * 将生产教材的“一个 Markdown = 一个章节”模型，转换为阅读器统一输入。
 * sections 只为旧版 mock 和历史数据保留，正式数据应直接使用 chapter.markdown。
 */
export function getReaderChapters(document: TextbookDocument): ReaderChapter[] {
  return document.chapters.flatMap((chapter) => {
    const markdownChapter = fromChapter(chapter);
    if (markdownChapter) return [markdownChapter];
    return (chapter.sections ?? []).map(fromSection);
  });
}