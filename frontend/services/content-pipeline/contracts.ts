import type { ContractDefinition, JsonValue } from './types';

export const contentPipelineArtifactTypes = {
  tutorEvents: 'TutorEventBatch',
  contextSnapshot: 'ContextSnapshot',
  learningBrief: 'LearningBrief',
  outline: 'Outline',
  contentDraft: 'ContentDraft',
  reviewReport: 'ReviewReport',
  chapterDecision: 'ChapterApprovalDecision',
  revisionFeedback: 'RevisionFeedback',
  validationReport: 'ValidationReport',
  beautifiedContent: 'BeautifiedContent',
  assessmentSet: 'AssessmentSet',
  publicationManifest: 'PublicationManifest',
} as const;

export type ContentPipelineArtifactType =
  (typeof contentPipelineArtifactTypes)[keyof typeof contentPipelineArtifactTypes];

/**
 * 学习水平档位 —— 画像与 LearningBrief 共用同一套词，两者才能比对
 * （「从『会用』到『进阶』」）。档位是定性描述，不是分数。
 */
export const learningLevels = ['涉猎', '入门', '会用', '熟练', '进阶', '精通'] as const;
export type LearningLevel = (typeof learningLevels)[number];

/** 学习取向 —— 决定大纲的形态。 */
export const learningApproaches = [
  'systematic',
  'gap-filling',
  'quick-scan',
  'project-driven',
] as const;
export type LearningApproach = (typeof learningApproaches)[number];

export interface TutorEventBatchPayload {
  capturedAt: string;
  events: Array<{ type: string; occurredAt: string; summary: string }>;
}

export interface ContextSnapshotPayload {
  id: string;
  learnerId: string;
  capturedAt: string;
  query: string;
  profileSummary: string;
  currentLevel: string;
  preferences: string[];
  knownKnowledgePointIds: string[];
  weakKnowledgePointIds: string[];
  sourceEventIds: string[];
}

/** 预期学习成果。带 id，下游才能「引用」而不是「抄文本」。 */
export interface LearningOutcome {
  /** 本 brief 版本内唯一；跨版本稳定性由 brief 版本链保证，不要求全局唯一。 */
  id: string;
  statement: string;
}

export interface LearningBriefScope {
  /** 目标水平（学完达到的档位）。起点由画像的当前水平提供，不在此重复。 */
  targetLevel: LearningLevel;
  /** 本次要覆盖的主题。 */
  inScope: string[];
  /** 明确不覆盖的主题 —— 防止大纲膨胀。 */
  outOfScope: string[];
  /** 体量预算（分钟）。区别于画像的「有效学习时间」（已投入的历史事实）。 */
  estimatedMinutes?: number;
}

export interface LearningBriefPayload {
  id: string;
  /** 学什么（一句话）。 */
  goal: string;
  /** 以什么方式学 —— 决定大纲形态。 */
  approach: LearningApproach;
  scope: LearningBriefScope;
  /** 预期成果；大纲通过 coveredOutcomeIds 引用它们。 */
  expectedOutcomes: LearningOutcome[];
  /** 本次任务的约束（时间、形式、限制）。区别于画像的长期偏好。 */
  constraints?: string[];
  /** 规划者信息不足时向用户提问 —— 由 brief-approval 渲染并回答。 */
  questions?: string[];
}

/**
 * 大纲节点（生成侧形态：嵌套）。
 *
 * 嵌套对模型更自然、不易编错 id；入库时由规范化步骤拍平为 StoredOutlineNode（含 parentId）。
 * 因此此形态不带 parentId / order —— 层级由嵌套表达，次序由数组顺序表达。
 */
export interface OutlineNodePayload {
  id: string;
  title: string;
  /** 摘要 —— 给人与模型看的展示文本，不是控制字段。 */
  summary?: string;
  /** 挂载：本节点涉及的知识点 id。 */
  knowledgePointIds?: string[];
  /** 本节点内容建立在这些节点之上：它们必须先完成；它们一变，本节点要重写。 */
  buildsOn?: string[];
  children?: OutlineNodePayload[];
}

