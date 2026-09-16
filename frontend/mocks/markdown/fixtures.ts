import type { ContentBlock } from '../../services/textbook/types';

export const markdownRequirements = {
  'md.inline.emphasis': '强调与加粗',
  'md.inline.code': '行内代码',
  'md.structure.heading': '多级标题',
  'md.structure.list': '无序与有序列表',
  'md.structure.quote': '引用',
  'md.table.basic': '基础表格',
  'md.table.alignment': '表格列对齐',
  'md.table.inline': '表格单元格行内格式',
  'md.table.cjk': '表格中文与长内容',
  'md.table.invalid': '非法表格回退',
  'md.link.basic': '普通链接',
  'md.image.basic': '图片',
  'code.javascript': 'JavaScript fence',
  'code.python': 'Python fence',
  'code.unknown-language': '未知语言 fence',
  'code.caption': '代码 fence caption',
  'code.runtime.capability': '代码 fence runtime capability',
  'math.inline': '行内公式',
  'math.block': '块级公式',
  'math.matrix': '矩阵公式',
  'mermaid.flowchart': 'Mermaid flowchart fence',
  'sandbox.runtime': 'Sandbox runtime 模式',
  'directive.callout': 'Callout directive',
  'html.render': 'HTML 渲染模型',
  'fallback.unknown-directive': '未知 directive 回退',
} as const;

export type MarkdownRequirementId = keyof typeof markdownRequirements;

export type MarkdownFixtureKind =
  | 'standard'
  | 'extension'
  | 'custom'
  | 'failure'
  | 'interaction';

export interface MarkdownFixture {
  id: string;
  title: string;
  kind: MarkdownFixtureKind;
  covers: MarkdownRequirementId[];
  markdown: string;
  expectedBlockTypes: Array<ContentBlock['type']>;
  expectedWarnings: number;
}

export const markdownFixtures: MarkdownFixture[] = [
  {
    id: 'markdown-inline',
    title: '基础行内格式',
    kind: 'standard',
    covers: ['md.inline.emphasis', 'md.inline.code'],
    markdown: '函数不是公式的别名，而是**稳定的对应关系**。可以用 *变化率* 和 `f(x)` 描述它。',
    expectedBlockTypes: ['prose'],
    expectedWarnings: 0,
  },
  {
    id: 'markdown-structure',
    title: '文档结构',
    kind: 'standard',
    covers: ['md.structure.heading', 'md.structure.list', 'md.structure.quote'],
    markdown: `## 函数与变化

学习时先区分：

- 自变量
- 因变量
- 变化范围

> 函数关注输入与输出之间的稳定对应关系。`,
    expectedBlockTypes: ['heading', 'prose', 'list', 'quote'],
    expectedWarnings: 0,
  },
  {
    id: 'markdown-table',
    title: 'GFM 表格',
    kind: 'standard',
    covers: [
      'md.table.basic',
      'md.table.alignment',
      'md.table.inline',
      'md.table.cjk',
    ],
    markdown: `| 函数 | 定义域 | 主要特征 |
| :--- | :---: | ---: |
| \`f(x)=x^2\` | 全体实数 | **偶函数** |
| \`g(x)=1/x\` | x ≠ 0 | 在零点没有定义 |
| 分段函数 | 按分支确定 | [说明](https://example.com) |`,
    expectedBlockTypes: ['table'],
    expectedWarnings: 0,
  },
  {
    id: 'markdown-link-image',
    title: '链接与图片',
    kind: 'standard',
    covers: ['md.link.basic', 'md.image.basic'],
    markdown: '[函数图像](https://example.com/graph) 和 ![函数示意图](https://example.com/graph.png)',
    expectedBlockTypes: ['prose'],
    expectedWarnings: 0,
  },
  {
    id: 'code-fence',
    title: '普通代码 fence',
    kind: 'standard',
    covers: ['code.javascript', 'code.python', 'code.unknown-language', 'code.caption'],
    markdown: `\`\`\`javascript caption="JavaScript 示例"
const answer = 6 * 7;
console.log(answer);
\`\`\`

\`\`\`python caption="Python 示例"
print(sum(range(1, 6)))
\`\`\`

\`\`\`text
普通文本 fence
\`\`\``,
    expectedBlockTypes: ['code', 'code', 'code'],
    expectedWarnings: 0,
  },
  {
    id: 'sandbox-runtime',
    title: '代码 fence 的运行能力',
    kind: 'extension',
    covers: ['code.runtime.capability', 'sandbox.runtime'],
    markdown: `\`\`\`javascript caption="中心差分"
const f = (x) => x * x;
const h = 0.001;
console.log((f(3 + h) - f(3 - h)) / (2 * h));
\`\`\``,
    expectedBlockTypes: ['code'],
    expectedWarnings: 0,
  },
  {
    id: 'math',
    title: '行内与块级公式',
    kind: 'extension',
    covers: ['math.inline', 'math.block', 'math.matrix'],
    markdown: `行内公式 $f'(x)=\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}$。

$$
\\mathbf{A}=
\\begin{bmatrix}
a_{11} & a_{12} \\\\
a_{21} & a_{22}
\\end{bmatrix}
$$`,
    expectedBlockTypes: ['prose', 'formula'],
    expectedWarnings: 0,
  },
  {
    id: 'mermaid',
    title: 'Mermaid fence',
    kind: 'extension',
    covers: ['mermaid.flowchart'],
    markdown: `\`\`\`mermaid
flowchart LR
  A[输入] --> B[处理]
  B --> C[输出]
\`\`\``,
    expectedBlockTypes: ['mermaid'],
    expectedWarnings: 0,
  },
  {
    id: 'directive',
    title: 'Callout directive',
    kind: 'custom',
    covers: ['directive.callout'],
    markdown: `:::tip{title="先问变量"}
面对新问题时，先写出“谁在变化、随谁变化、变化范围是什么”。
:::`,
    expectedBlockTypes: ['callout'],
    expectedWarnings: 0,
  },
  {
    id: 'html',
    title: 'HTML 渲染模型',
    kind: 'extension',
    covers: ['html.render'],
    markdown: '<div class="notice">HTML 文本</div>',
    expectedBlockTypes: ['html'],
    expectedWarnings: 0,
  },
  {
    id: 'fallback-unknown-directive',
    title: '未知 directive',
    kind: 'failure',
    covers: ['fallback.unknown-directive', 'md.table.invalid'],
    markdown: `:::unknown
这段内容应保留源码。
:::

| broken |
| --- |
| row | extra |`,
    expectedBlockTypes: ['unsupported', 'table'],
    expectedWarnings: 1,
  },
];

export function findMarkdownFixture(id: string): MarkdownFixture {
  const fixture = markdownFixtures.find((item) => item.id === id);
  if (!fixture) throw new Error(`Unknown markdown fixture: ${id}`);
  return fixture;
}
