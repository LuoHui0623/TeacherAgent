export type HighlightColor = 'green' | 'yellow' | 'sky' | 'pink' | 'orange';

export type AnnotationStyle =
  | { type: 'highlight'; color: HighlightColor }
  | { type: 'underline' | 'bold' | 'strike' };

export interface TextAnchor {
  blockId: string;
  start: number;
  end: number;
  quote?: string;
  prefix?: string;
  suffix?: string;
}

export interface TextAnnotation {
  id: string;
  anchor: TextAnchor;
  style: AnnotationStyle;
  createdAt: number;
}

export interface LocatedAnnotation {
  annotation: TextAnnotation;
  start: number;
  end: number;
  order: number;
}

export interface AnnotationRun {
  text: string;
  start: number;
  end: number;
  annotations: TextAnnotation[];
}