/** 教材大纲（生成侧契约）。 */
export interface OutlinePayload {
  id: string;
  briefId: string;
  title: string;
  /** 本大纲覆盖了 brief 的哪几条目标 —— 引用而非抄写。 */
  coveredOutcomeIds: string[];
  items: OutlineNodePayload[];
}

export interface ContentDraftPayload {
  id: string;
  outlineNodeId: string;
  chapterId: string;
  title: string;
  markdown: string;
  knowledgePointIds: string[];
  sourceRefs: string[];
  revisionOfVersionId?: string;
}

export interface ReviewIssuePayload {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'blocking';
  category: string;
  title: string;
  description: string;
  targetChapterId?: string;
  targetBlockId?: string;
  suggestion: string;
}

export interface ReviewReportPayload {
  id: string;
  chapterId: string;
  draftVersionId: string;
  verdict: 'pass' | 'changes-required';
  summary: string;
  issues: ReviewIssuePayload[];
}

export interface RevisionFeedbackPayload {
  scopeType: 'workflow' | 'outline' | 'chapter' | 'publish';
  scopeId: string;
  decision: 'rejected' | 'changes-requested';
  comments: string;
  targetArtifactVersionId: string;
}

export interface BeautifiedContentPayload {
  id: string;
  draftId: string;
  markdown: string;
  knowledgePointIds: string[];
  anchorIds: string[];
  assetRefs: string[];
  cover?: {
    title: string;
    subtitle: string;
    assetRef?: string;
  };
}

export interface AssessmentSetPayload {
  id: string;
  chapterId: string;
  items: Array<{
    id: string;
    type: 'single-choice' | 'multiple-choice' | 'short-answer' | 'code';
    knowledgePointIds: string[];
    prompt: string;
    answer: string;
    explanation: string;
  }>;
}

export interface ValidationReportPayload {
  id: string;
  passed: boolean;
  checkedArtifactVersionIds: string[];
  errors: string[];
  warnings: string[];
}

export interface PublicationManifestPayload {
  id: string;
  title: string;
  version: string;
  artifactVersionIds: string[];
  outlineVersionId: string;
  chapterVersionIds: string[];
  generatedAt: string;
}

export interface ArtifactPayloadMap {
  TutorEventBatch: TutorEventBatchPayload;
  ContextSnapshot: ContextSnapshotPayload;
  LearningBrief: LearningBriefPayload;
  Outline: OutlinePayload;
  ContentDraft: ContentDraftPayload;
  ReviewReport: ReviewReportPayload;
  ChapterApprovalDecision: RevisionFeedbackPayload;
  RevisionFeedback: RevisionFeedbackPayload;
  ValidationReport: ValidationReportPayload;
  BeautifiedContent: BeautifiedContentPayload;
  AssessmentSet: AssessmentSetPayload;
  PublicationManifest: PublicationManifestPayload;
}

export type ContentPipelineArtifactPayload =
  ArtifactPayloadMap[keyof ArtifactPayloadMap];

export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: JsonValue, errors: string[]) {
  if (!isRecord(value)) {
    errors.push('payload 必须是对象');
    return undefined;
  }
  return value;
}

function requireString(
  record: Record<string, JsonValue>,
  key: string,
  errors: string[],
) {
  if (typeof record[key] !== 'string' || record[key].trim() === '') {
    errors.push(`${key} 必须是非空字符串`);
  }
}

function requireStringArray(
  record: Record<string, JsonValue>,
  key: string,
  errors: string[],
) {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(`${key} 必须是字符串数组`);
  }
}

function requireObjectArray(
  record: Record<string, JsonValue>,
  key: string,
  errors: string[],
) {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    errors.push(`${key} 必须是对象数组`);
  }
}

