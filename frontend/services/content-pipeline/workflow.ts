import type {
  NodeRun,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowValidationIssue,
  WorkflowVersion,
} from './types';

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateWorkflowDefinition(
  definition: WorkflowDefinition,
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]));

  for (const nodeId of duplicateValues(definition.nodes.map((node) => node.id))) {
    issues.push({
      code: 'duplicate-node-id',
      nodeId,
      message: `节点 ID 重复：${nodeId}`,
    });
  }

  for (const edgeId of duplicateValues(definition.edges.map((edge) => edge.id))) {
    issues.push({
      code: 'duplicate-edge-id',
      edgeId,
      message: `连线 ID 重复：${edgeId}`,
    });
  }

  if (definition.entryNodeIds.length === 0) {
    issues.push({
      code: 'missing-entry',
      message: '工作流至少需要一个入口节点',
    });
  }

  for (const nodeId of definition.entryNodeIds) {
    if (!nodeById.has(nodeId)) {
      issues.push({
        code: 'unknown-entry-node',
        nodeId,
        message: `入口节点不存在：${nodeId}`,
      });
    }
  }

  for (const node of definition.nodes) {
    if (node.kind === 'agent' && !node.roleId) {
      issues.push({
        code: 'agent-without-role',
        nodeId: node.id,
        message: `Agent 节点缺少 roleId：${node.id}`,
      });
    }

    if (node.kind === 'human-gate' && !node.humanApproval) {
      issues.push({
        code: 'human-gate-without-approval',
        nodeId: node.id,
        message: `人工节点缺少审批定义：${node.id}`,
      });
    }
  }

  for (const edge of definition.edges) {
    const fromNode = nodeById.get(edge.from.nodeId);
    const toNode = nodeById.get(edge.to.nodeId);

    if (!fromNode) {
      issues.push({
        code: 'unknown-edge-source',
        edgeId: edge.id,
        message: `连线起点节点不存在：${edge.from.nodeId}`,
      });
      continue;
    }

    if (!toNode) {
      issues.push({
        code: 'unknown-edge-target',
        edgeId: edge.id,
        message: `连线终点节点不存在：${edge.to.nodeId}`,
      });
      continue;
    }

    const outputPort = fromNode.outputs.find((port) => port.id === edge.from.portId);
    const inputPort = toNode.inputs.find((port) => port.id === edge.to.portId);

    if (!outputPort) {
      issues.push({
        code: 'unknown-output-port',
        edgeId: edge.id,
        message: `连线引用了不存在的输出端口：${edge.from.nodeId}.${edge.from.portId}`,
      });
    }

    if (!inputPort) {
      issues.push({
        code: 'unknown-input-port',
        edgeId: edge.id,
        message: `连线引用了不存在的输入端口：${edge.to.nodeId}.${edge.to.portId}`,
      });
    }

    if (
      outputPort &&
      inputPort &&
      outputPort.artifactType !== inputPort.artifactType
    ) {
      issues.push({
        code: 'artifact-type-mismatch',
        edgeId: edge.id,
        message: `连线产物类型不匹配：${outputPort.artifactType} -> ${inputPort.artifactType}`,
      });
    }
  }

  const reachable = new Set<string>();
  const queue = [...definition.entryNodeIds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    for (const edge of definition.edges) {
      if (edge.from.nodeId === current) queue.push(edge.to.nodeId);
    }
  }

  for (const node of definition.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        code: 'unreachable-node',
        nodeId: node.id,
        message: `节点不可达：${node.id}`,
      });
    }
  }

  return issues;
}

export function createWorkflowRunSnapshot({
  workflowVersion,
  runId,
  contextSnapshotId,
  createdBy,
  createdAt,
}: {
  workflowVersion: WorkflowVersion;
  runId: string;
  contextSnapshotId: string;
  createdBy: string;
  createdAt: string;
}): { run: WorkflowRun; nodeRuns: NodeRun[] } {
  const validationIssues = validateWorkflowDefinition(workflowVersion.definition);
  if (validationIssues.length > 0) {
    throw new Error(
      `工作流定义无效：${validationIssues.map((issue) => issue.message).join('；')}`,
    );
  }

  return {
    run: {
      id: runId,
      workflowVersionId: workflowVersion.id,
      contextSnapshotId,
      status: 'ready',
      createdAt,
      createdBy,
    },
    nodeRuns: workflowVersion.definition.nodes.map((node) => ({
      id: `${runId}:${node.id}`,
      runId,
      nodeId: node.id,
      status: 'pending',
      attempt: 0,
      inputArtifactVersionIds: [],
      outputArtifactVersionIds: [],
      inputArtifacts: {},
      outputArtifacts: {},
    })),
  };
}
