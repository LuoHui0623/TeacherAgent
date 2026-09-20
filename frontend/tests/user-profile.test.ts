import { describe, expect, it } from 'vitest';

import {
  CORE_PROFILE_SECTIONS,
  diffProfileVersions,
  findMissingCoreSections,
  insertProfileSection,
} from '../services/settings/profileGuardrails';

describe('用户画像编辑器护栏', () => {
  it('识别缺失的核心分区', () => {
    const markdown = '# 用户画像\n\n## 主修技术\n\nPython\n\n## 技术栈\n\n- Python（进阶）';

    expect(findMissingCoreSections(markdown)).toEqual(['学习目标', '薄弱点']);
  });

  it('核心分区齐全时不提示', () => {
    const markdown = CORE_PROFILE_SECTIONS.map((section) => `## ${section}\n`).join('\n');

    expect(findMissingCoreSections(markdown)).toEqual([]);
  });

  it('插入分区时保持 Markdown 结构', () => {
    const markdown = '# 用户画像\n\n## 主修技术\n\nPython';

    expect(insertProfileSection(markdown, '学习目标')).toBe(
      '# 用户画像\n\n## 主修技术\n\nPython\n\n## 学习目标\n',
    );
  });

  it('生成行级 diff', () => {
    expect(diffProfileVersions('A\nB', 'A\nC')).toEqual([
      { kind: 'same', text: 'A' },
      { kind: 'remove', text: 'B' },
      { kind: 'add', text: 'C' },
    ]);
  });
});
