/* 对话：Tutor 与用户的对话记录，以及发起教材生产的提议。
 *
 * 消息只追加，顺序由后端按时间给出，前端不自己排序也不自己编号。`type` 区分
 * 普通对话与提议：只有提议能发起一次运行（后端拒绝其它类型）。
 */

import { apiGet, apiPost } from './runtime/apiClient';

export type ChatRole = 'user' | 'assistant';
export type ChatMessageType = 'chat' | 'proposal';

export interface ChatMessage {
  messageId: string;
  role: ChatRole;
  type: ChatMessageType;
  content: string;
  eventTime: string;
}

/** 一轮对话：用户发言与 Tutor 回复。 */
export interface ChatTurn {
  user: ChatMessage;
  assistant: ChatMessage;
}

/** 显示名：界面按 `role` 分派，文案跟着分派走。 */
export const chatRoleLabels: Record<ChatRole, string> = {
  user: '我',
  assistant: 'Tutor',
};

/** 消息类别的中文名。 */
export const chatTypeLabels: Record<ChatMessageType, string> = {
  chat: '对话',
  proposal: '教学提议',
};

/** 按时间升序读回对话。 */
export async function fetchChatMessages(limit = 100): Promise<ChatMessage[]> {
  const payload = await apiGet<{ messages: ChatMessage[] }>(`/chat/messages?limit=${limit}`);
  return payload.messages;
}

/** 走一轮 Tutor 对话：模型输入与历史都由后端组装。 */
export async function sendTutorTurn(content: string): Promise<ChatTurn> {
  return apiPost<ChatTurn>('/chat/turns', { content });
}

/** 追加一条对话消息；发起运行前用它写下提议。 */
export async function postChatMessage(input: {
  role: ChatRole;
  type: ChatMessageType;
  content: string;
}): Promise<ChatMessage> {
  return apiPost<ChatMessage>('/chat/messages', input);
}
