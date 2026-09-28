import { describe, expect, it } from 'vitest';

import {
  eraseAnnotationRange,
  resolveAnnotationPosition,
  splitTextByAnnotations,
} from '../modules/learning-zone/annotations/annotationRange';
import type { TextAnnotation } from '../modules/learning-zone/annotations/annotationModel';

function annotation(
  id: string,
  start: number,
  end: number,
  type: 'highlight' | 'underline' = 'highlight',
): TextAnnotation {
  return {
    id,
    anchor: { blockId: 'block-1', start, end },
    style: type === 'highlight' ? { type, color: 'yellow' } : { type },
    createdAt: 1,
  };
}

describe('learning-zone annotation ranges', () => {
  it('keeps repeated text anchored by its logical range', () => {
    const text = 'API 是接口。API 是契约。';
    const first = annotation('first', 0, 3);
    const second = annotation('second', 8, 11);
    const runs = splitTextByAnnotations(text, [first, second]);

    expect(runs.filter((run) => run.annotations.length).map((run) => run.text)).toEqual([
      'API',
      'API',
    ]);
    expect(runs.find((run) => run.annotations[0]?.id === 'second')?.start).toBe(8);
  });

  it('renders overlapping annotations as independent active styles', () => {
    const runs = splitTextByAnnotations('abcdef', [
      annotation('highlight', 0, 4),
      annotation('underline', 2, 6, 'underline'),
    ]);

    expect(runs.map((run) => [run.text, run.annotations.map(({ id }) => id)])).toEqual([
      ['ab', ['highlight']],
      ['cd', ['highlight', 'underline']],
      ['ef', ['underline']],
    ]);
  });

  it('splits a mark when the erased range is inside it', () => {
    const result = eraseAnnotationRange(annotation('mark', 2, 10), 5, 7);

    expect(result.map(({ anchor }) => [anchor.start, anchor.end])).toEqual([
      [2, 5],
      [7, 10],
    ]);
  });

  it('relocates an annotation using quote and surrounding context', () => {
    const position = resolveAnnotationPosition('前置内容：目标文本；后置内容', {
      blockId: 'block-1',
      start: 0,
      end: 4,
      quote: '目标文本',
      prefix: '前置内容：',
      suffix: '；后置内容',
    });

    expect(position).toEqual({ start: 5, end: 9, status: 'relocated' });
  });
});