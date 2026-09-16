/**
 * 知识点模型的归一化与校验。
 *
 * 归一化（`normalizeVocabulary` / `normalizeDomains` / `normalizeEdge` / `normalizeGraph`）负责把数据修成规范形态；
 * 校验（`validateVocabulary` / `validateGraph`）只报告问题、不修改数据。两者分开，
 * 便于「校验用户输入」与「整理入库数据」分别使用。
 */

import type {
  Domain,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgePoint,
} from './types';

export const DOMAIN_SEPARATOR = '/';

const SLUG_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** slug 形态：小写字母与数字，层级用 `.`，多词用 `-`。如 `python.decorator`。 */
export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** 领域路径规范化：去空白、去首尾分隔符。 */
export function normalizeDomainPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 判断 `ancestor` 是否为 `descendant` 的祖先路径。
 *
 * 按分隔符匹配，不做裸前缀比较 —— 否则「编程语言」会被误判为「编程语言工具」的祖先。
 * 入参需已规范化为领域路径。
 */
export function isDomainAncestor(ancestor: string, descendant: string): boolean {
  return descendant.startsWith(`${ancestor}${DOMAIN_SEPARATOR}`);
}

/** 领域过滤：命中自身或其后代（对应 PRD「按领域过滤」）。容忍未规范化的入参。 */
export function domainMatches(domain: string, filter: string): boolean {
  const normalizedDomain = normalizeDomainPath(domain);
  const normalizedFilter = normalizeDomainPath(filter);
  return normalizedDomain === normalizedFilter
    || isDomainAncestor(normalizedFilter, normalizedDomain);
}

/**
 * 领域词表归一化：路径规范化、去重、按字典序排序。
 *
 * **注意**：词表允许父子并存（祖先可以有自己的展示名与说明），
 * 因此这里**不**做「删除被后代蕴含的祖先」—— 那条规则只适用于 KnowledgePoint 的 `domains`。
 */
