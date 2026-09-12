import type {
  TextbookChapter,
  TextbookDocument,
  TextbookSummary,
} from '../../services/textbook/types';

export const textbookCatalog: TextbookSummary[] = [
  {
    id: 'calculus',
    title: '微积分',
    subtitle: '从变化到模型',
    category: '数学',
    code: 'MATH 01',
    edition: '2026',
    chapterCount: 12,
    progress: 68,
    status: 'learning',
    theme: 'jade',
  },
  {
    id: 'linear-algebra',
    title: '线性代数',
    subtitle: '向量、空间与几何直觉',
    category: '数学',
    code: 'MATH 02',
    edition: '2026',
    chapterCount: 10,
    progress: 42,
    status: 'learning',
    theme: 'navy',
  },
  {
    id: 'probability',
    title: '概率统计',
    subtitle: '不确定性的语言',
    category: '数学',
    code: 'MATH 03',
    edition: '2026',
    chapterCount: 9,
    progress: 73,
    status: 'learning',
    theme: 'sky',
  },
  {
    id: 'physics',
    title: '大学物理',
    subtitle: '力学与波',
    category: '物理',
    code: 'PHYS 01',
    edition: '2026',
    chapterCount: 11,
    progress: 18,
    status: 'queued',
    theme: 'slate',
  },
  {
    id: 'python',
    title: 'Python',
    subtitle: '程序设计基础',
    category: '计算机',
    code: 'CS 01',
    edition: '2026',
    chapterCount: 14,
    progress: 86,
    status: 'learning',
    theme: 'coral',
  },
  {
    id: 'artificial-intelligence',
    title: '人工智能',
    subtitle: '从搜索到学习',
    category: '人工智能',
    code: 'AI 01',
    edition: '2026',
    chapterCount: 12,
    progress: 24,
    status: 'queued',
    theme: 'amber',
  },
  {
    id: 'data-structures',
    title: '数据结构',
    subtitle: '抽象、实现与算法',
    category: '计算机',
    code: 'CS 02',
    edition: '2026',
    chapterCount: 16,
    progress: 55,
    status: 'learning',
    theme: 'plum',
  },
  {
    id: 'cognitive-psychology',
    title: '认知心理学',
    subtitle: '注意、记忆与思考',
    category: '心理',
    code: 'PSY 01',
    edition: '2026',
    chapterCount: 10,
    progress: 0,
    status: 'ready',
    theme: 'indigo',
  },
];

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
        blocks: [
          {
            id: 'heading-function-relation',
            type: 'heading',
            level: 2,
            title: '函数是关系，不是公式',
          },
          {
            id: 'block-functions-prose',
            type: 'prose',
            paragraphs: [
              '函数不是公式的别名，而是一种稳定的对应关系。给定一个输入，它只产生一个确定的输出。',
              '学习微积分时，最值得关注的不是单点数值，而是输入变化时输出如何变化。图像、表格和公式只是同一关系的三种表达。',
            ],
          },
          {
            id: 'block-functions-callout',
            type: 'callout',
            tone: 'tip',
            title: '先问变量',
            body: '面对新问题时，先写出“谁在变化、随谁变化、变化范围是什么”，比立即套公式更有效。',
          },
          {
            id: 'heading-function-representations',
            type: 'heading',
            level: 3,
            title: '图像、表格与公式',
          },
          {
            id: 'block-functions-formula',
            type: 'formula',
            expression: 'f: A -> B，x -> f(x)',
            caption: '函数把定义域 A 中的元素映射到值域 B。',
          },
        ],
      },
      {
        id: 'section-limit-language',
        title: '1.2 极限的语言',
        summary: '用“无限接近”替代“直接到达”，研究函数在某点附近的行为。',
        estimatedMinutes: 24,
        kind: 'lesson',
        objectives: ['理解极限的直观含义', '区分函数值与极限值', '观察数值逼近过程'],
        knowledgePoints: ['极限', '单侧极限', '连续性'],
        blocks: [
          {
            id: 'heading-limit-intuition',
            type: 'heading',
            level: 2,
            title: '无限接近意味着什么',
          },
          {
            id: 'block-limit-prose',
            type: 'prose',
            paragraphs: [
              '极限关心的不是 x 等于某点时发生了什么，而是 x 越来越接近该点时，f(x) 趋向哪里。',
              '这使得我们可以处理函数在某点没有定义，却在附近具有稳定趋势的情况。',
            ],
          },
          {
            id: 'heading-limit-numeric',
            type: 'heading',
            level: 3,
            title: '用数值逼近观察趋势',
          },
          {
            id: 'block-limit-code',
            type: 'code',
            language: 'javascript',
            caption: '用越来越小的步长观察函数趋势',
            code: `const f = (x) => (x * x - 1) / (x - 1);\nfor (const d of [0.1, 0.01, 0.001, 0.0001]) {\n  console.log((1 + d).toFixed(4), f(1 + d).toFixed(4));\n}`,
          },
          {
            id: 'block-limit-sandbox',
            type: 'sandbox',
            title: '观察趋近过程',
            description: '修改步长和中心点，观察输出是否稳定趋近同一个值。',
            language: 'javascript',
            entry: 'main.js',
            starterCode: `const f = (x) => Math.sin(x) / x;\n\nfor (const x of [1, 0.5, 0.1, 0.01, 0.001]) {\n  console.log(x, f(x));\n}`,
          },
        ],
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
        blocks: [
          {
            id: 'heading-average-rate',
            type: 'heading',
            level: 2,
            title: '平均变化率',
          },
          {
            id: 'block-tangent-prose',
            type: 'prose',
            paragraphs: [
              '平均变化率描述一段区间内的整体变化，而瞬时变化率只关心某一点附近的变化趋势。',
              '把区间长度 h 不断缩小，割线逐渐稳定到切线，这个极限就是导数。',
            ],
          },
          {
            id: 'heading-instantaneous-rate',
            type: 'heading',
            level: 3,
            title: '从割线到切线',
          },
          {
            id: 'block-tangent-formula',
            type: 'formula',
            expression: "f'(x) = lim(h -> 0) [f(x + h) - f(x)] / h",
            caption: '差商的极限定义了函数在 x 处的瞬时变化率。',
          },
        ],
      },
      {
        id: 'section-numerical-derivative',
        title: '2.2 数值微分实验',
        summary: '用有限差分近似导数，比较不同步长下的误差。',
        estimatedMinutes: 20,
        kind: 'sandbox',
        objectives: ['实现中心差分', '观察步长与误差关系'],
        knowledgePoints: ['有限差分', '数值误差'],
        blocks: [
          {
            id: 'heading-center-difference',
            type: 'heading',
            level: 2,
            title: '中心差分近似',
          },
          {
            id: 'block-numerical-prose',
            type: 'prose',
            paragraphs: [
              '计算机无法真正让 h 等于零，因此必须选择足够小又不会放大浮点误差的步长。',
            ],
          },
          {
            id: 'block-numerical-sandbox',
            type: 'sandbox',
            title: '数值导数工作台',
            description: '运行中心差分，并比较不同 h 的近似结果。',
            language: 'javascript',
            entry: 'main.js',
            starterCode: `const f = (x) => x * x;\nconst exact = (x) => 2 * x;\n\nfor (const h of [0.1, 0.01, 0.001, 0.0001]) {\n  const x = 3;\n  const approx = (f(x + h) - f(x - h)) / (2 * h);\n  console.log(h, approx, Math.abs(approx - exact(x)));\n}`,
          },
        ],
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
        blocks: [
          {
            id: 'heading-area-accumulation',
            type: 'heading',
            level: 2,
            title: '从面积到累积量',
          },
          {
            id: 'block-area-prose',
            type: 'prose',
            paragraphs: [
              '当量本身会随位置或时间变化时，总累积量不能简单用“速率乘以区间”得到。',
              '把区间切成许多小段，在每一小段上把变化近似为常数，再把所有贡献加起来。',
            ],
          },
          {
            id: 'heading-area-limit',
            type: 'heading',
            level: 3,
            title: '分割与极限',
          },
          {
            id: 'block-area-callout',
            type: 'callout',
            tone: 'info',
            title: '极限思想再次出现',
            body: '切得越细，每一段的近似越简单，总和却越接近真实累积量。',
          },
        ],
      },
      {
        id: 'section-riemann',
        title: '3.2 黎曼和沙盒',
        summary: '通过调整分割数量，观察近似面积如何收敛。',
        estimatedMinutes: 18,
        kind: 'sandbox',
        objectives: ['实现黎曼和', '观察误差收敛'],
        knowledgePoints: ['黎曼和', '收敛'],
        blocks: [
          {
            id: 'heading-riemann-approximation',
            type: 'heading',
            level: 2,
            title: '矩形近似',
          },
          {
            id: 'block-riemann-sandbox',
            type: 'sandbox',
            title: '黎曼和计算器',
            description: '修改 n，观察矩形数量增加时面积近似如何变化。',
            language: 'javascript',
            entry: 'main.js',
            starterCode: `const f = (x) => x * x;\nconst a = 0;\nconst b = 1;\n\nfor (const n of [4, 10, 50, 100, 1000]) {\n  const dx = (b - a) / n;\n  let sum = 0;\n  for (let i = 0; i < n; i += 1) {\n    sum += f(a + (i + 0.5) * dx) * dx;\n  }\n  console.log(n, sum);\n}`,
          },
        ],
      },
    ],
  },
];

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
          blocks: [
            {
              id: `${summary.id}-heading-overview`,
              type: 'heading',
              level: 2,
              title: '学习范围',
            },
            {
              id: `${summary.id}-block-overview`,
              type: 'prose',
              paragraphs: [
                `本教材围绕“${summary.subtitle}”组织章节、概念和实验。`,
                '阅读时先关注概念之间的关系，再通过示例和沙盒验证理解。',
              ],
            },
            {
              id: `${summary.id}-block-note`,
              type: 'callout',
              tone: 'info',
              title: 'Agent 生成内容',
              body: '当前章节结构用于验证阅读器和内容块协议，正式内容将由教材生产线写入。',
            },
          ],
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
          blocks: [
            {
              id: `${summary.id}-heading-sandbox`,
              type: 'heading',
              level: 2,
              title: '核心实验',
            },
            {
              id: `${summary.id}-block-sandbox`,
              type: 'sandbox',
              title: `${summary.title}实验`,
              description: '运行 JavaScript，探索输入和输出之间的关系。',
              language: 'javascript',
              entry: 'main.js',
              starterCode: `const values = [1, 2, 3, 4, 5];\n\nfor (const value of values) {\n  console.log(value, value * value);\n}`,
            },
          ],
        },
      ],
    },
  ];
}

const documents: Record<string, TextbookDocument> = Object.fromEntries(
  textbookCatalog.map((summary) => [
    summary.id,
    {
      ...summary,
      version: '0.1.0-demo',
      chapters: summary.id === 'calculus' ? calculusChapters : buildStarterChapters(summary),
    },
  ]),
);

export function getTextbookDocument(textbookId: string): TextbookDocument {
  return documents[textbookId] ?? documents.calculus;
}

export function firstSectionId(document: TextbookDocument): string {
  return document.chapters[0]?.sections[0]?.id ?? '';
}
