import { describe, expect, it } from 'vitest';

import {
  callLogToPromptMapCall,
  createDemoPromptMapCall,
  mergePromptMapCalls,
  sortPromptMapCalls,
} from '../services/content-pipeline/promptMap';

describe('prompt map call stream', () => {
  it('sorts calls by created_at and keeps stable ids for ties', () => {
    const calls = [
      createDemoPromptMapCall({ id: 'b', role: 'reviewer', inputText: 'b', createdAt: '2026-09-19T09:00:00.000Z' }),
      createDemoPromptMapCall({ id: 'a', role: 'reviewer', inputText: 'a', createdAt: '2026-09-19T08:00:00.000Z' }),
    ];

    expect(sortPromptMapCalls(calls).map((call) => call.id)).toEqual(['a', 'b']);
  });

  it('merges incremental updates without duplicating a call', () => {
    const initial = [createDemoPromptMapCall({ id: 'call-1', role: 'reviewer', inputText: 'old' })];
    const updated = createDemoPromptMapCall({
      id: 'call-1',
      role: 'reviewer',
      inputText: 'old',
      outputText: 'done',
      status: 'ok',
    });
    const next = mergePromptMapCalls(initial, [updated, createDemoPromptMapCall({ id: 'call-2', role: 'reviser', inputText: 'new' })]);

    expect(next).toHaveLength(2);
    expect(next.find((call) => call.id === 'call-1')?.outputText).toBe('done');
  });

  it('maps API audit rows to the three prompt-map sections', () => {
    const call = callLogToPromptMapCall({
      id: 7,
      role: 'reviewer',
      provider: 'openai',
      model: 'model-a',
      input_text: 'actual input',
      output_text: 'actual output',
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      duration_ms: 120,
      status: 'ok',
      error: '',
      created_at: '2026-09-19T09:00:00.000Z',
    });

    expect(call.inputText).toBe('actual input');
    expect(call.outputText).toBe('actual output');
    expect(call.template).toContain('审阅章节草稿');
  });
});
