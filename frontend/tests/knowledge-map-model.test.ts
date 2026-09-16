/** 知识点契约：领域归一化、无向边归一化与整图校验。 */

import { describe, expect, it } from 'vitest';

import {
  canPublish,
  collectPublishBlockers,
  domainMatches,
  isDomainAncestor,
  isSlug,
  normalizeDomains,
  normalizeEdge,
  findDeprecatedPoints,
  findUnrefinedPoints,
  normalizeGraph,
  normalizeVocabulary,
  nonLeafDomains,
  validateGraph,
  validateVocabulary,
} from '../services/knowledge-map/model';
import type { Domain, KnowledgeGraph } from '../services/knowledge-map/types';

function graphOf(overrides: Partial<KnowledgeGraph> = {}): KnowledgeGraph {
  return {
    knowledgePoints: [
      { id: 'python', label: 'Python', domains: ['编程语言/Python'] },
      {
        id: 'python.closure',
        label: '闭包',
        domains: ['编程语言/Python'],
      },
      {
        id: 'python.decorator',
        label: '装饰器',
        domains: ['编程语言/Python'],
        aliases: ['Python 装饰器', 'decorator'],
      },
    ],
    edges: [
      { from: 'python', to: 'python.decorator', type: 'contains' },
      { from: 'python.closure', to: 'python.decorator', type: 'prerequisite' },
    ],
    ...overrides,
  };
}

describe('领域路径', () => {
  it('按分隔符判断祖先，不做裸前缀比较', () => {
    expect(isDomainAncestor('编程语言', '编程语言/Python')).toBe(true);
    expect(isDomainAncestor('编程语言', '编程语言工具')).toBe(false);
    expect(isDomainAncestor('编程语言/Python', '编程语言')).toBe(false);
  });

  it('过滤时命中自身与后代', () => {
    expect(domainMatches('编程语言/Python', '编程语言')).toBe(true);
    expect(domainMatches('编程语言', '编程语言')).toBe(true);
    expect(domainMatches('机器学习', '编程语言')).toBe(false);
  });

  it('归一化时删除被后代蕴含的祖先、去重并排序', () => {
    expect(normalizeDomains(['编程语言/Python', '编程语言', '机器学习', '编程语言/Python'])).toEqual([
      '机器学习',
      '编程语言/Python',
    ]);
  });

  it('清理空白项与首尾分隔符', () => {
    expect(normalizeDomains(['  ', '/机器学习/', ''])).toEqual(['机器学习']);
  });
});

describe('slug', () => {
  it('接受层级与多词形态', () => {
    expect(isSlug('python')).toBe(true);
    expect(isSlug('python.decorator')).toBe(true);
    expect(isSlug('python.list-comprehension')).toBe(true);
  });

  it('拒绝大写、空格与连续分隔符', () => {
    expect(isSlug('Python')).toBe(false);
    expect(isSlug('python decorator')).toBe(false);
    expect(isSlug('python..decorator')).toBe(false);
  });
});

describe('边归一化', () => {
  it('related 边按 id 排序，避免反向重复', () => {
    expect(normalizeEdge({ from: 'python', to: 'ml', type: 'related' })).toEqual({
      from: 'ml',
      to: 'python',
      type: 'related',
    });
  });

  it('有向边保持方向不变', () => {
    const edge = { from: 'python.closure', to: 'python.decorator', type: 'prerequisite' } as const;
    expect(normalizeEdge(edge)).toEqual(edge);
  });
});

describe('整图归一化', () => {
  it('归一化各知识点的领域列表', () => {
    const graph = graphOf({
      knowledgePoints: [
        { id: 'python', label: 'Python', domains: ['编程语言', '编程语言/Python'] },
      ],
      edges: [],
    });
    expect(normalizeGraph(graph).knowledgePoints[0].domains).toEqual(['编程语言/Python']);
  });

  it('别名去重但保留顺序', () => {
    const graph = graphOf({
      knowledgePoints: [
        {
          id: 'python.decorator',
          label: '装饰器',
          domains: ['编程语言/Python'],
          aliases: ['decorator', 'Python 装饰器', 'decorator'],
        },
      ],
      edges: [],
    });
    expect(normalizeGraph(graph).knowledgePoints[0].aliases).toEqual([
      'decorator',
      'Python 装饰器',
    ]);
  });
});

