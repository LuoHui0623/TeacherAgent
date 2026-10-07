/** 提示词地图契约：阶段摘要与正文、变量绑定、漂移说明，以及接口路径的拼法。 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  artifactLabel,
  bindingRows,
  callStatusLabel,
  driftLabel,
  fetchNodePromptMap,
  fetchPromptDiff,
  gateRows,
  stageDetail,
  stageLabel,
  stageSummary,
  type ArtifactRef,
  type PromptMapCall,
  type PromptMapStage,
  type TemplateData,
} from '../services/content-pipeline/promptMap';
import { fetchWorkflowRuns } from '../services/content-pipeline/runs';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(payload),
    });
  });
  return calls;
}

function template(overrides: Partial<TemplateData> = {}): TemplateData {
  return {
    ref: 'agent/prompts/outline-architect.md',
    currentHash: 'sha256:1a2b3c4d5e6f',
    runHash: null,
    changed: false,
    variables: ['brief', 'learnerProfile'],
    bindings: [],
    template: '规则 ${{ brief }}',
    staticPrefix: '规则',
    injection: '${{ brief }}',
    ...overrides,
  };
}

function call(stages: PromptMapStage[]): PromptMapCall {
  return {
    callId: 'run-call-1',
    sequence: 1,
    attempt: 1,
    itemKey: '',
    generation: 0,
    role: 'curriculum',
    status: 'success',
    stages,
  };
}

function artifact(overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    nodeId: 'outline-architect',
    portId: 'outline',
    itemKey: '',
    generation: 0,
    type: 'Outline',
    contentHash: 'sha256:1a2b3c4d5e6f',
    payload: {},
    ...overrides,
  };
}

describe('阶段的中文名与摘要', () => {
  it('六阶段各有中文名', () => {
    expect([
      stageLabel('template'),
      stageLabel('sources'),
      stageLabel('context'),
      stageLabel('messages'),
      stageLabel('request'),
      stageLabel('output'),
    ]).toEqual(['模板原文', '来源资产', '上下文注入', '最终消息', '已提交请求', '模型输出']);
  });

  it('待运行的调用只有模板阶段有内容', () => {
    const pending = call([
      { kind: 'template', state: 'pending', data: template() },
      { kind: 'sources', state: 'pending', data: null },
      { kind: 'context', state: 'pending', data: null },
      { kind: 'messages', state: 'pending', data: null },
      { kind: 'request', state: 'pending', data: null },
      { kind: 'output', state: 'pending', data: null },
    ]);

    expect(pending.stages.map(stageSummary)).toEqual([
      '模板 1a2b3c4',
      '待填充',
      '待填充',
      '待填充',
      '待填充',
      '待填充',
    ]);
  });

  it('运行中的调用把输出阶段显示为输出中', () => {
    expect(stageSummary({ kind: 'output', state: 'streaming', data: null })).toBe('输出中');
  });

  it('完成的调用给出用量与耗时，失败时给出错误', () => {
    const data = {
      message: { content: 'answer' },
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
      durationMs: 120,
      completedAt: '2026-10-07T09:00:00+00:00',
      error: '',
    };

    expect(stageSummary({ kind: 'output', state: 'filled', data })).toBe('5 tokens · 120 ms');
    expect(stageSummary({ kind: 'output', state: 'failed', data: { ...data, error: '限流' } })).toBe(
      '失败：限流',
    );
  });

  it('其余阶段按各自的数据给摘要', () => {
    expect(
      stageSummary({
        kind: 'sources',
        state: 'filled',
        data: [
          {
            ref: 'agent/prompts/outline-architect.md',
            name: 'outline-architect',
            order: 0,
            role: 'system',
            contentHash: 'sha256:a',
            templateText: '',
            renderedText: '',
          },
        ],
      }),
    ).toBe('1 段来源资产');
    expect(
      stageSummary({
        kind: 'context',
        state: 'filled',
        data: [{ portId: 'brief', nodeId: 'intent-planner', itemKey: '', contentHash: 'sha256:a' }],
      }),
    ).toBe('1 个输入端口');
    expect(
      stageSummary({ kind: 'messages', state: 'filled', data: [{ role: 'system', content: 'hi' }] }),
    ).toBe('1 条消息');
    expect(
      stageSummary({
        kind: 'request',
        state: 'filled',
        data: {
          provider: 'openai',
          model: 'model-a',
          role: 'curriculum',
          temperature: 0.7,
          attempt: 1,
          startedAt: '2026-10-07T09:00:00+00:00',
        },
      }),
    ).toBe('model-a · 温度 0.7');
  });
});

describe('阶段的展开正文', () => {
  it('模板阶段给出待填充模板原文', () => {
    expect(stageDetail({ kind: 'template', state: 'filled', data: template() })).toBe(
      '规则 ${{ brief }}',
    );
  });

  it('消息阶段按角色拼出实际发送的内容', () => {
    expect(
      stageDetail({
        kind: 'messages',
        state: 'filled',
        data: [
          { role: 'system', content: '规则' },
          { role: 'user', content: '输入' },
        ],
      }),
    ).toBe('[system]\n规则\n\n[user]\n输入');
  });

  it('上下文阶段给出产物版本的 JSON', () => {
    const detail = stageDetail({
      kind: 'context',
      state: 'filled',
      data: [{ portId: 'brief', nodeId: 'intent-planner', itemKey: '', contentHash: 'sha256:a' }],
    });

    expect(JSON.parse(detail)).toEqual([
      { portId: 'brief', nodeId: 'intent-planner', itemKey: '', contentHash: 'sha256:a' },
    ]);
  });

  it('没有数据的阶段没有正文', () => {
    expect(stageDetail({ kind: 'output', state: 'streaming', data: null })).toBe('');
  });
});

describe('变量绑定与漂移', () => {
  it('把变量清单摊成「哪个变量由什么填充」', () => {
    const rows = bindingRows(
      template({
        bindings: [
          {
            name: 'brief',
            state: 'bound',
            portId: 'brief',
            nodeId: 'intent-planner',
            itemKey: '',
            contentHash: 'sha256:a',
          },
          {
            name: 'learnerProfile',
            state: 'bound',
            portId: null,
            nodeId: null,
            itemKey: null,
            contentHash: null,
          },
        ],
      }),
    );

    expect(rows).toEqual([
      { name: 'brief', state: 'bound', source: '产物端口 brief' },
      { name: 'learnerProfile', state: 'bound', source: '平台上下文' },
    ]);
  });

  it('还没调用的节点每个变量都是未绑定', () => {
    const rows = bindingRows(
      template({
        bindings: [
          {
            name: 'brief',
            state: 'pending',
            portId: null,
            nodeId: null,
            itemKey: null,
            contentHash: null,
          },
        ],
      }),
    );

    expect(rows).toEqual([{ name: 'brief', state: 'pending', source: '未绑定' }]);
  });

  it('没有模板时没有变量行', () => {
    expect(bindingRows(null)).toEqual([]);
  });

  it('只在漂移时给出说明', () => {
    expect(driftLabel(template())).toBeNull();
    expect(
      driftLabel(
        template({ changed: true, runHash: 'sha256:old1old', currentHash: 'sha256:new2new' }),
      ),
    ).toBe('本次运行用的是 old1old，当前模板是 new2new');
  });
});

describe('调用状态', () => {
  it('把落库状态译成中文，未知取值原样返回', () => {
    expect(['pending', 'running', 'success', 'error', 'cancelled'].map(callStatusLabel)).toEqual([
      '待运行',
      '执行中',
      '完成',
      '失败',
      '已取消',
    ]);
    expect(callStatusLabel('unknown-status')).toBe('unknown-status');
  });
});

describe('产物与审批', () => {
  it('产物行给出端口、类型与内容身份', () => {
    expect(artifactLabel(artifact())).toBe('outline · Outline · 1a2b3c4');
  });

  it('只把 GateReview 当成审批记录', () => {
    const rows = gateRows([
      artifact(),
      artifact({
        portId: 'approved',
        type: 'GateReview',
        payload: { reviewer: 'user', decision: 'approved', comments: '可以发布' },
      }),
    ]);

    expect(rows).toEqual([{ reviewer: 'user', decision: 'approved', comments: '可以发布' }]);
  });

  it('评估正文不是对象时忽略该行', () => {
    expect(gateRows([artifact({ type: 'GateReview', payload: 'not-an-object' })])).toEqual([]);
  });
});

describe('接口路径', () => {
  it('按流程取运行列表', async () => {
    const calls = stubFetch({ runs: [{ runId: 'run-1' }] });

    const runs = await fetchWorkflowRuns('content-pipeline-main', 1);

    expect(runs).toEqual([{ runId: 'run-1' }]);
    expect(calls).toEqual(['http://localhost:8000/workflows/content-pipeline-main/runs?limit=1']);
  });

  it('没有运行记录时列表为空', async () => {
    stubFetch({ runs: [] });

    expect(await fetchWorkflowRuns('content-pipeline-main')).toEqual([]);
  });

  it('节点地图按流程 / 运行 / 节点定位', async () => {
    const calls = stubFetch({ nodeId: 'outline-architect' });

    await fetchNodePromptMap('content-pipeline-main', 'run-1', 'outline-architect');

    expect(calls).toEqual([
      'http://localhost:8000/workflows/content-pipeline-main/runs/run-1/nodes/outline-architect/prompt-map',
    ]);
  });

  it('提示词路径里的斜杠是路径分隔，不被转义', async () => {
    const calls = stubFetch({ unifiedDiff: '@@ -1 +1 @@' });

    const diff = await fetchPromptDiff(
      'agent/prompts/outline-architect.md',
      'sha256:old',
      'sha256:new',
    );

    expect(diff).toBe('@@ -1 +1 @@');
    expect(calls).toEqual([
      'http://localhost:8000/prompts/agent/prompts/outline-architect.md/diff' +
        '?from=sha256%3Aold&to=sha256%3Anew',
    ]);
  });
});
