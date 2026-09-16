import {
  ArtifactNotFoundError,
  ArtifactStore,
  ContractValidationError,
} from './artifactStore';
import {
  getContractByType,
  type ContentPipelineArtifactType,
} from './contracts';
import { createWorkflowRunSnapshot } from './workflow';
import type {
  Approval,
  ArtifactVersion,
  JsonValue,
  NodeExecutionTelemetry,
  NodeRun,
  RunEvent,
  WorkflowDefinition,
  WorkflowNodeDefinition,
  WorkflowRun,
  WorkflowVersion,
} from './types';

export interface NodeArtifactOutput {
  portId: string;
  artifactId: string;
  versionId: string;
  artifactType: ContentPipelineArtifactType;
  payload: JsonValue;
  summary: string;
  createdAt: string;
}

export interface NodeExecutionResult {
  outcome?: string;
  outputs?: NodeArtifactOutput[];
  waitForApproval?: boolean;
  telemetry?: NodeExecutionTelemetry;
}

export interface NodeExecutionContext {
  run: WorkflowRun;
  node: WorkflowNodeDefinition;
  nodeRun: NodeRun;
  inputs: Record<string, ArtifactVersion[]>;
  artifactStore: ArtifactStore;
  now: () => string;
}

export type NodeHandler = (
  context: NodeExecutionContext,
) => NodeExecutionResult | Promise<NodeExecutionResult>;

interface HumanGateItemDecision {
  itemId: string;
  decision: Approval['decision'];
  comments: string;
  decidedBy: string;
  decidedAt: string;
  outputs: NodeArtifactOutput[];
}

interface HumanGateItemDecisionInput {
  runId: string;
  nodeId: string;
  itemId: string;
  decision: Approval['decision'];
  comments: string;
  decidedBy: string;
  decidedAt: string;
  outputs: NodeArtifactOutput[];
}

interface HumanGateDecisionInput {
  runId: string;
  nodeId: string;
  decision: Approval['decision'];
  comments: string;
  decidedBy: string;
  decidedAt: string;
  outcome: string;
  outputs?: NodeArtifactOutput[];
}

export interface WorkflowRuntimeOptions {
  workflowVersions: WorkflowVersion[];
  artifactStore?: ArtifactStore;
  now?: () => string;
}

export class WorkflowRuntime {
  private readonly versions = new Map<string, WorkflowVersion>();
  private readonly runs = new Map<string, WorkflowRun>();
  private readonly nodeRuns = new Map<string, NodeRun>();
  private readonly events = new Map<string, RunEvent[]>();
  private readonly approvals = new Map<string, Approval[]>();
  private readonly humanItemDecisions = new Map<
    string,
    Map<string, HumanGateItemDecision>
  >();
  private readonly handlers = new Map<string, NodeHandler>();
  private readonly inputBuffers = new Map<string, string[]>();
  private readonly artifactStore: ArtifactStore;
  private readonly now: () => string;

