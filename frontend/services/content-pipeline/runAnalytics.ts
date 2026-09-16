import type { NodeRun, WorkflowRun } from './types';

export interface AgentRunMetric {
  agentId: string;
  model: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface RunAnalytics {
  runId: string;
  durationMs: number;
  nodeCount: number;
  succeededNodes: number;
  failedNodes: number;
  waitingNodes: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byAgent: AgentRunMetric[];
}

function durationMs(run: WorkflowRun) {
  const start = run.startedAt ? Date.parse(run.startedAt) : Date.parse(run.createdAt);
  const end = run.completedAt ? Date.parse(run.completedAt) : Date.now();
  return Math.max(0, end - start);
}

export function calculateRunAnalytics(
  run: WorkflowRun,
  nodeRuns: NodeRun[],
): RunAnalytics {
  const byAgent = new Map<string, AgentRunMetric>();
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;

  for (const nodeRun of nodeRuns) {
    const telemetry = nodeRun.telemetry;
    if (!telemetry) continue;
    inputTokens += telemetry.inputTokens;
    outputTokens += telemetry.outputTokens;
    costUsd += telemetry.costUsd;
    const current = byAgent.get(telemetry.agentId) ?? {
      agentId: telemetry.agentId,
      model: telemetry.model,
      runs: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    current.runs += 1;
    current.inputTokens += telemetry.inputTokens;
    current.outputTokens += telemetry.outputTokens;
    current.costUsd += telemetry.costUsd;
    byAgent.set(telemetry.agentId, current);
  }

  return {
    runId: run.id,
    durationMs: durationMs(run),
    nodeCount: nodeRuns.length,
    succeededNodes: nodeRuns.filter((item) => item.status === 'succeeded').length,
    failedNodes: nodeRuns.filter((item) => item.status === 'failed').length,
    waitingNodes: nodeRuns.filter((item) => item.status === 'waiting-approval').length,
    inputTokens,
    outputTokens,
    costUsd: Number(costUsd.toFixed(6)),
    byAgent: [...byAgent.values()].sort((left, right) => right.costUsd - left.costUsd),
  };
}

export function formatDuration(duration: number) {
  if (duration < 1000) return `${duration}ms`;
  const seconds = Math.round(duration / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
