import { describe, expect, it } from 'vitest';

import { getTextbookDocument, textbookCatalog } from '../mocks/textbooks';

describe('generated textbook loader', () => {
  it('builds the bookshelf catalog from per-book textbook metadata', () => {
    expect(textbookCatalog).toHaveLength(9);
    expect(textbookCatalog.map((book) => book.id)).toContain('c7bb982f-4337-4738-95b9-0a04f6e45e4d');
  });

  it('loads every chapter declared by the per-book textbook metadata', () => {
    const document = getTextbookDocument('c7bb982f-4337-4738-95b9-0a04f6e45e4d');

    expect(document.chapters.map((chapter) => chapter.id)).toEqual([
      '01',
      '02',
      '03',
      '04',
    ]);
    expect(
      document.chapters.every(
        (chapter) => typeof chapter.markdown === 'string' && chapter.markdown.length > 0,
      ),
    ).toBe(true);
  });
});