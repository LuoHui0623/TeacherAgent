import { describe, expect, it } from 'vitest';

import { createMockContentAgentRegistry, createMockContentPipelineRuntime } from '../mocks/content-pipeline/agents';
import { mainWorkflowVersion } from '../mocks/content-pipeline/main-workflow';
import {
  contentPipelineArtifactTypes,
  type OutlinePayload,
  type LearningBriefPayload,
  type PublicationManifestPayload,
} from '../services/content-pipeline/contracts';
import type { NodeArtifactOutput } from '../services/content-pipeline/runtime';
import type { JsonValue } from '../services/content-pipeline/types';

const learningBriefPayload: LearningBriefPayload = {
  id: 'brief-test',
  goal: '掌握前端性能优化',
  approach: 'systematic',
  scope: {
    targetLevel: '进阶',
    inScope: ['性能指标与测量'],
    outOfScope: [],
    estimatedMinutes: 480,
  },
  expectedOutcomes: [{ id: 'diagnose', statement: '能定位性能瓶颈' }],
  constraints: [],
  questions: [],
};

const outlinePayload: OutlinePayload = {
  id: 'blueprint-test',
  briefId: 'brief-test',
  title: '前端性能优化',
  coveredOutcomeIds: ['diagnose'],
  items: [
    {
      id: 'outline-1',
      title: '性能指标与测量',
      summary: '指标基础',
      knowledgePointIds: ['performance-metrics'],
      buildsOn: [],
      children: [],
    },
  ],
};

function output(
  portId: string,
  artifactId: string,
  versionId: string,
  artifactType: NodeArtifactOutput['artifactType'],
  payload: JsonValue,
  summary: string,
): NodeArtifactOutput {
  return {
    portId,
    artifactId,
    versionId,
    artifactType,
    payload,
    summary,
    createdAt: '2026-09-13T00:00:00.000Z',
  };
}

describe('content pipeline role agents', () => {
  it('registers the complete role set with declared IO contracts', () => {
    const registry = createMockContentAgentRegistry();
    const agents = registry.list();
    expect(agents.map((agent) => agent.id)).toEqual([
      'context-profiler',
      'intent-planner',
      'outline-architect',
      'section-writer',
      'reviewer',
      'reviser',
      'beautifier',
      'assessment-generator',
      'quality-publisher',
    ]);
    expect(agents.every((agent) => agent.inputArtifactTypes.length >= 0)).toBe(true);
    expect(agents.every((agent) => agent.outputArtifactTypes.length > 0)).toBe(true);
  });

  it('runs the complete main workflow through mock agents and human gates', async () => {
    const runtime = createMockContentPipelineRuntime();
    runtime.createRun({
      runId: 'run-agent-flow',
      workflowVersionId: mainWorkflowVersion.id,
      contextSnapshotId: 'context-agent-flow',
      createdBy: 'user',
    });

    let state = await runtime.runUntilIdle('run-agent-flow');
    expect(state.run.status).toBe('waiting-human');
    expect(state.nodeRuns.find((node) => node.nodeId === 'intent-planner')?.status).toBe('succeeded');
    expect(
      state.nodeRuns.find((node) => node.nodeId === 'intent-planner')?.telemetry,
    ).toMatchObject({
      agentId: 'intent-planner',
      model: 'mock-planner-v1',
      promptRef: 'content-pipeline/intent-planner',
    });

    await runtime.decideHumanGate({
      runId: 'run-agent-flow',
      nodeId: 'brief-approval',
      decision: 'approved',
      comments: 'brief approved',
      decidedBy: 'user',
      decidedAt: '2026-09-13T00:01:00.000Z',
      outcome: '审批通过',
      outputs: [
        output(
          'approved',
          'brief-approved',
          'brief-approved-v1',
          contentPipelineArtifactTypes.learningBrief,
          learningBriefPayload as unknown as JsonValue,
          'approved brief',
        ),
      ],
    });

    state = await runtime.runUntilIdle('run-agent-flow');
    expect(state.run.status).toBe('waiting-human');
    expect(state.nodeRuns.find((node) => node.nodeId === 'outline-architect')?.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'outline-contract-gate')?.status).toBe('succeeded');

    await runtime.decideHumanGate({
      runId: 'run-agent-flow',
      nodeId: 'outline-approval',
      decision: 'approved',
      comments: 'outline approved',
      decidedBy: 'user',
      decidedAt: '2026-09-13T00:02:00.000Z',
      outcome: '审批通过',
      outputs: [
        output(
          'approved',
          'outline-approved',
          'outline-approved-v1',
          contentPipelineArtifactTypes.outline,
          outlinePayload as unknown as JsonValue,
          'approved outline',
        ),
      ],
    });

    state = await runtime.runUntilIdle('run-agent-flow');
    expect(
      state.run.status,
      JSON.stringify(state.nodeRuns.map((node) => ({ id: node.nodeId, status: node.status }))),
    ).toBe('waiting-human');
    expect(state.nodeRuns.find((node) => node.nodeId === 'chapter-writers')?.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'reviewer')?.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'reviser')?.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'chapter-approval')?.status).toBe('waiting-approval');

    const items = runtime.getHumanGateItems('run-agent-flow', 'chapter-approval');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      await runtime.decideHumanGateItem({
        runId: 'run-agent-flow',
        nodeId: 'chapter-approval',
        itemId: item.itemId,
        decision: 'approved',
        comments: `${item.title} approved`,
        decidedBy: 'user',
        decidedAt: '2026-09-13T00:03:00.000Z',
        outputs: [
          output(
            'approved',
            `approved-${item.itemId}`,
            `approved-${item.itemId}-v1`,
            contentPipelineArtifactTypes.contentDraft,
            {
              id: `approved-${item.itemId}`,
              outlineNodeId: 'outline-1',
              chapterId: 'chapter-1',
              title: item.title,
              markdown: `## ${item.title}`,
              knowledgePointIds: ['performance-metrics'],
              sourceRefs: [],
            },
            `${item.title} approved`,
          ),
        ],
      });
    }

    state = await runtime.runUntilIdle('run-agent-flow');
    expect(state.run.status).toBe('waiting-human');
    expect(state.nodeRuns.find((node) => node.nodeId === 'beautifier')?.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'assessment-generator')?.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'quality-gate')?.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'publish-approval')?.status).toBe('waiting-approval');

    const manifest: PublicationManifestPayload = {
      id: 'manifest-test',
      title: '前端性能优化',
      version: '1.0.0',
      artifactVersionIds: [],
      outlineVersionId: 'blueprint-test',
      chapterVersionIds: [],
      generatedAt: '2026-09-13T00:04:00.000Z',
    };
    state = await runtime.decideHumanGate({
      runId: 'run-agent-flow',
      nodeId: 'publish-approval',
      decision: 'approved',
      comments: 'publish approved',
      decidedBy: 'user',
      decidedAt: '2026-09-13T00:04:00.000Z',
      outcome: '确认发布',
      outputs: [
        output(
          'approved',
          'manifest-approved',
          'manifest-approved-v1',
          contentPipelineArtifactTypes.publicationManifest,
          manifest as unknown as JsonValue,
          'approved manifest',
        ),
      ],
    });

    expect(state.run.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'publisher')?.status).toBe('succeeded');
    expect(state.nodeRuns.find((node) => node.nodeId === 'quality-gate')?.telemetry?.agentId).toBe(
      'quality-publisher',
    );
  });
});
