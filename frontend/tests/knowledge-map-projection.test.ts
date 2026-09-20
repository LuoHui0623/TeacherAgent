import { describe, expect, it } from 'vitest';

import {
  currentOutlineSnapshot,
  layoutProjection,
  neighborhood,
  projectOutlineToKnowledgeMap,
} from '../services/knowledge-map/projection';

describe('outline knowledge projection', () => {
  it('projects outline chapters, knowledge points, source links, and prerequisite edges', () => {
    const projection = projectOutlineToKnowledgeMap(currentOutlineSnapshot);

    expect(projection.chapters).toHaveLength(3);
    expect(projection.nodes.filter((node) => node.kind === 'chapter')).toHaveLength(3);
    expect(projection.nodes.filter((node) => node.kind === 'knowledge')).toHaveLength(6);
    expect(projection.edges).toContainEqual({
      from: 'chapter:performance-metrics',
      to: 'chapter:rendering-performance',
      type: 'prerequisite',
    });
    expect(projection.nodes.find((node) => node.id === 'knowledge:web-vitals')?.sourceChapterIds)
      .toEqual(['chapter:performance-metrics']);
  });

  it('keeps the displayed neighborhood bounded and deterministic', () => {
    const projection = projectOutlineToKnowledgeMap(currentOutlineSnapshot);
    const view = neighborhood(projection, 'knowledge:web-vitals', 1, 4);
    const layout = layoutProjection(projection, 'knowledge:web-vitals');

    expect(view.nodes.length).toBeLessThanOrEqual(4);
    expect(layout.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});
