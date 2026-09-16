import {
  contentPipelineArtifactTypes,
  type AssessmentSetPayload,
  type BeautifiedContentPayload,
  type ContentDraftPayload,
  type ContextSnapshotPayload,
  type CourseBlueprintPayload,
  type LearningBriefPayload,
  type PublicationManifestPayload,
  type ReviewReportPayload,
  type TutorEventBatchPayload,
} from '../../services/content-pipeline/contracts';
import {
  ContentAgentRegistry,
  type ContentAgentDefinition,
  type ContentAgentRole,
} from '../../services/content-pipeline/agents';
import {
  WorkflowRuntime,
  type NodeArtifactOutput,
  type NodeExecutionContext,
  type NodeHandler,
} from '../../services/content-pipeline/runtime';
import type { JsonValue } from '../../services/content-pipeline/types';
import {
  mainWorkflowDefinition,
  mainWorkflowVersion,
} from './main-workflow';

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function artifactOutput(
  context: NodeExecutionContext,
  portId: string,
  artifactType: NodeArtifactOutput['artifactType'],
  payload: JsonValue,
  summary: string,
  suffix = 'main',
): NodeArtifactOutput {
  const id = `${context.run.id}:${context.node.id}:${context.nodeRun.attempt}:${suffix}`;
  return {
    portId,
    artifactId: id,
    versionId: `${id}:v1`,
    artifactType,
    payload,
    summary,
    createdAt: context.now(),
  };
}

function payloadRecord(payload: JsonValue): Record<string, JsonValue> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, JsonValue>)
    : {};
}

function draftPayloads(context: NodeExecutionContext, portId: string) {
  return (context.inputs[portId] ?? []).map((version) => ({
    version,
    payload: version.payload as unknown as ContentDraftPayload,
  }));
}

const agentDefinitions: ContentAgentDefinition[] = [
  {
    id: 'context-profiler',
    label: '学情与上下文 Agent',
    description: '冻结用户画像、行为事件和当前学习目标。',
    promptRef: 'content-pipeline/context-profiler',
    defaultModel: 'mock-context-v1',
    inputArtifactTypes: [contentPipelineArtifactTypes.tutorEvents],
    outputArtifactTypes: [contentPipelineArtifactTypes.contextSnapshot],
  },
  {
    id: 'intent-planner',
    label: '意图与任务规划 Agent',
    description: '识别学习范围和任务计划，生成 Learning Brief。',
    promptRef: 'content-pipeline/intent-planner',
    defaultModel: 'mock-planner-v1',
    inputArtifactTypes: [
      contentPipelineArtifactTypes.contextSnapshot,
      contentPipelineArtifactTypes.revisionFeedback,
    ],
    outputArtifactTypes: [contentPipelineArtifactTypes.learningBrief],
  },
  {
    id: 'outline-architect',
    label: '大纲架构 Agent',
    description: '生成结构化章节、知识点、体量和验收标准。',
    promptRef: 'content-pipeline/outline-architect',
    defaultModel: 'mock-outline-v1',
    inputArtifactTypes: [
      contentPipelineArtifactTypes.learningBrief,
      contentPipelineArtifactTypes.revisionFeedback,
    ],
    outputArtifactTypes: [contentPipelineArtifactTypes.courseBlueprint],
  },
  {
    id: 'section-writer',
    label: '章节主笔 Agent',
    description: '按 OutlineItem 并行生成 Markdown 内容草稿。',
    promptRef: 'content-pipeline/section-writer',
    defaultModel: 'mock-writer-v1',
    inputArtifactTypes: [contentPipelineArtifactTypes.courseBlueprint],
    outputArtifactTypes: [contentPipelineArtifactTypes.contentDraft],
  },
  {
    id: 'reviewer',
    label: '审校 Agent',
    description: '输出结构化审校报告和章节验收结论。',
    promptRef: 'content-pipeline/reviewer',
    defaultModel: 'mock-reviewer-v1',
    inputArtifactTypes: [contentPipelineArtifactTypes.contentDraft],
    outputArtifactTypes: [contentPipelineArtifactTypes.reviewReport],
  },
  {
    id: 'reviser',
    label: '修订整理 Agent',
    description: '应用审校和用户意见，完成修订与二次整理。',
    promptRef: 'content-pipeline/reviser',
    defaultModel: 'mock-reviser-v1',
    inputArtifactTypes: [
      contentPipelineArtifactTypes.contentDraft,
      contentPipelineArtifactTypes.reviewReport,
      contentPipelineArtifactTypes.revisionFeedback,
    ],
    outputArtifactTypes: [contentPipelineArtifactTypes.contentDraft],
  },
  {
    id: 'beautifier',
    label: '美化 Agent',
    description: '增强公式、列表、Anchor、知识点和封面。',
    promptRef: 'content-pipeline/beautifier',
    defaultModel: 'mock-beautifier-v1',
    inputArtifactTypes: [contentPipelineArtifactTypes.contentDraft],
    outputArtifactTypes: [contentPipelineArtifactTypes.beautifiedContent],
  },
  {
    id: 'assessment-generator',
    label: '出题 Agent',
    description: '生成与知识点关联的题目、答案和解析。',
    promptRef: 'content-pipeline/assessment-generator',
    defaultModel: 'mock-assessment-v1',
    inputArtifactTypes: [contentPipelineArtifactTypes.contentDraft],
    outputArtifactTypes: [contentPipelineArtifactTypes.assessmentSet],
  },
  {
    id: 'quality-publisher',
    label: '质检与发布 Agent',
    description: '校验最终内容并冻结发布清单。',
    promptRef: 'content-pipeline/quality-publisher',
    defaultModel: 'mock-publisher-v1',
    inputArtifactTypes: [
      contentPipelineArtifactTypes.beautifiedContent,
      contentPipelineArtifactTypes.assessmentSet,
      contentPipelineArtifactTypes.publicationManifest,
    ],
    outputArtifactTypes: [
      contentPipelineArtifactTypes.publicationManifest,
      contentPipelineArtifactTypes.validationReport,
    ],
  },
];

