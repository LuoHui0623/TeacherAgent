import {
  contentPipelineArtifactTypes,
  contentPipelineContracts,
  type OutlineNodePayload,
  type OutlinePayload,
} from './contracts';
import type { ArtifactVersion } from './types';

export type OutlineNodeWorkStatus =
  | 'planned'
  | 'assigned'
  | 'generating'
  | 'generated'
  | 'review'
  | 'approved'
  | 'stale';

/** 大纲节点的存储形态（扁平）。权威存储表示：层级由 parentId 表达，次序由数组顺序表达。 */
export type StoredOutlineNode = Omit<OutlineNodePayload, 'children'> & {
  parentId?: string;
};

export interface OutlineWorkState {
  nodeId: string;
  status: OutlineNodeWorkStatus;
  revision: number;
  assignedTo?: string;
  generatedArtifactVersionId?: string;
  updatedAt: string;
}

export interface OutlineVersion {
  id: string;
  outlineId: string;
  version: number;
  parentVersionId?: string;
  sourceArtifactVersionId?: string;
  status: 'draft' | 'confirmed' | 'superseded';
  title: string;
  briefId: string;
  /** 本大纲覆盖了 brief 的哪几条目标 —— 引用而非抄写。 */
  coveredOutcomeIds: string[];
  items: StoredOutlineNode[];
  createdAt: string;
  createdBy: string;
}

export interface CreateOutlineVersionInput {
  outlineId: string;
  id: string;
  sourceArtifactVersionId?: string;
  outline: OutlinePayload;
  createdBy: string;
  createdAt: string;
}

export interface UpdateOutlineNodeInput {
  outlineId: string;
  nodeId: string;
  patch: Partial<Pick<OutlineNodePayload, 'title' | 'summary' | 'knowledgePointIds' | 'buildsOn'>>;
  createdBy: string;
  createdAt: string;
  versionId: string;
}

export interface OutlineRepository {
  save(version: OutlineVersion): void;
  get(versionId: string): OutlineVersion | undefined;
  listVersions(outlineId: string): OutlineVersion[];
  getLatest(outlineId: string): OutlineVersion | undefined;
}

export class InMemoryOutlineRepository implements OutlineRepository {
  private readonly versions = new Map<string, OutlineVersion>();

  save(version: OutlineVersion) {
    this.versions.set(version.id, structuredClone(version));
  }

  get(versionId: string) {
    const version = this.versions.get(versionId);
    return version ? structuredClone(version) : undefined;
  }

  listVersions(outlineId: string) {
    return [...this.versions.values()]
      .filter((version) => version.outlineId === outlineId)
      .sort((left, right) => left.version - right.version)
      .map((version) => structuredClone(version));
  }

  createVersionFromArtifact({
    id,
    artifactVersion,
    createdBy,
    createdAt,
  }: {
    id: string;
    artifactVersion: ArtifactVersion;
    createdBy: string;
    createdAt: string;
  }) {
    const contract = contentPipelineContracts.find(
      (node) => node.id === artifactVersion.contractId,
    );
    if (contract?.artifactType !== contentPipelineArtifactTypes.outline) {
      throw new Error(`Artifact 不是 Outline：${artifactVersion.id}`);
    }
    const outline = artifactVersion.payload as unknown as OutlinePayload;
    return this.createVersion({
      outlineId: outline.id,
      id,
      sourceArtifactVersionId: artifactVersion.id,
      outline,
      createdBy,
      createdAt,
    });
  }

  getLatest(outlineId: string) {
    return this.listVersions(outlineId).at(-1);
  }
}

function flattenNodes(
  items: OutlineNodePayload[],
  parentId?: string,
): StoredOutlineNode[] {
  return items.flatMap((node) => [
    {
      ...node,
      parentId,
      children: undefined,
    } as unknown as StoredOutlineNode,
    ...flattenNodes(node.children, node.id),
  ]);
}

export class OutlineStore {
  private readonly workStates = new Map<string, Map<string, OutlineWorkState>>();

  constructor(
    private readonly repository: OutlineRepository = new InMemoryOutlineRepository(),
  ) {}

  createVersion(input: CreateOutlineVersionInput) {
    const previous = this.repository.getLatest(input.outlineId);
    if (previous) {
      this.repository.save({ ...previous, status: 'superseded' });
    }
    const version: OutlineVersion = {
      id: input.id,
      outlineId: input.outlineId,
      version: (previous?.version ?? 0) + 1,
      parentVersionId: previous?.id,
      sourceArtifactVersionId: input.sourceArtifactVersionId,
      status: 'draft',
      title: input.outline.title,
      briefId: input.outline.briefId,
      coveredOutcomeIds: [...input.outline.coveredOutcomeIds],
      items: flattenNodes(input.outline.items),
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    };
    this.repository.save(version);
    this.ensureWorkStates(version);
    return structuredClone(version);
  }

  createVersionFromArtifact({
    id,
    artifactVersion,
    createdBy,
    createdAt,
  }: {
    id: string;
    artifactVersion: ArtifactVersion;
    createdBy: string;
    createdAt: string;
  }) {
    const contract = contentPipelineContracts.find(
      (node) => node.id === artifactVersion.contractId,
    );
    if (contract?.artifactType !== contentPipelineArtifactTypes.outline) {
      throw new Error(`Artifact 不是 Outline：${artifactVersion.id}`);
    }
    const outline = artifactVersion.payload as unknown as OutlinePayload;
    return this.createVersion({
      outlineId: outline.id,
      id,
      sourceArtifactVersionId: artifactVersion.id,
      outline,
      createdBy,
      createdAt,
    });
  }

