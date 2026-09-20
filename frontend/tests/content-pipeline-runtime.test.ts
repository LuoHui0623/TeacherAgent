import { describe, expect, it } from 'vitest';

import { contentPipelineArtifactTypes } from '../services/content-pipeline/contracts';
import {
  WorkflowRuntime,
  type NodeArtifactOutput,
} from '../services/content-pipeline/runtime';
import type {
  JsonValue,
  PortDefinition,
  WorkflowDefinition,
  WorkflowVersion,
} from '../services/content-pipeline/types';

function port(id: string, artifactType: string, multiple = false): PortDefinition {
  return {
    id,
    artifactType,
    required: true,
    multiple,
    description: artifactType,
  };
}

function artifactOutput(
  portId: string,
  artifactId: string,
  versionId: string,
  artifactType: NodeArtifactOutput['artifactType'],
  payload: JsonValue,
  summary: string,
  createdAt: string,
): NodeArtifactOutput {
  return { portId, artifactId, versionId, artifactType, payload, summary, createdAt };
}

const runtimeWorkflow: WorkflowDefinition = {
  id: 'runtime-test',
  name: 'Runtime Test',
  description: '运行时测试工作流',
  entryNodeIds: ['start'],
  nodes: [
    {
      id: 'start',
      kind: 'trigger',
      label: 'Start',
      description: 'start',
      inputs: [],
      outputs: [port('events', contentPipelineArtifactTypes.tutorEvents)],
      config: {},
    },
    {
      id: 'context',
      kind: 'context',
      label: 'Context',
      description: 'context',
      inputs: [port('events', contentPipelineArtifactTypes.tutorEvents)],
      outputs: [port('snapshot', contentPipelineArtifactTypes.contextSnapshot)],
      config: {},
    },
    {
      id: 'split',
      kind: 'fan-out',
      label: 'Split',
      description: 'split',
      inputs: [port('snapshot', contentPipelineArtifactTypes.contextSnapshot)],
      outputs: [port('briefs', contentPipelineArtifactTypes.learningBrief, true)],
      config: {},
    },
    {
      id: 'merge',
      kind: 'fan-in',
      label: 'Merge',
      description: 'merge',
      inputs: [port('briefs', contentPipelineArtifactTypes.learningBrief, true)],
      outputs: [port('outline', contentPipelineArtifactTypes.outline)],
      config: {},
    },
    {
      id: 'gate',
      kind: 'human-gate',
      label: 'Gate',
      description: 'gate',
      inputs: [port('outline', contentPipelineArtifactTypes.outline)],
      outputs: [port('manifest', contentPipelineArtifactTypes.publicationManifest)],
      config: {},
      humanApproval: {
        scopeType: 'publish',
        perItem: false,
        allowBatch: false,
        required: true,
      },
    },
    {
      id: 'publish',
      kind: 'persist',
      label: 'Publish',
      description: 'publish',
      inputs: [port('manifest', contentPipelineArtifactTypes.publicationManifest)],
      outputs: [port('published', contentPipelineArtifactTypes.publicationManifest)],
      config: {},
    },
  ],
  edges: [
    { id: 'e1', from: { nodeId: 'start', portId: 'events' }, to: { nodeId: 'context', portId: 'events' } },
    { id: 'e2', from: { nodeId: 'context', portId: 'snapshot' }, to: { nodeId: 'split', portId: 'snapshot' } },
    { id: 'e3', from: { nodeId: 'split', portId: 'briefs' }, to: { nodeId: 'merge', portId: 'briefs' } },
    { id: 'e4', from: { nodeId: 'merge', portId: 'outline' }, to: { nodeId: 'gate', portId: 'outline' } },
    { id: 'e5', from: { nodeId: 'gate', portId: 'manifest' }, to: { nodeId: 'publish', portId: 'manifest' }, condition: 'approved', label: 'approved' },
  ],
};

const runtimeVersion: WorkflowVersion = {
  id: 'runtime-test-v1',
  workflowId: runtimeWorkflow.id,
  version: 1,
  status: 'active',
  definition: runtimeWorkflow,
  createdAt: '2026-09-13T00:00:00.000Z',
  createdBy: 'test',
};

