import type {
  WorkflowDefinition,
  WorkflowTemplate,
  WorkflowVersion,
} from '../../services/content-pipeline/types';

export {
  contentPipelineArtifactTypes,
  contentPipelineContracts,
} from '../../services/content-pipeline/contracts';

/** 图定义来自后端接口，这里只按它派生流程模板信息。 */
export function buildWorkflowTemplate(
  definition: WorkflowDefinition,
  version = 1,
): WorkflowTemplate {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    activeVersionId: `${definition.id}-v${version}`,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  };
}

/** 按图定义派生一份版本记录，供演示运行时使用。 */
export function buildWorkflowVersion(
  definition: WorkflowDefinition,
  version = 1,
): WorkflowVersion {
  const template = buildWorkflowTemplate(definition, version);
  return {
    id: template.activeVersionId,
    workflowId: template.id,
    version,
    status: 'active',
    definition,
    createdAt: template.createdAt,
    createdBy: 'system',
  };
}