function registerAgent(
  registry: ContentAgentRegistry,
  role: ContentAgentRole,
  handler: NodeHandler,
) {
  const definition = agentDefinitions.find((item) => item.id === role);
  if (!definition) throw new Error(`未定义 Agent：${role}`);
  registry.register(definition, handler);
}

export function createMockContentAgentRegistry() {
  const registry = new ContentAgentRegistry();

  registerAgent(registry, 'context-profiler', (context) => {
    const eventBatches = context.inputs.events ?? [];
    const payload: ContextSnapshotPayload = {
      id: `${context.run.id}:context`,
      learnerId: 'local-user',
      capturedAt: context.now(),
      query: '我想系统学习前端性能优化',
      profileSummary: '具备 JavaScript 与 React 基础，实践导向学习偏好。',
      currentLevel: 'intermediate',
      preferences: ['项目实践', '结构化大纲'],
      knownKnowledgePointIds: ['javascript', 'react'],
      weakKnowledgePointIds: ['browser-rendering', 'network-performance'],
      sourceEventIds: eventBatches.map((version) => version.id),
    };
    return {
      outputs: [
        artifactOutput(
          context,
          'snapshot',
          contentPipelineArtifactTypes.contextSnapshot,
          asJson(payload),
          '上下文快照',
        ),
      ],
    };
  });

  registerAgent(registry, 'intent-planner', (context) => {
    const payload: LearningBriefPayload = {
      id: `${context.run.id}:brief`,
      goal: '掌握前端性能优化的分析与实践',
      intent: '从基础指标到项目优化形成系统能力',
      learnerSummary: '具备 React 基础，偏好示例驱动和可运行实验。',
      scope: {
        level: 'intermediate',
        depth: 'systematic',
        breadth: 'frontend-performance',
        estimatedMinutes: 480,
      },
      expectedOutcomes: ['识别性能瓶颈', '制定优化方案', '验证优化结果'],
      constraints: ['每周 6 小时', '以项目实践为主'],
      questions: [],
    };
    return {
      outcome: '审批通过',
      outputs: [
        artifactOutput(
          context,
          'brief',
          contentPipelineArtifactTypes.learningBrief,
          asJson(payload),
          'Learning Brief',
        ),
      ],
    };
  });

  registerAgent(registry, 'outline-architect', (context) => {
    const payload: CourseBlueprintPayload = {
      id: `${context.run.id}:blueprint`,
      briefId: `${context.run.id}:brief`,
      title: '前端性能优化',
      audience: '具备 React 基础的中级学习者',
      expectedOutcomes: ['能诊断性能瓶颈', '能完成一次端到端优化'],
      coreKnowledgePointIds: ['performance-metrics', 'rendering', 'network'],
      estimatedMinutes: 480,
      items: [1, 2, 3].map((index) => ({
        id: `${context.run.id}:outline-${index}`,
        order: index,
        title: ['性能指标与测量', '渲染性能', '网络与缓存'][index - 1],
        summary: `第 ${index} 个核心章节`,
        learningObjectives: [`掌握第 ${index} 部分核心概念`],
        knowledgePointIds: [`kp-${index}`],
        prerequisites: index > 1 ? [`kp-${index - 1}`] : [],
        requiredArtifacts: ['ContentDraft', 'AssessmentSet'],
        assessmentCriteria: ['完成章节练习', '能解释优化方案'],
        estimatedMinutes: 160,
        depth: 'systematic',
        children: [],
      })),
    };
    return {
      outcome: '校验合格',
      outputs: [
        artifactOutput(
          context,
          'blueprint',
          contentPipelineArtifactTypes.courseBlueprint,
          asJson(payload),
          '课程大纲',
        ),
      ],
    };
  });

  registerAgent(registry, 'section-writer', (context) => {
    const blueprint = context.inputs.blueprint?.[0]?.payload as unknown as
      | CourseBlueprintPayload
      | undefined;
    const items = blueprint?.items ?? [];
    return {
      outputs: items.map((item, index) =>
        artifactOutput(
          context,
          'drafts',
          contentPipelineArtifactTypes.contentDraft,
          asJson({
            id: `${context.run.id}:draft:${item.id}`,
            outlineItemId: item.id,
            chapterId: item.id,
            title: item.title,
            markdown: `## ${item.title}\n\n这是章节主笔生成的初始 Markdown 草稿。`,
            knowledgePointIds: item.knowledgePointIds,
            sourceRefs: [],
          } satisfies ContentDraftPayload),
          `${item.title} 草稿`,
          `chapter-${index + 1}`,
        ),
      ),
    };
  });

  registerAgent(registry, 'reviewer', (context) => {
    const revised = context.inputs.revisions ?? [];
    const initialDrafts = context.inputs.drafts ?? [];
    const hasRevision = revised.length > 0;
    const target = revised[0] ?? initialDrafts[0];
    const targetPayload = payloadRecord(target?.payload ?? {});
    const payload: ReviewReportPayload = {
      id: `${context.run.id}:review:${context.nodeRun.attempt}`,
      chapterId: String(targetPayload.chapterId ?? 'chapter-1'),
      draftVersionId: target?.id ?? '',
      verdict: hasRevision ? 'pass' : 'changes-required',
      summary: hasRevision ? '修订稿通过连续性、术语和验收检查。' : '发现术语不统一和章节衔接问题。',
      issues: hasRevision
        ? []
        : [
            {
              id: `${context.run.id}:issue:1`,
              severity: 'warning',
              category: 'terminology',
              title: '术语不统一',
              description: '同一概念在不同章节使用不同称呼。',
              targetChapterId: 'chapter-1',
              suggestion: '统一术语并补充第一次出现时的说明。',
            },
          ],
    };
    return {
      outcome: hasRevision ? '审校通过' : '存在 issue',
      outputs: [
        artifactOutput(
          context,
          'report',
          contentPipelineArtifactTypes.reviewReport,
          asJson(payload),
          hasRevision ? '审校通过报告' : '审校问题报告',
        ),
      ],
    };
  });

  registerAgent(registry, 'reviser', (context) => {
    const drafts = draftPayloads(context, 'drafts');
    return {
      outputs: drafts.map(({ version, payload }, index) =>
        artifactOutput(
          context,
          'revised',
          contentPipelineArtifactTypes.contentDraft,
          asJson({
            ...payload,
            id: `${payload.id}:revised:${context.nodeRun.attempt}`,
            title: `${payload.title}（修订稿）`,
            markdown: `${payload.markdown}\n\n> 已根据审校意见完成二次整理。`,
            revisionOfVersionId: version.id,
          } satisfies ContentDraftPayload),
          `${payload.title} 修订稿`,
          `chapter-${index + 1}`,
        ),
      ),
    };
  });

  registerAgent(registry, 'beautifier', (context) => {
    const content = context.inputs.content ?? [];
    const first = content[0]?.payload as unknown as ContentDraftPayload | undefined;
    const payload: BeautifiedContentPayload = {
      id: `${context.run.id}:beautified`,
      draftId: first?.id ?? '',
      markdown: first?.markdown ?? '',
      knowledgePointIds: first?.knowledgePointIds ?? [],
      anchorIds: ['anchor-performance-metrics'],
      assetRefs: ['cover:frontend-performance'],
      cover: {
        title: '前端性能优化',
        subtitle: '从指标到实践',
      },
    };
    return {
      outputs: [
        artifactOutput(
          context,
          'beautified',
          contentPipelineArtifactTypes.beautifiedContent,
          asJson(payload),
          '美化教材',
        ),
      ],
    };
  });

  registerAgent(registry, 'assessment-generator', (context) => {
    const content = context.inputs.content ?? [];
    const first = content[0]?.payload as unknown as ContentDraftPayload | undefined;
    const payload: AssessmentSetPayload = {
      id: `${context.run.id}:assessments`,
      chapterId: first?.chapterId ?? 'chapter-1',
      items: [
        {
          id: `${context.run.id}:question:1`,
          type: 'short-answer',
          knowledgePointIds: first?.knowledgePointIds ?? [],
          prompt: '说明如何判断页面渲染性能瓶颈。',
          answer: '结合指标、火焰图和主线程任务分析。',
          explanation: '需要同时观察测量指标和实现原因。',
        },
      ],
    };
    return {
      outputs: [
        artifactOutput(
          context,
          'assessments',
          contentPipelineArtifactTypes.assessmentSet,
          asJson(payload),
          '练习与解析',
        ),
      ],
    };
  });

  registerAgent(registry, 'quality-publisher', (context) => {
    if (context.node.id === 'quality-gate') {
      const payload: PublicationManifestPayload = {
        id: `${context.run.id}:manifest`,
        title: '前端性能优化',
        version: '1.0.0',
        artifactVersionIds: context.nodeRun.inputArtifactVersionIds,
        outlineVersionId: `${context.run.id}:blueprint`,
        chapterVersionIds: [],
        generatedAt: context.now(),
      };
      return {
        outcome: '校验通过',
        outputs: [
          artifactOutput(
            context,
            'passed',
            contentPipelineArtifactTypes.publicationManifest,
            asJson(payload),
            '发布清单',
          ),
        ],
      };
    }

    const manifest = context.inputs.manifest?.[0]?.payload as unknown as
      | PublicationManifestPayload
      | undefined;
    const payload: PublicationManifestPayload = {
      ...(manifest ?? {
        id: `${context.run.id}:manifest`,
        title: '前端性能优化',
        version: '1.0.0',
        artifactVersionIds: [],
        outlineVersionId: `${context.run.id}:blueprint`,
        chapterVersionIds: [],
        generatedAt: context.now(),
      }),
      id: `${context.run.id}:published`,
    };
    return {
      outputs: [
        artifactOutput(
          context,
          'published',
          contentPipelineArtifactTypes.publicationManifest,
          asJson(payload),
          '已发布教材',
        ),
      ],
    };
  });

  return registry;
}