  getLatest(outlineId: string) {
    return this.repository.getLatest(outlineId);
  }

  listVersions(outlineId: string) {
    return this.repository.listVersions(outlineId);
  }

  listNodes(outlineId: string) {
    const version = this.requireLatest(outlineId);
    const states = this.ensureWorkStates(version);
    return version.items.map((node) => ({
      ...node,
      work: structuredClone(states.get(node.id)!),
    }));
  }

  getNode(outlineId: string, nodeId: string) {
    const node = this.listNodes(outlineId).find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`大纲节点不存在：${nodeId}`);
    return node;
  }

  listAvailableNodes(outlineId: string) {
    const items = this.listNodes(outlineId);
    const byId = new Map(items.map((node) => [node.id, node]));
    return items.filter((node) => {
      if (!['planned', 'stale'].includes(node.work.status)) return false;
      return node.buildsOn.every((dependencyId) => {
        const dependency = byId.get(dependencyId);
        return dependency ? ['generated', 'approved'].includes(dependency.work.status) : true;
      });
    });
  }

  claimNodes({
    outlineId,
    count,
    assignedTo,
    updatedAt,
  }: {
    outlineId: string;
    count: number;
    assignedTo: string;
    updatedAt: string;
  }) {
    const available = this.listAvailableNodes(outlineId).slice(0, count);
    const states = this.ensureWorkStates(this.requireLatest(outlineId));
    for (const node of available) {
      states.set(node.id, {
        ...node.work,
        status: 'assigned',
        assignedTo,
        updatedAt,
      });
    }
    return available.map((node) => ({
      ...node,
      work: structuredClone(states.get(node.id)!),
    }));
  }

  startNode({
    outlineId,
    nodeId,
    updatedAt,
  }: {
    outlineId: string;
    nodeId: string;
    updatedAt: string;
  }) {
    return this.patchWorkState(outlineId, nodeId, {
      status: 'generating',
      updatedAt,
    });
  }

  completeNode({
    outlineId,
    nodeId,
    artifactVersionId,
    updatedAt,
  }: {
    outlineId: string;
    nodeId: string;
    artifactVersionId: string;
    updatedAt: string;
  }) {
    return this.patchWorkState(outlineId, nodeId, {
      status: 'generated',
      generatedArtifactVersionId: artifactVersionId,
      updatedAt,
    });
  }

  approveNode({
    outlineId,
    nodeId,
    updatedAt,
  }: {
    outlineId: string;
    nodeId: string;
    updatedAt: string;
  }) {
    return this.patchWorkState(outlineId, nodeId, {
      status: 'approved',
      updatedAt,
    });
  }

  updateNode(input: UpdateOutlineNodeInput) {
    const latest = this.requireLatest(input.outlineId);
    const target = latest.items.find((node) => node.id === input.nodeId);
    if (!target) throw new Error(`大纲节点不存在：${input.nodeId}`);

    const affectedNodeIds = this.collectAffectedNodes(latest.items, input.nodeId);
    const nextItems = latest.items.map((node) =>
      node.id === input.nodeId ? { ...node, ...input.patch } : node,
    );
    this.repository.save({ ...latest, status: 'superseded' });
    const nextVersion: OutlineVersion = {
      ...latest,
      id: input.versionId,
      version: latest.version + 1,
      parentVersionId: latest.id,
      status: 'draft',
      items: nextItems,
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    };
    this.repository.save(nextVersion);
    const states = this.ensureWorkStates(nextVersion);
    for (const nodeId of affectedNodeIds) {
      const state = states.get(nodeId);
      if (!state) continue;
      states.set(nodeId, {
        ...state,
        status: 'stale',
        revision: state.revision + 1,
        generatedArtifactVersionId: undefined,
        updatedAt: input.createdAt,
      });
    }
    return {
      version: structuredClone(nextVersion),
      affectedNodeIds,
    };
  }

  private patchWorkState(
    outlineId: string,
    nodeId: string,
    patch: Partial<OutlineWorkState> & { updatedAt: string },
  ) {
    const version = this.requireLatest(outlineId);
    const states = this.ensureWorkStates(version);
    const current = states.get(nodeId);
    if (!current) throw new Error(`大纲节点不存在：${nodeId}`);
    const next = {
      ...current,
      ...patch,
    };
    states.set(nodeId, next);
    return structuredClone(next);
  }

  private collectAffectedNodes(items: StoredOutlineNode[], rootNodeId: string) {
    const affected = new Set([rootNodeId]);
    const queue = [rootNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const node of items) {
        const dependsOnCurrent = node.buildsOn.includes(current);
        const isChild = node.parentId === current;
        if ((!dependsOnCurrent && !isChild) || affected.has(node.id)) continue;
        affected.add(node.id);
        queue.push(node.id);
      }
    }
    return [...affected];
  }

  private ensureWorkStates(version: OutlineVersion) {
    let states = this.workStates.get(version.outlineId);
    if (!states) {
      states = new Map();
      this.workStates.set(version.outlineId, states);
    }
    for (const node of version.items) {
      if (!states.has(node.id)) {
        states.set(node.id, {
          nodeId: node.id,
          status: 'planned',
          revision: 1,
          updatedAt: version.createdAt,
        });
      }
    }
    return states;
  }

  private requireLatest(outlineId: string) {
    const version = this.repository.getLatest(outlineId);
    if (!version) throw new Error(`Outline 不存在：${outlineId}`);
    return version;
  }
}
