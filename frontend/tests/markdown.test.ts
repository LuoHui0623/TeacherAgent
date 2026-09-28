import { describe, expect, it } from 'vitest';

import { findMarkdownFixture, markdownFixtures, markdownRequirements } from '../mocks/markdown/fixtures';
import { getTextbookDocument } from '../mocks/textbooks';
import { getReaderChapters } from '../services/textbook/chapterModel';
import { parseMarkdownSection } from '../services/textbook/markdown/parser';

describe('markdown rendering pipeline', () => {
  it('parses each fixture into the expected RenderBlock types', () => {
    for (const fixture of markdownFixtures) {
      const result = parseMarkdownSection(fixture.id, fixture.markdown);
      expect(
        result.blocks.map((block) => block.type),
        fixture.id,
      ).toEqual(fixture.expectedBlockTypes);
      expect(result.warnings, fixture.id).toHaveLength(fixture.expectedWarnings);
    }
  });

  it('keeps every confirmed markdown requirement owned by a fixture', () => {
    const covered = new Set(markdownFixtures.flatMap((fixture) => fixture.covers));
    for (const requirement of Object.keys(markdownRequirements)) {
      expect(covered.has(requirement as keyof typeof markdownRequirements)).toBe(true);
    }
  });

  it('attaches a runtime capability only to whitelisted languages', () => {
    const fixture = findMarkdownFixture('code-fence');
    const blocks = parseMarkdownSection(fixture.id, fixture.markdown).blocks;
    const codeBlocks = blocks.filter((block) => block.type === 'code');

    expect(codeBlocks[0].runtime?.id).toBe('javascript');
    expect(codeBlocks[1].runtime).toBeUndefined();
    expect(codeBlocks[2].runtime).toBeUndefined();
  });

  it('parses every textbook chapter from its markdown source', () => {
    const document = getTextbookDocument('94134faf-b49c-4a50-bd46-2c9c92654bc4');
    const chapters = getReaderChapters(document);

    for (const chapter of chapters) {
      const result = parseMarkdownSection(chapter.id, chapter.markdown);
      expect(result.blocks.length, chapter.id).toBeGreaterThan(0);
      expect(result.warnings, chapter.id).toHaveLength(0);
    }
  });

  it('uses ## and ### markdown headings as the chapter outline', () => {
    const result = parseMarkdownSection('chapter-1', '## 第一节\n\n### 一个概念\n');
    expect(result.blocks.filter((block) => block.type === 'heading')).toEqual([
      expect.objectContaining({ level: 2, title: '第一节' }),
      expect.objectContaining({ level: 3, title: '一个概念' }),
    ]);
  });
});
