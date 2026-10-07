/* 运行读模型与运行控制：pipeline 历史、所选运行的图与节点、以及四个控制动作。
 *
 * 前端是纯投影：状态、阶段与产物都来自后端，这里只把它们摊成可直接渲染的形状。
 * 暂停是执行器内存里的行为（不落库），所以暂停视图由前端自己记（口径 26）。
 */

import { apiGet, apiPost } from '../runtime/apiClient';
import type { NodeRunStatus, WorkflowDefinition, WorkflowRunStatus } from './types';

/** 一个产物版本的引用与正文。 */
export interface ArtifactRef {
  nodeId: string;
  portId: string;
  itemKey: string;
  generation: number;
  type: string;
  contentHash: string;
  payload: unknown;
}

/** 一个图节点在该次运行里的执行摘要。 */
export interface NodeRunSummary {
  nodeId: string;
  kind: string;
  label: string;
  status: string;
  attempts: number;
  itemKeys: string[];
  callCount: number;
  eventTime: string;
  error: string;
  inputs: ArtifactRef[];
  outputs: ArtifactRef[];
}

/** 该 run 冻结的图：定义本体加它的版本与内容身份。 */
export interface RunGraphPayload extends WorkflowDefinition {
  version: number;
  contentHash: string;
}

export interface WorkflowRunSummary {
  runId: string;
  workflowId: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  durationMs: number;
  nodeCount: number;
  graphContentHash: string;
  triggerMessageId: string | null;
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  graph: RunGraphPayload;
  nodes: NodeRunSummary[];
}

/** 一次推进的结果：跑了哪些实例、在等决断、失败的，以及是否仍在暂停。 */
export interface RunProgress {
  executed: RunInstance[];
  waiting: RunInstance[];
  failed: RunInstance[];
  paused: boolean;
}

export interface RunInstance {
  nodeId: string;
  itemKey: string;
}

/** 新开一次运行的结果：身份、图版本与第一轮推进。 */
export interface StartedRun extends RunProgress {
  workflowId: string;
  runId: string;
  messageId: string;
  graphContentHash: string;
}

export interface RunEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}

export interface DecideOptions {
  approved: boolean;
  comments?: string;
  itemKey?: string;
  expectedHash?: string | null;
}

/** 后端的节点状态词表更窄：`waiting-human` 在前端叫 `waiting-approval`。 */
export function nodeRunStatus(status: string): NodeRunStatus {
  if (status === 'waiting-human') return 'waiting-approval';
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'pending';
}

/** 该 run 的每个节点状态；没轮到过的节点由后端报 `pending`，这里照旧保留。 */
export function nodeStatusMap(detail: WorkflowRunDetail | null): Record<string, NodeRunStatus> {
  return Object.fromEntries(
    (detail?.nodes ?? []).map((node) => [node.nodeId, nodeRunStatus(node.status)]),
  );
}

