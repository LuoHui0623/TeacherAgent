import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { WorkflowDefinition } from '../../services/content-pipeline/types';

/** `GET /workflows/{id}` 的响应：图定义本体 + 版本号与内容身份。 */
export interface WorkflowFixture extends WorkflowDefinition {
  version: number;
  contentHash: string;
}

const fixturePath = fileURLToPath(new URL('./workflows.json', import.meta.url));

/**
 * 接口响应的快照。
 *
 * 图定义的真值在后端；这份夹具只是「后端当时返回了什么」，由
 * `src/teacheragent/tests/test_workflow_api.py` 断言它与注册表一致。
 */
export const mainWorkflowDefinition: WorkflowFixture = JSON.parse(
  readFileSync(fixturePath, 'utf8'),
) as WorkflowFixture;