  constructor(options: WorkflowRuntimeOptions) {
    for (const version of options.workflowVersions) {
      this.versions.set(version.id, version);
    }
    this.artifactStore = options.artifactStore ?? new ArtifactStore();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  registerNodeHandler(workflowId: string, nodeId: string, handler: NodeHandler) {
    this.handlers.set(`${workflowId}:${nodeId}`, handler);
  }

  createRun({
    runId,
    workflowVersionId,
    contextSnapshotId,
    createdBy,
  }: {
    runId: string;
    workflowVersionId: string;
    contextSnapshotId: string;
    createdBy: string;
  }) {
    if (this.runs.has(runId)) throw new Error(`Run 已存在：${runId}`);
    const version = this.requireVersion(workflowVersionId);
    const snapshot = createWorkflowRunSnapshot({
      workflowVersion: version,
      runId,
      contextSnapshotId,
      createdBy,
      createdAt: this.now(),
    });

    this.runs.set(runId, snapshot.run);
    this.events.set(runId, []);
    this.approvals.set(runId, []);
    for (const nodeRun of snapshot.nodeRuns) {
      this.nodeRuns.set(nodeRun.id, nodeRun);
    }
    this.emit(runId, 'run-created', '工作流运行已创建', {
      workflowVersionId,
      contextSnapshotId,
    });
    return snapshot.run;
  }

  async runUntilIdle(runId: string) {
    const run = this.requireRun(runId);
    if (['succeeded', 'failed', 'cancelled'].includes(run.status)) {
      return this.getState(runId);
    }

    this.updateRun(runId, {
      status: 'running',
      startedAt: run.startedAt ?? this.now(),
    });

    let steps = 0;
    while (steps < 200) {
      steps += 1;
      const readyNodes = this.getReadyNodes(runId);
      if (readyNodes.length === 0) break;
      await Promise.all(readyNodes.map((node) => this.executeNode(runId, node.id)));
    }

    if (steps >= 200) {
      throw new Error(`工作流运行超过最大步骤数：${runId}`);
    }

    this.refreshTerminalStatus(runId);
    return this.getState(runId);
  }

  getReadyNodes(runId: string) {
    this.requireRun(runId);
    const definition = this.requireDefinition(runId);
    return definition.nodes.filter((node) => {
      const nodeRun = this.requireNodeRun(runId, node.id);
      if (nodeRun.status !== 'pending') return false;
      return node.inputs
        .filter((port) => port.required)
        .every(
          (port) =>
            (this.inputBuffers.get(this.bufferKey(runId, node.id, port.id)) ?? [])
              .length > 0,
        );
    });
  }

  async retryNode(runId: string, nodeId: string) {
    const nodeRun = this.requireNodeRun(runId, nodeId);
    if (nodeRun.status !== 'failed') {
      throw new Error(`节点当前不可重试：${nodeId}`);
    }
    this.setNodeRun(runId, nodeId, {
      ...nodeRun,
      status: 'pending',
      errorMessage: undefined,
      completedAt: undefined,
    });
    this.updateRun(runId, { status: 'running', completedAt: undefined });
    this.emit(runId, 'node-rerun', `从节点 ${nodeId} 开始局部重跑`, { nodeId });
    return this.runUntilIdle(runId);
  }

  async rerunFromNode(runId: string, nodeId: string) {
    const definition = this.requireDefinition(runId);
    if (!definition.nodes.some((node) => node.id === nodeId)) {
      throw new Error(`节点不存在：${nodeId}`);
    }

    const affected = this.collectDescendants(definition, nodeId);
    for (const affectedNodeId of affected) {
      const nodeRun = this.requireNodeRun(runId, affectedNodeId);
      const preserveTargetInput = affectedNodeId === nodeId;
      this.setNodeRun(runId, affectedNodeId, {
        ...nodeRun,
        status: 'pending',
        attempt: 0,
        inputArtifactVersionIds: preserveTargetInput
          ? nodeRun.inputArtifactVersionIds
          : [],
        outputArtifactVersionIds: [],
        inputArtifacts: preserveTargetInput ? nodeRun.inputArtifacts : {},
        outputArtifacts: {},
        startedAt: undefined,
        completedAt: undefined,
        errorMessage: undefined,
      });

      this.humanItemDecisions.delete(this.humanDecisionKey(runId, affectedNodeId));
      const node = this.requireNode(definition, affectedNodeId);
      for (const port of node.outputs) {
        this.inputBuffers.delete(this.bufferKey(runId, affectedNodeId, port.id));
      }
      if (!preserveTargetInput) {
        for (const port of node.inputs) {
          this.inputBuffers.delete(this.bufferKey(runId, affectedNodeId, port.id));
        }
      }
    }

    this.updateRun(runId, { status: 'running', completedAt: undefined });
    this.emit(runId, 'node-rerun', `从节点 ${nodeId} 开始局部重跑`, { nodeId });
    return this.runUntilIdle(runId);
  }

  getHumanGateItems(runId: string, nodeId: string) {
    const node = this.requireNode(this.requireDefinition(runId), nodeId);
    const nodeRun = this.requireNodeRun(runId, nodeId);
    const decisions =
      this.humanItemDecisions.get(this.humanDecisionKey(runId, nodeId)) ?? new Map();
    return this.getHumanGateItemIds(nodeRun, node).map((itemId) => {
      const decision = decisions.get(itemId);
      return {
        itemId,
        title: this.getArtifactTitle(itemId),
        decision: decision?.decision,
        comments: decision?.comments ?? '',
      };
    });
  }

  async decideHumanGateItem(input: HumanGateItemDecisionInput) {
    const definition = this.requireDefinition(input.runId);
    const node = this.requireNode(definition, input.nodeId);
    if (!node.humanApproval?.perItem) {
      throw new Error(`当前节点不支持逐项审批：${input.nodeId}`);
    }
    const nodeRun = this.requireNodeRun(input.runId, input.nodeId);
    if (nodeRun.status !== 'waiting-approval') {
      throw new Error(`节点不在等待审批状态：${input.nodeId}`);
    }

    const itemIds = this.getHumanGateItemIds(nodeRun, node);
    if (!itemIds.includes(input.itemId)) {
      throw new Error(`审批项不存在：${input.itemId}`);
    }

    const key = this.humanDecisionKey(input.runId, input.nodeId);
    const decisions = this.humanItemDecisions.get(key) ?? new Map();
    decisions.set(input.itemId, {
      itemId: input.itemId,
      decision: input.decision,
      comments: input.comments,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      outputs: input.outputs,
    });
    this.humanItemDecisions.set(key, decisions);
    this.recordApproval({
      runId: input.runId,
      node,
      nodeRun,
      scopeId: input.itemId,
      decision: input.decision,
      comments: input.comments,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
    });

    if (decisions.size < itemIds.length) {
      return this.getState(input.runId);
    }

    const values = [...decisions.values()];
    const outcome = values.every((item) => item.decision === 'approved')
      ? node.humanApproval.approvedOutcome ?? 'approved'
      : node.humanApproval.changesOutcome ?? 'changes-requested';
    return this.completeHumanGateFromItems(
      input.runId,
      node,
      nodeRun,
      values,
      outcome,
      input.decidedAt,
    );
  }

  async decideHumanGateBatch({
    runId,
    nodeId,
    decision,
    comments,
    decidedBy,
    decidedAt,
    outputsByItem,
  }: {
    runId: string;
    nodeId: string;
    decision: Approval['decision'];
    comments: string;
    decidedBy: string;
    decidedAt: string;
    outputsByItem: Record<string, NodeArtifactOutput[]>;
  }) {
    const items = this.getHumanGateItems(runId, nodeId);
    for (const item of items) {
      if (item.decision) continue;
      await this.decideHumanGateItem({
        runId,
        nodeId,
        itemId: item.itemId,
        decision,
        comments,
        decidedBy,
        decidedAt,
        outputs: outputsByItem[item.itemId] ?? [],
      });
    }
    return this.getState(runId);
  }

  async forkRunFromNode({
    sourceRunId,
    nodeId,
    newRunId,
    createdBy,
    createdAt,
  }: {
    sourceRunId: string;
    nodeId: string;
    newRunId: string;
    createdBy: string;
    createdAt: string;
  }) {
    const sourceRun = this.requireRun(sourceRunId);
    const version = this.requireVersion(sourceRun.workflowVersionId);
    const definition = version.definition;
    const node = this.requireNode(definition, nodeId);
    const affected = this.collectDescendants(definition, nodeId);

    this.createRun({
      runId: newRunId,
      workflowVersionId: sourceRun.workflowVersionId,
      contextSnapshotId: sourceRun.contextSnapshotId,
      createdBy,
    });

    for (const sourceNodeRun of this.getNodeRuns(sourceRunId)) {
      if (affected.has(sourceNodeRun.nodeId) || sourceNodeRun.status !== 'succeeded') {
        continue;
      }
      this.setNodeRun(newRunId, sourceNodeRun.nodeId, {
        ...sourceNodeRun,
        id: `${newRunId}:${sourceNodeRun.nodeId}`,
        runId: newRunId,
      });
    }

    for (const port of node.inputs) {
      const sourceKey = this.bufferKey(sourceRunId, nodeId, port.id);
      const targetKey = this.bufferKey(newRunId, nodeId, port.id);
      const versions = this.inputBuffers.get(sourceKey) ?? [];
      if (versions.length > 0) this.inputBuffers.set(targetKey, [...versions]);
    }

    this.updateRun(newRunId, {
      status: 'running',
      startedAt: createdAt,
    });
    this.emit(newRunId, 'run-branched', `已从 ${sourceRunId}:${nodeId} 创建运行分支`, {
      sourceRunId,
      sourceNodeId: nodeId,
    });
    return this.runUntilIdle(newRunId);
  }

  async decideHumanGate(input: HumanGateDecisionInput) {
    const nodeRun = this.requireNodeRun(input.runId, input.nodeId);
    if (nodeRun.status !== 'waiting-approval') {
      throw new Error(`节点不在等待审批状态：${input.nodeId}`);
    }
    const node = this.requireNode(this.requireDefinition(input.runId), input.nodeId);
    const approval: Approval = {
      id: `${input.runId}:approval:${input.nodeId}:${this.approvals.get(input.runId)?.length ?? 0}`,
      runId: input.runId,
      nodeRunId: nodeRun.id,
      scopeType: node.humanApproval?.scopeType ?? 'workflow',
      scopeId: input.nodeId,
      decision: input.decision,
      comments: input.comments,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
    };
    this.approvals.get(input.runId)?.push(approval);
    this.emit(input.runId, 'approval-recorded', '人工审批已记录', {
      nodeId: input.nodeId,
      decision: input.decision,
      comments: input.comments,
    });

    const outputs = this.persistOutputs(
      input.runId,
      node,
      nodeRun,
      input.outputs ?? [],
      input.decidedAt,
    );
    const succeededNodeRun: NodeRun = {
      ...nodeRun,
      status: 'succeeded',
      outputArtifactVersionIds: outputs.versionIds,
      outputArtifacts: outputs.byPort,
      completedAt: input.decidedAt,
    };
    this.setNodeRun(input.runId, input.nodeId, succeededNodeRun);
    this.emit(input.runId, 'node-succeeded', `${node.label} 已通过`, {
      nodeId: input.nodeId,
      outcome: input.outcome,
    });
    this.routeOutgoing(
      input.runId,
      node,
      input.outcome,
      outputs.byPort,
      input.decidedAt,
    );
    return this.runUntilIdle(input.runId);
  }

  cancelRun(runId: string, reason: string) {
    const run = this.requireRun(runId);
    if (['succeeded', 'failed', 'cancelled'].includes(run.status)) return run;
    for (const nodeRun of this.getNodeRuns(runId)) {
      if (['pending', 'running', 'waiting-approval', 'blocked'].includes(nodeRun.status)) {
        this.setNodeRun(runId, nodeRun.nodeId, {
          ...nodeRun,
          status: 'skipped',
          completedAt: this.now(),
        });
      }
    }
    this.updateRun(runId, { status: 'cancelled', completedAt: this.now() });
    this.emit(runId, 'run-cancelled', reason, { cancelled: true });
    return this.requireRun(runId);
  }

  getState(runId: string) {
    return {
      run: this.requireRun(runId),
      nodeRuns: this.getNodeRuns(runId),
      events: [...(this.events.get(runId) ?? [])],
      approvals: [...(this.approvals.get(runId) ?? [])],
    };
  }

  private async executeNode(runId: string, nodeId: string) {
    const definition = this.requireDefinition(runId);
    const node = this.requireNode(definition, nodeId);
    const nodeRun = this.requireNodeRun(runId, nodeId);
    const inputs = this.collectInputs(runId, node);

    if (node.kind === 'human-gate') {
      const waiting: NodeRun = {
        ...nodeRun,
        status: 'waiting-approval',
        inputArtifacts: this.versionIdsByPort(inputs),
        inputArtifactVersionIds: Object.values(inputs)
          .flat()
          .map((item) => item.id),
      };
      this.setNodeRun(runId, nodeId, waiting);
      this.updateRun(runId, { status: 'waiting-human' });
      this.emit(runId, 'approval-requested', `${node.label} 等待人工审批`, {
        nodeId,
      });
      return;
    }

    const handler = this.handlers.get(`${definition.id}:${nodeId}`);
    if (!handler) {
      this.failNode(runId, node, nodeRun, `未注册节点处理器：${nodeId}`);
      return;
    }

    const maxAttempts = Math.max(1, (node.retryPolicy?.maxAttempts ?? 0) + 1);
    let lastError = '';
    let lastNodeRun = nodeRun;
    const startingAttempt = nodeRun.attempt;

    for (let execution = 1; execution <= maxAttempts; execution += 1) {
      const attempt = startingAttempt + execution;
      const runningNodeRun: NodeRun = {
        ...nodeRun,
        status: 'running',
        attempt,
        inputArtifacts: this.versionIdsByPort(inputs),
        inputArtifactVersionIds: Object.values(inputs)
          .flat()
          .map((item) => item.id),
        startedAt: nodeRun.startedAt ?? this.now(),
        errorMessage: undefined,
      };
      lastNodeRun = runningNodeRun;
      this.setNodeRun(runId, nodeId, runningNodeRun);
      this.emit(runId, 'node-started', `开始执行：${node.label}`, {
        nodeId,
        attempt,
      });

      try {
        const result = await handler({
          run: this.requireRun(runId),
          node,
          nodeRun: runningNodeRun,
          inputs,
          artifactStore: this.artifactStore,
          now: this.now,
        });
        if (result.waitForApproval) {
          this.setNodeRun(runId, nodeId, {
            ...runningNodeRun,
            status: 'waiting-approval',
          });
          this.updateRun(runId, { status: 'waiting-human' });
          this.emit(runId, 'approval-requested', `${node.label} 等待人工审批`, {
            nodeId,
          });
          return;
        }

        const outputs = this.persistOutputs(
          runId,
          node,
          runningNodeRun,
          result.outputs ?? [],
          this.now(),
        );
        const succeeded: NodeRun = {
          ...runningNodeRun,
          status: 'succeeded',
          telemetry: result.telemetry,
          outputArtifactVersionIds: outputs.versionIds,
          outputArtifacts: outputs.byPort,
          completedAt: this.now(),
        };
        this.setNodeRun(runId, nodeId, succeeded);
        this.emit(runId, 'node-succeeded', `执行完成：${node.label}`, {
          nodeId,
          outcome: result.outcome ?? 'success',
        });
        this.routeOutgoing(
          runId,
          node,
          result.outcome ?? 'success',
          outputs.byPort,
          this.now(),
        );
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.emit(runId, 'node-failed', `执行失败：${node.label}`, {
          nodeId,
          attempt,
          error: lastError,
        });
      }
    }

    this.failNode(runId, node, lastNodeRun, lastError);
  }

  private async completeHumanGateFromItems(
    runId: string,
    node: WorkflowNodeDefinition,
    nodeRun: NodeRun,
    decisions: HumanGateItemDecision[],
    outcome: string,
    decidedAt: string,
  ) {
    const outputs = this.persistOutputs(
      runId,
      node,
      nodeRun,
      decisions.flatMap((item) => item.outputs),
      decidedAt,
    );
    this.setNodeRun(runId, node.id, {
      ...nodeRun,
      status: 'succeeded',
      outputArtifactVersionIds: outputs.versionIds,
      outputArtifacts: outputs.byPort,
      completedAt: decidedAt,
    });
    this.emit(runId, 'node-succeeded', `${node.label} 已完成逐项审批`, {
      nodeId: node.id,
      outcome,
    });
    this.routeOutgoing(runId, node, outcome, outputs.byPort, decidedAt);
    return this.runUntilIdle(runId);
  }

  private getHumanGateItemIds(
    nodeRun: NodeRun,
    node: WorkflowNodeDefinition,
  ) {
    const preferredPort = node.humanApproval?.itemPort;
    if (preferredPort) return nodeRun.inputArtifacts[preferredPort] ?? [];
    for (const port of node.inputs) {
      const ids = nodeRun.inputArtifacts[port.id] ?? [];
      if (ids.length > 0) return ids;
    }
    return [];
  }

  private getArtifactTitle(versionId: string) {
    const payload = this.artifactStore.getVersion(versionId).payload;
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      const record = payload as Record<string, JsonValue>;
      if (typeof record.title === 'string') return record.title;
      if (typeof record.id === 'string') return record.id;
    }
    return versionId;
  }

