import { apiGet } from '../runtime/apiClient';
import type { WorkflowDefinition } from './types';

/** 教材生产主流程的 workflow id；与后端注册表里的 id 同值。 */
export const CONTENT_PIPELINE_WORKFLOW_ID = 'content-pipeline-main';

/** 图定义接口的响应：图定义本体 + 它的版本号与内容身份。 */
export interface WorkflowDefinitionPayload extends WorkflowDefinition {
  version: number;
  contentHash: string;
}

/**
 * 从后端取图定义。
 *
 * 图定义是后端资产，前端不再持有自己的副本；接口不可用时调用方负责呈现降级状态，
 * 不回退到任何本地定义。
 */
export async function fetchWorkflowDefinition(
  workflowId: string = CONTENT_PIPELINE_WORKFLOW_ID,
): Promise<WorkflowDefinitionPayload> {
  return apiGet<WorkflowDefinitionPayload>(`/workflows/${workflowId}`);
}
