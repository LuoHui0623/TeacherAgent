import {
  contentPipelineArtifactTypes,
  contentPipelineContracts,
  type CourseBlueprintPayload,
  type OutlineItemPayload,
} from './contracts';
import type { ArtifactVersion } from './types';

export type OutlineItemWorkStatus =
  | 'planned'
  | 'assigned'
  | 'generating'
  | 'generated'
  | 'review'
  | 'approved'
  | 'stale';

export interface StoredOutlineItem
  extends Omit<OutlineItemPayload, 'children'> {
  parentId?: string;
}

export interface OutlineWorkState {
  itemId: string;
  status: OutlineItemWorkStatus;
  revision: number;
  assignedTo?: string;
  generatedArtifactVersionId?: string;
  updatedAt: string;
}

export interface OutlineBlueprintVersion {
  id: string;
  blueprintId: string;
  version: number;
  parentVersionId?: string;
  sourceArtifactVersionId?: string;
  status: 'draft' | 'confirmed' | 'superseded';
  title: string;
  briefId: string;
  audience: string;
  expectedOutcomes: string[];
  coreKnowledgePointIds: string[];
  estimatedMinutes: number;
  items: StoredOutlineItem[];
  createdAt: string;
  createdBy: string;
}

export interface CreateOutlineVersionInput {
  blueprintId: string;
  id: string;
  sourceArtifactVersionId?: string;
  blueprint: CourseBlueprintPayload;
  createdBy: string;
  createdAt: string;
}

export interface UpdateOutlineItemInput {
  blueprintId: string;
  itemId: string;
  patch: Partial<
    Pick<
      OutlineItemPayload,
      | 'title'
      | 'summary'
      | 'learningObjectives'
      | 'knowledgePointIds'
      | 'prerequisites'
      | 'dependsOnItemIds'
      | 'requiredArtifacts'
      | 'assessmentCriteria'
      | 'estimatedMinutes'
      | 'depth'
    >
  >;
  createdBy: string;
  createdAt: string;
  versionId: string;
}

export interface OutlineRepository {
  save(version: OutlineBlueprintVersion): void;
  get(versionId: string): OutlineBlueprintVersion | undefined;
  listVersions(blueprintId: string): OutlineBlueprintVersion[];
  getLatest(blueprintId: string): OutlineBlueprintVersion | undefined;
}

export class InMemoryOutlineRepository implements OutlineRepository {
  private readonly versions = new Map<string, OutlineBlueprintVersion>();

  save(version: OutlineBlueprintVersion) {
    this.versions.set(version.id, structuredClone(version));
  }

  get(versionId: string) {
    const version = this.versions.get(versionId);
    return version ? structuredClone(version) : undefined;
  }

  listVersions(blueprintId: string) {
    return [...this.versions.values()]
      .filter((version) => version.blueprintId === blueprintId)
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
      (item) => item.id === artifactVersion.contractId,
    );
    if (contract?.artifactType !== contentPipelineArtifactTypes.courseBlueprint) {
      throw new Error(`Artifact 不是 CourseBlueprint：${artifactVersion.id}`);
    }
    const blueprint = artifactVersion.payload as unknown as CourseBlueprintPayload;
    return this.createVersion({
      blueprintId: blueprint.id,
      id,
      sourceArtifactVersionId: artifactVersion.id,
      blueprint,
      createdBy,
      createdAt,
    });
  }

  getLatest(blueprintId: string) {
    return this.listVersions(blueprintId).at(-1);
  }
}

function flattenItems(
  items: OutlineItemPayload[],
  parentId?: string,
): StoredOutlineItem[] {
  return items.flatMap((item) => [
    {
      ...item,
      parentId,
      children: undefined,
    } as unknown as StoredOutlineItem,
    ...flattenItems(item.children, item.id),
  ]);
}

export class OutlineStore {
  private readonly workStates = new Map<string, Map<string, OutlineWorkState>>();

  constructor(
    private readonly repository: OutlineRepository = new InMemoryOutlineRepository(),
  ) {}

  createVersion(input: CreateOutlineVersionInput) {
    const previous = this.repository.getLatest(input.blueprintId);
    if (previous) {
      this.repository.save({ ...previous, status: 'superseded' });
    }
    const version: OutlineBlueprintVersion = {
      id: input.id,
      blueprintId: input.blueprintId,
      version: (previous?.version ?? 0) + 1,
      parentVersionId: previous?.id,
      sourceArtifactVersionId: input.sourceArtifactVersionId,
      status: 'draft',
      title: input.blueprint.title,
      briefId: input.blueprint.briefId,
      audience: input.blueprint.audience,
      expectedOutcomes: [...input.blueprint.expectedOutcomes],
      coreKnowledgePointIds: [...input.blueprint.coreKnowledgePointIds],
      estimatedMinutes: input.blueprint.estimatedMinutes,
      items: flattenItems(input.blueprint.items),
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
      (item) => item.id === artifactVersion.contractId,
    );
    if (contract?.artifactType !== contentPipelineArtifactTypes.courseBlueprint) {
      throw new Error(`Artifact 不是 CourseBlueprint：${artifactVersion.id}`);
    }
    const blueprint = artifactVersion.payload as unknown as CourseBlueprintPayload;
    return this.createVersion({
      blueprintId: blueprint.id,
      id,
      sourceArtifactVersionId: artifactVersion.id,
      blueprint,
      createdBy,
      createdAt,
    });
  }

