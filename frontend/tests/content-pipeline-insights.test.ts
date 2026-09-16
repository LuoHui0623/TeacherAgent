import { describe, expect, it } from 'vitest';

import { diffText } from '../services/content-pipeline/artifactDiff';
import { calculateRunAnalytics, formatDuration } from '../services/content-pipeline/runAnalytics';
import type { NodeRun, WorkflowRun } from '../services/content-pipeline/types';

describe('content pipeline insights', () => {
  it('produces line-level artifact diff summary', () => {
    const diff = diffText('# 函数\n\n旧内容', '# 函数\n\n新内容');
    expect(diff.filter((line) => line.type === 'removed')).toHaveLength(1);
    expect(diff.filter((line) => line.type === 'added')).toHaveLength(1);
    expect(diff.filter((line) => line.type === 'unchanged').length).toBeGreaterThan(0);
  });

  it('aggregates run duration, tokens and cost by agent', () => {
    const run: WorkflowRun = {
      id: 'run-analytics',
      workflowVersionId: 'v1',
      contextSnapshotId: 'ctx-1',
      status: 'succeeded',
      createdAt: '2026-09-13T00:00:00.000Z',
      startedAt: '2026-09-13T00:00:00.000Z',
      completedAt: '2026-09-13T00:01:00.000Z',
      createdBy: 'user',
    };
    const baseNode = {
      runId: run.id,
      attempt: 1,
      inputArtifactVersionIds: [],
      outputArtifactVersionIds: [],
      inputArtifacts: {},
      outputArtifacts: {},
    };
    const nodeRuns: NodeRun[] = [
      {
        ...baseNode,
        id: 'run-analytics:n1',
        nodeId: 'n1',
        status: 'succeeded',
        telemetry: {
          agentId: 'writer',
          model: 'mock-writer',
          promptRef: 'writer',
          inputTokens: 100,
          outputTokens: 200,
          costUsd: 0.001,
        },
      },
      {
        ...baseNode,
        id: 'run-analytics:n2',
        nodeId: 'n2',
        status: 'succeeded',
        telemetry: {
          agentId: 'reviewer',
          model: 'mock-reviewer',
          promptRef: 'reviewer',
          inputTokens: 50,
          outputTokens: 80,
          costUsd: 0.0005,
        },
      },
    ];

    const analytics = calculateRunAnalytics(run, nodeRuns);
    expect(analytics.durationMs).toBe(60000);
    expect(analytics.inputTokens).toBe(150);
    expect(analytics.outputTokens).toBe(280);
    expect(analytics.costUsd).toBe(0.0015);
    expect(analytics.byAgent[0].agentId).toBe('writer');
    expect(formatDuration(analytics.durationMs)).toBe('1m 0s');
  });
});
