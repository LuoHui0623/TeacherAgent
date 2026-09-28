import { describe, expect, it } from 'vitest';

import type { TextAnchor, TextAnnotation } from '../modules/learning-zone/annotations/annotationModel';
import {
  annotationStyleForTool,
  applyAnnotation,
  eraseAnnotations,
} from '../modules/learning-zone/tools/readingToolModel';

const anchor: TextAnchor = {
  blockId: 'block-1',
  start: 2,
  end: 8,
};

function existingAnnotation(): TextAnnotation {
  return {
    id: 'existing',
    anchor: { ...anchor },
    style: { type: 'highlight', color: 'yellow' },
    createdAt: 1,
  };
}

describe('learning-zone reading tools', () => {
  it('maps direct tools to annotation styles without a selection menu', () => {
    expect(annotationStyleForTool('highlight', 'pink')).toEqual({
      type: 'highlight',
      color: 'pink',
    });
    expect(annotationStyleForTool('underline', 'yellow')).toEqual({
      type: 'underline',
    });
    expect(annotationStyleForTool('eraser', 'yellow')).toBeNull();
  });

  it('replaces an exact same-type mark while preserving other styles', () => {
    const annotations = applyAnnotation(
      [existingAnnotation(), {
        id: 'underline',
        anchor: { ...anchor },
        style: { type: 'underline' },
        createdAt: 1,
      }],
      anchor,
      { type: 'highlight', color: 'pink' },
      2,
    );

    expect(annotations.map(({ id, style }) => [id, style.type])).toEqual([
      ['underline', 'underline'],
      ['annotation-2-2', 'highlight'],
    ]);
  });

  it('erases the selected range across every intersecting annotation', () => {
    const annotations = eraseAnnotations(
      [
        {
          ...existingAnnotation(),
          anchor: { blockId: 'block-1', start: 0, end: 10 },
        },
        {
          id: 'other-block',
          anchor: { blockId: 'block-2', start: 0, end: 10 },
          style: { type: 'underline' },
          createdAt: 1,
        },
      ],
      { blockId: 'block-1', start: 4, end: 6 },
    );

    expect(annotations.map(({ anchor: result }) => [result.blockId, result.start, result.end])).toEqual([
      ['block-1', 0, 4],
      ['block-1', 6, 10],
      ['block-2', 0, 10],
    ]);
  });
});