  private humanDecisionKey(runId: string, nodeId: string) {
    return `${runId}:${nodeId}`;
  }

  private recordApproval({
    runId,
    node,
    nodeRun,
    scopeId,
    decision,
    comments,
    decidedBy,
    decidedAt,
  }: {
    runId: string;
    node: WorkflowNodeDefinition;
    nodeRun: NodeRun;
    scopeId: string;
    decision: Approval['decision'];
    comments: string;
    decidedBy: string;
    decidedAt: string;
  }) {
    const current = this.approvals.get(runId) ?? [];
    current.push({
      id: `${runId}:approval:${node.id}:${scopeId}:${current.length}`,
      runId,
      nodeRunId: nodeRun.id,
      scopeType: node.humanApproval?.scopeType ?? 'workflow',
      scopeId,
      decision,
      comments,
      decidedBy,
      decidedAt,
    });
    this.approvals.set(runId, current);
    this.emit(runId, 'approval-recorded', '人工审批已记录', {
      nodeId: node.id,
      scopeId,
      decision,
      comments,
    });
  }

  private persistOutputs(
    runId: string,
    node: WorkflowNodeDefinition,
    nodeRun: NodeRun,
    outputs: NodeArtifactOutput[],
    createdAt: string,
  ) {
    const byPort: Record<string, string[]> = {};
    const versionIds: string[] = [];

    for (const output of outputs) {
      const contract = getContractByType(output.artifactType);
      if (!contract) {
        throw new ContractValidationError(`未注册 Artifact Contract：${output.artifactType}`);
      }
      let artifactExists = true;
      try {
        this.artifactStore.getArtifact(output.artifactId);
      } catch (error) {
        if (error instanceof ArtifactNotFoundError) artifactExists = false;
        else throw error;
      }

      const version = artifactExists
        ? this.artifactStore.addVersion({
            artifactId: output.artifactId,
            versionId: output.versionId,
            runId,
            producerNodeRunId: nodeRun.id,
            inputArtifactVersionIds: nodeRun.inputArtifactVersionIds,
            payload: output.payload,
            summary: output.summary,
            createdAt: output.createdAt || createdAt,
          }).version
        : this.artifactStore.createArtifact({
            id: output.artifactId,
            versionId: output.versionId,
            runId,
            artifactType: output.artifactType,
            contractId: contract.id,
            producerNodeRunId: nodeRun.id,
            inputArtifactVersionIds: nodeRun.inputArtifactVersionIds,
            payload: output.payload,
            summary: output.summary,
            createdAt: output.createdAt || createdAt,
          }).version;

      byPort[output.portId] = [...(byPort[output.portId] ?? []), version.id];
      versionIds.push(version.id);
      this.emit(runId, 'artifact-created', `生成产物：${version.summary}`, {
        nodeId: node.id,
        artifactType: version.contractId,
        versionId: version.id,
      });
    }

    return { byPort, versionIds };
  }

