/* 节点提示词地图：某次运行里一个节点的调用序列、六阶段、输入输出与模板漂移。
 *
 * 数据全部来自后端读接口，前端不自己判断节点与阶段状态；阶段的中文名与摘要在这里
 * 给 —— 渲染本来就要按 `kind` 分派，文案跟着分派走，不占后端字段。
 */

import { apiGet } from '../runtime/apiClient';
import type { ArtifactRef } from './runs';

export type StageKind = 'template' | 'sources' | 'context' | 'messages' | 'request' | 'output';

/** 阶段状态：尚未发生、已填充、输出中、失败；`pending` 的阶段没有数据。 */
export type StageState = 'pending' | 'filled' | 'streaming' | 'failed';

/** 模板声明的一个变量由什么填充。`portId` 为空而状态是 `bound` 说明值来自平台上下文。 */
export interface TemplateBinding {
  name: string;
  state: 'pending' | 'bound';
  portId: string | null;
  nodeId: string | null;
  itemKey: string | null;
  contentHash: string | null;
}

export interface TemplateData {
  ref: string;
  currentHash: string | null;
  runHash: string | null;
  changed: boolean;
  variables: string[];
  bindings: TemplateBinding[];
  template: string | null;
  staticPrefix: string | null;
  injection: string | null;
}

/** 这次调用用到的提示词资产片段。 */
export interface SourceItem {
  ref: string;
  name: string | null;
  order: number;
  role: string;
  contentHash: string;
  templateText: string;
  renderedText: string;
}

/** 一个变量由哪份产物版本填充。 */
export interface BindingItem {
  portId: string;
  nodeId: string;
  itemKey: string;
  contentHash: string;
}

export interface RequestData {
  provider: string;
  model: string;
  role: string;
  temperature: number;
  attempt: number;
  startedAt: string;
}

export interface OutputData {
  message: Record<string, unknown> | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  completedAt: string;
  error: string;
}

export type PromptMapStage =
  | { kind: 'template'; state: StageState; data: TemplateData | null }
  | { kind: 'sources'; state: StageState; data: SourceItem[] | null }
  | { kind: 'context'; state: StageState; data: BindingItem[] | null }
  | { kind: 'messages'; state: StageState; data: Array<Record<string, unknown>> | null }
  | { kind: 'request'; state: StageState; data: RequestData | null }
  | { kind: 'output'; state: StageState; data: OutputData | null };

/** 一次调用的状态：`pending` 是预期调用，其余取自 `llm_runs.status`。 */
export interface PromptMapCall {
  callId: string | null;
  sequence: number;
  attempt: number;
  itemKey: string;
  generation: number;
  role: string;
  status: string;
  stages: PromptMapStage[];
}

/** 一个产物版本的引用与正文；类型定义在运行读模型里，这里只转发。 */
export type { ArtifactRef };

export interface PromptMap {
  runId: string;
  workflowId: string;
  nodeId: string;
  nodeStatus: string;
  promptRef: string | null;
  template: TemplateData | null;
  calls: PromptMapCall[];
  inputs: ArtifactRef[];
  outputs: ArtifactRef[];
}

export const stageLabels: Record<StageKind, string> = {
  template: '模板原文',
  sources: '来源资产',
  context: '上下文注入',
  messages: '最终消息',
  request: '已提交请求',
  output: '模型输出',
};

export const stageStateLabels: Record<StageState, string> = {
  pending: '待填充',
  filled: '已填充',
  streaming: '输出中',
  failed: '失败',
};

/** 阶段的中文名。 */
export function stageLabel(kind: StageKind): string {
  return stageLabels[kind];
}

/** 阶段状态的中文名。 */
export function stageStateLabel(state: StageState): string {
  return stageStateLabels[state];
}

/** 调用状态的中文名；取值来自 `llm_runs.status`，多出的一档 `pending` 是预期调用。 */
export function callStatusLabel(status: string): string {
  if (status === 'pending') return '待运行';
  if (status === 'running') return '执行中';
  if (status === 'success') return '完成';
  if (status === 'error') return '失败';
  if (status === 'cancelled') return '已取消';
  return status;
}

