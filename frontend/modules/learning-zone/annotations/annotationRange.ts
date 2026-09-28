import type {
  AnnotationRun,
  LocatedAnnotation,
  TextAnchor,
  TextAnnotation,
} from './annotationModel';

export type ResolvedAnchor = {
  start: number;
  end: number;
  status: 'exact' | 'relocated';
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function offsetAt(root: Node, container: Node, offset: number): number | null {
  if (container === root) {
    if (container.nodeType === 3) {
      return clamp(offset, 0, container.textContent?.length ?? 0);
    }
    return Array.from(container.childNodes)
      .slice(0, offset)
      .reduce((total, node) => total + (node.textContent?.length ?? 0), 0);
  }

  let total = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child === container) {
      if (child.nodeType === 3) {
        return total + clamp(offset, 0, child.textContent?.length ?? 0);
      }
      return total + Array.from(child.childNodes)
        .slice(0, offset)
        .reduce((innerTotal, node) => innerTotal + (node.textContent?.length ?? 0), 0);
    }

    if (child.contains(container)) {
      const nestedOffset = offsetAt(child, container, offset);
      return nestedOffset === null ? null : total + nestedOffset;
    }
    total += child.textContent?.length ?? 0;
  }

  return null;
}

export function domRangeToTextAnchor(
  range: Range,
  blockElement: HTMLElement,
): TextAnchor | null {
  const start = offsetAt(blockElement, range.startContainer, range.startOffset);
  const end = offsetAt(blockElement, range.endContainer, range.endOffset);
  const blockText = blockElement.textContent ?? '';
  if (start === null || end === null || end <= start) return null;

  const safeStart = clamp(start, 0, blockText.length);
  const safeEnd = clamp(end, safeStart, blockText.length);
  return createTextAnchor(
    blockElement.dataset.blockId ?? '',
    safeStart,
    safeEnd,
    blockText,
  );
}

export function createTextAnchor(
  blockId: string,
  start: number,
  end: number,
  blockText?: string,
): TextAnchor {
  const anchor: TextAnchor = { blockId, start, end };
  if (blockText === undefined) return anchor;

  anchor.quote = blockText.slice(start, end);
  anchor.prefix = blockText.slice(Math.max(0, start - 32), start);
  anchor.suffix = blockText.slice(end, Math.min(blockText.length, end + 32));
  return anchor;
}

function matchesContext(
  text: string,
  start: number,
  end: number,
  anchor: TextAnchor,
) {
  const prefix = anchor.prefix ?? '';
  const suffix = anchor.suffix ?? '';
  return (
    (!prefix || text.slice(Math.max(0, start - prefix.length), start).endsWith(prefix)) &&
    (!suffix || text.slice(end, end + suffix.length).startsWith(suffix))
  );
}

export function resolveAnnotationPosition(
  blockText: string,
  anchor: TextAnchor,
): ResolvedAnchor | null {
  const expectedStart = clamp(anchor.start, 0, blockText.length);
  const expectedEnd = clamp(anchor.end, expectedStart, blockText.length);
  if (
    expectedEnd > expectedStart &&
    (!anchor.quote || blockText.slice(expectedStart, expectedEnd) === anchor.quote)
  ) {
    return { start: expectedStart, end: expectedEnd, status: 'exact' };
  }

  if (!anchor.quote) return null;
  let searchFrom = 0;
  let best: ResolvedAnchor | null = null;
  while (searchFrom < blockText.length) {
    const start = blockText.indexOf(anchor.quote, searchFrom);
    if (start < 0) break;
    const end = start + anchor.quote.length;
    if (matchesContext(blockText, start, end, anchor)) {
      const candidate = { start, end, status: 'relocated' as const };
      if (!best || Math.abs(start - anchor.start) < Math.abs(best.start - anchor.start)) {
        best = candidate;
      }
    }
    searchFrom = start + 1;
  }
  return best;
}

export function locateAnnotations(
  blockText: string,
  annotations: TextAnnotation[],
): LocatedAnnotation[] {
  return annotations.flatMap((annotation, order) => {
    const position = resolveAnnotationPosition(blockText, annotation.anchor);
    return position ? [{ annotation, ...position, order }] : [];
  });
}

export function splitTextByAnnotations(
  text: string,
  annotations: TextAnnotation[],
): AnnotationRun[] {
  const located = locateAnnotations(text, annotations);
  const boundaries = Array.from(
    new Set([0, text.length, ...located.flatMap(({ start, end }) => [start, end])]),
  ).sort((left, right) => left - right);
  const runs: AnnotationRun[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;
    runs.push({
      text: text.slice(start, end),
      start,
      end,
      annotations: located
        .filter((item) => item.start <= start && item.end >= end)
        .sort((left, right) => left.order - right.order)
        .map(({ annotation }) => annotation),
    });
  }
  return runs;
}

export function eraseAnnotationRange(
  annotation: TextAnnotation,
  eraseStart: number,
  eraseEnd: number,
): TextAnnotation[] {
  const { start, end } = annotation.anchor;
  if (eraseEnd <= start || eraseStart >= end || eraseEnd <= eraseStart) {
    return [annotation];
  }

  const slices = [
    ...(start < eraseStart ? [[start, Math.min(eraseStart, end)] as const] : []),
    ...(eraseEnd < end ? [[Math.max(eraseEnd, start), end] as const] : []),
  ];
  return slices.map(([sliceStart, sliceEnd], index) => ({
    ...annotation,
    id: `${annotation.id}-slice-${index}`,
    anchor: {
      blockId: annotation.anchor.blockId,
      start: sliceStart,
      end: sliceEnd,
    },
  }));
}