export function normalizeVocabulary(domains: readonly Domain[]): Domain[] {
  const seen = new Set<string>();
  const normalized: Domain[] = [];
  for (const domain of domains) {
    const path = normalizeDomainPath(domain.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    normalized.push({ ...domain, path });
  }
  // 用码位比较而非 localeCompare：契约需要跨环境确定性，不依赖运行时的 ICU / 语言设置
  return normalized.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * 知识点领域列表归一化：
 * 1. 路径规范化并去掉空项
 * 2. 删除被后代蕴含的祖先 —— 同时写「编程语言」与「编程语言/Python」时，前者是冗余
 * 3. 去重
 * 4. 按字典序排序，避免顺序差异造成同一份数据有两种写法
 */
export function normalizeDomains(domains: readonly string[]): string[] {
  const cleaned = domains.map(normalizeDomainPath).filter((domain) => domain.length > 0);
  const unique = [...new Set(cleaned)];
  const minimal = unique.filter(
    (domain) => !unique.some((other) => other !== domain && isDomainAncestor(domain, other)),
  );
  return minimal.sort();
}

/** `related` 边无方向：按 id 排序归一化，避免出现反向重复边。有向边保持原方向。 */
export function normalizeEdge(edge: KnowledgeEdge): KnowledgeEdge {
  if (edge.type !== 'related' || edge.from <= edge.to) return edge;
  return { ...edge, from: edge.to, to: edge.from };
}

function normalizePoint(point: KnowledgePoint): KnowledgePoint {
  const normalized: KnowledgePoint = {
    ...point,
    domains: normalizeDomains(point.domains ?? []),
  };
  if (point.aliases) {
    // 去重但保留顺序：别名的先后可能表达常用度
    normalized.aliases = [...new Set(point.aliases)];
  }
  return normalized;
}

/** 整图归一化：领域列表 + 无向边。 */
export function normalizeGraph(graph: KnowledgeGraph): KnowledgeGraph {
  return {
    knowledgePoints: graph.knowledgePoints.map(normalizePoint),
    edges: graph.edges.map(normalizeEdge),
  };
}

export interface GraphValidation {
  valid: boolean;
  errors: string[];
}

export interface GraphValidationOptions {
  /**
   * 领域词表。传入时额外校验知识点的 `domains` 是否都来自词表 ——
   * 对应「先定义 Domain，后有 KnowledgePoint」。
   */
  vocabulary?: readonly Domain[];
}

function hasRedundantDomain(domains: readonly string[]): boolean {
  return domains.some((domain) =>
    domains.some((other) => other !== domain && isDomainAncestor(domain, other)),
  );
}

/** 校验领域词表。只报告问题，不修改数据。 */
export function validateVocabulary(domains: readonly Domain[]): GraphValidation {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const domain of domains) {
    const path = normalizeDomainPath(domain.path);
    if (!path) {
      errors.push('领域缺少 path');
      continue;
    }
    if (seen.has(path)) errors.push(`领域 path 重复：${path}`);
    seen.add(path);
  }
  for (const domain of domains) {
    if (!domain.replacedBy) continue;
    const path = normalizeDomainPath(domain.path);
    const target = normalizeDomainPath(domain.replacedBy);
    if (target === path) {
      errors.push(`领域的 replacedBy 不能指向自己：${path}`);
    } else if (!seen.has(target)) {
      errors.push(`领域的 replacedBy 指向词表外的路径：${path} -> ${domain.replacedBy}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** 词表里哪些路径是非叶子（存在更具体的后代）。 */
export function nonLeafDomains(vocabulary: readonly Domain[]): Set<string> {
  const paths = vocabulary
    .map((domain) => normalizeDomainPath(domain.path))
    .filter((path) => path.length > 0);
  const result = new Set<string>();
  for (const path of paths) {
    if (paths.some((other) => other !== path && isDomainAncestor(path, other))) {
      result.add(path);
    }
  }
  return result;
}

/**
 * 待细化清单：挂在**非叶子**领域上的知识点。
 *
 * 「允许粗归属」是增量演化的关键 —— 拆分领域时老知识点不必立即迁移，
 * 它们出现在这里，由用户按需细化到更具体的路径。
 */
export function findUnrefinedPoints(
  graph: KnowledgeGraph,
  vocabulary: readonly Domain[],
): KnowledgePoint[] {
  const nonLeaf = nonLeafDomains(vocabulary);
  return graph.knowledgePoints.filter((point) =>
    (point.domains ?? []).some((domain) => nonLeaf.has(normalizeDomainPath(domain))),
  );
}

/**
 * 待迁移清单：引用了**已废弃**领域的知识点。
 *
 * 废弃而非删除，正是为了让老引用仍然合法 —— 迁移是待办，不是错误。
 */
export function findDeprecatedPoints(
  graph: KnowledgeGraph,
  vocabulary: readonly Domain[],
): KnowledgePoint[] {
  const deprecated = new Set(
    vocabulary
      .filter((domain) => domain.status === 'deprecated')
      .map((domain) => normalizeDomainPath(domain.path)),
  );
  return graph.knowledgePoints.filter((point) =>
    (point.domains ?? []).some((domain) => deprecated.has(normalizeDomainPath(domain))),
  );
}

/** 校验整图。只报告问题，不修改数据。 */
export function validateGraph(
  graph: KnowledgeGraph,
  options: GraphValidationOptions = {},
): GraphValidation {
  const errors: string[] = [];

  const ids = new Set<string>();
  for (const point of graph.knowledgePoints) {
    if (!point.id) {
      errors.push('知识点缺少 id');
      continue;
    }
    if (!isSlug(point.id)) errors.push(`知识点 id 不是 slug 形态：${point.id}`);
    if (ids.has(point.id)) errors.push(`知识点 id 重复：${point.id}`);
    ids.add(point.id);
  }

  const vocabulary = options.vocabulary
    ? new Set(options.vocabulary.map((domain) => normalizeDomainPath(domain.path)))
    : null;

  for (const point of graph.knowledgePoints) {
    if (!point.label?.trim()) errors.push(`知识点缺少 label：${point.id}`);
    const domains = point.domains ?? [];
    if (domains.length === 0) errors.push(`知识点缺少 domain：${point.id}`);
    if (hasRedundantDomain(domains)) {
      errors.push(`domain 列表同时包含祖先与后代，应只写最具体的路径：${point.id}`);
    }
    if (vocabulary) {
      for (const domain of domains) {
        if (!vocabulary.has(normalizeDomainPath(domain))) {
          errors.push(`知识点引用了词表外的领域：${point.id} -> ${domain}`);
        }
      }
    }
  }

  const seenRelated = new Set<string>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      errors.push(`边引用了不存在的知识点：${edge.from} -> ${edge.to}`);
      continue;
    }
    if (edge.from === edge.to) {
      errors.push(`边不允许自环：${edge.from}`);
      continue;
    }
    if (edge.type === 'related') {
      const key = [edge.from, edge.to].sort().join('|');
      if (seenRelated.has(key)) errors.push(`related 边重复：${key}`);
      seenRelated.add(key);
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface PublishBlocker {
  code: 'invalid' | 'unrefined' | 'deprecated';
  message: string;
}

/**
 * 发布门禁：**发布态不允许中间态**。
 *
 * 工作态只需 `validateGraph` 通过即可；要推进到发布态，粗归属与废弃引用都必须清零。
 * 返回可执行的清单（而不是布尔值），让调用方能告诉用户「具体改哪些」。
 */
export function collectPublishBlockers(
  graph: KnowledgeGraph,
  vocabulary: readonly Domain[],
): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];

  const vocabularyCheck = validateVocabulary(vocabulary);
  if (!vocabularyCheck.valid) {
    blockers.push({
      code: 'invalid',
      message: `领域词表不合法：${vocabularyCheck.errors.join('；')}`,
    });
  }

  const graphCheck = validateGraph(graph, { vocabulary });
  if (!graphCheck.valid) {
    blockers.push({
      code: 'invalid',
      message: `知识图不合法：${graphCheck.errors.join('；')}`,
    });
  }

  const unrefined = findUnrefinedPoints(graph, vocabulary);
  if (unrefined.length > 0) {
    blockers.push({
      code: 'unrefined',
      message: `${unrefined.length} 个知识点挂在非叶子领域上未细化：${unrefined
        .map((point) => point.id)
        .join('、')}`,
    });
  }

  const deprecated = findDeprecatedPoints(graph, vocabulary);
  if (deprecated.length > 0) {
    blockers.push({
      code: 'deprecated',
      message: `${deprecated.length} 个知识点引用了已废弃领域：${deprecated
        .map((point) => point.id)
        .join('、')}`,
    });
  }

  return blockers;
}

/** 是否可以发布到发布态。 */
export function canPublish(graph: KnowledgeGraph, vocabulary: readonly Domain[]): boolean {
  return collectPublishBlockers(graph, vocabulary).length === 0;
}