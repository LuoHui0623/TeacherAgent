import type {
  PortDefinition,
  WorkflowDefinition,
  WorkflowEdgeDefinition,
  WorkflowNodeDefinition,
  WorkflowTemplate,
  WorkflowVersion,
} from '../../services/content-pipeline/types';
import {
  contentPipelineArtifactTypes,
  contentPipelineContracts,
} from '../../services/content-pipeline/contracts';

function port(
  id: string,
  artifactType: string,
  multiple = false,
  required = true,
): PortDefinition {
  return {
    id,
    artifactType,
    required,
    multiple,
    description: artifactType,
  };
}

function node(
  definition: Omit<WorkflowNodeDefinition, 'config' | 'inputs' | 'outputs'> & {
    inputs?: PortDefinition[];
    outputs?: PortDefinition[];
    config?: WorkflowNodeDefinition['config'];
  },
): WorkflowNodeDefinition {
  return {
    ...definition,
    inputs: definition.inputs ?? [],
    outputs: definition.outputs ?? [],
    config: definition.config ?? {},
  };
}

export const mainWorkflowDefinition: WorkflowDefinition = {
  id: 'content-pipeline-main',
  name: '教材生产主流程',
  description: '从 Tutor 上下文到结构化大纲、内容生成、审校、美化和发布的领域主流程。',
  entryNodeIds: ['tutor-trigger'],
  nodes: [
    node({
      id: 'tutor-trigger',
      kind: 'trigger',
      label: 'Tutor 互动',
      description: '接收学习请求、提问和学习行为事件。',
      outputs: [port('events', contentPipelineArtifactTypes.tutorEvents, true)],
    }),
    node({
      id: 'context-snapshot',
      kind: 'context',
      label: '上下文快照',
      description: '冻结用户画像、学习历史、当前 Query 和约束。',
      inputs: [port('events', contentPipelineArtifactTypes.tutorEvents, true)],
      outputs: [port('snapshot', contentPipelineArtifactTypes.contextSnapshot)],
    }),
    node({
      id: 'intent-planner',
      kind: 'agent',
      roleId: 'intent-planner',
      label: '意图与任务规划',
      description: '识别学习意图、范围、难度和预期结果。',
      inputs: [
        port('snapshot', contentPipelineArtifactTypes.contextSnapshot),
        port('feedback', contentPipelineArtifactTypes.revisionFeedback, false, false),
      ],
      outputs: [port('brief', contentPipelineArtifactTypes.learningBrief)],
      config: { promptRef: 'content-pipeline/intent-planner' },
    }),
    node({
      id: 'brief-approval',
      kind: 'human-gate',
      label: '确认 Learning Brief',
      description: '用户确认学习目标、范围和深度。',
      inputs: [port('brief', contentPipelineArtifactTypes.learningBrief)],
      outputs: [
        port('approved', contentPipelineArtifactTypes.learningBrief),
        port('feedback', contentPipelineArtifactTypes.revisionFeedback, false, false),
      ],
      humanApproval: {
        scopeType: 'workflow',
        perItem: false,
        allowBatch: false,
        required: true,
      },
    }),
    node({
      id: 'outline-architect',
      kind: 'agent',
      roleId: 'outline-architect',
      label: '大纲架构',
      description: '生成章节、学习目标、知识点、体量和依赖。',
      inputs: [
        port('brief', contentPipelineArtifactTypes.learningBrief),
        port('feedback', contentPipelineArtifactTypes.revisionFeedback, false, false),
      ],
      outputs: [port('blueprint', contentPipelineArtifactTypes.courseBlueprint)],
      config: { promptRef: 'content-pipeline/outline-architect' },
    }),
    node({
      id: 'outline-contract-gate',
      kind: 'contract-gate',
      label: '大纲 Contract 校验',
      description: '验证大纲结构、覆盖范围、依赖和验收标准。',
      inputs: [port('blueprint', contentPipelineArtifactTypes.courseBlueprint)],
      outputs: [
        port('validated', contentPipelineArtifactTypes.courseBlueprint),
        port('invalid', contentPipelineArtifactTypes.revisionFeedback),
      ],
    }),
    node({
      id: 'outline-approval',
      kind: 'human-gate',
      label: '确认大纲',
      description: '用户确认结构化大纲并决定是否进入内容生产。',
      inputs: [port('blueprint', contentPipelineArtifactTypes.courseBlueprint)],
      outputs: [
        port('approved', contentPipelineArtifactTypes.courseBlueprint),
        port('feedback', contentPipelineArtifactTypes.revisionFeedback, false, false),
      ],
      humanApproval: {
        scopeType: 'outline',
        perItem: false,
        allowBatch: true,
        required: true,
      },
    }),
    node({
      id: 'chapter-writers',
      kind: 'fan-out',
      label: '章节主笔',
      description: '按 OutlineItem 并行生成章节草稿。',
      roleId: 'section-writer',
      inputs: [port('blueprint', contentPipelineArtifactTypes.courseBlueprint)],
      outputs: [port('drafts', contentPipelineArtifactTypes.contentDraft, true)],
      config: { concurrency: 4 },
    }),
    node({
      id: 'reviewer',
      kind: 'agent',
      roleId: 'reviewer',
      label: '审校',
      description: '检查连续性、术语、颗粒度、重复和章节验收标准。',
      inputs: [
        port('drafts', contentPipelineArtifactTypes.contentDraft, true),
        port('revisions', contentPipelineArtifactTypes.contentDraft, true, false),
      ],
      outputs: [port('report', contentPipelineArtifactTypes.reviewReport)],
      config: { promptRef: 'content-pipeline/reviewer' },
    }),
    node({
      id: 'reviser',
      kind: 'agent',
      roleId: 'reviser',
      label: '修订整理',
      description: '应用审校和用户意见，形成修订与二次整理稿。',
      inputs: [
        port('drafts', contentPipelineArtifactTypes.contentDraft, true),
        port('report', contentPipelineArtifactTypes.reviewReport),
        port('feedback', contentPipelineArtifactTypes.revisionFeedback, false, false),
        port('validation', contentPipelineArtifactTypes.validationReport, false, false),
      ],
      outputs: [port('revised', contentPipelineArtifactTypes.contentDraft, true)],
      config: { promptRef: 'content-pipeline/reviser' },
    }),
    node({
      id: 'chapter-approval',
      kind: 'human-gate',
      label: '按章节确认修订',
      description: '用户逐章通过或提出审批意见。',
      inputs: [
        port('drafts', contentPipelineArtifactTypes.contentDraft, true),
        port('report', contentPipelineArtifactTypes.reviewReport),
      ],
      outputs: [
        port('approved', contentPipelineArtifactTypes.contentDraft, true),
        port('feedback', contentPipelineArtifactTypes.revisionFeedback, false, false),
      ],
      humanApproval: {
        scopeType: 'chapter',
        perItem: true,
        allowBatch: true,
        required: true,
        itemPort: 'drafts',
        approvedOutcome: '章节通过',
        changesOutcome: '提出审批意见',
      },
    }),
    node({
      id: 'beautifier',
      kind: 'agent',
      roleId: 'beautifier',
      label: '美化与知识点增强',
      description: '增加公式、列表、表格、callout、Anchor、图示和封面。',
      inputs: [port('content', contentPipelineArtifactTypes.contentDraft, true)],
      outputs: [port('beautified', contentPipelineArtifactTypes.beautifiedContent)],
      config: { promptRef: 'content-pipeline/beautifier' },
    }),
    node({
      id: 'assessment-generator',
      kind: 'agent',
      roleId: 'assessment-generator',
      label: '出题',
      description: '根据正文和知识点生成题目、答案与解析。',
      inputs: [port('content', contentPipelineArtifactTypes.contentDraft, true)],
      outputs: [port('assessments', contentPipelineArtifactTypes.assessmentSet)],
      config: { promptRef: 'content-pipeline/assessment-generator' },
    }),
    node({
      id: 'quality-gate',
      kind: 'contract-gate',
      label: '质检与渲染验证',
      description: '检查公式、Mermaid、Anchor、知识点和内容完整性。',
      inputs: [
        port('beautified', contentPipelineArtifactTypes.beautifiedContent),
        port('assessments', contentPipelineArtifactTypes.assessmentSet),
      ],
      outputs: [
        port('passed', contentPipelineArtifactTypes.publicationManifest),
        port('failed', contentPipelineArtifactTypes.validationReport),
      ],
    }),
    node({
      id: 'publish-approval',
      kind: 'human-gate',
      label: '确认发布',
      description: '用户确认最终教材版本。',
      inputs: [port('manifest', contentPipelineArtifactTypes.publicationManifest)],
      outputs: [
        port('approved', contentPipelineArtifactTypes.publicationManifest),
        port('feedback', contentPipelineArtifactTypes.revisionFeedback, false, false),
      ],
      humanApproval: {
        scopeType: 'publish',
        perItem: false,
        allowBatch: false,
        required: true,
      },
    }),
    node({
      id: 'publisher',
      kind: 'persist',
      label: '发布教材',
      description: '冻结教材版本并写入教材资产。',
      inputs: [port('manifest', contentPipelineArtifactTypes.publicationManifest)],
      outputs: [port('published', contentPipelineArtifactTypes.publicationManifest)],
    }),
  ],
  edges: [
    edge('e-trigger-context', 'tutor-trigger', 'events', 'context-snapshot', 'events'),
    edge('e-context-planner', 'context-snapshot', 'snapshot', 'intent-planner', 'snapshot'),
    edge('e-planner-brief', 'intent-planner', 'brief', 'brief-approval', 'brief'),
    edge('e-brief-approved', 'brief-approval', 'approved', 'outline-architect', 'brief', '审批通过'),
    edge('e-brief-revise', 'brief-approval', 'feedback', 'intent-planner', 'feedback', '要求修改'),
    edge('e-outline-validate', 'outline-architect', 'blueprint', 'outline-contract-gate', 'blueprint'),
    edge('e-outline-invalid', 'outline-contract-gate', 'invalid', 'outline-architect', 'feedback', '校验失败'),
    edge('e-outline-approval', 'outline-contract-gate', 'validated', 'outline-approval', 'blueprint'),
    edge('e-outline-revise', 'outline-approval', 'feedback', 'outline-architect', 'feedback', '要求修改'),
    edge('e-outline-write', 'outline-approval', 'approved', 'chapter-writers', 'blueprint', '审批通过'),
    edge('e-writer-review', 'chapter-writers', 'drafts', 'reviewer', 'drafts'),
    edge('e-writer-chapter', 'chapter-writers', 'drafts', 'chapter-approval', 'drafts'),
    edge('e-writer-revise', 'chapter-writers', 'drafts', 'reviser', 'drafts'),
    edge('e-review-revise', 'reviewer', 'report', 'reviser', 'report', '存在 issue'),
    edge('e-review-chapter', 'reviewer', 'report', 'chapter-approval', 'report', '审校通过'),
    edge('e-revise-review', 'reviser', 'revised', 'reviewer', 'revisions'),
    edge('e-chapter-revise', 'chapter-approval', 'feedback', 'reviser', 'feedback', '提出审批意见'),
    edge('e-chapter-beautify', 'chapter-approval', 'approved', 'beautifier', 'content', '章节通过'),
    edge('e-chapter-assess', 'chapter-approval', 'approved', 'assessment-generator', 'content', '章节通过'),
    edge('e-beautify-quality', 'beautifier', 'beautified', 'quality-gate', 'beautified'),
    edge('e-assessment-quality', 'assessment-generator', 'assessments', 'quality-gate', 'assessments'),
    edge('e-quality-revise', 'quality-gate', 'failed', 'reviser', 'validation', '质检失败'),
    edge('e-quality-publish', 'quality-gate', 'passed', 'publish-approval', 'manifest'),
    edge('e-publish-revise', 'publish-approval', 'feedback', 'reviser', 'feedback', '驳回'),
    edge('e-publish-final', 'publish-approval', 'approved', 'publisher', 'manifest', '确认发布'),
  ],
};

function edge(
  id: string,
  fromNodeId: string,
  fromPortId: string,
  toNodeId: string,
  toPortId: string,
  label?: string,
): WorkflowEdgeDefinition {
  return {
    id,
    from: { nodeId: fromNodeId, portId: fromPortId },
    to: { nodeId: toNodeId, portId: toPortId },
    label,
    condition: label,
  };
}

export const mainWorkflowTemplate: WorkflowTemplate = {
  id: mainWorkflowDefinition.id,
  name: mainWorkflowDefinition.name,
  description: mainWorkflowDefinition.description,
  activeVersionId: 'content-pipeline-main-v1',
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
};

export const mainWorkflowVersion: WorkflowVersion = {
  id: mainWorkflowTemplate.activeVersionId,
  workflowId: mainWorkflowTemplate.id,
  version: 1,
  status: 'active',
  definition: mainWorkflowDefinition,
  createdAt: mainWorkflowTemplate.createdAt,
  createdBy: 'system',
};

export { contentPipelineArtifactTypes, contentPipelineContracts };
