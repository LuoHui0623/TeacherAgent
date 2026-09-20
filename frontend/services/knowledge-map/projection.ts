import type { OutlineNodePayload, OutlinePayload } from '../content-pipeline/contracts';
import type { KnowledgeGraph, KnowledgePoint } from './types';

export interface ProjectionChapter {
  id: string;
  outlineNodeId: string;
  title: string;
  summary?: string;
  depth: number;
  parentId?: string;
  knowledgePointIds: string[];
  children: ProjectionChapter[];
}

export interface ProjectionNode {
  id: string;
  kind: 'chapter' | 'knowledge';
  label: string;
  summary?: string;
  outlineNodeId?: string;
  sourceChapterIds: string[];
  depth: number;
}

export interface ProjectionEdge {
  from: string;
  to: string;
  type: 'contains' | 'prerequisite' | 'related';
}

export interface KnowledgeMapProjection {
  outlineId: string;
  title: string;
  chapters: ProjectionChapter[];
  nodes: ProjectionNode[];
  edges: ProjectionEdge[];
}

export interface PositionedProjectionNode extends ProjectionNode {
  x: number;
  y: number;
}

export interface PositionedProjection {
  nodes: PositionedProjectionNode[];
  edges: ProjectionEdge[];
  width: number;
  height: number;
}

function flattenOutline(
  items: OutlineNodePayload[],
  depth = 0,
  parentId?: string,
): ProjectionChapter[] {
  return items.map((item) => ({
    id: `chapter:${item.id}`,
    outlineNodeId: item.id,
    title: item.title,
    summary: item.summary,
    depth,
    parentId,
    knowledgePointIds: [...(item.knowledgePointIds ?? [])],
    children: flattenOutline(item.children ?? [], depth + 1, `chapter:${item.id}`),
  }));
}

function flattenChapters(chapters: ProjectionChapter[]): ProjectionChapter[] {
  return chapters.flatMap((chapter) => [chapter, ...flattenChapters(chapter.children)]);
}

function findKnowledgePoint(graph: KnowledgeGraph | undefined, id: string): KnowledgePoint | undefined {
  return graph?.knowledgePoints.find((point) => point.id === id);
}

export function projectOutlineToKnowledgeMap(
  outline: OutlinePayload,
  knowledgeGraph?: KnowledgeGraph,
): KnowledgeMapProjection {
  const chapters = flattenOutline(outline.items);
  const flatChapters = flattenChapters(chapters);
  const nodes: ProjectionNode[] = flatChapters.map((chapter) => ({
    id: chapter.id,
    kind: 'chapter',
    label: chapter.title,
    summary: chapter.summary,
    outlineNodeId: chapter.outlineNodeId,
    sourceChapterIds: [chapter.id],
    depth: chapter.depth,
  }));
  const edges: ProjectionEdge[] = [];
  const knowledgeToChapters = new Map<string, string[]>();

  for (const chapter of flatChapters) {
    for (const knowledgePointId of chapter.knowledgePointIds) {
      const knowledgeId = `knowledge:${knowledgePointId}`;
      const attached = knowledgeToChapters.get(knowledgeId) ?? [];
      attached.push(chapter.id);
      knowledgeToChapters.set(knowledgeId, attached);
      if (!nodes.some((node) => node.id === knowledgeId)) {
        const point = findKnowledgePoint(knowledgeGraph, knowledgePointId);
        nodes.push({
          id: knowledgeId,
          kind: 'knowledge',
          label: point?.label ?? knowledgePointId,
          summary: point?.summary,
          sourceChapterIds: [],
          depth: chapter.depth + 1,
        });
      }
      edges.push({ from: chapter.id, to: knowledgeId, type: 'contains' });
    }
  }

  for (const chapter of flatChapters) {
    const outlineNode = findOutlineNode(outline.items, chapter.outlineNodeId);
    for (const dependency of outlineNode?.buildsOn ?? []) {
      edges.push({
        from: `chapter:${dependency}`,
        to: chapter.id,
        type: 'prerequisite',
      });
    }
  }

  for (const node of nodes.filter((candidate) => candidate.kind === 'knowledge')) {
    node.sourceChapterIds = [...(knowledgeToChapters.get(node.id) ?? [])];
  }

  for (const edge of knowledgeGraph?.edges ?? []) {
    const from = `knowledge:${edge.from}`;
    const to = `knowledge:${edge.to}`;
    if (nodes.some((node) => node.id === from) && nodes.some((node) => node.id === to)) {
      edges.push({ from, to, type: edge.type });
    }
  }

  return {
    outlineId: outline.id,
    title: outline.title,
    chapters,
    nodes,
    edges: uniqueEdges(edges),
  };
}

