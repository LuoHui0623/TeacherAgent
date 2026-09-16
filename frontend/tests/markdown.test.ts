import { describe, expect, it } from 'vitest';

import { findMarkdownFixture, markdownFixtures, markdownRequirements } from '../mocks/markdown/fixtures';
import { getTextbookDocument } from '../mocks/textbooks';
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

  it('parses every textbook section from markdown source', () => {
    const document = getTextbookDocument('calculus');
    const sections = document.chapters.flatMap((chapter) => chapter.sections);

    for (const section of sections) {
      const result = parseMarkdownSection(section.id, section.markdown);
      expect(result.blocks.length, section.id).toBeGreaterThan(0);
      expect(result.warnings, section.id).toHaveLength(0);
    }
  });
});