  getLatest(blueprintId: string) {
    return this.repository.getLatest(blueprintId);
  }

  listVersions(blueprintId: string) {
    return this.repository.listVersions(blueprintId);
  }

  listItems(blueprintId: string) {
    const version = this.requireLatest(blueprintId);
    const states = this.ensureWorkStates(version);
    return version.items.map((item) => ({
      ...item,
      work: structuredClone(states.get(item.id)!),
    }));
  }

  getItem(blueprintId: string, itemId: string) {
    const item = this.listItems(blueprintId).find((candidate) => candidate.id === itemId);
    if (!item) throw new Error(`OutlineItem 不存在：${itemId}`);
    return item;
  }

  listAvailableItems(blueprintId: string) {
    const items = this.listItems(blueprintId);
    const byId = new Map(items.map((item) => [item.id, item]));
    return items.filter((item) => {
      if (!['planned', 'stale'].includes(item.work.status)) return false;
      return item.dependsOnItemIds.every((dependencyId) => {
        const dependency = byId.get(dependencyId);
        return dependency ? ['generated', 'approved'].includes(dependency.work.status) : true;
      });
    });
  }

  claimItems({
    blueprintId,
    count,
    assignedTo,
    updatedAt,
  }: {
    blueprintId: string;
    count: number;
    assignedTo: string;
    updatedAt: string;
  }) {
    const available = this.listAvailableItems(blueprintId).slice(0, count);
    const states = this.ensureWorkStates(this.requireLatest(blueprintId));
    for (const item of available) {
      states.set(item.id, {
        ...item.work,
        status: 'assigned',
        assignedTo,
        updatedAt,
      });
    }
    return available.map((item) => ({
      ...item,
      work: structuredClone(states.get(item.id)!),
    }));
  }

  startItem({
    blueprintId,
    itemId,
    updatedAt,
  }: {
    blueprintId: string;
    itemId: string;
    updatedAt: string;
  }) {
    return this.patchWorkState(blueprintId, itemId, {
      status: 'generating',
      updatedAt,
    });
  }

  completeItem({
    blueprintId,
    itemId,
    artifactVersionId,
    updatedAt,
  }: {
    blueprintId: string;
    itemId: string;
    artifactVersionId: string;
    updatedAt: string;
  }) {
    return this.patchWorkState(blueprintId, itemId, {
      status: 'generated',
      generatedArtifactVersionId: artifactVersionId,
      updatedAt,
    });
  }

  approveItem({
    blueprintId,
    itemId,
    updatedAt,
  }: {
    blueprintId: string;
    itemId: string;
    updatedAt: string;
  }) {
    return this.patchWorkState(blueprintId, itemId, {
      status: 'approved',
      updatedAt,
    });
  }

  updateItem(input: UpdateOutlineItemInput) {
    const latest = this.requireLatest(input.blueprintId);
    const target = latest.items.find((item) => item.id === input.itemId);
    if (!target) throw new Error(`OutlineItem 不存在：${input.itemId}`);

    const affectedItemIds = this.collectAffectedItems(latest.items, input.itemId);
    const nextItems = latest.items.map((item) =>
      item.id === input.itemId ? { ...item, ...input.patch } : item,
    );
    this.repository.save({ ...latest, status: 'superseded' });
    const nextVersion: OutlineBlueprintVersion = {
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
    for (const itemId of affectedItemIds) {
      const state = states.get(itemId);
      if (!state) continue;
      states.set(itemId, {
        ...state,
        status: 'stale',
        revision: state.revision + 1,
        generatedArtifactVersionId: undefined,
        updatedAt: input.createdAt,
      });
    }
    return {
      version: structuredClone(nextVersion),
      affectedItemIds,
    };
  }

  private patchWorkState(
    blueprintId: string,
    itemId: string,
    patch: Partial<OutlineWorkState> & { updatedAt: string },
  ) {
    const version = this.requireLatest(blueprintId);
    const states = this.ensureWorkStates(version);
    const current = states.get(itemId);
    if (!current) throw new Error(`OutlineItem 不存在：${itemId}`);
    const next = {
      ...current,
      ...patch,
    };
    states.set(itemId, next);
    return structuredClone(next);
  }

  private collectAffectedItems(items: StoredOutlineItem[], rootItemId: string) {
    const affected = new Set([rootItemId]);
    const queue = [rootItemId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const item of items) {
        const dependsOnCurrent = item.dependsOnItemIds.includes(current);
        const isChild = item.parentId === current;
        if ((!dependsOnCurrent && !isChild) || affected.has(item.id)) continue;
        affected.add(item.id);
        queue.push(item.id);
      }
    }
    return [...affected];
  }

  private ensureWorkStates(version: OutlineBlueprintVersion) {
    let states = this.workStates.get(version.blueprintId);
    if (!states) {
      states = new Map();
      this.workStates.set(version.blueprintId, states);
    }
    for (const item of version.items) {
      if (!states.has(item.id)) {
        states.set(item.id, {
          itemId: item.id,
          status: 'planned',
          revision: 1,
          updatedAt: version.createdAt,
        });
      }
    }
    return states;
  }

  private requireLatest(blueprintId: string) {
    const version = this.repository.getLatest(blueprintId);
    if (!version) throw new Error(`CourseBlueprint 不存在：${blueprintId}`);
    return version;
  }
}