  private routeOutgoing(
    runId: string,
    node: WorkflowNodeDefinition,
    outcome: string,
    outputsByPort: Record<string, string[]>,
    routedAt: string,
  ) {
    const definition = this.requireDefinition(runId);
    for (const edge of definition.edges.filter((item) => item.from.nodeId === node.id)) {
      if (edge.condition && edge.condition !== outcome) continue;
      const versionIds = outputsByPort[edge.from.portId] ?? [];
      if (versionIds.length === 0) continue;

      const key = this.bufferKey(runId, edge.to.nodeId, edge.to.portId);
      const current = this.inputBuffers.get(key) ?? [];
      this.inputBuffers.set(key, [...new Set([...current, ...versionIds])]);

      const targetRun = this.requireNodeRun(runId, edge.to.nodeId);
      if (targetRun.status === 'succeeded' || targetRun.status === 'skipped') {
        this.setNodeRun(runId, edge.to.nodeId, {
          ...targetRun,
          status: 'pending',
          startedAt: undefined,
          completedAt: undefined,
          errorMessage: undefined,
        });
      }
      if (targetRun.status === 'failed') {
        this.setNodeRun(runId, edge.to.nodeId, {
          ...targetRun,
          status: 'pending',
          errorMessage: undefined,
          completedAt: undefined,
        });
      }
      this.emit(runId, 'artifact-created', `路由产物到：${edge.to.nodeId}`, {
        edgeId: edge.id,
        routedAt,
      });
    }
  }

