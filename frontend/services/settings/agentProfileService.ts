import { apiDelete, apiGet, apiPost, apiPut } from '../runtime/apiClient';
import type {
  AgentProfile,
  CatalogRefreshResult,
  InvokeResult,
  ModelCatalog,
  ProfilePayload,
  RoleProfiles,
} from './types';

export const agentRoles = ['teacher', 'curriculum', 'knowledge_map'] as const;
export type AgentRole = (typeof agentRoles)[number];

export function listModels(): Promise<ModelCatalog> {
  return apiGet<ModelCatalog>('/llm/models');
}

export function refreshModels(): Promise<CatalogRefreshResult> {
  return apiPost<CatalogRefreshResult>('/llm/models/refresh', null);
}

export function listProfiles(role: AgentRole): Promise<RoleProfiles> {
  return apiGet<RoleProfiles>(`/llm/roles/${role}/profiles`);
}

export function createProfile(
  role: AgentRole,
  payload: ProfilePayload & { profile_id: string },
): Promise<AgentProfile> {
  return apiPost<AgentProfile>(`/llm/roles/${role}/profiles`, payload);
}

export function updateProfile(
  role: AgentRole,
  profileId: string,
  payload: ProfilePayload,
): Promise<AgentProfile> {
  return apiPut<AgentProfile>(
    `/llm/roles/${role}/profiles/${encodeURIComponent(profileId)}`,
    payload,
  );
}

export function activateProfile(
  role: AgentRole,
  profileId: string,
): Promise<AgentProfile> {
  return apiPost<AgentProfile>(
    `/llm/roles/${role}/profiles/${encodeURIComponent(profileId)}/activate`,
    null,
  );
}

export function deleteProfile(role: AgentRole, profileId: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(
    `/llm/roles/${role}/profiles/${encodeURIComponent(profileId)}`,
  );
}

export function invokeCurrentProfile(role: AgentRole): Promise<InvokeResult> {
  return apiPost<InvokeResult>('/llm/invoke', {
    role,
    messages: [{ role: 'user', content: 'ping' }],
  });
}
