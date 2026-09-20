import { describe, expect, it } from 'vitest';

import type { OutlinePayload } from '../services/content-pipeline/contracts';
import { OutlineStore } from '../services/content-pipeline/outlineStore';
import type { ArtifactVersion } from '../services/content-pipeline/types';

const outline: OutlinePayload = {
  id: 'blueprint-outline-1',
  briefId: 'brief-1',
  title: '前端性能优化',
  coveredOutcomeIds: ['diagnose', 'design'],
  items: [
    {
      id: 'outline-1',
      title: '性能指标与测量',
      summary: '指标基础',
      knowledgePointIds: ['metrics'],
      buildsOn: [],
      children: [
        {
          id: 'outline-1-1',
          title: '核心指标',
          summary: '核心指标',
          knowledgePointIds: ['metrics'],
          buildsOn: [],
          children: [],
        },
      ],
    },
    {
      id: 'outline-2',
      title: '渲染性能',
      summary: '渲染基础',
      knowledgePointIds: ['rendering'],
      buildsOn: ['outline-1'],
      children: [],
    },
    {
      id: 'outline-3',
      title: '网络与缓存',
      summary: '网络优化',
      knowledgePointIds: ['network'],
      buildsOn: ['outline-2'],
      children: [],
    },
  ],
};

describe('outline store', () => {
  it('creates a versioned normalized outline and exposes writable items', () => {
    const store = new OutlineStore();
    const version = store.createVersion({
      outlineId: outline.id,
      id: 'outline-version-1',
      sourceArtifactVersionId: 'artifact-blueprint-v1',
      outline,
      createdBy: 'agent',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    expect(version.version).toBe(1);
    expect(version.items).toHaveLength(4);
    expect(version.items.find((item) => item.id === 'outline-1-1')?.parentId).toBe('outline-1');
    expect(store.listAvailableNodes(outline.id).map((item) => item.id)).toEqual([
      'outline-1',
      'outline-1-1',
    ]);
  });

  it('creates an outline version from a validated Outline artifact', () => {
    const store = new OutlineStore();
    const artifactVersion: ArtifactVersion = {
      id: 'artifact-blueprint-version-1',
      artifactId: 'artifact-blueprint',
      runId: 'run-1',
      producerNodeRunId: 'run-1:outline-architect',
      inputArtifactVersionIds: [],
      version: 1,
      status: 'validated',
      contractId: 'contract-outline-v1',
      payload: outline as unknown as ArtifactVersion['payload'],
      summary: 'Outline',
      parentVersionIds: [],
      createdAt: '2026-09-13T00:00:00.000Z',
    };

    const version = store.createVersionFromArtifact({
      id: 'outline-version-from-artifact',
      artifactVersion,
      createdBy: 'system',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    expect(version.sourceArtifactVersionId).toBe(artifactVersion.id);
    expect(version.items).toHaveLength(4);
  });
  it('claims work items and unlocks dependents after generation', () => {
    const store = new OutlineStore();
    store.createVersion({
      outlineId: outline.id,
      id: 'outline-version-1',
      outline,
      createdBy: 'agent',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    const claimed = store.claimNodes({
      outlineId: outline.id,
      count: 1,
      assignedTo: 'section-writer-1',
      updatedAt: '2026-09-13T00:01:00.000Z',
    });
    expect(claimed[0].id).toBe('outline-1');
    expect(claimed[0].work.status).toBe('assigned');
    expect(claimed[0].work.assignedTo).toBe('section-writer-1');

    store.startNode({
      outlineId: outline.id,
      nodeId: 'outline-1',
      updatedAt: '2026-09-13T00:02:00.000Z',
    });
    store.completeNode({
      outlineId: outline.id,
      nodeId: 'outline-1',
      artifactVersionId: 'draft-outline-1-v1',
      updatedAt: '2026-09-13T00:03:00.000Z',
    });

    expect(store.listAvailableNodes(outline.id).map((item) => item.id)).toContain('outline-2');
    expect(store.getNode(outline.id, 'outline-1').work.status).toBe('generated');
  });

  it('creates a new version on edit and marks dependent items stale', () => {
    const store = new OutlineStore();
    store.createVersion({
      outlineId: outline.id,
      id: 'outline-version-1',
      outline,
      createdBy: 'agent',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    store.claimNodes({
      outlineId: outline.id,
      count: 2,
      assignedTo: 'section-writer-1',
      updatedAt: '2026-09-13T00:01:00.000Z',
    });
    store.completeNode({
      outlineId: outline.id,
      nodeId: 'outline-1',
      artifactVersionId: 'draft-outline-1-v1',
      updatedAt: '2026-09-13T00:02:00.000Z',
    });
    store.completeNode({
      outlineId: outline.id,
      nodeId: 'outline-1-1',
      artifactVersionId: 'draft-outline-1-1-v1',
      updatedAt: '2026-09-13T00:02:30.000Z',
    });

    const updated = store.updateNode({
      outlineId: outline.id,
      nodeId: 'outline-1',
      patch: { title: '性能指标、测量与基线' },
      createdBy: 'user',
      createdAt: '2026-09-13T00:03:00.000Z',
      versionId: 'outline-version-2',
    });

    expect(updated.version.version).toBe(2);
    expect(updated.version.parentVersionId).toBe('outline-version-1');
    expect(updated.affectedNodeIds).toEqual([
      'outline-1',
      'outline-1-1',
      'outline-2',
      'outline-3',
    ]);
    expect(store.listVersions(outline.id)).toHaveLength(2);
    expect(store.getNode(outline.id, 'outline-1').work.status).toBe('stale');
    expect(store.getNode(outline.id, 'outline-2').work.status).toBe('stale');
    expect(store.getNode(outline.id, 'outline-3').work.status).toBe('stale');
  });
});
