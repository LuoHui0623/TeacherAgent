/** 对话接口的客户端：读消息、走一轮对话、写下提议，以及由提议发起运行。 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  chatRoleLabels,
  chatTypeLabels,
  fetchChatMessages,
  postChatMessage,
  sendTutorTurn,
} from '../services/chat';
import { createWorkflowRun } from '../services/content-pipeline/runs';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(payload: unknown) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', (url: string, init?: { method?: string; body?: string }) => {
    calls.push({
      method: init?.method ?? 'GET',
      url,
      body: init?.body ? JSON.parse(init.body) : null,
    });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(payload),
    });
  });
  return calls;
}

describe('对话读写', () => {
  it('按时间升序读回消息', async () => {
    const calls = stubFetch({ messages: [{ messageId: 'msg-1' }, { messageId: 'msg-2' }] });

    const messages = await fetchChatMessages(2);

    expect(messages.map((message) => message.messageId)).toEqual(['msg-1', 'msg-2']);
    expect(calls).toEqual([
      { method: 'GET', url: 'http://localhost:8000/chat/messages?limit=2', body: null },
    ]);
  });

  it('一轮对话只发这一句用户发言', async () => {
    const calls = stubFetch({ user: { messageId: 'msg-1' }, assistant: { messageId: 'msg-2' } });

    await sendTutorTurn('什么是 LCP？');

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://localhost:8000/chat/turns');
    expect(calls[0].body).toEqual({ content: '什么是 LCP？' });
  });

  it('提议作为消息类型写下来', async () => {
    const calls = stubFetch({ messageId: 'msg-3', type: 'proposal' });

    await postChatMessage({ role: 'user', type: 'proposal', content: '帮我做一份教材' });

    expect(calls[0].url).toBe('http://localhost:8000/chat/messages');
    expect(calls[0].body).toEqual({
      role: 'user',
      type: 'proposal',
      content: '帮我做一份教材',
    });
  });

  it('界面文案按 role 与 type 分派，不来自后端', () => {
    expect(chatRoleLabels.assistant).toBe('Tutor');
    expect(chatRoleLabels.user).toBe('我');
    expect(chatTypeLabels.proposal).toBe('教学提议');
  });
});

describe('由提议发起运行', () => {
  it('运行挂在流程下，引用那条消息', async () => {
    const calls = stubFetch({ runId: 'run-1', messageId: 'msg-3' });

    const started = await createWorkflowRun('content-pipeline-main', 'msg-3');

    expect(started.runId).toBe('run-1');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://localhost:8000/workflows/content-pipeline-main/runs');
    expect(calls[0].body).toEqual({ messageId: 'msg-3' });
  });
});
