/// <reference types="vite/client" />

import type {
  TextbookChapter,
  TextbookDocument,
  TextbookSummary,
} from '../services/textbook/types';

interface ChapterMetadata {
  id: string;
  title: string;
  summary: string;
}

interface TextbookMetadata extends TextbookSummary {
  publishedAt: string;
  revisedAt: string;
  revision: string;
  chapters: ChapterMetadata[];
}

const textbookMetadataFiles = import.meta.glob('./textbook/**/textbook.json', {
  eager: true,
  import: 'default',
}) as Record<string, TextbookMetadata>;
const markdownSources = import.meta.glob('./textbook/**/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const textbookBooks = Object.entries(textbookMetadataFiles).map(([metadataPath, metadata]) => ({
  directory: metadataPath.slice('./textbook/'.length, -'/textbook.json'.length),
  metadata,
}));

function chapterPrefix(directory: string, chapterId: string) {
  return `./textbook/${directory}/chapters/${chapterId}_`;
}

function validateGeneratedContent() {
  const errors: string[] = [];
  const bookIds = textbookBooks.map(({ metadata }) => metadata.id);
  const duplicateBookIds = bookIds.filter((id, index) => bookIds.indexOf(id) !== index);
  if (duplicateBookIds.length) {
    errors.push(`教材 id 重复：${[...new Set(duplicateBookIds)].join(', ')}`);
  }
  textbookBooks.forEach(({ directory, metadata }) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadata.id)) {
      errors.push(`教材 id 必须为 UUID：${directory}/textbook.json`);
    }
    if (!/^(0|[1-9]\d*)\.([1-9]\d*)\.(0|[1-9]\d*)$/.test(metadata.revision)) {
      errors.push(`教材 revision 必须符合 N.N.N，且发布版本从 1 开始：${directory}/textbook.json`);
    }
  });

  const declaredFiles = new Set<string>();
  textbookBooks.forEach(({ directory, metadata }) => {
    metadata.chapters.forEach((chapter, index) => {
      const expectedId = String(index + 1).padStart(2, '0');
      if (!/^\d{2}$/.test(chapter.id) || chapter.id !== expectedId) {
        errors.push(`章节 id 必须为连续两位数字序号：${directory}/chapters/${chapter.id}`);
      }

      const matchingFiles = Object.keys(markdownSources).filter((fileName) =>
        fileName.startsWith(chapterPrefix(directory, chapter.id)),
      );
      if (matchingFiles.length !== 1) {
        errors.push(`章节文件必须且只能匹配一个 id 前缀：${directory}/chapters/${chapter.id}_`);
      }
      matchingFiles.forEach((fileName) => declaredFiles.add(fileName));
    });
  });

  const sourceFiles = Object.keys(markdownSources);
  const undeclaredFiles = sourceFiles.filter((fileName) => !declaredFiles.has(fileName));
  const missingFiles = [...declaredFiles].filter((fileName) => !sourceFiles.includes(fileName));

  if (undeclaredFiles.length) errors.push(`未登记教材文件：${undeclaredFiles.join(', ')}`);
  if (missingFiles.length) errors.push(`缺少教材文件：${missingFiles.join(', ')}`);

  if (errors.length) {
    throw new Error(errors.join('；'));
  }
}

validateGeneratedContent();

function toTextbookSummary(metadata: TextbookMetadata): TextbookSummary {
  return {
    id: metadata.id,
    title: metadata.title,
    subtitle: metadata.subtitle,
    category: metadata.category,
    status: metadata.status,
  };
}

export const textbookCatalog: TextbookSummary[] = textbookBooks.map(({ metadata }) =>
  toTextbookSummary(metadata),
);

