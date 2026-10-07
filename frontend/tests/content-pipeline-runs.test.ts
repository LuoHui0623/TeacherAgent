/** 运行读模型与运行控制：状态映射、视图派生、控制接口的路径与请求体。 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  artifactRows,
  decideRunNode,
  nodeRunStatus,
  nodeStatusMap,
  pauseWorkflowRun,
  rerunRunNode,
  resumeWorkflowRun,
  reviewedHash,
  runMetrics,
  runStatusOf,
  timelineEvents,
  waitingItems,
  type ArtifactRef,
  type NodeRunSummary,
  type WorkflowRunDetail,
} from '../services/content-pipeline/runs';
import { graphLayout } from '../services/content-pipeline/canvasLayout';
import type { WorkflowDefinition, WorkflowNodeDefinition } from '../services/content-pipeline/types';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(payload),
    });
  });
  return calls;
}

function artifact(overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    nodeId: 'outline-architect',
    portId: 'outline',
    itemKey: '',
    generation: 0,
    type: 'Outline',
    contentHash: 'sha256:aaaa1111',
    payload: {},
    ...overrides,
  };
}

function node(overrides: Partial<NodeRunSummary> = {}): NodeRunSummary {
  return {
    nodeId: 'outline-architect',
    kind: 'agent',
    label: '大纲设计',
    status: 'succeeded',
    attempts: 1,
    itemKeys: [],
    callCount: 0,
    eventTime: '2026-01-01T09:00:00+00:00',
    error: '',
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

function detail(overrides: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return {
    runId: 'run-1',
    workflowId: 'content-pipeline-main',
    status: 'running',
    startedAt: '2026-01-01T09:00:00+00:00',
    updatedAt: '2026-01-01T09:02:34+00:00',
    durationMs: 154000,
    nodeCount: 2,
    graphContentHash: 'sha256:graph',
    triggerMessageId: null,
    graph: definition(),
    nodes: [node()],
    ...overrides,
  };
}

function graphNode(id: string, overrides: Partial<WorkflowNodeDefinition> = {}): WorkflowNodeDefinition {
  return {
    id,
    kind: 'agent',
    label: id,
    description: '',
    inputs: [],
    outputs: [],
    config: {},
    ...overrides,
  };
}

function definition(): WorkflowDefinition {
  return {
    id: 'content-pipeline-main',
    name: '教材生产主流程',
    description: '',
    entryNodeIds: ['start'],
    nodes: [graphNode('start'), graphNode('plan'), graphNode('approve'), graphNode('publish')],
    edges: [
      { id: 'e1', from: { nodeId: 'start', portId: 'out' }, to: { nodeId: 'plan', portId: 'in' } },
      { id: 'e2', from: { nodeId: 'plan', portId: 'out' }, to: { nodeId: 'approve', portId: 'in' } },
      {
        id: 'e3',
        from: { nodeId: 'approve', portId: 'out' },
        to: { nodeId: 'publish', portId: 'in' },
      },
      // 打回上游的回边：审批可以退回到计划节点。
      { id: 'e4', from: { nodeId: 'approve', portId: 'feedback' }, to: { nodeId: 'plan', portId: 'in' } },
    ],
  };
}

describe('状态映射', () => {
  it('后端的人工等待在前端叫 waiting-approval', () => {
    expect(nodeRunStatus('waiting-human')).toBe('waiting-approval');
  });

  it('词表内的状态原样保留，未知状态按等待处理', () => {
    expect(nodeRunStatus('running')).toBe('running');
    expect(nodeRunStatus('cancelled')).toBe('cancelled');
    expect(nodeRunStatus('something-else')).toBe('pending');
  });

  it('节点状态表按节点 id 平铺', () => {
    const statuses = nodeStatusMap(
      detail({
        nodes: [node({ nodeId: 'plan', status: 'running' }), node({ nodeId: 'approve', status: 'waiting-human' })],
      }),
    );

    expect(statuses).toEqual({ plan: 'running', approve: 'waiting-approval' });
  });

  it('没有运行数据时状态表为空', () => {
    expect(nodeStatusMap(null)).toEqual({});
  });

  it('运行状态：暂停优先于后端状态', () => {
    expect(runStatusOf(detail({ status: 'running' }), true)).toBe('paused');
    expect(runStatusOf(detail({ status: 'waiting-human' }), false)).toBe('waiting-human');
  });

  it('运行状态：没有运行时是就绪，未知值也按就绪处理', () => {
    expect(runStatusOf(null, false)).toBe('ready');
    expect(runStatusOf({ status: 'weird' }, false)).toBe('ready');
  });
});

describe('视图派生', () => {
  it('时间线按事件时间排序，失败节点带错误文案', () => {
    const events = timelineEvents(
      detail({
        nodes: [
          node({ nodeId: 'plan', label: '计划', eventTime: '2026-01-01T09:02:00+00:00' }),
          node({
            nodeId: 'approve',
            label: '审批',
            status: 'failed',
            error: '版本冲突',
            eventTime: '2026-01-01T09:01:00+00:00',
          }),
          node({ nodeId: 'idle', label: '未执行', status: 'pending', eventTime: '' }),
        ],
      }),
    );

    expect(events.map((event) => event.id)).toEqual(['approve', 'plan']);
    expect(events[0].detail).toBe('版本冲突');
    expect(events[0].tone).toBe('danger');
    expect(events[1].title).toContain('计划');
  });

  it('产物列表按节点、代次降序排列，重跑的旧代次仍在', () => {
    const rows = artifactRows(
      detail({
        nodes: [
          node({
            nodeId: 'plan',
            outputs: [artifact({ nodeId: 'plan', generation: 0 }), artifact({ nodeId: 'plan', generation: 2 })],
          }),
          node({ nodeId: 'approve', outputs: [artifact({ nodeId: 'approve', generation: 1 })] }),
        ],
      }),
    );

    expect(rows.map((row) => `${row.nodeId}#${row.generation}`)).toEqual([
      'approve#1',
      'plan#2',
      'plan#0',
    ]);
  });

  it('指标取真实耗时、跑过的节点数与模型调用数', () => {
    const metrics = runMetrics(
      detail({
        durationMs: 154000,
        nodes: [
          node({ callCount: 2 }),
          node({ nodeId: 'plan', status: 'pending', callCount: 0 }),
        ],
      }),
    );

    expect(metrics).toEqual({ duration: '2m 34s', nodes: '1 / 2', calls: '2' });
  });

  it('没有运行时的指标不编造数字', () => {
    expect(runMetrics(null)).toEqual({ duration: '—', nodes: '—', calls: '—' });
  });

  it('等待条目：只有等待人工的节点有，没有条目时留一项整节点决断', () => {
    expect(waitingItems(node({ status: 'succeeded', itemKeys: ['c1'] }))).toEqual([]);
    expect(waitingItems(node({ status: 'waiting-human', itemKeys: ['c1', 'c2'] }))).toEqual(['c1', 'c2']);
    expect(waitingItems(node({ status: 'waiting-human', itemKeys: [] }))).toEqual(['']);
  });

  it('被审版本取该条目的输入产物身份', () => {
    const gate = node({
      status: 'waiting-human',
      itemKeys: ['c1', 'c2'],
      inputs: [
        artifact({ portId: 'draft', itemKey: 'c1', contentHash: 'sha256:1111' }),
        artifact({ portId: 'draft', itemKey: 'c2', contentHash: 'sha256:2222' }),
      ],
    });

    expect(reviewedHash(gate, 'c2')).toBe('sha256:2222');
    expect(reviewedHash(gate, 'c3')).toBeNull();
    expect(reviewedHash(null, 'c1')).toBeNull();
  });
});

describe('控制接口', () => {
  it('暂停与继续打在同一运行上', async () => {
    const calls = stubFetch({ runId: 'run-1', paused: true });

    await pauseWorkflowRun('content-pipeline-main', 'run-1');
    await resumeWorkflowRun('content-pipeline-main', 'run-1');

    expect(calls.map((call) => call.url)).toEqual([
      'http://localhost:8000/workflows/content-pipeline-main/runs/run-1/pause',
      'http://localhost:8000/workflows/content-pipeline-main/runs/run-1/resume',
    ]);
  });

  it('局部重跑按节点定位', async () => {
    const calls = stubFetch({ affected: [] });

    await rerunRunNode('content-pipeline-main', 'run-1', 'chapter-approval');

    expect(calls[0].url).toBe(
      'http://localhost:8000/workflows/content-pipeline-main/runs/run-1/nodes/chapter-approval/rerun',
    );
    expect(calls[0].body).toEqual({});
  });

  it('决断带上条目与所审版本身份', async () => {
    const calls = stubFetch({ executed: [] });

    await decideRunNode('content-pipeline-main', 'run-1', 'chapter-approval', {
      approved: true,
      comments: '可以发布',
      itemKey: 'c2',
      expectedHash: 'sha256:2222',
    });

    expect(calls[0].url).toBe(
      'http://localhost:8000/workflows/content-pipeline-main/runs/run-1/nodes/chapter-approval/decide',
    );
    expect(calls[0].body).toEqual({
      approved: true,
      comments: '可以发布',
      itemKey: 'c2',
      expectedHash: 'sha256:2222',
    });
  });

  it('没有所审版本身份时不编造一个', async () => {
    const calls = stubFetch({ executed: [] });

    await decideRunNode('content-pipeline-main', 'run-1', 'chapter-approval', { approved: false });

    expect(calls[0].body).toEqual({
      approved: false,
      comments: '',
      itemKey: '',
      expectedHash: null,
    });
  });
});

describe('画布布局', () => {
  it('入口在最左列，下游逐列加深', () => {
    const layout = graphLayout(definition());

    expect(layout.positions.start.x).toBe(40);
    expect(layout.positions.plan.x).toBe(258);
    expect(layout.positions.approve.x).toBe(476);
    expect(layout.positions.publish.x).toBe(694);
  });

  it('打回上游的回边不会把已排过的节点重排', () => {
    const layout = graphLayout(definition());

    expect(layout.columns[1]).toEqual(['plan']);
    expect(layout.positions.plan.x).toBeLessThan(layout.positions.approve.x);
  });

  it('图里每个节点都有坐标，画布按坐标给尺寸', () => {
    const layout = graphLayout(definition());

    expect(Object.keys(layout.positions).sort()).toEqual(['approve', 'plan', 'publish', 'start']);
    expect(layout.width).toBeGreaterThan(layout.positions.publish.x);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('没有定义时给一张空画布', () => {
    expect(graphLayout(null).positions).toEqual({});
  });
});
