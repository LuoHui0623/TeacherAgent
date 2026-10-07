import { describe, expect, it, vi } from 'vitest';

import { fetchWorkflowDefinition } from '../services/content-pipeline/workflowSource';
import { mainWorkflowDefinition } from './fixtures/workflow-fixture';

describe('workflow definition source', () => {
  it('reads the graph from the backend endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(mainWorkflowDefinition), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const payload = await fetchWorkflowDefinition();

      expect(String(fetchMock.mock.calls[0][0])).toContain('/workflows/content-pipeline-main');
      expect(payload.nodes).toHaveLength(mainWorkflowDefinition.nodes.length);
      expect(payload.contentHash).toBe(mainWorkflowDefinition.contentHash);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