function findOutlineNode(items: OutlineNodePayload[], id: string): OutlineNodePayload | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = findOutlineNode(item.children ?? [], id);
    if (nested) return nested;
  }
  return undefined;
}

function uniqueEdges(edges: ProjectionEdge[]): ProjectionEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function neighborhood(
  projection: KnowledgeMapProjection,
  centerId: string,
  radius = 1,
  maxNodes = 32,
): KnowledgeMapProjection {
  const distance = new Map<string, number>([[centerId, 0]]);
  const queue = [centerId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDistance = distance.get(current)!;
    if (currentDistance >= radius) continue;
    for (const edge of projection.edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
      if (!next || distance.has(next)) continue;
      distance.set(next, currentDistance + 1);
      queue.push(next);
    }
  }

  const selectedIds = new Set(
    [...distance.entries()]
      .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
      .slice(0, maxNodes)
      .map(([id]) => id),
  );
  return {
    ...projection,
    nodes: projection.nodes.filter((node) => selectedIds.has(node.id)),
    edges: projection.edges.filter(
      (edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to),
    ),
  };
}

export function layoutProjection(
  projection: KnowledgeMapProjection,
  centerId: string,
): PositionedProjection {
  const selected = neighborhood(projection, centerId);
  const distances = new Map<string, number>([[centerId, 0]]);
  const queue = [centerId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of selected.edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
      if (next && !distances.has(next)) {
        distances.set(next, (distances.get(current) ?? 0) + 1);
        queue.push(next);
      }
    }
  }

  const layers = new Map<number, ProjectionNode[]>();
  for (const node of selected.nodes) {
    const layer = distances.get(node.id) ?? 2;
    const nodes = layers.get(layer) ?? [];
    nodes.push(node);
    layers.set(layer, nodes);
  }

  const positioned: PositionedProjectionNode[] = [];
  for (const [layer, nodes] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    nodes.sort((left, right) => left.id.localeCompare(right.id));
    nodes.forEach((node, index) => {
      positioned.push({
        ...node,
        x: 140 + layer * 220,
        y: 100 + index * 92 - ((nodes.length - 1) * 46),
      });
    });
  }
  return { nodes: positioned, edges: selected.edges, width: 860, height: 360 };
}

/** 当前大纲快照：由 Outline 契约提供，供无后端连接时的工作区首屏展示。 */
export const currentOutlineSnapshot: OutlinePayload = {
  id: 'outline-current',
  briefId: 'brief-frontend-performance',
  title: '前端性能优化',
  coveredOutcomeIds: ['diagnose', 'plan', 'verify'],
  items: [
    {
      id: 'performance-metrics',
      title: '性能指标与测量',
      summary: '建立性能问题的测量与诊断基线。',
      knowledgePointIds: ['web-vitals', 'performance-timeline'],
      buildsOn: [],
      children: [],
    },
    {
      id: 'rendering-performance',
      title: '渲染性能',
      summary: '理解浏览器渲染路径与常见优化策略。',
      knowledgePointIds: ['browser-rendering', 'layout-thrashing'],
      buildsOn: ['performance-metrics'],
      children: [],
    },
    {
      id: 'network-cache',
      title: '网络与缓存',
      summary: '掌握网络瀑布、缓存策略和资源交付优化。',
      knowledgePointIds: ['network-performance', 'http-caching'],
      buildsOn: ['performance-metrics'],
      children: [],
    },
  ],
};
