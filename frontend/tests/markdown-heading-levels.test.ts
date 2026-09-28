import { describe, expect, it } from 'vitest';

import { parseMarkdownSection } from '../services/textbook/markdown/parser';

describe('markdown heading levels', () => {
  it('preserves all six markdown heading levels', () => {
    const markdown = Array.from({ length: 6 }, (_, index) => {
      const level = index + 1;
      return `${'#'.repeat(level)} 标题 ${level}`;
    }).join('\n\n');
    const result = parseMarkdownSection('chapter-heading-levels', markdown);

    expect(
      result.blocks
        .filter((block) => block.type === 'heading')
        .map(({ level, title }) => [level, title]),
    ).toEqual([
      [1, '标题 1'],
      [2, '标题 2'],
      [3, '标题 3'],
      [4, '标题 4'],
      [5, '标题 5'],
      [6, '标题 6'],
    ]);
  });
});