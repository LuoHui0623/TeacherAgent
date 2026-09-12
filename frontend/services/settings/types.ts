export interface ModelCatalog {
  models: string[];
}

export interface CatalogRefreshResult extends ModelCatalog {
  ok: boolean;
  added: string[];
  removed: string[];
  error_type?: string;
  message?: string;
  profile_changes: {
    invalid_profiles: string[];
    recovered_profiles: string[];
  };
}

export interface AgentProfile {
  profile_id: string;
  model: string;
  temperature: number;
  active: number;
  valid: number;
  updated_at: string;
}

export interface RoleProfiles {
  role: string;
  profiles: AgentProfile[];
}

export interface ProfilePayload {
  model: string;
  temperature: number;
}

export interface InvokeResult {
  role: string;
  content: string;
}