describe('整图校验', () => {
  it('接受合法图', () => {
    expect(validateGraph(graphOf())).toEqual({ valid: true, errors: [] });
  });

  it('拒绝重复 id', () => {
    const graph = graphOf({
      knowledgePoints: [
        { id: 'python', label: 'Python', domains: ['编程语言'] },
        { id: 'python', label: '另一个 Python', domains: ['编程语言'] },
      ],
      edges: [],
    });
    expect(validateGraph(graph).errors).toContain('知识点 id 重复：python');
  });

  it('拒绝引用不存在的知识点', () => {
    const graph = graphOf({
      edges: [{ from: 'python', to: 'missing', type: 'contains' }],
    });
    expect(validateGraph(graph).errors).toContain('边引用了不存在的知识点：python -> missing');
  });

  it('拒绝自环与重复 related 边', () => {
    const graph = graphOf({
      edges: [
        { from: 'python', to: 'python', type: 'contains' },
        { from: 'python', to: 'python.closure', type: 'related' },
        { from: 'python.closure', to: 'python', type: 'related' },
      ],
    });
    const { errors } = validateGraph(graph);
    expect(errors).toContain('边不允许自环：python');
    expect(errors).toContain('related 边重复：python|python.closure');
  });

  it('报告同时包含祖先与后代的领域列表，而不是静默接受', () => {
    const graph = graphOf({
      knowledgePoints: [
        { id: 'python', label: 'Python', domains: ['编程语言', '编程语言/Python'] },
      ],
      edges: [],
    });
    expect(validateGraph(graph).errors).toContain(
      'domain 列表同时包含祖先与后代，应只写最具体的路径：python',
    );
  });

  it('拒绝缺少 label 或 domain 的知识点', () => {
    const graph = graphOf({
      knowledgePoints: [{ id: 'python', label: '  ', domains: [] }],
      edges: [],
    });
    const { errors } = validateGraph(graph);
    expect(errors).toContain('知识点缺少 label：python');
    expect(errors).toContain('知识点缺少 domain：python');
  });
});

describe('领域词表', () => {
  const vocabulary: Domain[] = [
    { path: '编程语言', description: '通用编程语言与相关技术' },
    { path: '编程语言/Python' },
    { path: '机器学习' },
  ];

  it('词表允许父子并存，不删除祖先', () => {
    expect(normalizeVocabulary(vocabulary).map((domain) => domain.path)).toEqual([
      '机器学习',
      '编程语言',
      '编程语言/Python',
    ]);
  });

  it('归一化时规范路径、去重并排序', () => {
    const normalized = normalizeVocabulary([
      { path: '机器学习' },
      { path: '/编程语言/Python/' },
      { path: '机器学习' },
    ]);
    expect(normalized.map((domain) => domain.path)).toEqual(['机器学习', '编程语言/Python']);
  });

  it('报告重复与空路径', () => {
    const { errors } = validateVocabulary([
      { path: '机器学习' },
      { path: '机器学习' },
      { path: '  ' },
    ]);
    expect(errors).toContain('领域 path 重复：机器学习');
    expect(errors).toContain('领域缺少 path');
  });

  it('传入词表时拒绝引用词表外的领域', () => {
    const graph = graphOf({
      knowledgePoints: [{ id: 'python', label: 'Python', domains: ['编程语言/Go'] }],
      edges: [],
    });
    expect(validateGraph(graph, { vocabulary }).errors).toContain(
      '知识点引用了词表外的领域：python -> 编程语言/Go',
    );
  });

  it('传入词表时接受词表内的领域', () => {
    expect(validateGraph(graphOf(), { vocabulary })).toEqual({ valid: true, errors: [] });
  });

  it('不传词表时不校验领域归属', () => {
    const graph = graphOf({
      knowledgePoints: [{ id: 'python', label: 'Python', domains: ['任意领域'] }],
      edges: [],
    });
    expect(validateGraph(graph).valid).toBe(true);
  });
});

describe('领域过滤的容错', () => {
  it('容忍未规范化的入参', () => {
    expect(domainMatches('/编程语言/Python/', '编程语言/')).toBe(true);
  });
});

