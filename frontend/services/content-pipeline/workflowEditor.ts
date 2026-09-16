import { validateWorkflowDefinition } from './workflow';
import type {
  WorkflowDefinition,
  WorkflowEdgeDefinition,
  WorkflowNodeDefinition,
  WorkflowValidationIssue,
  WorkflowVersion,
} from './types';

export interface WorkflowEditCommitInput {
  id: string;
  createdBy: string;
  createdAt: string;
}

export interface MaterializedWorkflow {
  definition: WorkflowDefinition;
  issues: WorkflowValidationIssue[];
}

function cloneDefinition(definition: WorkflowDefinition) {
  return structuredClone(definition);
}

export function materializeWorkflowDefinition(
  source: WorkflowDefinition,
): MaterializedWorkflow {
  const disabledNodes = source.nodes.filter((node) => node.enabled === false);
  const activeNodes = source.nodes.filter((node) => node.enabled !== false);
  const activeIds = new Set(activeNodes.map((node) => node.id));
  const issues: WorkflowValidationIssue[] = [];
  const edges = source.edges.filter(
    (edge) => activeIds.has(edge.from.nodeId) && activeIds.has(edge.to.nodeId),
  );

  for (const disabled of disabledNodes) {
    const incoming = source.edges.filter(
      (edge) => edge.to.nodeId === disabled.id && activeIds.has(edge.from.nodeId),
    );
    const outgoing = source.edges.filter(
      (edge) => edge.from.nodeId === disabled.id && activeIds.has(edge.to.nodeId),
    );

    if (incoming.length === 0 && outgoing.length > 0) {
      continue;
    }

    for (const before of incoming) {
      const beforeNode = source.nodes.find((node) => node.id === before.from.nodeId);
      const outputPort = beforeNode?.outputs.find(
        (port) => port.id === before.from.portId,
      );
      let matched = false;

      for (const after of outgoing) {
        const afterNode = source.nodes.find((node) => node.id === after.to.nodeId);
        const inputPort = afterNode?.inputs.find((port) => port.id === after.to.portId);
        if (!outputPort || !inputPort || outputPort.artifactType !== inputPort.artifactType) {
          continue;
        }
        matched = true;
        edges.push({
          id: `bypass-${disabled.id}-${before.id}-${after.id}`,
          from: before.from,
          to: after.to,
          label: after.label,
          condition: after.condition,
        });
      }

      if (!matched && outgoing.length > 0) {
        issues.push({
          code: 'cannot-bypass-disabled-node',
          nodeId: disabled.id,
          message: `节点 ${disabled.id} 停用后无法连接兼容的输入输出 Contract`,
        });
      }
    }
  }

  const entryNodeIds = Array.from(
    new Set(
      source.entryNodeIds.flatMap((entryId) => {
        if (activeIds.has(entryId)) return [entryId];
        return source.edges
          .filter(
            (edge) =>
              edge.from.nodeId === entryId && activeIds.has(edge.to.nodeId),
          )
          .map((edge) => edge.to.nodeId);
      }),
    ),
  );
  const definition: WorkflowDefinition = {
    ...source,
    entryNodeIds,
    nodes: activeNodes,
    edges,
  };

  return {
    definition,
    issues: [...issues, ...validateWorkflowDefinition(definition)],
  };
}

export class WorkflowEditSession {
  private draft: WorkflowDefinition;
  private readonly baseVersion: WorkflowVersion;

  constructor(baseVersion: WorkflowVersion) {
    this.baseVersion = baseVersion;
    this.draft = cloneDefinition(baseVersion.definition);
  }

  getDraft() {
    return cloneDefinition(this.draft);
  }

  getBaseVersion() {
    return structuredClone(this.baseVersion);
  }

  updateNode(
    nodeId: string,
    patch: Partial<
      Pick<
        WorkflowNodeDefinition,
        'label' | 'description' | 'enabled' | 'position' | 'config' | 'retryPolicy'
      >
    >,
  ) {
    return this.patchNode(nodeId, (node) => ({
      ...node,
      ...patch,
      config: patch.config ? { ...node.config, ...patch.config } : node.config,
      retryPolicy: patch.retryPolicy
        ? { ...node.retryPolicy, ...patch.retryPolicy }
        : node.retryPolicy,
    }));
  }

  setNodeEnabled(nodeId: string, enabled: boolean) {
    return this.patchNode(nodeId, (node) => ({ ...node, enabled }));
  }

  setNodePosition(nodeId: string, x: number, y: number) {
    return this.patchNode(nodeId, (node) => ({
      ...node,
      position: { x, y },
    }));
  }

  addCustomNode(node: WorkflowNodeDefinition) {
    if (this.draft.nodes.some((item) => item.id === node.id)) {
      throw new Error(`节点 ID 已存在：${node.id}`);
    }
    this.draft.nodes.push(structuredClone(node));
    return this.getDraft();
  }

  removeNode(nodeId: string) {
    this.draft.nodes = this.draft.nodes.filter((node) => node.id !== nodeId);
    this.draft.edges = this.draft.edges.filter(
      (edge) => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId,
    );
    this.draft.entryNodeIds = this.draft.entryNodeIds.filter((id) => id !== nodeId);
    return this.getDraft();
  }

  addEdge(edge: WorkflowEdgeDefinition) {
    if (this.draft.edges.some((item) => item.id === edge.id)) {
      throw new Error(`连线 ID 已存在：${edge.id}`);
    }
    this.draft.edges.push(structuredClone(edge));
    return this.getDraft();
  }

  removeEdge(edgeId: string) {
    this.draft.edges = this.draft.edges.filter((edge) => edge.id !== edgeId);
    return this.getDraft();
  }

  validate() {
    return materializeWorkflowDefinition(this.draft).issues;
  }

  commit(input: WorkflowEditCommitInput) {
    const materialized = materializeWorkflowDefinition(this.draft);
    if (materialized.issues.length > 0) {
      throw new Error(
        `工作流模板无效：${materialized.issues.map((issue) => issue.message).join('；')}`,
      );
    }
    const version: WorkflowVersion = {
      id: input.id,
      workflowId: this.baseVersion.workflowId,
      version: this.baseVersion.version + 1,
      status: 'active',
      definition: materialized.definition,
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    };
    return version;
  }

  private patchNode(
    nodeId: string,
    update: (node: WorkflowNodeDefinition) => WorkflowNodeDefinition,
  ) {
    const node = this.draft.nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error(`节点不存在：${nodeId}`);
    Object.assign(node, update(structuredClone(node)));
    return this.getDraft();
  }
}