  private collectInputs(runId: string, node: WorkflowNodeDefinition) {
    const inputs: Record<string, ArtifactVersion[]> = {};
    for (const port of node.inputs) {
      const versionIds =
        this.inputBuffers.get(this.bufferKey(runId, node.id, port.id)) ?? [];
      inputs[port.id] = versionIds.map((versionId) =>
        this.artifactStore.getVersion(versionId),
      );
    }
    return inputs;
  }

  private versionIdsByPort(inputs: Record<string, ArtifactVersion[]>) {
    return Object.fromEntries(
      Object.entries(inputs).map(([portId, versions]) => [
        portId,
        versions.map((version) => version.id),
      ]),
    );
  }

  private failNode(
    runId: string,
    node: WorkflowNodeDefinition,
    nodeRun: NodeRun,
    errorMessage: string,
  ) {
    this.setNodeRun(runId, node.id, {
      ...nodeRun,
      status: 'failed',
      errorMessage,
      completedAt: this.now(),
    });
    this.updateRun(runId, { status: 'failed', completedAt: this.now() });
    this.emit(runId, 'node-failed', `节点失败：${node.label}`, {
      nodeId: node.id,
      error: errorMessage,
    });
  }

  private refreshTerminalStatus(runId: string) {
    const nodeRuns = this.getNodeRuns(runId);
    if (nodeRuns.some((nodeRun) => nodeRun.status === 'failed')) {
      this.updateRun(runId, { status: 'failed', completedAt: this.now() });
      return;
    }
    if (nodeRuns.some((nodeRun) => nodeRun.status === 'waiting-approval')) {
      this.updateRun(runId, { status: 'waiting-human' });
      return;
    }
    if (nodeRuns.every((nodeRun) => ['succeeded', 'skipped'].includes(nodeRun.status))) {
      this.updateRun(runId, { status: 'succeeded', completedAt: this.now() });
      this.emit(runId, 'run-completed', '工作流运行完成', {});
      return;
    }
    this.updateRun(runId, { status: 'paused' });
  }

