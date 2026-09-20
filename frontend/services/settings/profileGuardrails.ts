export const CORE_PROFILE_SECTIONS = ['主修技术', '技术栈', '学习目标', '薄弱点'] as const;

export type ProfileDiffKind = 'same' | 'add' | 'remove';

export interface ProfileDiffLine {
  kind: ProfileDiffKind;
  text: string;
}

export function findMissingCoreSections(markdown: string): string[] {
  const headings = new Set(
    markdown
      .split(/\r?\n/)
      .map((line) => line.match(/^##\s+(.+?)\s*$/)?.[1])
      .filter((value): value is string => Boolean(value)),
  );
  return CORE_PROFILE_SECTIONS.filter((section) => !headings.has(section));
}

export function insertProfileSection(markdown: string, section: string): string {
  if (findMissingCoreSections(markdown).includes(section)) {
    const base = markdown.replace(/\s+$/, '');
    return `${base}${base ? '\n\n' : ''}## ${section}\n`;
  }
  return markdown;
}

export function diffProfileVersions(before: string, after: string): ProfileDiffLine[] {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const table = Array.from({ length: beforeLines.length + 1 }, () =>
    Array<number>(afterLines.length + 1).fill(0),
  );

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        beforeLines[i] === afterLines[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const diff: ProfileDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      diff.push({ kind: 'same', text: beforeLines[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      diff.push({ kind: 'remove', text: beforeLines[i] });
      i += 1;
    } else {
      diff.push({ kind: 'add', text: afterLines[j] });
      j += 1;
    }
  }
  while (i < beforeLines.length) {
    diff.push({ kind: 'remove', text: beforeLines[i] });
    i += 1;
  }
  while (j < afterLines.length) {
    diff.push({ kind: 'add', text: afterLines[j] });
    j += 1;
  }
  return diff;
}
