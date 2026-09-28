import type {
  AnnotationStyle,
  HighlightColor,
  TextAnchor,
  TextAnnotation,
} from '../annotations/annotationModel';
import { eraseAnnotationRange } from '../annotations/annotationRange';

export type ReadingTool =
  | 'read'
  | 'highlight'
  | 'underline'
  | 'strike'
  | 'bold'
  | 'eraser';

export function annotationStyleForTool(
  tool: ReadingTool,
  highlightColor: HighlightColor,
): AnnotationStyle | null {
  switch (tool) {
    case 'highlight':
      return { type: 'highlight', color: highlightColor };
    case 'underline':
      return { type: 'underline' };
    case 'strike':
      return { type: 'strike' };
    case 'bold':
      return { type: 'bold' };
    default:
      return null;
  }
}

export function applyAnnotation(
  annotations: TextAnnotation[],
  anchor: TextAnchor,
  style: AnnotationStyle,
  createdAt: number,
): TextAnnotation[] {
  return [
    ...annotations.filter(
      (annotation) =>
        annotation.anchor.blockId !== anchor.blockId ||
        annotation.anchor.start !== anchor.start ||
        annotation.anchor.end !== anchor.end ||
        annotation.style.type !== style.type,
    ),
    {
      id: `annotation-${createdAt}-${annotations.length}`,
      anchor,
      style,
      createdAt,
    },
  ];
}

export function eraseAnnotations(
  annotations: TextAnnotation[],
  anchor: TextAnchor,
): TextAnnotation[] {
  return annotations.flatMap((annotation) => {
    if (annotation.anchor.blockId !== anchor.blockId) return [annotation];
    return eraseAnnotationRange(annotation, anchor.start, anchor.end);
  });
}