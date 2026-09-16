import type {
  Artifact,
  ArtifactStatus,
  ArtifactVersion,
  ContractDefinition,
  JsonValue,
} from './types';
import {
  contentPipelineContracts,
  validateArtifactPayload,
  type ContentPipelineArtifactType,
} from './contracts';

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

export class ArtifactNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactNotFoundError';
  }
}

interface CreateArtifactInput {
  id: string;
  versionId: string;
  runId: string;
  artifactType: ContentPipelineArtifactType;
  contractId: string;
  producerNodeRunId: string;
  inputArtifactVersionIds?: string[];
  payload: JsonValue;
  summary: string;
  createdAt: string;
}

interface AddArtifactVersionInput
  extends Omit<CreateArtifactInput, 'id' | 'artifactType' | 'contractId'> {
  artifactId: string;
  parentVersionIds?: string[];
}

export class ArtifactStore {
  private readonly artifacts = new Map<string, Artifact>();
  private readonly versions = new Map<string, ArtifactVersion>();

  constructor(
    private readonly contracts: ContractDefinition[] = contentPipelineContracts,
  ) {}

  createArtifact(input: CreateArtifactInput) {
    if (this.artifacts.has(input.id)) {
      throw new Error(`Artifact 已存在：${input.id}`);
    }
    if (this.versions.has(input.versionId)) {
      throw new Error('ArtifactVersion 已存在：' + input.versionId);
    }

    const contract = this.requireContract(input.contractId, input.artifactType);
    this.validatePayload(input.artifactType, input.payload);

    const artifact: Artifact = {
      id: input.id,
      runId: input.runId,
      type: input.artifactType,
      producerNodeRunId: input.producerNodeRunId,
      latestVersionId: input.versionId,
      createdAt: input.createdAt,
    };
    const version: ArtifactVersion = {
      id: input.versionId,
      artifactId: input.id,
      runId: input.runId,
      producerNodeRunId: input.producerNodeRunId,
      inputArtifactVersionIds: [...(input.inputArtifactVersionIds ?? [])],
      version: 1,
      status: 'draft',
      contractId: contract.id,
      payload: structuredClone(input.payload),
      summary: input.summary,
      parentVersionIds: [],
      createdAt: input.createdAt,
    };

    this.artifacts.set(artifact.id, Object.freeze(artifact));
    this.versions.set(version.id, Object.freeze(version));
    return {
      artifact: this.artifacts.get(artifact.id)!,
      version: this.versions.get(version.id)!,
    };
  }

  addVersion(input: AddArtifactVersionInput) {
    if (this.versions.has(input.versionId)) {
      throw new Error('ArtifactVersion 已存在：' + input.versionId);
    }
    const artifact = this.requireArtifact(input.artifactId);
    const contract = this.requireContractByType(artifact.type);
    this.validatePayload(artifact.type, input.payload);

    const currentVersions = this.listVersions(artifact.id);
    const versionNumber =
      currentVersions.reduce((maximum, item) => Math.max(maximum, item.version), 0) + 1;
    const version: ArtifactVersion = {
      id: input.versionId,
      artifactId: artifact.id,
      runId: input.runId,
      producerNodeRunId: input.producerNodeRunId,
      inputArtifactVersionIds: [...(input.inputArtifactVersionIds ?? [])],
      version: versionNumber,
      status: 'draft',
      contractId: contract.id,
      payload: structuredClone(input.payload),
      summary: input.summary,
      parentVersionIds: [
        ...(input.parentVersionIds ?? [artifact.latestVersionId]),
      ],
      createdAt: input.createdAt,
    };

    const nextArtifact = Object.freeze({
      ...artifact,
      latestVersionId: version.id,
    });
    this.versions.set(version.id, Object.freeze(version));
    this.artifacts.set(artifact.id, nextArtifact);
    return { artifact: nextArtifact, version: this.versions.get(version.id)! };
  }

  getArtifact(artifactId: string) {
    return this.requireArtifact(artifactId);
  }

  getVersion(versionId: string) {
    const version = this.versions.get(versionId);
    if (!version) throw new ArtifactNotFoundError(`ArtifactVersion 不存在：${versionId}`);
    return version;
  }

  listVersions(artifactId: string) {
    this.requireArtifact(artifactId);
    return [...this.versions.values()]
      .filter((version) => version.artifactId === artifactId)
      .sort((left, right) => left.version - right.version);
  }

  getLatestVersion(artifactId: string) {
    return this.getVersion(this.requireArtifact(artifactId).latestVersionId);
  }

  validateVersion(versionId: string) {
    const version = this.getVersion(versionId);
    if (version.status !== 'draft') {
      throw new ContractValidationError(`只有 draft 版本可以进入 validated：${version.status}`);
    }
    const nextVersion = Object.freeze({
      ...version,
      status: 'validated' as ArtifactStatus,
    });
    this.versions.set(versionId, nextVersion);
    return nextVersion;
  }

  confirmVersion(versionId: string, confirmedBy: string, confirmedAt: string) {
    const version = this.getVersion(versionId);
    if (version.status !== 'validated') {
      throw new ContractValidationError(`只有 validated 版本可以确认：${version.status}`);
    }
    const nextVersion = Object.freeze({
      ...version,
      status: 'confirmed' as ArtifactStatus,
      confirmedBy,
      confirmedAt,
    });
    this.versions.set(versionId, nextVersion);
    return nextVersion;
  }

  supersedeVersion(versionId: string) {
    const version = this.getVersion(versionId);
    const nextVersion = Object.freeze({
      ...version,
      status: 'superseded' as ArtifactStatus,
    });
    this.versions.set(versionId, nextVersion);
    return nextVersion;
  }

  assertConsumable(versionIds: string[], expectedType: ContentPipelineArtifactType) {
    return versionIds.map((versionId) => {
      const version = this.getVersion(versionId);
      if (version.status !== 'validated' && version.status !== 'confirmed') {
        throw new ContractValidationError(
          `ArtifactVersion 尚未通过校验：${versionId}`,
        );
      }
      const contract = this.getContractById(version.contractId);
      if (!contract || contract.artifactType !== expectedType) {
        throw new ContractValidationError(
          `Artifact 类型不匹配：期望 ${expectedType}，实际 ${contract?.artifactType ?? 'unknown'}`,
        );
      }
      return version;
    });
  }

  private validatePayload(
    artifactType: ContentPipelineArtifactType,
    payload: JsonValue,
  ) {
    const result = validateArtifactPayload(artifactType, payload);
    if (!result.valid) {
      throw new ContractValidationError(
        `${artifactType} 不符合 Contract：${result.errors.join('；')}`,
      );
    }
  }

  private requireContract(
    contractId: string,
    artifactType: ContentPipelineArtifactType,
  ) {
    const contract = this.getContractById(contractId);
    if (!contract) throw new ContractValidationError(`Contract 不存在：${contractId}`);
    if (contract.artifactType !== artifactType) {
      throw new ContractValidationError(
        `Contract 与 Artifact 类型不匹配：${contractId}`,
      );
    }
    return contract;
  }

  private requireContractByType(artifactType: string) {
    const contract = this.contracts.find(
      (item) => item.artifactType === artifactType,
    );
    if (!contract) {
      throw new ContractValidationError(`未注册 Artifact Contract：${artifactType}`);
    }
    return contract;
  }

  private getContractById(contractId: string) {
    return this.contracts.find((contract) => contract.id === contractId);
  }

  private requireArtifact(artifactId: string) {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) throw new ArtifactNotFoundError(`Artifact 不存在：${artifactId}`);
    return artifact;
  }
}
