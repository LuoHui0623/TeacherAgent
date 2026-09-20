import { apiGet, apiPost, apiPut } from '../runtime/apiClient';

export interface UserProfileVersion {
  id: string;
  user_key: string;
  content: string;
  content_hash: string;
  created_at: string;
}

export interface UserProfileCatalog {
  current: UserProfileVersion | null;
  versions: UserProfileVersion[];
}

export function listUserProfileVersions(): Promise<UserProfileCatalog> {
  return apiGet<UserProfileCatalog>('/user-profile/versions');
}

export function saveUserProfile(content: string): Promise<UserProfileVersion> {
  return apiPut<UserProfileVersion>('/user-profile/current', { content });
}

export function restoreUserProfileVersion(versionId: string): Promise<UserProfileVersion> {
  return apiPost<UserProfileVersion>(
    `/user-profile/versions/${encodeURIComponent(versionId)}/restore`,
    null,
  );
}
