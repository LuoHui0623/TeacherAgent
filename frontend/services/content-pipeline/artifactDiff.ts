import type { ArtifactVersion } from './types';

export type ArtifactDiffLineType = 'unchanged' | 'added' | 'removed';

export interface ArtifactDiffLine {
  type: ArtifactDiffLineType;
  value: string;
  beforeLine?: number;
  afterLine?: number;
}

export interface ArtifactDiffResult {
  beforeVersionId: string;
  afterVersionId: string;
  lines: ArtifactDiffLine[];
  added: number;
  removed: number;
  unchanged: number;
}

function extractComparableText(version: ArtifactVersion) {
  const payload = version.payload;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    for (const key of ['markdown', 'text', 'content']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
  }
  return JSON.stringify(payload, null, 2);
}

function splitLines(value: string) {
  return value.replace(/\r\n/g, '\n').split('\n');
}

export function diffText(before: string, after: string): ArtifactDiffLine[] {
  const left = splitLines(before);
  const right = splitLines(after);
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? matrix[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(
              matrix[leftIndex + 1][rightIndex],
              matrix[leftIndex][rightIndex + 1],
            );
    }
  }

  const lines: ArtifactDiffLine[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      lines.push({
        type: 'unchanged',
        value: left[leftIndex],
        beforeLine: leftIndex + 1,
        afterLine: rightIndex + 1,
      });
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      matrix[leftIndex + 1][rightIndex] >= matrix[leftIndex][rightIndex + 1]
    ) {
      lines.push({
        type: 'removed',
        value: left[leftIndex],
        beforeLine: leftIndex + 1,
      });
      leftIndex += 1;
    } else {
      lines.push({
        type: 'added',
        value: right[rightIndex],
        afterLine: rightIndex + 1,
      });
      rightIndex += 1;
    }
  }

  while (leftIndex < left.length) {
    lines.push({
      type: 'removed',
      value: left[leftIndex],
      beforeLine: leftIndex + 1,
    });
    leftIndex += 1;
  }
  while (rightIndex < right.length) {
    lines.push({
      type: 'added',
      value: right[rightIndex],
      afterLine: rightIndex + 1,
    });
    rightIndex += 1;
  }

  return lines;
}

export function diffArtifactVersions(
  before: ArtifactVersion,
  after: ArtifactVersion,
): ArtifactDiffResult {
  const lines = diffText(extractComparableText(before), extractComparableText(after));
  return {
    beforeVersionId: before.id,
    afterVersionId: after.id,
    lines,
    added: lines.filter((line) => line.type === 'added').length,
    removed: lines.filter((line) => line.type === 'removed').length,
    unchanged: lines.filter((line) => line.type === 'unchanged').length,
  };
}
