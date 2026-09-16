export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type WorkflowStatus = 'draft' | 'active' | 'archived';
export type WorkflowRunStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'paused'
  | 'waiting-human'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type NodeRunStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'waiting-approval'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'stale';

export type WorkflowNodeKind =
  | 'trigger'
  | 'context'
  | 'agent'
  | 'contract-gate'
  | 'human-gate'
  | 'router'
  | 'fan-out'
  | 'fan-in'
  | 'quality-loop'
  | 'tool'
  | 'persist'
  | 'notify';

export type ArtifactStatus =
  | 'draft'
  | 'validated'
  | 'confirmed'
  | 'superseded'
  | 'failed';

export type ApprovalScopeType = 'workflow' | 'outline' | 'chapter' | 'publish';
export type ApprovalDecision = 'approved' | 'rejected' | 'changes-requested';

export interface PortDefinition {
  id: string;
  artifactType: string;
  required: boolean;
  multiple: boolean;
  description: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  retryOn: string[];
}

export interface HumanApprovalDefinition {
  scopeType: ApprovalScopeType;
  perItem: boolean;
  allowBatch: boolean;
  required: boolean;
  itemPort?: string;
  approvedOutcome?: string;
  changesOutcome?: string;
}

export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export interface WorkflowNodeDefinition {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  description: string;
  roleId?: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  config: Record<string, JsonValue>;
  retryPolicy?: RetryPolicy;
  humanApproval?: HumanApprovalDefinition;
  enabled?: boolean;
  position?: WorkflowNodePosition;
}

export type NodeAnchorSide = 'top' | 'right' | 'bottom' | 'left';

export interface EdgeEndpoint {
  nodeId: string;
  portId: string;
}

export interface WorkflowEdgeDefinition {
  id: string;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  label?: string;
  condition?: string;
  fromSide?: NodeAnchorSide;
  toSide?: NodeAnchorSide;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  entryNodeIds: string[];
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  activeVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  status: WorkflowStatus;
  definition: WorkflowDefinition;
  createdAt: string;
  createdBy: string;
}

export interface ContractDefinition {
  id: string;
  artifactType: string;
  version: number;
  schemaId: string;
  description: string;
  required: boolean;
}

export interface WorkflowRun {
  id: string;
  workflowVersionId: string;
  contextSnapshotId: string;
  status: WorkflowRunStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
}

export interface NodeExecutionTelemetry {
  agentId: string;
  model: string;
  promptRef: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface NodeRun {
  id: string;
  runId: string;
  nodeId: string;
  status: NodeRunStatus;
  attempt: number;
  inputArtifactVersionIds: string[];
  outputArtifactVersionIds: string[];
  inputArtifacts: Record<string, string[]>;
  outputArtifacts: Record<string, string[]>;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  telemetry?: NodeExecutionTelemetry;
}

export interface Artifact {
  id: string;
  runId: string;
  type: string;
  producerNodeRunId: string;
  latestVersionId: string;
  createdAt: string;
}

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  runId: string;
  producerNodeRunId: string;
  inputArtifactVersionIds: string[];
  version: number;
  status: ArtifactStatus;
  contractId: string;
  payload: JsonValue;
  summary: string;
  parentVersionIds: string[];
  createdAt: string;
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface Approval {
  id: string;
  runId: string;
  nodeRunId: string;
  scopeType: ApprovalScopeType;
  scopeId: string;
  decision: ApprovalDecision;
  comments: string;
  decidedBy: string;
  decidedAt: string;
}

export type ReviewIssueSeverity = 'info' | 'warning' | 'error' | 'blocking';
export type ReviewIssueStatus = 'open' | 'applied' | 'rejected' | 'resolved';

export interface ReviewIssue {
  id: string;
  severity: ReviewIssueSeverity;
  category: string;
  title: string;
  description: string;
  targetChapterId?: string;
  targetBlockId?: string;
  suggestion: string;
  status: ReviewIssueStatus;
}

export type RunEventType =
  | 'run-created'
  | 'run-started'
  | 'node-started'
  | 'node-succeeded'
  | 'node-failed'
  | 'approval-requested'
  | 'approval-recorded'
  | 'artifact-created'
  | 'run-paused'
  | 'run-resumed'
  | 'run-cancelled'
  | 'run-branched'
  | 'node-rerun'
  | 'run-completed';

export interface RunEvent {
  id: string;
  runId: string;
  nodeRunId?: string;
  type: RunEventType;
  message: string;
  data: JsonValue;
  createdAt: string;
}

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}
