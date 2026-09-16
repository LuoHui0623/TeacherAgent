import { describe, expect, it } from 'vitest';

import {
  mainWorkflowDefinition,
  mainWorkflowVersion,
} from '../mocks/content-pipeline/main-workflow';
import {
  ArtifactStore,
  ContractValidationError,
} from '../services/content-pipeline/artifactStore';
import {
  contentPipelineArtifactTypes,
  validateArtifactPayload,
  type LearningBriefPayload,
} from '../services/content-pipeline/contracts';
import {
  createWorkflowRunSnapshot,
  validateWorkflowDefinition,
} from '../services/content-pipeline/workflow';

const learningBrief: LearningBriefPayload = {
  id: 'brief-001',
  goal: '掌握前端性能优化',
  intent: '系统学习并用于项目实践',
  learnerSummary: '具备基础 JavaScript 和 React 经验',
  scope: {
    level: 'intermediate',
    depth: 'systematic',
    breadth: 'frontend-performance',
    estimatedMinutes: 480,
  },
  expectedOutcomes: ['能定位常见性能瓶颈', '能设计优化方案'],
  constraints: ['每周 6 小时', '以项目实践为主'],
  questions: ['是否包含服务端渲染？'],
};

describe('content pipeline workflow model', () => {
  it('keeps the main workflow graph valid', () => {
    expect(validateWorkflowDefinition(mainWorkflowDefinition)).toEqual([]);
  });

  it('defines the required human gates and parallel writing stage', () => {
    const humanScopes = mainWorkflowDefinition.nodes
      .filter((node) => node.kind === 'human-gate')
      .map((node) => node.humanApproval?.scopeType);

    expect(humanScopes).toContain('outline');
    expect(humanScopes).toContain('chapter');
    expect(humanScopes).toContain('publish');

    const writer = mainWorkflowDefinition.nodes.find(
      (node) => node.id === 'chapter-writers',
    );
    expect(writer?.kind).toBe('fan-out');
    expect(writer?.roleId).toBe('section-writer');
    expect(writer?.config.concurrency).toBe(4);
  });

  it('creates a run from an immutable workflow version', () => {
    const snapshot = createWorkflowRunSnapshot({
      workflowVersion: mainWorkflowVersion,
      runId: 'run-001',
      contextSnapshotId: 'context-001',
      createdBy: 'user',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    expect(snapshot.run.workflowVersionId).toBe(mainWorkflowVersion.id);
    expect(snapshot.run.status).toBe('ready');
    expect(snapshot.nodeRuns).toHaveLength(mainWorkflowDefinition.nodes.length);
    expect(snapshot.nodeRuns.every((nodeRun) => nodeRun.status === 'pending')).toBe(true);
  });

  it('rejects a workflow edge with incompatible artifact types', () => {
    const invalidDefinition = structuredClone(mainWorkflowDefinition);
    const edge = invalidDefinition.edges.find((item) => item.id === 'e-writer-review');
    if (!edge) throw new Error('missing test edge');
    edge.to.portId = 'snapshot';

    const issues = validateWorkflowDefinition(invalidDefinition);
    expect(issues.some((issue) => issue.code === 'unknown-input-port')).toBe(true);
  });
});

describe('content pipeline artifact contracts', () => {
  it('validates the core LearningBrief contract', () => {
    expect(
      validateArtifactPayload(contentPipelineArtifactTypes.learningBrief, learningBrief),
    ).toEqual({ valid: true, errors: [] });

    const result = validateArtifactPayload(
      contentPipelineArtifactTypes.learningBrief,
      { ...learningBrief, goal: '' },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('goal 必须是非空字符串');
  });

  it('versions artifacts and keeps confirmed versions addressable', () => {
    const store = new ArtifactStore();
    const created = store.createArtifact({
      id: 'artifact-brief-001',
      versionId: 'artifact-brief-001-v1',
      runId: 'run-001',
      artifactType: contentPipelineArtifactTypes.learningBrief,
      contractId: 'contract-learning-brief-v1',
      producerNodeRunId: 'run-001:intent-planner',
      payload: learningBrief,
      summary: '第一版 Learning Brief',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    expect(created.version.version).toBe(1);
    expect(created.version.status).toBe('draft');

    const second = store.addVersion({
      artifactId: created.artifact.id,
      versionId: 'artifact-brief-001-v2',
      runId: 'run-001',
      producerNodeRunId: 'run-001:intent-planner',
      payload: { ...learningBrief, goal: '掌握前端性能优化与监控' },
      summary: '补充性能监控目标',
      createdAt: '2026-09-13T00:10:00.000Z',
    });

    expect(second.version.version).toBe(2);
    expect(second.version.parentVersionIds).toEqual(['artifact-brief-001-v1']);
    expect(store.getLatestVersion(created.artifact.id).id).toBe('artifact-brief-001-v2');
    expect(store.listVersions(created.artifact.id).map((item) => item.version)).toEqual([1, 2]);

    const validated = store.validateVersion(second.version.id);
    expect(validated.status).toBe('validated');
    const confirmed = store.confirmVersion(
      second.version.id,
      'user',
      '2026-09-13T00:12:00.000Z',
    );
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedBy).toBe('user');
    expect(
      store.assertConsumable([second.version.id], contentPipelineArtifactTypes.learningBrief),
    ).toHaveLength(1);
  });

  it('rejects invalid payloads and unvalidated consumption', () => {
    const store = new ArtifactStore();
    const created = store.createArtifact({
      id: 'artifact-draft-001',
      versionId: 'artifact-draft-001-v1',
      runId: 'run-002',
      artifactType: contentPipelineArtifactTypes.contentDraft,
      contractId: 'contract-content-draft-v1',
      producerNodeRunId: 'run-002:chapter-writers',
      payload: {
        id: 'draft-001',
        outlineItemId: 'outline-001',
        chapterId: 'chapter-001',
        title: '函数基础',
        markdown: '## 函数',
        knowledgePointIds: ['kp-function'],
        sourceRefs: [],
      },
      summary: '函数章节草稿',
      createdAt: '2026-09-13T00:00:00.000Z',
    });

    expect(() =>
      store.assertConsumable(
        [created.version.id],
        contentPipelineArtifactTypes.contentDraft,
      ),
    ).toThrow(ContractValidationError);

    expect(() =>
      store.createArtifact({
        id: 'artifact-invalid',
        versionId: 'artifact-invalid-v1',
        runId: 'run-002',
        artifactType: contentPipelineArtifactTypes.learningBrief,
        contractId: 'contract-learning-brief-v1',
        producerNodeRunId: 'run-002:intent-planner',
        payload: { id: 'invalid' },
        summary: 'invalid',
        createdAt: '2026-09-13T00:00:00.000Z',
      }),
    ).toThrow(ContractValidationError);
  });
});