function createRuntime() {
  let splitCount = 0;
  let mergeCount = 0;
  let publishCount = 0;
  const runtime = new WorkflowRuntime({
    workflowVersions: [runtimeVersion],
    now: () => '2026-09-13T00:00:00.000Z',
  });

  runtime.registerNodeHandler(runtimeWorkflow.id, 'start', (context) => ({
    outputs: [
      artifactOutput(
        'events',
        'artifact-events',
        'artifact-events-v1',
        contentPipelineArtifactTypes.tutorEvents,
        { capturedAt: context.now(), events: [] },
        'events',
        context.now(),
      ),
    ],
  }));
  runtime.registerNodeHandler(runtimeWorkflow.id, 'context', (context) => ({
    outputs: [
      artifactOutput(
        'snapshot',
        'artifact-context',
        'artifact-context-v1',
        contentPipelineArtifactTypes.contextSnapshot,
        {
          id: 'context-1',
          learnerId: 'user-1',
          capturedAt: context.now(),
          query: '学习前端性能',
          profileSummary: '具备 React 基础',
          currentLevel: 'intermediate',
          preferences: [],
          knownKnowledgePointIds: ['react'],
          weakKnowledgePointIds: ['performance'],
          sourceEventIds: [],
        },
        'context',
        context.now(),
      ),
    ],
  }));
  runtime.registerNodeHandler(runtimeWorkflow.id, 'split', (context) => {
    splitCount += 1;
    return {
      outputs: [1, 2].map((index) =>
        artifactOutput(
          'briefs',
          `artifact-brief-${splitCount}-${index}`,
          `artifact-brief-${splitCount}-${index}-v1`,
          contentPipelineArtifactTypes.learningBrief,
          {
            id: `brief-${splitCount}-${index}`,
            goal: `goal-${index}`,
            approach: 'systematic',
            scope: {
              targetLevel: '入门',
              inScope: ['frontend'],
              outOfScope: [],
              estimatedMinutes: 60,
            },
            expectedOutcomes: [{ id: 'outcome', statement: 'outcome' }],
            constraints: [],
            questions: [],
          },
          `brief ${index}`,
          context.now(),
        ),
      ),
    };
  });
  runtime.registerNodeHandler(runtimeWorkflow.id, 'merge', (context) => {
    mergeCount += 1;
    return {
      outputs: [
        artifactOutput(
          'outline',
          `artifact-blueprint-${mergeCount}`,
          `artifact-blueprint-${mergeCount}-v1`,
          contentPipelineArtifactTypes.outline,
        {
          id: 'blueprint-1',
          briefId: 'brief-1',
          title: '前端性能',
          coveredOutcomeIds: ['outcome'],
          items: [
            {
              id: 'outline-1',
              title: '性能基础',
              summary: '基础',
              knowledgePointIds: ['performance'],
              buildsOn: [],
              children: [],
            },
          ],
        },
          'outline',
          context.now(),
        ),
      ],
    };
  });
  runtime.registerNodeHandler(runtimeWorkflow.id, 'publish', (context) => {
    publishCount += 1;
    return {
      outputs: [
        artifactOutput(
          'published',
          `artifact-published-${publishCount}`,
          `artifact-published-${publishCount}-v1`,
          contentPipelineArtifactTypes.publicationManifest,
        {
          id: 'publication-1',
          title: '前端性能',
          version: '1.0.0',
          artifactVersionIds: context.nodeRun.inputArtifactVersionIds,
          outlineVersionId: 'outline-v1',
          chapterVersionIds: [],
          generatedAt: context.now(),
        },
          'published',
          context.now(),
        ),
      ],
    };
  });

  return {
    runtime,
    getSplitCount: () => splitCount,
  };
}

