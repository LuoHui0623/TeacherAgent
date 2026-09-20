import { apiGet } from '../runtime/apiClient';

export type PromptMapCallStatus = 'ok' | 'error' | 'running';

export interface PromptMapCall {
  id: string;
  role: string;
  provider: string;
  model: string;
  inputText: string;
  outputText: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  status: PromptMapCallStatus;
  error: string;
  createdAt: string;
  template: string;
}

export interface CallLogApiRow {
  id: number;
  role: string;
  provider: string;
  model: string;
  input_text: string;
  output_text: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
  status: 'ok' | 'error';
  error: string;
  created_at: string;
}

export const promptRoleLabels: Record<string, string> = {
  tutor: 'Tutor Agent',
  curriculum: '课程设计 Agent',
  'context-profiler': '上下文画像 Agent',
  'intent-planner': '学习意图 Agent',
  'outline-architect': '大纲架构 Agent',
  'section-writer': '章节主笔 Agent',
  reviewer: '审校 Agent',
  reviser: '修订 Agent',
  beautifier: '教材美化 Agent',
  'assessment-generator': '练习生成 Agent',
  'quality-publisher': '质量发布 Agent',
};

export const currentPromptTemplates: Record<string, string> = {
  'context-profiler': '读取用户画像与最近学习上下文，整理为可供课程设计使用的 ContextSnapshot。只保留可验证信息，不替用户臆测学习目标。',
  'intent-planner': '根据 ContextSnapshot 和用户目标生成 Learning Brief，明确范围、预期结果、约束与待确认问题。',
  'outline-architect': '根据 Learning Brief 设计可执行课程大纲，覆盖目标、知识点、章节依赖与验收标准。',
  'section-writer': '依据已确认的大纲条目撰写章节草稿，保持术语一致，并为每个关键概念提供可验证的学习结果。',
  reviewer: '审阅章节草稿，输出结构化问题、严重级别与可执行的修订建议，不直接掩盖原文问题。',
  reviser: '根据审校报告和用户意见修订章节，保留有效内容并逐项关闭已确认的问题。',
  beautifier: '在不改变事实与结构契约的前提下，统一教材格式、层级、示例和阅读节奏。',
  'assessment-generator': '根据课程目标与章节内容生成练习、参考答案和解析，并检查题目覆盖范围。',
  'quality-publisher': '检查发布清单与所有必需产物，确认内容可发布后生成最终教材版本。',
  tutor: '理解学习者当前目标与上下文，选择合适的教学行动，并在必要时调用工具完成任务。',
  curriculum: '根据学习目标、画像和约束设计可验证的课程结构与内容产物。',
};

export function promptRoleLabel(role: string): string {
  return promptRoleLabels[role] ?? role;
}

export function promptTemplateForRole(role: string): string {
  return currentPromptTemplates[role] ?? '当前提示词模板由工作流侧提供。';
}

export function sortPromptMapCalls(calls: PromptMapCall[]): PromptMapCall[] {
  return [...calls].sort((left, right) => {
    const byTime = left.createdAt.localeCompare(right.createdAt);
    return byTime || left.id.localeCompare(right.id);
  });
}

export function mergePromptMapCalls(
  current: PromptMapCall[],
  incoming: PromptMapCall[],
): PromptMapCall[] {
  const merged = new Map(current.map((call) => [call.id, call]));
  for (const call of incoming) merged.set(call.id, call);
  return sortPromptMapCalls([...merged.values()]);
}

export function callLogToPromptMapCall(row: CallLogApiRow): PromptMapCall {
  return {
    id: String(row.id),
    role: row.role,
    provider: row.provider,
    model: row.model,
    inputText: row.input_text,
    outputText: row.output_text,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    durationMs: row.duration_ms,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    template: promptTemplateForRole(row.role),
  };
}

export async function fetchPromptMapCalls(limit = 100): Promise<PromptMapCall[]> {
  const response = await apiGet<{ logs: CallLogApiRow[] }>(`/llm/call-logs?limit=${limit}`);
  return sortPromptMapCalls(response.logs.map(callLogToPromptMapCall));
}

export function createDemoPromptMapCall({
  id,
  role,
  inputText,
  outputText = '',
  status = 'running',
  createdAt = new Date().toISOString(),
  durationMs = 0,
  totalTokens = 0,
}: {
  id: string;
  role: string;
  inputText: string;
  outputText?: string;
  status?: PromptMapCallStatus;
  createdAt?: string;
  durationMs?: number;
  totalTokens?: number;
}): PromptMapCall {
  return {
    id,
    role,
    provider: 'workflow-demo',
    model: 'content-pipeline-demo',
    inputText,
    outputText,
    promptTokens: totalTokens,
    completionTokens: 0,
    totalTokens,
    durationMs,
    status,
    error: status === 'error' ? outputText : '',
    createdAt,
    template: promptTemplateForRole(role),
  };
}

export const initialPromptMapCalls: PromptMapCall[] = [
  createDemoPromptMapCall({
    id: 'prompt-call-1',
    role: 'context-profiler',
    inputText: '请根据用户画像、最近 Tutor Query 和学习历史生成上下文快照。',
    outputText: '已冻结用户画像、最近 Tutor Query 和学习历史。',
    status: 'ok',
    createdAt: '2026-09-19T09:18:12.000Z',
    durationMs: 812,
    totalTokens: 1240,
  }),
  createDemoPromptMapCall({
    id: 'prompt-call-2',
    role: 'intent-planner',
    inputText: '学习目标：系统学习前端性能优化；可用时间：每周 6 小时。',
    outputText: 'Learning Brief v2：覆盖性能指标、渲染性能和网络优化。',
    status: 'ok',
    createdAt: '2026-09-19T09:19:03.000Z',
    durationMs: 1460,
    totalTokens: 2180,
  }),
  createDemoPromptMapCall({
    id: 'prompt-call-3',
    role: 'outline-architect',
    inputText: '根据已确认 Learning Brief 设计章节依赖、知识点和验收标准。',
    outputText: '课程大纲 v3 已生成，包含 4 个 OutlineItem。',
    status: 'ok',
    createdAt: '2026-09-19T09:23:47.000Z',
    durationMs: 2310,
    totalTokens: 3620,
  }),
  createDemoPromptMapCall({
    id: 'prompt-call-4',
    role: 'section-writer',
    inputText: '并行撰写性能指标、渲染性能、网络优化和缓存策略章节。',
    outputText: '4 个章节草稿已完成。',
    status: 'ok',
    createdAt: '2026-09-19T09:31:25.000Z',
    durationMs: 6280,
    totalTokens: 8140,
  }),
  createDemoPromptMapCall({
    id: 'prompt-call-5',
    role: 'reviewer',
    inputText: '审阅章节草稿，检查术语一致性、前后衔接和验收标准覆盖。',
    outputText: '发现 6 个问题，主要集中在术语一致性和前后衔接。',
    status: 'ok',
    createdAt: '2026-09-19T09:38:16.000Z',
    durationMs: 3180,
    totalTokens: 4410,
  }),
  createDemoPromptMapCall({
    id: 'prompt-call-6',
    role: 'reviser',
    inputText: '应用审校报告，整理修订稿并保留用户可确认的变更说明。',
    outputText: '修订稿已生成，等待章节审批。',
    status: 'ok',
    createdAt: '2026-09-19T09:44:08.000Z',
    durationMs: 2740,
    totalTokens: 3920,
  }),
];



