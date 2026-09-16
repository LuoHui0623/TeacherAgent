import { describe, expect, it } from 'vitest';

import { contentPipelineArtifactTypes } from '../services/content-pipeline/contracts';
import { materializeWorkflowDefinition, WorkflowEditSession } from '../services/content-pipeline/workflowEditor';
import type { WorkflowDefinition, WorkflowVersion } from '../services/content-pipeline/types';

const editableDefinition: WorkflowDefinition = {
  id: 'editable-flow',
  name: 'Editable Flow',
  description: 'editor test',
  entryNodeIds: ['start'],
  nodes: [
    {
      id: 'start',
      kind: 'trigger',
      label: 'Start',
      description: 'start',
      inputs: [],
      outputs: [{ id: 'events', artifactType: contentPipelineArtifactTypes.tutorEvents, required: true, multiple: false, description: 'events' }],
      config: {},
    },
    {
      id: 'optional-tool',
      kind: 'tool',
      label: 'Optional Tool',
      description: 'optional',
      inputs: [{ id: 'events', artifactType: contentPipelineArtifactTypes.tutorEvents, required: true, multiple: false, description: 'events' }],
      outputs: [{ id: 'events', artifactType: contentPipelineArtifactTypes.tutorEvents, required: true, multiple: false, description: 'events' }],
      config: {},
    },
    {
      id: 'end',
      kind: 'persist',
      label: 'End',
      description: 'end',
      inputs: [{ id: 'events', artifactType: contentPipelineArtifactTypes.tutorEvents, required: true, multiple: false, description: 'events' }],
      outputs: [{ id: 'result', artifactType: contentPipelineArtifactTypes.tutorEvents, required: true, multiple: false, description: 'result' }],
      config: {},
    },
  ],
  edges: [
    { id: 'e1', from: { nodeId: 'start', portId: 'events' }, to: { nodeId: 'optional-tool', portId: 'events' } },
    { id: 'e2', from: { nodeId: 'optional-tool', portId: 'events' }, to: { nodeId: 'end', portId: 'events' } },
  ],
};

const baseVersion: WorkflowVersion = {
  id: 'editable-flow-v1',
  workflowId: editableDefinition.id,
  version: 1,
  status: 'active',
  definition: editableDefinition,
  createdAt: '2026-09-13T00:00:00.000Z',
  createdBy: 'system',
};

describe('workflow editor', () => {
  it('disables an optional node and commits a bypassed new version', () => {
    const session = new WorkflowEditSession(baseVersion);
    session.setNodeEnabled('optional-tool', false);
    const materialized = materializeWorkflowDefinition(session.getDraft());

    expect(materialized.issues).toEqual([]);
    expect(materialized.definition.nodes.map((node) => node.id)).toEqual(['start', 'end']);
    expect(materialized.definition.edges.some((edge) => edge.id.startsWith('bypass-'))).toBe(true);

    const version = session.commit({
      id: 'editable-flow-v2',
      createdBy: 'user',
      createdAt: '2026-09-13T00:10:00.000Z',
    });
    expect(version.version).toBe(2);
    expect(version.definition.nodes).toHaveLength(2);
    expect(baseVersion.definition.nodes).toHaveLength(3);
  });

  it('updates node configuration, retry policy and canvas position', () => {
    const session = new WorkflowEditSession(baseVersion);
    session.updateNode('optional-tool', {
      config: { promptRef: 'custom/tool', model: 'mock-tool-v2' },
      retryPolicy: { maxAttempts: 3, backoffMs: 500, retryOn: ['timeout'] },
      position: { x: 420, y: 180 },
    });
    const node = session.getDraft().nodes.find((item) => item.id === 'optional-tool');
    expect(node?.config.model).toBe('mock-tool-v2');
    expect(node?.retryPolicy?.maxAttempts).toBe(3);
    expect(node?.position).toEqual({ x: 420, y: 180 });
  });

});
