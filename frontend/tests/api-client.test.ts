/** API 地址解析契约：运行时注入优先，便于桌面壳传入动态端口。 */

import { afterEach, describe, expect, it } from 'vitest';

import { resolveBaseUrl } from '../services/runtime/apiClient';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('后端地址解析', () => {
  it('无 window 时回退到开发默认地址', () => {
    expect(resolveBaseUrl()).toBe('http://localhost:8000');
  });

  it('运行时注入优先于其它来源', () => {
    (globalThis as { window?: unknown }).window = {
      __TEACHERAGENT_API__: 'http://127.0.0.1:53123',
    };
    expect(resolveBaseUrl()).toBe('http://127.0.0.1:53123');
  });

  it('注入值为空时回退，不返回空串', () => {
    (globalThis as { window?: unknown }).window = { __TEACHERAGENT_API__: '' };
    expect(resolveBaseUrl()).toBe('http://localhost:8000');
  });
});