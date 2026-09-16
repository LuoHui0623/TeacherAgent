import type { ContractDefinition, JsonValue } from './types';

export const contentPipelineArtifactTypes = {
  tutorEvents: 'TutorEventBatch',
  contextSnapshot: 'ContextSnapshot',
  learningBrief: 'LearningBrief',
  courseBlueprint: 'CourseBlueprint',
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

export interface LearningBriefPayload {
  id: string;
  goal: string;
  intent: string;
  learnerSummary: string;
  scope: {
    level: string;
    depth: string;
    breadth: string;
    estimatedMinutes: number;
  };
  expectedOutcomes: string[];
  constraints: string[];
  questions: string[];
}

export interface OutlineItemPayload {
  id: string;
  parentId?: string;
  order: number;
  title: string;
  summary: string;
  learningObjectives: string[];
  knowledgePointIds: string[];
  prerequisites: string[];
  dependsOnItemIds: string[];
  requiredArtifacts: string[];
  assessmentCriteria: string[];
  estimatedMinutes: number;
  depth: string;
  children: OutlineItemPayload[];
}

export interface CourseBlueprintPayload {
  id: string;
  briefId: string;
  title: string;
  audience: string;
  expectedOutcomes: string[];
  coreKnowledgePointIds: string[];
  estimatedMinutes: number;
  items: OutlineItemPayload[];
}

export interface ContentDraftPayload {
  id: string;
  outlineItemId: string;
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
  CourseBlueprint: CourseBlueprintPayload;
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

function requireNumber(
  record: Record<string, JsonValue>,
  key: string,
  errors: string[],
) {
  if (typeof record[key] !== 'number' || !Number.isFinite(record[key])) {
    errors.push(`${key} 必须是有效数字`);
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
    for (const key of ['id', 'goal', 'intent', 'learnerSummary']) {
      requireString(record, key, errors);
    }
    for (const key of ['expectedOutcomes', 'constraints', 'questions']) {
      requireStringArray(record, key, errors);
    }
    if (!isRecord(record.scope)) errors.push('scope 必须是对象');
    return { valid: errors.length === 0, errors };
  },
  CourseBlueprint: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'briefId', 'title', 'audience']) {
      requireString(record, key, errors);
    }
    requireNumber(record, 'estimatedMinutes', errors);
    requireStringArray(record, 'expectedOutcomes', errors);
    requireStringArray(record, 'coreKnowledgePointIds', errors);
    if (!Array.isArray(record.items) || record.items.length === 0) {
      errors.push('items 至少需要一个大纲条目');
    }
    return { valid: errors.length === 0, errors };
  },
  ContentDraft: (payload) => {
    const errors: string[] = [];
    const record = requireRecord(payload, errors);
    if (!record) return { valid: false, errors };
    for (const key of ['id', 'outlineItemId', 'chapterId', 'title', 'markdown']) {
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
    id: 'contract-course-blueprint-v1',
    artifactType: contentPipelineArtifactTypes.courseBlueprint,
    version: 1,
    schemaId: 'content-pipeline/course-blueprint@1',
    description: '结构化教材大纲、知识点与章节任务',
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
