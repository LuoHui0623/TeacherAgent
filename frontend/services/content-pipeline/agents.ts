import type { ContentPipelineArtifactType } from './contracts';
import type {
  NodeExecutionResult,
  NodeHandler,
} from './runtime';

export type ContentAgentRole =
  | 'context-profiler'
  | 'intent-planner'
  | 'outline-architect'
  | 'section-writer'
  | 'reviewer'
  | 'reviser'
  | 'beautifier'
  | 'assessment-generator'
  | 'quality-publisher';

export interface ContentAgentDefinition {
  id: ContentAgentRole;
  label: string;
  description: string;
  promptRef: string;
  defaultModel: string;
  inputArtifactTypes: ContentPipelineArtifactType[];
  outputArtifactTypes: ContentPipelineArtifactType[];
}

function estimateTokens(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

export function createAgentNodeHandler(
  definition: ContentAgentDefinition,
  execute: NodeHandler,
): NodeHandler {
  return async (context) => {
    const result = await execute(context);
    const inputTokens = estimateTokens(
      Object.fromEntries(
        Object.entries(context.inputs).map(([portId, versions]) => [
          portId,
          versions.map((version) => version.payload),
        ]),
      ),
    );
    const outputTokens = estimateTokens(result.outputs ?? []);
    const telemetry = {
      agentId: definition.id,
      model: definition.defaultModel,
      promptRef: definition.promptRef,
      inputTokens,
      outputTokens,
      costUsd: Number(((inputTokens + outputTokens) * 0.000002).toFixed(6)),
    };
    return {
      ...result,
      telemetry,
    } satisfies NodeExecutionResult;
  };
}

export class ContentAgentRegistry {
  private readonly definitions = new Map<ContentAgentRole, ContentAgentDefinition>();
  private readonly handlers = new Map<ContentAgentRole, NodeHandler>();

  register(definition: ContentAgentDefinition, handler: NodeHandler) {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Agent 已注册：${definition.id}`);
    }
    this.definitions.set(definition.id, definition);
    this.handlers.set(definition.id, createAgentNodeHandler(definition, handler));
  }

  getDefinition(agentId: ContentAgentRole) {
    return this.definitions.get(agentId);
  }

  getHandler(agentId: ContentAgentRole) {
    return this.handlers.get(agentId);
  }

  list() {
    return [...this.definitions.values()];
  }
}