/** 运行级状态：后端按节点汇总，暂停是执行器内存里的行为，由前端叠加。 */
export function runStatusOf(run: { status: string } | null, paused: boolean): WorkflowRunStatus {
  if (paused) return 'paused';
  if (!run) return 'ready';
  const status = run.status;
  if (
    status === 'draft' ||
    status === 'ready' ||
    status === 'running' ||
    status === 'paused' ||
    status === 'waiting-human' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'ready';
}

/** 事件时间线：由节点执行事实派生，不另建账本。 */
export function timelineEvents(detail: WorkflowRunDetail | null): RunEvent[] {
  return [...(detail?.nodes ?? [])]
    .filter((node) => node.eventTime !== '')
    .sort((left, right) => left.eventTime.localeCompare(right.eventTime))
    .map((node) => ({
      id: node.nodeId,
      at: timestampLabel(node.eventTime),
      title: `${node.label} · ${nodeStatusText(node.status)}`,
      detail: node.error || (node.attempts > 1 ? `第 ${node.attempts} 次尝试` : ''),
      tone: statusTone(node.status),
    }));
}

/** 该 run 的全部产物版本：按节点产出汇总，重跑的旧代次也在（按代次降序）。 */
export function artifactRows(detail: WorkflowRunDetail | null): ArtifactRef[] {
  return (detail?.nodes ?? [])
    .flatMap((node) => node.outputs)
    .sort(
      (left, right) =>
        left.nodeId.localeCompare(right.nodeId) ||
        right.generation - left.generation ||
        left.portId.localeCompare(right.portId),
    );
}

/** 一次运行的三个真实指标：耗时、已跑过的节点数、模型调用次数。 */
export function runMetrics(detail: WorkflowRunDetail | null): {
  duration: string;
  nodes: string;
  calls: string;
} {
  if (!detail) return { duration: '—', nodes: '—', calls: '—' };
  const touched = detail.nodes.filter((node) => node.status !== 'pending').length;
  const calls = detail.nodes.reduce((total, node) => total + node.callCount, 0);
  return {
    duration: formatDuration(detail.durationMs),
    nodes: `${touched} / ${detail.nodes.length}`,
    calls: String(calls),
  };}

/** 该节点上等待决断的条目：人工门禁按条目各决断一次。 */
export function waitingItems(node: NodeRunSummary | null): string[] {
  if (!node || node.status !== 'waiting-human') return [];
  return node.itemKeys.length > 0 ? node.itemKeys : [''];
}

/** 某个条目的被审内容身份：决断要绑定界面上看到的那一版（口径 20）。 */
export function reviewedHash(node: NodeRunSummary | null, itemKey: string): string | null {
  const item = (node?.inputs ?? []).find((artifact) => artifact.itemKey === itemKey);
  return item?.contentHash ?? null;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

/** 内容身份的短写；用不上 `sha256:` 前缀时就不占宽度。 */
export function shortId(value: string, length = 7): string {
  return value.replace(/^sha256:/, '').slice(0, length);
}

/** 时间戳的短写：只保留时刻，运行列表与时间线都不需要日期。 */
export function timestampLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function nodeStatusText(status: string): string {
  if (status === 'waiting-human') return '等待人工';
  if (status === 'running') return '运行中';
  if (status === 'succeeded') return '已完成';
  if (status === 'failed') return '失败';
  if (status === 'cancelled') return '已取消';
  return '等待';
}

function statusTone(status: string): RunEvent['tone'] {
  if (status === 'failed') return 'danger';
  if (status === 'cancelled') return 'warning';
  if (status === 'succeeded') return 'success';
  return 'neutral';
}

/** 列出该流程的 pipeline 历史，最近的运行在最前。 */
export async function fetchWorkflowRuns(
  workflowId: string,
  limit = 20,
): Promise<WorkflowRunSummary[]> {
  const payload = await apiGet<{ runs: WorkflowRunSummary[] }>(
    `/workflows/${encodeURIComponent(workflowId)}/runs?limit=${limit}`,
  );
  return payload.runs;
}

/** 取一次运行的详情：摘要、冻结的图与节点摘要。 */
export async function fetchWorkflowRun(
  workflowId: string,
  runId: string,
): Promise<WorkflowRunDetail> {
  return apiGet<WorkflowRunDetail>(
    `/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}`,
  );
}

/** 由一条 proposal 消息发起一次运行；消息不存在或不是提议时后端拒绝。 */
export async function createWorkflowRun(
  workflowId: string,
  messageId: string,
): Promise<StartedRun> {
  return apiPost<StartedRun>(`/workflows/${encodeURIComponent(workflowId)}/runs`, { messageId });
}

function runPath(workflowId: string, runId: string, tail = ''): string {
  return `/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}${tail}`;
}

/** 暂停：执行器不再推进这个 run；库里状态不变。 */
export async function pauseWorkflowRun(
  workflowId: string,
  runId: string,
): Promise<{ runId: string; paused: boolean }> {
  return apiPost(`${runPath(workflowId, runId, '/pause')}`, {});
}

/** 继续：去掉暂停标记并接着推进。 */
export async function resumeWorkflowRun(workflowId: string, runId: string): Promise<RunProgress> {
  return apiPost(`${runPath(workflowId, runId, '/resume')}`, {});
}

/** 从某节点重跑：该节点与全部下游进新代次。 */
export async function rerunRunNode(
  workflowId: string,
  runId: string,
  nodeId: string,
): Promise<RunProgress & { nodeId: string; affected: RunInstance[] }> {
  return apiPost(`${runPath(workflowId, runId, `/nodes/${encodeURIComponent(nodeId)}/rerun`)}`, {});
}

/** 人工决断：写一行评估并推进下游；版本冲突时后端返回 409。 */
export async function decideRunNode(
  workflowId: string,
  runId: string,
  nodeId: string,
  options: DecideOptions,
): Promise<RunProgress & { nodeId: string }> {
  return apiPost(`${runPath(workflowId, runId, `/nodes/${encodeURIComponent(nodeId)}/decide`)}`, {
    approved: options.approved,
    comments: options.comments ?? '',
    itemKey: options.itemKey ?? '',
    expectedHash: options.expectedHash ?? null,
  });
}