const validators: Record<
  ContentPipelineArtifactType,
  (payload: JsonValue) => ContractValidationResult
> = {
  TutorEventBatch: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    requireString(record, 'capturedAt', errors);
    requireObjectArray(record, 'events', errors);
    return { valid: errors.length === 0, errors };
  },
  ContextSnapshot: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'learnerId', 'capturedAt', 'query', 'profileSummary', 'currentLevel']) {
      requireString(record, key, errors);
    }
    for (const key of ['preferences', 'knownKnowledgePointIds', 'weakKnowledgePointIds', 'sourceEventIds']) {
      requireStringArray(record, key, errors);
    }
    return { valid: errors.length === 0, errors };
  },
  LearningBrief: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'goal', 'approach']) {
      requireString(record, key, errors);
    }
    requireObjectArray(record, 'expectedOutcomes', errors);
    const scope = record.scope;
    if (!isRecord(scope)) {
      errors.push('scope 必须是对象');
    } else {
      requireString(scope, 'targetLevel', errors);
      requireStringArray(scope, 'inScope', errors);
      requireStringArray(scope, 'outOfScope', errors);
    }
    return { valid: errors.length === 0, errors };
  },
  Outline: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'briefId', 'title']) {
      requireString(record, key, errors);
    }
    requireStringArray(record, 'coveredOutcomeIds', errors);
    if (!Array.isArray(record.items) || record.items.length === 0) {
      errors.push('items 至少需要一个大纲节点');
    }
    return { valid: errors.length === 0, errors };
  },
  ContentDraft: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'outlineNodeId', 'chapterId', 'title', 'markdown']) {
      requireString(record, key, errors);
    }
    requireStringArray(record, 'knowledgePointIds', errors);
    requireStringArray(record, 'sourceRefs', errors);
    return { valid: errors.length === 0, errors };
  },
  ReviewReport: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'chapterId', 'draftVersionId', 'verdict', 'summary']) {
      requireString(record, key, errors);
    }
    if (record.verdict !== 'pass' && record.verdict !== 'changes-required') {
      errors.push('verdict 必须是 pass 或 changes-required');
    }
    requireObjectArray(record, 'issues', errors);
    return { valid: errors.length === 0, errors };
  },
  ChapterApprovalDecision: revisionFeedbackValidator,
  RevisionFeedback: revisionFeedbackValidator,
  ValidationReport: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    requireString(record, 'id', errors);
    if (typeof record.passed !== 'boolean') errors.push('passed 必须是布尔值');
    requireStringArray(record, 'checkedArtifactVersionIds', errors);
    requireStringArray(record, 'errors', errors);
    requireStringArray(record, 'warnings', errors);
    return { valid: errors.length === 0, errors };
  },
  BeautifiedContent: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'draftId', 'markdown']) requireString(record, key, errors);
    for (const key of ['knowledgePointIds', 'anchorIds', 'assetRefs']) {
      requireStringArray(record, key, errors);
    }
    return { valid: errors.length === 0, errors };
  },
  AssessmentSet: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    requireString(record, 'id', errors);
    requireString(record, 'chapterId', errors);
    requireObjectArray(record, 'items', errors);
    return { valid: errors.length === 0, errors };
  },
  PublicationManifest: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'title', 'version', 'outlineVersionId', 'generatedAt']) {
      requireString(record, key, errors);
    }
    for (const key of ['artifactVersionIds', 'chapterVersionIds']) {
      requireStringArray(record, key, errors);
    }
    return { valid: errors.length === 0, errors };
  },
};

function revisionFeedbackValidator(payload: JsonValue): ContractValidationResult {
  const errors: string[] = [];
  const record = requireRecord(payload, errors);
  if (!record) return { valid: false, errors };
  for (const key of ['scopeType', 'scopeId', 'decision', 'comments', 'targetArtifactVersionId']) {
    requireString(record, key, errors);
  }
  return { valid: errors.length === 0, errors };
}