  private collectDescendants(definition: WorkflowDefinition, nodeId: string) {
    const affected = new Set<string>([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of definition.edges) {
        if (edge.from.nodeId !== current || affected.has(edge.to.nodeId)) continue;
        affected.add(edge.to.nodeId);
        queue.push(edge.to.nodeId);
      }
    }
    return affected;
  }

  private requireVersion(versionId: string) {
    const version = this.versions.get(versionId);
    if (!version) throw new Error(`WorkflowVersion 不存在：${versionId}`);
    return version;
  }

  private requireRun(runId: string) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`WorkflowRun 不存在：${runId}`);
    return run;
  }

  private requireDefinition(runId: string) {
    return this.requireVersion(this.requireRun(runId).workflowVersionId).definition;
  }

  private requireNode(definition: WorkflowDefinition, nodeId: string) {
    const node = definition.nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error(`WorkflowNode 不存在：${nodeId}`);
    return node;
  }

  private requireNodeRun(runId: string, nodeId: string) {
    const nodeRun = this.nodeRuns.get(`${runId}:${nodeId}`);
    if (!nodeRun) throw new Error(`NodeRun 不存在：${runId}:${nodeId}`);
    return nodeRun;
  }

  private getNodeRuns(runId: string) {
    this.requireRun(runId);
    return [...this.nodeRuns.values()].filter((item) => item.runId === runId);
  }

  private setNodeRun(runId: string, nodeId: string, nodeRun: NodeRun) {
    this.nodeRuns.set(`${runId}:${nodeId}`, Object.freeze(nodeRun));
  }

  private updateRun(runId: string, patch: Partial<WorkflowRun>) {
    const current = this.requireRun(runId);
    this.runs.set(runId, Object.freeze({ ...current, ...patch }));
  }

  private bufferKey(runId: string, nodeId: string, portId: string) {
    return `${runId}:${nodeId}:${portId}`;
  }

  private emit(
    runId: string,
    type: RunEvent['type'],
    message: string,
    data: JsonValue,
  ) {
    const current = this.events.get(runId) ?? [];
    current.push({
      id: `${runId}:event:${current.length}`,
      runId,
      type,
      message,
      data,
      createdAt: this.now(),
    });
    this.events.set(runId, current);
  }
}