const calculusChapters: TextbookChapter[] = [
  {
    id: 'chapter-functions',
    title: '函数、变化与极限',
    summary: '先用函数描述变化，再建立极限这一研究局部行为的语言。',
    sections: [
      {
        id: 'section-functions-as-models',
        title: '1.1 函数作为模型',
        summary: '从现实变量关系抽象出函数，并理解定义域、值域与变化。',
        estimatedMinutes: 18,
        kind: 'lesson',
        objectives: ['识别自变量与因变量', '判断函数定义域', '用图像解释变化趋势'],
        knowledgePoints: ['函数', '定义域', '值域', '变化率'],
        markdown: String.raw`## 函数是关系，不是公式

函数不是公式的别名，而是一种**稳定的对应关系**。给定一个输入，它只产生一个确定的输出。

学习微积分时，最值得关注的不是单点数值，而是输入变化时输出如何变化。图像、表格和公式只是同一关系的三种表达。

:::tip{title="先问变量"}
面对新问题时，先写出“谁在变化、随谁变化、变化范围是什么”，比立即套公式更有效。
:::

### 图像、表格与公式

| 函数 | 定义域 | 主要特征 |
| :--- | :---: | ---: |
| ${'`'}f(x)=x^2${'`'} | 全体实数 | **偶函数** |
| ${'`'}g(x)=1/x${'`'} | x ≠ 0 | 在零点没有定义 |
| 分段函数 | 按分支确定 | 需要分别讨论 |

$$
\begin{aligned}
\mathbf{A}
&=
\begin{bmatrix}
a_{11} & a_{12} & \cdots & a_{1n} \\
a_{21} & a_{22} & \cdots & a_{2n} \\
\vdots & \vdots & \ddots & \vdots \\
a_{m1} & a_{m2} & \cdots & a_{mn}
\end{bmatrix},\\[6pt]
\mathbf{A}^{-1}
&=
\frac{1}{\det(\mathbf{A})}
\operatorname{adj}(\mathbf{A})
\end{aligned}
$$`,
      },
      {
        id: 'section-limit-language',
        title: '1.2 极限的语言',
        summary: '用“无限接近”替代“直接到达”，研究函数在某点附近的行为。',
        estimatedMinutes: 24,
        kind: 'sandbox',
        objectives: ['理解极限的直观含义', '区分函数值与极限值', '观察数值逼近过程'],
        knowledgePoints: ['极限', '单侧极限', '连续性'],
        markdown: String.raw`## 无限接近意味着什么

极限关心的不是 $x$ 等于某点时发生了什么，而是 $x$ 越来越接近该点时，$f(x)$ 趋向哪里。

这使得我们可以处理函数在某点没有定义，却在附近具有稳定趋势的情况。例如：

$$
\lim_{x\to 1}\frac{x^2-1}{x-1}=2
$$

### 用数值逼近观察趋势

下面的代码可以直接在普通 fence 与 Sandbox 模式之间切换。

${'```'}javascript caption="用越来越小的步长观察函数趋势"
const f = (x) => (x * x - 1) / (x - 1);
for (const d of [0.1, 0.01, 0.001, 0.0001]) {
  console.log((1 + d).toFixed(4), f(1 + d).toFixed(4));
}
${'```'}`,
      },
    ],
  },
  {
    id: 'chapter-derivatives',
    title: '导数与局部变化',
    summary: '把变化率从平均概念推进到瞬时概念，并用数值实验验证。',
    sections: [
      {
        id: 'section-tangent',
        title: '2.1 从割线到切线',
        summary: '让两个点不断靠近，用割线斜率逼近切线斜率。',
        estimatedMinutes: 22,
        kind: 'lesson',
        objectives: ['理解平均变化率', '构造差商', '解释导数的几何意义'],
        knowledgePoints: ['割线', '切线', '导数'],
        markdown: String.raw`## 平均变化率

平均变化率描述一段区间内的整体变化，而瞬时变化率只关心某一点附近的变化趋势。

把区间长度 $h$ 不断缩小，割线逐渐稳定到切线，这个极限就是导数。

### 从割线到切线

$$
\begin{aligned}
\frac{d}{dx}\left(
  \int_{\alpha(x)}^{\beta(x)} f(x,t)\,dt
\right)
={}&
f\bigl(x,\beta(x)\bigr)\beta'(x)
-f\bigl(x,\alpha(x)\bigr)\alpha'(x) \\
&+
\int_{\alpha(x)}^{\beta(x)}
\frac{\partial f}{\partial x}(x,t)\,dt
\end{aligned}
$$`,
      },
      {
        id: 'section-numerical-derivative',
        title: '2.2 数值微分实验',
        summary: '用有限差分近似导数，比较不同步长下的误差。',
        estimatedMinutes: 20,
        kind: 'sandbox',
        objectives: ['实现中心差分', '观察步长与误差关系'],
        knowledgePoints: ['有限差分', '数值误差'],
        markdown: String.raw`## 中心差分近似

计算机无法真正让 $h$ 等于零，因此必须选择足够小又不会放大浮点误差的步长。

${'```'}javascript caption="中心差分与精确值比较"
const f = (x) => x * x;
const exact = (x) => 2 * x;

for (const h of [0.1, 0.01, 0.001, 0.0001]) {
  const x = 3;
  const approx = (f(x + h) - f(x - h)) / (2 * h);
  console.log(h, approx, Math.abs(approx - exact(x)));
}
${'```'}`,
      },
    ],
  },
  {
    id: 'chapter-integrals',
    title: '积分与累积',
    summary: '从面积问题出发，把无限多个微小贡献累积为整体。',
    sections: [
      {
        id: 'section-area',
        title: '3.1 面积与累积量',
        summary: '用矩形近似曲线下方的面积，为黎曼和做准备。',
        estimatedMinutes: 20,
        kind: 'lesson',
        objectives: ['理解面积近似', '写出黎曼和'],
        knowledgePoints: ['定积分', '黎曼和'],
        markdown: String.raw`## 从面积到累积量

当量本身会随位置或时间变化时，总累积量不能简单用“速率乘以区间”得到。

把区间切成许多小段，在每一小段上把变化近似为常数，再把所有贡献加起来。

### 分割与极限

:::info{title="极限思想再次出现"}
切得越细，每一段的近似越简单，总和却越接近真实累积量。
:::`,
      },
      {
        id: 'section-riemann',
        title: '3.2 黎曼和沙盒',
        summary: '通过调整分割数量，观察近似面积如何收敛。',
        estimatedMinutes: 18,
        kind: 'sandbox',
        objectives: ['实现黎曼和', '观察误差收敛'],
        knowledgePoints: ['黎曼和', '收敛'],
        markdown: String.raw`## 矩形近似

下面的程序比较不同分割数量下的黎曼和。

${'```'}javascript caption="黎曼和计算器"
const f = (x) => x * x;
const a = 0;
const b = 1;

for (const n of [4, 10, 50, 100, 1000]) {
  const dx = (b - a) / n;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += f(a + (i + 0.5) * dx) * dx;
  }
  console.log(n, sum);
}
${'```'}`,
      },
    ],
  },
];

function getGeneratedChapters(directory: string, chapters: ChapterMetadata[]): TextbookChapter[] {
  return chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary,
    markdown: markdownSources[
      Object.keys(markdownSources).find((fileName) =>
        fileName.startsWith(chapterPrefix(directory, chapter.id)),
      ) ?? ''
    ],
  }));
}

function buildStarterChapters(summary: TextbookSummary): TextbookChapter[] {
  return [
    {
      id: `${summary.id}-chapter-foundation`,
      title: `${summary.title}：基础结构`,
      summary: `建立 ${summary.subtitle} 所需的概念地图与学习路径。`,
      sections: [
        {
          id: `${summary.id}-section-overview`,
          title: '1.1 学习路径',
          summary: '先建立整体结构，再进入关键概念。',
          estimatedMinutes: 15,
          kind: 'lesson',
          objectives: ['理解教材范围', '确认前置知识'],
          knowledgePoints: [summary.category, summary.title],
          markdown: `## 学习范围

本教材围绕“**${summary.subtitle}**”组织章节、概念和实验。

阅读时先关注概念之间的关系，再通过示例和沙盒验证理解。

:::info{title="Agent 生成内容"}
当前章节结构用于验证阅读器和内容块协议，正式内容将由教材生产线写入。
:::`,
        },
      ],
    },
    {
      id: `${summary.id}-chapter-practice`,
      title: `${summary.title}：概念与实验`,
      summary: '将核心概念放入可运行示例中验证。',
      sections: [
        {
          id: `${summary.id}-section-sandbox`,
          title: '2.1 核心沙盒',
          summary: '在浏览器中运行一个最小实验。',
          estimatedMinutes: 20,
          kind: 'sandbox',
          objectives: ['修改输入参数', '观察输出变化'],
          knowledgePoints: [summary.title, '实验'],
          markdown: `## 核心实验

运行 JavaScript，探索输入和输出之间的关系。

${'```'}javascript caption="${summary.title}实验"
const values = [1, 2, 3, 4, 5];

for (const value of values) {
  console.log(value, value * value);
}
${'```'}`,
        },
      ],
    },
  ];
}

function toMarkdownChapters(chapters: TextbookChapter[]): TextbookChapter[] {
  return chapters.flatMap((chapter) => {
    if (typeof chapter.markdown === 'string') return [chapter];
    return (chapter.sections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      summary: section.summary,
      markdown: section.markdown,
    }));
  });
}

const documents: Record<string, TextbookDocument> = Object.fromEntries(
  textbookBooks.map(({ directory, metadata }) => [
    metadata.id,
    {
      ...toTextbookSummary(metadata),
      version: metadata.revision,
      chapters: toMarkdownChapters(
        directory === 'calculus'
          ? calculusChapters
          : metadata.chapters.length
            ? getGeneratedChapters(directory, metadata.chapters)
            : buildStarterChapters(toTextbookSummary(metadata)),
      ),
    },
  ]),
);

export function getTextbookDocument(textbookId: string): TextbookDocument {
  const defaultTextbookId =
    textbookBooks.find(({ directory }) => directory === 'calculus')?.metadata.id ??
    textbookBooks[0].metadata.id;
  return documents[textbookId] ?? documents[defaultTextbookId];
}

export function firstSectionId(document: TextbookDocument): string {
  return document.chapters[0]?.id ?? document.chapters[0]?.sections?.[0]?.id ?? '';
}