const workflowAgentMapping: Record<string, ContentAgentRole> = {
  'context-snapshot': 'context-profiler',
  'intent-planner': 'intent-planner',
  'outline-architect': 'outline-architect',
  'chapter-writers': 'section-writer',
  reviewer: 'reviewer',
  reviser: 'reviser',
  beautifier: 'beautifier',
  'assessment-generator': 'assessment-generator',
  'quality-gate': 'quality-publisher',
  publisher: 'quality-publisher',
};

export function registerMockContentAgents(runtime: WorkflowRuntime) {
  const registry = createMockContentAgentRegistry();
  runtime.registerNodeHandler(mainWorkflowDefinition.id, 'tutor-trigger', (context) => ({
    outputs: [
      artifactOutput(
        context,
        'events',
        contentPipelineArtifactTypes.tutorEvents,
        asJson({
          capturedAt: context.now(),
          events: [
            {
              type: 'tutor-query',
              occurredAt: context.now(),
              summary: '用户希望系统学习前端性能优化。',
            },
          ],
        } satisfies TutorEventBatchPayload),
        'Tutor 事件',
      ),
    ],
  }));

  runtime.registerNodeHandler(
    mainWorkflowDefinition.id,
    'outline-contract-gate',
    (context) => {
      const blueprint = context.inputs.blueprint?.[0];
      if (!blueprint) throw new Error('缺少 CourseBlueprint 输入');
      return {
        outputs: [
          artifactOutput(
            context,
            'validated',
            contentPipelineArtifactTypes.courseBlueprint,
            blueprint.payload,
            '大纲 Contract 校验通过',
          ),
        ],
      };
    },
  );
  for (const [nodeId, role] of Object.entries(workflowAgentMapping)) {
    const handler = registry.getHandler(role);
    if (!handler) throw new Error(`Mock Agent handler 缺失：${role}`);
    runtime.registerNodeHandler(mainWorkflowDefinition.id, nodeId, handler);
  }

  return registry;
}

export function createMockContentPipelineRuntime() {
  const runtime = new WorkflowRuntime({
    workflowVersions: [mainWorkflowVersion],
  });
  registerMockContentAgents(runtime);
  return runtime;
}