/** 阶段的摘要行：不展开也能看出这一步到哪了。 */
export function stageSummary(stage: PromptMapStage): string {
  switch (stage.kind) {
    case 'template':
      if (!stage.data) return stageStateLabel(stage.state);
      return `模板 ${shortHash(stage.data.currentHash)}`;
    case 'sources':
      if (!stage.data) return stageStateLabel(stage.state);
      return `${stage.data.length} 段来源资产`;
    case 'context':
      if (!stage.data) return stageStateLabel(stage.state);
      return `${stage.data.length} 个输入端口`;
    case 'messages':
      if (!stage.data) return stageStateLabel(stage.state);
      return `${stage.data.length} 条消息`;
    case 'request':
      if (!stage.data) return stageStateLabel(stage.state);
      return `${stage.data.model} · 温度 ${stage.data.temperature}`;
    case 'output':
      if (stage.state === 'streaming') return '输出中';
      if (!stage.data) return stageStateLabel(stage.state);
      if (stage.state === 'failed') return `失败：${stage.data.error}`;
      return `${stage.data.totalTokens} tokens · ${stage.data.durationMs} ms`;
  }
}

/** 阶段的正文：展开时看到的就是这一步实际进出的内容。 */
export function stageDetail(stage: PromptMapStage): string {
  switch (stage.kind) {
    case 'template':
      return stage.data?.template ?? '';
    case 'sources':
      return (stage.data ?? []).map((source) => source.renderedText).join('\n\n---\n\n');
    case 'context':
      return stage.data ? JSON.stringify(stage.data, null, 2) : '';
    case 'messages':
      return (stage.data ?? [])
        .map((message) => `[${String(message.role ?? '')}]\n${String(message.content ?? '')}`)
        .join('\n\n');
    case 'request':
      return stage.data ? JSON.stringify(stage.data, null, 2) : '';
    case 'output':
      if (!stage.data) return '';
      if (stage.data.error) return stage.data.error;
      return JSON.stringify(stage.data.message, null, 2);
  }
}

/** 变量清单的行：每个变量是否已绑定、绑定到什么。 */
export interface TemplateBindingRow {
  name: string;
  state: 'pending' | 'bound';
  source: string;
}

export function bindingRows(template: TemplateData | null): TemplateBindingRow[] {
  return (template?.bindings ?? []).map((binding) => ({
    name: binding.name,
    state: binding.state,
    source: bindingSource(binding),
  }));
}

function bindingSource(binding: TemplateBinding): string {
  if (binding.state === 'pending') return '未绑定';
  if (binding.portId) return `产物端口 ${binding.portId}`;
  return '平台上下文';
}

/** 模板漂移的说明；没有漂移时返回 null。 */
export function driftLabel(template: TemplateData | null): string | null {
  if (!template?.changed) return null;
  return `本次运行用的是 ${shortHash(template.runHash)}，当前模板是 ${shortHash(template.currentHash)}`;
}

/** `GateReview` 评估的要点：谁审的、结论、意见。 */
export interface GateReviewRow {
  reviewer: string;
  decision: string;
  comments: string;
}

export function gateRows(outputs: ArtifactRef[]): GateReviewRow[] {
  return outputs
    .filter((artifact) => artifact.type === 'GateReview' && isRecord(artifact.payload))
    .map((artifact) => {
      const payload = artifact.payload as Record<string, unknown>;
      return {
        reviewer: String(payload.reviewer ?? ''),
        decision: String(payload.decision ?? ''),
        comments: String(payload.comments ?? ''),
      };
    });
}

/** 产物的单行描述。 */
export function artifactLabel(artifact: ArtifactRef): string {
  const type = artifact.type || '未知类型';
  return `${artifact.portId} · ${type} · ${shortHash(artifact.contentHash)}`;
}

/** 内容身份的短写：`sha256:1a2b3c4d…` → `1a2b3c4`。 */
export function shortHash(hash: string | null): string {
  if (!hash) return '—';
  return hash.replace(/^sha256:/, '').slice(0, 7);
}

function isRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

/** 取某节点在该次运行里的提示词地图。 */
export async function fetchNodePromptMap(
  workflowId: string,
  runId: string,
  nodeId: string,
): Promise<PromptMap> {
  return apiGet<PromptMap>(
    `/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}` +
      `/nodes/${encodeURIComponent(nodeId)}/prompt-map`,
  );
}

/** 取提示词两版之间的统一 diff。 */
export async function fetchPromptDiff(ref: string, from: string, to: string): Promise<string> {
  const query = new URLSearchParams({ from, to });
  const payload = await apiGet<{ unifiedDiff: string }>(
    `/prompts/${refPath(ref)}/diff?${query.toString()}`,
  );
  return payload.unifiedDiff;
}

/** 资产路径进 URL：斜杠是路径分隔，逐段编码后原样保留。 */
function refPath(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}