export const contentPipelineContracts: ContractDefinition[] = [
  {
    id: 'contract-tutor-events-v1',
    artifactType: contentPipelineArtifactTypes.tutorEvents,
    version: 1,
    schemaId: 'content-pipeline/tutor-event-batch@1',
    description: 'Tutor 交互与学习行为事件批次',
    required: true,
  },
  {
    id: 'contract-context-snapshot-v1',
    artifactType: contentPipelineArtifactTypes.contextSnapshot,
    version: 1,
    schemaId: 'content-pipeline/context-snapshot@1',
    description: '运行时冻结的用户画像与学习上下文',
    required: true,
  },
  {
    id: 'contract-learning-brief-v1',
    artifactType: contentPipelineArtifactTypes.learningBrief,
    version: 1,
    schemaId: 'content-pipeline/learning-brief@1',
    description: '意图、范围、深度和预期学习结果',
    required: true,
  },
  {
    id: 'contract-outline-v1',
    artifactType: contentPipelineArtifactTypes.outline,
    version: 1,
    schemaId: 'content-pipeline/outline@1',
    description: '结构化教材大纲：章节树与知识点挂载',
    required: true,
  },
  {
    id: 'contract-content-draft-v1',
    artifactType: contentPipelineArtifactTypes.contentDraft,
    version: 1,
    schemaId: 'content-pipeline/content-draft@1',
    description: '遵循统一写作规范的 Markdown 内容草稿',
    required: true,
  },
  {
    id: 'contract-review-report-v1',
    artifactType: contentPipelineArtifactTypes.reviewReport,
    version: 1,
    schemaId: 'content-pipeline/review-report@1',
    description: '结构化审校问题和章节验收结果',
    required: true,
  },
  {
    id: 'contract-chapter-decision-v1',
    artifactType: contentPipelineArtifactTypes.chapterDecision,
    version: 1,
    schemaId: 'content-pipeline/chapter-decision@1',
    description: '用户按章节给出的通过与审批意见',
    required: true,
  },
  {
    id: 'contract-revision-feedback-v1',
    artifactType: contentPipelineArtifactTypes.revisionFeedback,
    version: 1,
    schemaId: 'content-pipeline/revision-feedback@1',
    description: '审校、章节审批或发布驳回产生的修订意见',
    required: true,
  },
  {
    id: 'contract-validation-report-v1',
    artifactType: contentPipelineArtifactTypes.validationReport,
    version: 1,
    schemaId: 'content-pipeline/validation-report@1',
    description: '最终质检和渲染验证报告',
    required: true,
  },
  {
    id: 'contract-beautified-content-v1',
    artifactType: contentPipelineArtifactTypes.beautifiedContent,
    version: 1,
    schemaId: 'content-pipeline/beautified-content@1',
    description: '完成公式、列表、Anchor、知识点和封面增强的内容',
    required: true,
  },
  {
    id: 'contract-assessment-set-v1',
    artifactType: contentPipelineArtifactTypes.assessmentSet,
    version: 1,
    schemaId: 'content-pipeline/assessment-set@1',
    description: '与知识点关联的题目、答案和解析',
    required: true,
  },
  {
    id: 'contract-publication-manifest-v1',
    artifactType: contentPipelineArtifactTypes.publicationManifest,
    version: 1,
    schemaId: 'content-pipeline/publication-manifest@1',
    description: '发布版本、文档清单和内容摘要',
    required: true,
  },
];

export function validateArtifactPayload(
  artifactType: ContentPipelineArtifactType,
  payload: JsonValue,
): ContractValidationResult {
  return validators[artifactType](payload);
}

export function getContractByType(
  artifactType: ContentPipelineArtifactType,
): ContractDefinition | undefined {
  return contentPipelineContracts.find(
    (contract) => contract.artifactType === artifactType,
  );
}