describe('content pipeline workflow runtime', () => {
  it('executes sequential, fan-out and fan-in nodes, then waits for human approval', async () => {
    const { runtime, getSplitCount } = createRuntime();
    runtime.createRun({
      runId: 'run-runtime-1',
      workflowVersionId: runtimeVersion.id,
      contextSnapshotId: 'context-1',
      createdBy: 'user',
    });

    const waiting = await runtime.runUntilIdle('run-runtime-1');
    expect(waiting.run.status).toBe('waiting-human');
    expect(waiting.nodeRuns.find((node) => node.nodeId === 'gate')?.status).toBe(
      'waiting-approval',
    );
    expect(waiting.nodeRuns.find((node) => node.nodeId === 'merge')?.inputArtifacts.briefs).toHaveLength(2);
    expect(getSplitCount()).toBe(1);
  });

  it('resumes a human gate and completes the run', async () => {
    const { runtime } = createRuntime();
    runtime.createRun({
      runId: 'run-runtime-2',
      workflowVersionId: runtimeVersion.id,
      contextSnapshotId: 'context-1',
      createdBy: 'user',
    });
    await runtime.runUntilIdle('run-runtime-2');

    const result = await runtime.decideHumanGate({
      runId: 'run-runtime-2',
      nodeId: 'gate',
      decision: 'approved',
      comments: 'approved',
      decidedBy: 'user',
      decidedAt: '2026-09-13T00:01:00.000Z',
      outcome: 'approved',
      outputs: [
        artifactOutput(
          'manifest',
          'artifact-manifest',
          'artifact-manifest-v1',
          contentPipelineArtifactTypes.publicationManifest,
          {
            id: 'manifest-1',
            title: '前端性能',
            version: '1.0.0',
            artifactVersionIds: [],
            outlineVersionId: 'outline-v1',
            chapterVersionIds: [],
            generatedAt: '2026-09-13T00:01:00.000Z',
          },
          'approved manifest',
          '2026-09-13T00:01:00.000Z',
        ),
      ],
    });

    expect(result.run.status).toBe('succeeded');
    expect(result.nodeRuns.every((node) => node.status === 'succeeded')).toBe(true);
    expect(result.approvals).toHaveLength(1);
  });

  it('reruns a completed downstream chain from a selected node', async () => {
    const { runtime, getSplitCount } = createRuntime();
    runtime.createRun({
      runId: 'run-runtime-rerun',
      workflowVersionId: runtimeVersion.id,
      contextSnapshotId: 'context-1',
      createdBy: 'user',
    });
    await runtime.runUntilIdle('run-runtime-rerun');
    await runtime.decideHumanGate({
      runId: 'run-runtime-rerun',
      nodeId: 'gate',
      decision: 'approved',
      comments: 'approved',
      decidedBy: 'user',
      decidedAt: '2026-09-13T00:01:00.000Z',
      outcome: 'approved',
      outputs: [
        artifactOutput(
          'manifest',
          'artifact-manifest-rerun',
          'artifact-manifest-rerun-v1',
          contentPipelineArtifactTypes.publicationManifest,
          {
            id: 'manifest-rerun',
            title: '前端性能',
            version: '1.0.0',
            artifactVersionIds: [],
            outlineVersionId: 'outline-v1',
            chapterVersionIds: [],
            generatedAt: '2026-09-13T00:01:00.000Z',
          },
          'manifest',
          '2026-09-13T00:01:00.000Z',
        ),
      ],
    });
    expect(runtime.getState('run-runtime-rerun').run.status).toBe('succeeded');

    const rerun = await runtime.rerunFromNode('run-runtime-rerun', 'split');
    expect(rerun.run.status).toBe('waiting-human');
    expect(rerun.nodeRuns.find((node) => node.nodeId === 'gate')?.status).toBe(
      'waiting-approval',
    );
    expect(getSplitCount()).toBe(2);
  });

  it('retries a failed node without recreating the run', async () => {
    let shouldFail = true;
    const retryWorkflow: WorkflowDefinition = {
      id: 'retry-runtime',
      name: 'Retry Runtime',
      description: 'retry test',
      entryNodeIds: ['work'],
      nodes: [
        {
          id: 'work',
          kind: 'trigger',
          label: 'Work',
          description: 'work',
          inputs: [],
          outputs: [port('events', contentPipelineArtifactTypes.tutorEvents)],
          config: {},
          retryPolicy: { maxAttempts: 0, backoffMs: 0, retryOn: ['error'] },
        },
      ],
      edges: [],
    };
    const retryVersion: WorkflowVersion = {
      id: 'retry-runtime-v1',
      workflowId: retryWorkflow.id,
      version: 1,
      status: 'active',
      definition: retryWorkflow,
      createdAt: '2026-09-13T00:00:00.000Z',
      createdBy: 'test',
    };
    const runtime = new WorkflowRuntime({
      workflowVersions: [retryVersion],
      now: () => '2026-09-13T00:00:00.000Z',
    });
    runtime.registerNodeHandler(retryWorkflow.id, 'work', (context) => {
      if (shouldFail) throw new Error('temporary failure');
      return {
        outputs: [
          artifactOutput(
            'events',
            'artifact-retry-events',
            'artifact-retry-events-v1',
            contentPipelineArtifactTypes.tutorEvents,
            { capturedAt: context.now(), events: [] },
            'retry events',
            context.now(),
          ),
        ],
      };
    });

    runtime.createRun({
      runId: 'run-retry',
      workflowVersionId: retryVersion.id,
      contextSnapshotId: 'context-1',
      createdBy: 'user',
    });
    const failed = await runtime.runUntilIdle('run-retry');
    expect(failed.run.status).toBe('failed');
    expect(failed.nodeRuns[0].status).toBe('failed');

    shouldFail = false;
    const recovered = await runtime.retryNode('run-retry', 'work');
    expect(recovered.run.status).toBe('succeeded');
    expect(recovered.nodeRuns[0].status).toBe('succeeded');
  });
  it('records chapter approvals item by item and completes on the last decision', async () => {
    const chapterWorkflow: WorkflowDefinition = {
      id: 'chapter-approval-runtime',
      name: 'Chapter Approval',
      description: 'per item approval test',
      entryNodeIds: ['writer'],
      nodes: [
        {
          id: 'writer',
          kind: 'fan-out',
          label: 'Writer',
          description: 'writer',
          inputs: [],
          outputs: [port('drafts', contentPipelineArtifactTypes.contentDraft, true)],
          config: {},
        },
        {
          id: 'gate',
          kind: 'human-gate',
          label: 'Chapter Gate',
          description: 'gate',
          inputs: [port('drafts', contentPipelineArtifactTypes.contentDraft, true)],
          outputs: [
            port('approved', contentPipelineArtifactTypes.contentDraft, true),
            port('feedback', contentPipelineArtifactTypes.revisionFeedback),
          ],
          config: {},
          humanApproval: {
            scopeType: 'chapter',
            perItem: true,
            allowBatch: true,
            required: true,
            itemPort: 'drafts',
            approvedOutcome: '章节通过',
            changesOutcome: '提出审批意见',
          },
        },
        {
          id: 'done',
          kind: 'persist',
          label: 'Done',
          description: 'done',
          inputs: [port('content', contentPipelineArtifactTypes.contentDraft, true)],
          outputs: [port('published', contentPipelineArtifactTypes.contentDraft, true)],
          config: {},
        },
      ],
      edges: [
        { id: 'e-writer-gate', from: { nodeId: 'writer', portId: 'drafts' }, to: { nodeId: 'gate', portId: 'drafts' } },
        { id: 'e-gate-done', from: { nodeId: 'gate', portId: 'approved' }, to: { nodeId: 'done', portId: 'content' }, condition: '章节通过' },
      ],
    };
    const chapterVersion: WorkflowVersion = {
      id: 'chapter-approval-runtime-v1',
      workflowId: chapterWorkflow.id,
      version: 1,
      status: 'active',
      definition: chapterWorkflow,
      createdAt: '2026-09-13T00:00:00.000Z',
      createdBy: 'test',
    };
    const runtime = new WorkflowRuntime({
      workflowVersions: [chapterVersion],
      now: () => '2026-09-13T00:00:00.000Z',
    });
    runtime.registerNodeHandler(chapterWorkflow.id, 'writer', (context) => ({
      outputs: [1, 2].map((index) =>
        artifactOutput(
          'drafts',
          `chapter-draft-${index}`,
          `chapter-draft-${index}-v1`,
          contentPipelineArtifactTypes.contentDraft,
          {
            id: `draft-${index}`,
            outlineNodeId: `outline-${index}`,
            chapterId: `chapter-${index}`,
            title: `章节 ${index}`,
            markdown: `## 章节 ${index}`,
            knowledgePointIds: [`kp-${index}`],
            sourceRefs: [],
          },
          `章节 ${index} 草稿`,
          context.now(),
        ),
      ),
    }));
    runtime.registerNodeHandler(chapterWorkflow.id, 'done', (context) => ({
      outputs: context.inputs.content.map((version) => ({
        portId: 'published',
        artifactId: `published-${version.id}`,
        versionId: `published-${version.id}-v1`,
        artifactType: contentPipelineArtifactTypes.contentDraft,
        payload: version.payload,
        summary: 'published chapter',
        createdAt: context.now(),
      })),
    }));

    runtime.createRun({
      runId: 'run-chapter-approval',
      workflowVersionId: chapterVersion.id,
      contextSnapshotId: 'context-1',
      createdBy: 'user',
    });
    await runtime.runUntilIdle('run-chapter-approval');
    expect(runtime.getHumanGateItems('run-chapter-approval', 'gate')).toHaveLength(2);

    const firstItem = runtime.getHumanGateItems('run-chapter-approval', 'gate')[0];
    await runtime.decideHumanGateItem({
      runId: 'run-chapter-approval',
      nodeId: 'gate',
      itemId: firstItem.itemId,
      decision: 'approved',
      comments: '第一章通过',
      decidedBy: 'user',
      decidedAt: '2026-09-13T00:02:00.000Z',
      outputs: [
        artifactOutput(
          'approved',
          `approved-${firstItem.itemId}`,
          `approved-${firstItem.itemId}-v1`,
          contentPipelineArtifactTypes.contentDraft,
          {
            id: `approved-${firstItem.itemId}`,
            outlineNodeId: 'outline-1',
            chapterId: 'chapter-1',
            title: '章节 1',
            markdown: '## 章节 1',
            knowledgePointIds: ['kp-1'],
            sourceRefs: [],
          },
          'approved chapter',
          '2026-09-13T00:02:00.000Z',
        ),
      ],
    });
    expect(runtime.getState('run-chapter-approval').run.status).toBe('waiting-human');
    expect(runtime.getState('run-chapter-approval').approvals).toHaveLength(1);

    const secondItem = runtime.getHumanGateItems('run-chapter-approval', 'gate')[1];
    await runtime.decideHumanGateItem({
      runId: 'run-chapter-approval',
      nodeId: 'gate',
      itemId: secondItem.itemId,
      decision: 'approved',
      comments: '第二章通过',
      decidedBy: 'user',
      decidedAt: '2026-09-13T00:03:00.000Z',
      outputs: [
        artifactOutput(
          'approved',
          `approved-${secondItem.itemId}`,
          `approved-${secondItem.itemId}-v1`,
          contentPipelineArtifactTypes.contentDraft,
          {
            id: `approved-${secondItem.itemId}`,
            outlineNodeId: 'outline-2',
            chapterId: 'chapter-2',
            title: '章节 2',
            markdown: '## 章节 2',
            knowledgePointIds: ['kp-2'],
            sourceRefs: [],
          },
          'approved chapter',
          '2026-09-13T00:03:00.000Z',
        ),
      ],
    });
    const completed = runtime.getState('run-chapter-approval');
    expect(completed.run.status).toBe('succeeded');
    expect(completed.approvals).toHaveLength(2);
  });
  it('forks a completed run from a selected node without changing the source run', async () => {
    const { runtime, getSplitCount } = createRuntime();
    runtime.createRun({
      runId: 'run-fork-source',
      workflowVersionId: runtimeVersion.id,
      contextSnapshotId: 'context-1',
      createdBy: 'user',
    });
    await runtime.runUntilIdle('run-fork-source');
    await runtime.decideHumanGate({
      runId: 'run-fork-source',
      nodeId: 'gate',
      decision: 'approved',
      comments: 'approved',
      decidedBy: 'user',
      decidedAt: '2026-09-13T00:01:00.000Z',
      outcome: 'approved',
      outputs: [
        artifactOutput(
          'manifest',
          'artifact-manifest-fork',
          'artifact-manifest-fork-v1',
          contentPipelineArtifactTypes.publicationManifest,
          {
            id: 'manifest-fork',
            title: '前端性能',
            version: '1.0.0',
            artifactVersionIds: [],
            outlineVersionId: 'outline-v1',
            chapterVersionIds: [],
            generatedAt: '2026-09-13T00:01:00.000Z',
          },
          'manifest',
          '2026-09-13T00:01:00.000Z',
        ),
      ],
    });
    expect(runtime.getState('run-fork-source').run.status).toBe('succeeded');

    const forked = await runtime.forkRunFromNode({
      sourceRunId: 'run-fork-source',
      nodeId: 'split',
      newRunId: 'run-fork-branch',
      createdBy: 'user',
      createdAt: '2026-09-13T00:02:00.000Z',
    });

    expect(forked.run.status).toBe('waiting-human');
    expect(runtime.getState('run-fork-source').run.status).toBe('succeeded');
    expect(forked.nodeRuns.find((node) => node.nodeId === 'gate')?.status).toBe(
      'waiting-approval',
    );
    expect(getSplitCount()).toBe(2);
  });
  it('cancels active runs', async () => {
    const { runtime } = createRuntime();
    runtime.createRun({
      runId: 'run-runtime-3',
      workflowVersionId: runtimeVersion.id,
      contextSnapshotId: 'context-1',
      createdBy: 'user',
    });
    const cancelled = runtime.cancelRun('run-runtime-3', 'user cancelled');
    expect(cancelled.status).toBe('cancelled');
    expect(runtime.getState('run-runtime-3').nodeRuns.every((node) => node.status === 'skipped')).toBe(true);
  });
});
