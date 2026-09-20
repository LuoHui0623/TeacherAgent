/* API client：统一 fetch 封装（后端 FastAPI）。
 *
 * 后端地址**运行时解析**，不在编译期固定 —— 桌面壳的后端端口是启动时才取的
 * 空闲端口，编译期常量无法表达。解析顺序（运行时优先）：
 *
 *   1. 运行时注入：`window.__TEACHERAGENT_API__`（桌面壳 preload 写入）
 *   2. 编译期环境变量：`VITE_API_BASE_URL`
 *   3. 开发默认：`http://localhost:8000`
 *
 * 每次请求都重新解析：注入可能晚于模块加载，而解析开销远小于一次 fetch。
 */

declare global {
  interface Window {
    /** 由桌面壳（Electron preload）注入的后端地址，如 `http://127.0.0.1:53123`。 */
    __TEACHERAGENT_API__?: string;
  }
}

const FALLBACK_BASE_URL = 'http://localhost:8000';

/** 解析后端地址：运行时注入 > 编译期变量 > 开发默认。 */
export function resolveBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__TEACHERAGENT_API__) {
    return window.__TEACHERAGENT_API__;
  }
  return import.meta.env.VITE_API_BASE_URL ?? FALLBACK_BASE_URL;
}

async function errorDetail(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (detail != null) return JSON.stringify(detail);
  return res.statusText || `HTTP ${res.status}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${resolveBaseUrl()}${path}`);
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${resolveBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${resolveBaseUrl()}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${resolveBaseUrl()}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await errorDetail(res));
  return res.json() as Promise<T>;
}