describe('领域演化', () => {
  const vocabulary: Domain[] = [
    { path: '后端' },
    { path: '后端/编程语言' },
    { path: '后端/编程语言/Java' },
    { path: '后端/数据库' },
    { path: 'Web前端', status: 'deprecated', replacedBy: '前端' },
    { path: '前端' },
  ];

  it('识别非叶子领域', () => {
    expect([...nonLeafDomains(vocabulary)].sort()).toEqual(['后端', '后端/编程语言']);
  });

  it('待细化清单收拢挂在非叶子领域上的知识点', () => {
    const graph = graphOf({
      knowledgePoints: [
        { id: 'java', label: 'Java 基础', domains: ['后端'] },
        { id: 'java.collections', label: '集合', domains: ['后端/编程语言/Java'] },
        { id: 'css', label: 'CSS', domains: ['前端'] },
      ],
      edges: [],
    });
    expect(findUnrefinedPoints(graph, vocabulary).map((point) => point.id)).toEqual(['java']);
  });

  it('待迁移清单收拢引用了废弃领域的知识点', () => {
    const graph = graphOf({
      knowledgePoints: [
        { id: 'css', label: 'CSS', domains: ['Web前端'] },
        { id: 'html', label: 'HTML', domains: ['前端'] },
      ],
      edges: [],
    });
    expect(findDeprecatedPoints(graph, vocabulary).map((point) => point.id)).toEqual(['css']);
  });

  it('粗归属与废弃引用都是合法的，不由校验报错', () => {
    const graph = graphOf({
      knowledgePoints: [{ id: 'java', label: 'Java 基础', domains: ['后端'] }],
      edges: [],
    });
    expect(validateGraph(graph, { vocabulary })).toEqual({ valid: true, errors: [] });
  });

  it('校验 replacedBy 的指向', () => {
    expect(validateVocabulary([{ path: 'a', status: 'deprecated', replacedBy: 'missing' }]).errors)
      .toContain('领域的 replacedBy 指向词表外的路径：a -> missing');
    expect(validateVocabulary([{ path: 'a', status: 'deprecated', replacedBy: 'a' }]).errors)
      .toContain('领域的 replacedBy 不能指向自己：a');
  });
});

describe('发布门禁（版本隔离）', () => {
  const vocabulary: Domain[] = [
    { path: '后端' },
    { path: '后端/编程语言' },
    { path: '后端/编程语言/Java' },
    { path: '前端' },
    { path: 'Web前端', status: 'deprecated', replacedBy: '前端' },
  ];

  function graphWith(domains: string[]): KnowledgeGraph {
    return {
      knowledgePoints: [{ id: 'java', label: 'Java 基础', domains }],
      edges: [],
    };
  }

  it('工作态允许粗归属：结构校验通过，但发布门禁拦住', () => {
    const graph = graphWith(['后端']);
    expect(validateGraph(graph, { vocabulary }).valid).toBe(true);
    expect(canPublish(graph, vocabulary)).toBe(false);
    expect(collectPublishBlockers(graph, vocabulary).map((blocker) => blocker.code)).toEqual([
      'unrefined',
    ]);
  });

  it('工作态允许废弃引用：结构校验通过，但发布门禁拦住', () => {
    const graph = graphWith(['Web前端']);
    expect(validateGraph(graph, { vocabulary }).valid).toBe(true);
    expect(collectPublishBlockers(graph, vocabulary).map((blocker) => blocker.code)).toEqual([
      'deprecated',
    ]);
  });

  it('消除中间态后可以发布', () => {
    expect(canPublish(graphWith(['后端/编程语言/Java']), vocabulary)).toBe(true);
  });

  it('门禁给出可执行清单而不是一句失败', () => {
    const { message } = collectPublishBlockers(graphWith(['后端']), vocabulary)[0];
    expect(message).toContain('java');
    expect(message).toContain('未细化');
  });

  it('词表或结构不合法时同样阻塞', () => {
    const brokenGraph: KnowledgeGraph = {
      knowledgePoints: [{ id: 'Bad-Id', label: 'x', domains: ['前端'] }],
      edges: [],
    };
    expect(collectPublishBlockers(brokenGraph, vocabulary).map((blocker) => blocker.code)).toContain(
      'invalid',
    );
  });
});