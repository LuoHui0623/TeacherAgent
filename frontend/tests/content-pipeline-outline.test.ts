import { describe, expect, it } from 'vitest';

import type { CourseBlueprintPayload } from '../services/content-pipeline/contracts';
import { OutlineStore } from '../services/content-pipeline/outlineStore';
import type { ArtifactVersion } from '../services/content-pipeline/types';

const blueprint: CourseBlueprintPayload = {
  id: 'blueprint-outline-1',
  briefId: 'brief-1',
  title: '前端性能优化',
  audience: 'intermediate',
  expectedOutcomes: ['完成端到端优化'],
  coreKnowledgePointIds: ['metrics', 'rendering', 'network'],
  estimatedMinutes: 360,
  items: [
    {
      id: 'outline-1',
      order: 1,
      title: '性能指标与测量',
      summary: '指标基础',
      learningObjectives: ['理解指标'],
      knowledgePointIds: ['metrics'],
      prerequisites: [],
      dependsOnItemIds: [],
      requiredArtifacts: ['ContentDraft'],
      assessmentCriteria: ['完成练习'],
      estimatedMinutes: 120,
      depth: 'basic',
      children: [
        {
          id: 'outline-1-1',
          parentId: 'outline-1',
          order: 1,
          title: '核心指标',
          summary: '核心指标',
          learningObjectives: ['掌握指标含义'],
          knowledgePointIds: ['metrics'],
          prerequisites: [],
          dependsOnItemIds: [],
          requiredArtifacts: ['ContentDraft'],
          assessmentCriteria: ['完成练习'],
          estimatedMinutes: 60,
          depth: 'basic',
          children: [],
        },
      ],
    },
    {
      id: 'outline-2',
      order: 2,
      title: '渲染性能',
      summary: '渲染基础',
      learningObjectives: ['定位渲染瓶颈'],
      knowledgePointIds: ['rendering'],
      prerequisites: ['metrics'],
      dependsOnItemIds: ['outline-1'],
      requiredArtifacts: ['ContentDraft'],
      assessmentCriteria: ['完成练习'],
      estimatedMinutes: 120,
      depth: 'systematic',
      children: [],
    },
    {
      id: 'outline-3',
      order: 3,
      title: '网络与缓存',
      summary: '网络优化',
      learningObjectives: ['优化请求链路'],
      knowledgePointIds: ['network'],
      prerequisites: ['rendering'],
      dependsOnItemIds: ['outline-2'],
      requiredArtifacts: ['ContentDraft'],
      assessmentCriteria: ['完成练习'],
      estimatedMinutes: 120,
      depth: 'systematic',
      children: [],
    },
  ],
};

describe('outline store', () => {
  it('creates a versioned normalized outline and exposes writable items', () => {
    const store = new OutlineStore();
    const version = store.createVersion({
      blueprintId: blueprint.id,
      id: 'outline-version-1',
      sourceArtifactVersionId: 'artifact-blueprint-v1',
      blueprint,
      createdBy: 'agent',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    expect(version.version).toBe(1);
    expect(version.items).toHaveLength(4);
    expect(version.items.find((item) => item.id === 'outline-1-1')?.parentId).toBe('outline-1');
    expect(store.listAvailableItems(blueprint.id).map((item) => item.id)).toEqual([
      'outline-1',
      'outline-1-1',
    ]);
  });

  it('creates an outline version from a validated CourseBlueprint artifact', () => {
    const store = new OutlineStore();
    const artifactVersion: ArtifactVersion = {
      id: 'artifact-blueprint-version-1',
      artifactId: 'artifact-blueprint',
      runId: 'run-1',
      producerNodeRunId: 'run-1:outline-architect',
      inputArtifactVersionIds: [],
      version: 1,
      status: 'validated',
      contractId: 'contract-course-blueprint-v1',
      payload: blueprint as unknown as ArtifactVersion['payload'],
      summary: 'CourseBlueprint',
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
      blueprintId: blueprint.id,
      id: 'outline-version-1',
      blueprint,
      createdBy: 'agent',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    const claimed = store.claimItems({
      blueprintId: blueprint.id,
      count: 1,
      assignedTo: 'section-writer-1',
      updatedAt: '2026-09-13T00:01:00.000Z',
    });
    expect(claimed[0].id).toBe('outline-1');
    expect(claimed[0].work.status).toBe('assigned');
    expect(claimed[0].work.assignedTo).toBe('section-writer-1');

    store.startItem({
      blueprintId: blueprint.id,
      itemId: 'outline-1',
      updatedAt: '2026-09-13T00:02:00.000Z',
    });
    store.completeItem({
      blueprintId: blueprint.id,
      itemId: 'outline-1',
      artifactVersionId: 'draft-outline-1-v1',
      updatedAt: '2026-09-13T00:03:00.000Z',
    });

    expect(store.listAvailableItems(blueprint.id).map((item) => item.id)).toContain('outline-2');
    expect(store.getItem(blueprint.id, 'outline-1').work.status).toBe('generated');
  });

  it('creates a new version on edit and marks dependent items stale', () => {
    const store = new OutlineStore();
    store.createVersion({
      blueprintId: blueprint.id,
      id: 'outline-version-1',
      blueprint,
      createdBy: 'agent',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    store.claimItems({
      blueprintId: blueprint.id,
      count: 2,
      assignedTo: 'section-writer-1',
      updatedAt: '2026-09-13T00:01:00.000Z',
    });
    store.completeItem({
      blueprintId: blueprint.id,
      itemId: 'outline-1',
      artifactVersionId: 'draft-outline-1-v1',
      updatedAt: '2026-09-13T00:02:00.000Z',
    });
    store.completeItem({
      blueprintId: blueprint.id,
      itemId: 'outline-1-1',
      artifactVersionId: 'draft-outline-1-1-v1',
      updatedAt: '2026-09-13T00:02:30.000Z',
    });

    const updated = store.updateItem({
      blueprintId: blueprint.id,
      itemId: 'outline-1',
      patch: { title: '性能指标、测量与基线' },
      createdBy: 'user',
      createdAt: '2026-09-13T00:03:00.000Z',
      versionId: 'outline-version-2',
    });

    expect(updated.version.version).toBe(2);
    expect(updated.version.parentVersionId).toBe('outline-version-1');
    expect(updated.affectedItemIds).toEqual([
      'outline-1',
      'outline-1-1',
      'outline-2',
      'outline-3',
    ]);
    expect(store.listVersions(blueprint.id)).toHaveLength(2);
    expect(store.getItem(blueprint.id, 'outline-1').work.status).toBe('stale');
    expect(store.getItem(blueprint.id, 'outline-2').work.status).toBe('stale');
    expect(store.getItem(blueprint.id, 'outline-3').work.status).toBe('stale');
  });
});
