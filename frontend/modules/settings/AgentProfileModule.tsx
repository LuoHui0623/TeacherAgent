import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CheckIcon,
  CpuIcon,
  MinusIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TrashIcon,
} from '@phosphor-icons/react';

import {
  activateProfile,
  agentRoles,
  createProfile,
  deleteProfile,
  invokeCurrentProfile,
  listModels,
  listProfiles,
  refreshModels,
  updateProfile,
  type AgentRole,
} from '../../services/settings/agentProfileService';
import { Button, SelectButton, TextField } from '../../shared/ui';
import { domId } from '../../shared/ids';
import './AgentProfileModule.css';

const roleMeta: Record<AgentRole, { label: string; code: string }> = {
  teacher: { label: '教师', code: 'teacher' },
  curriculum: { label: '课程', code: 'curriculum' },
  knowledge_map: { label: '知识地图', code: 'knowledge_map' },
};

export function AgentProfileModule() {
  const [role, setRole] = useState<AgentRole>('teacher');
  const [profileId, setProfileId] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState('0.7');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [catalogNotice, setCatalogNotice] = useState('');
  const [invokeNotice, setInvokeNotice] = useState('');

  const queryClient = useQueryClient();
  const profilesQuery = useQuery({
    queryKey: ['profiles', role],
    queryFn: () => listProfiles(role),
  });
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: listModels });
  const models = modelsQuery.data?.models ?? [];
  const preferredModel = models.includes('omen-alpha') ? 'omen-alpha' : models[0] ?? '';
  const selectedModel = model || preferredModel;

  const refresh = useMutation({
    mutationFn: refreshModels,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['models'] });
      void queryClient.invalidateQueries({ queryKey: ['profiles', role] });
      setCatalogNotice(
        result.ok
          ? `新增 ${result.added.length} 个，删除 ${result.removed.length} 个`
          : `刷新失败：${result.message ?? '未知错误'}`,
      );
    },
    onError: (error: Error) => setCatalogNotice(`刷新失败：${error.message}`),
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = { model: selectedModel, temperature: Number(temperature) };
      return editingProfileId
        ? updateProfile(role, editingProfileId, payload)
        : createProfile(role, { ...payload, profile_id: profileId.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles', role] });
      resetForm();
      setInvokeNotice('');
    },
  });
  const activate = useMutation({
    mutationFn: (profileId: string) => activateProfile(role, profileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles', role] });
    },
  });
  const remove = useMutation({
    mutationFn: (profileId: string) => deleteProfile(role, profileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles', role] });
    },
  });
  const testInvoke = useMutation({
    mutationFn: () => invokeCurrentProfile(role),
    onSuccess: (result) => setInvokeNotice(result.content),
    onError: (error: Error) => setInvokeNotice(error.message),
  });

  const profiles = profilesQuery.data?.profiles ?? [];
  const activeProfile = profiles.find((profile) => profile.active === 1);
  const temperatureNumber = Number(temperature);
  const selectedRoleIndex = agentRoles.indexOf(role);

  function resetForm() {
    setEditingProfileId(null);
    setProfileId('');
    setModel('');
    setTemperature('0.7');
  }

  return (
    <section className="settings-page">
      <header className="settings-page__header motion-enter">
        <div>
          <p className="page-kicker">Settings / Agent Profile</p>
          <h1 className="page-title">Agent Profile</h1>
          <p className="page-subtitle">按角色管理模型配置与采样温度。</p>
        </div>

        <div className="settings-page__actions">
          <div className="catalog-summary" aria-label={`${models.length} 个可用模型`}>
            <CpuIcon size={17} weight="duotone" />
            <span>{models.length} 个模型</span>
          </div>
          <Button
            id="settings-refresh-models"
            variant="secondary"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            leadingIcon={
              <ArrowsClockwiseIcon
                size={16}
                className={refresh.isPending ? 'spin-soft' : undefined}
              />
            }
          >
            {refresh.isPending ? '刷新中' : '刷新模型'}
          </Button>
        </div>
      </header>

      <div className="settings-toolbar motion-enter motion-delay-1">
        <div className="role-switch" role="tablist" aria-label="Agent role">
          <span
            className={`role-switch__indicator is-index-${selectedRoleIndex}`}
            aria-hidden="true"
          />
          {agentRoles.map((roleKey) => {
            const selected = roleKey === role;
            return (
              <button
                key={roleKey}
                type="button"
                id={domId('settings', 'role', roleKey)}
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setRole(roleKey);
                  resetForm();
                }}
                className={`role-switch__item ${selected ? 'is-selected' : ''}`}
              >
                <span>{roleMeta[roleKey].label}</span>
                <code>{roleMeta[roleKey].code}</code>
              </button>
            );
          })}
        </div>

        <div className="active-profile-summary">
          <span className={`status-dot ${activeProfile ? 'is-online' : ''}`} />
          <span className="active-profile-summary__label">
            {activeProfile ? activeProfile.profile_id : '未激活'}
          </span>
          {activeProfile && (
            <span className="active-profile-summary__model">{activeProfile.model}</span>
          )}
        </div>
      </div>

      {(catalogNotice || modelsQuery.isError) && (
        <div
          className={`notice-bar motion-enter motion-delay-2 ${
            modelsQuery.isError ? 'is-error' : ''
          }`}
        >
          <span className="notice-bar__dot" />
          {modelsQuery.isError
            ? modelsQuery.error instanceof Error
              ? modelsQuery.error.message
              : '模型列表加载失败'
            : catalogNotice}
        </div>
      )}

      <div className="settings-layout">
        <form
          className="settings-panel motion-enter motion-delay-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">{editingProfileId ? 'Editing profile' : 'New profile'}</p>
              <h2>{editingProfileId ? '编辑配置' : '创建配置'}</h2>
            </div>
            <SlidersHorizontalIcon size={20} weight="duotone" className="panel-heading__icon" />
          </div>

          <TextField
            label="Profile name"
            className="settings-field"
            type="text"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            disabled={editingProfileId !== null}
            required
            placeholder="例如 default"
          />

          <SelectButton
            id="settings-model-select"
            label="Model"
            className="settings-field"
            value={selectedModel}
            onChange={setModel}
            disabled={modelsQuery.isLoading || models.length === 0}
            options={
              models.length > 0
                ? models.map((modelId) => ({ value: modelId, label: modelId }))
                : [{ value: '', label: '暂无可用模型' }]
            }
          />

          <div className="field">
            <div className="field__label-row">
              <span className="field__label">Temperature</span>
              <output className="temperature-output">
                {Number.isNaN(temperatureNumber) ? '0.7' : temperatureNumber.toFixed(1)}
              </output>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={Number.isNaN(temperatureNumber) ? 0.7 : temperatureNumber}
              onChange={(event) => setTemperature(event.target.value)}
              className="temperature-range"
              aria-label="Temperature"
            />
            <div className="temperature-stepper">
              <button
                type="button"
                id="settings-temperature-decrease"
                className="icon-button interactive-control"
                aria-label="降低 temperature"
                title="降低 temperature"
                onClick={() =>
                  setTemperature(String(Math.max(0, (temperatureNumber || 0) - 0.1).toFixed(1)))
                }
              >
                <MinusIcon size={14} weight="bold" />
              </button>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
                required
                className="temperature-input"
                aria-label="Temperature 数值"
              />
              <button
                type="button"
                id="settings-temperature-increase"
                className="icon-button interactive-control"
                aria-label="提高 temperature"
                title="提高 temperature"
                onClick={() =>
                  setTemperature(String(Math.min(2, (temperatureNumber || 0) + 0.1).toFixed(1)))
                }
              >
                <PlusIcon size={14} weight="bold" />
              </button>
            </div>
          </div>

          <div className="panel-actions">
            <Button id="settings-save-profile" type="submit" disabled={save.isPending}>
              {save.isPending ? '保存中' : editingProfileId ? '更新 Profile' : '创建 Profile'}
            </Button>
            {editingProfileId && (
              <Button
                id="settings-cancel-profile-edit"
                type="button"
                variant="text-ghost"
                onClick={resetForm}
              >
                取消
              </Button>
            )}
          </div>

          {save.isError && <p className="inline-error">{save.error.message}</p>}
        </form>

        <section className="settings-panel motion-enter motion-delay-3">
          <div className="panel-heading panel-heading--list">
            <div>
              <p className="panel-kicker">{roleMeta[role].code}</p>
              <h2>{roleMeta[role].label} Agent</h2>
            </div>
            <Button
              id={domId('settings', 'test-invoke', role)}
              variant="accent"
              onClick={() => testInvoke.mutate()}
              disabled={testInvoke.isPending || !activeProfile}
              leadingIcon={<PlayIcon size={15} weight="fill" />}
            >
              {testInvoke.isPending ? '调用中' : '调用测试'}
            </Button>
          </div>

          {activeProfile && (
            <div className="active-profile-band">
              <div className="active-profile-band__icon">
                <CheckCircleIcon size={21} weight="fill" />
              </div>
              <div className="active-profile-band__copy">
                <span>当前生效</span>
                <strong>{activeProfile.profile_id}</strong>
              </div>
              <div className="active-profile-band__config">
                <code>{activeProfile.model}</code>
                <span>T {activeProfile.temperature}</span>
              </div>
            </div>
          )}

          <ul className="profile-list">
            {profiles.map((profile) => {
              const isEditing = editingProfileId === profile.profile_id;
              return (
                <li
                  key={profile.profile_id}
                  className={`profile-row ${profile.active ? 'is-active' : ''} ${
                    isEditing ? 'is-editing' : ''
                  }`}
                >
                  <div className="profile-row__identity">
                    <span className="profile-avatar">
                      {profile.profile_id.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{profile.profile_id}</strong>
                      <span>{profile.active ? 'Active profile' : 'Stored profile'}</span>
                    </div>
                  </div>

                  <div className="profile-row__config">
                    <code>{profile.model}</code>
                    <span>T {profile.temperature}</span>
                  </div>

                  <span
                    className={`status-tag ${
                      profile.valid ? 'status-tag--valid' : 'status-tag--invalid'
                    }`}
                  >
                    {profile.valid ? '可用' : '失效'}
                  </span>

                  <div className="profile-row__actions">
                    <button
                      type="button"
                      id={domId('settings', `profile-${role}-activate`, profile.profile_id)}
                      onClick={() => activate.mutate(profile.profile_id)}
                      disabled={profile.active === 1 || profile.valid !== 1 || activate.isPending}
                      className="icon-button interactive-control"
                      aria-label={`激活 ${profile.profile_id}`}
                      title="激活 Profile"
                    >
                      <CheckIcon size={15} weight="bold" />
                    </button>
                    <button
                      type="button"
                      id={domId('settings', `profile-${role}-edit`, profile.profile_id)}
                      onClick={() => {
                        setEditingProfileId(profile.profile_id);
                        setProfileId(profile.profile_id);
                        setModel(profile.model);
                        setTemperature(String(profile.temperature));
                      }}
                      className="icon-button interactive-control"
                      aria-label={`编辑 ${profile.profile_id}`}
                      title="编辑 Profile"
                    >
                      <PencilSimpleIcon size={15} />
                    </button>
                    <button
                      type="button"
                      id={domId('settings', `profile-${role}-delete`, profile.profile_id)}
                      onClick={() => remove.mutate(profile.profile_id)}
                      disabled={profile.active === 1 || remove.isPending}
                      className="icon-button icon-button--danger interactive-control"
                      aria-label={`删除 ${profile.profile_id}`}
                      title="删除 Profile"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {!profilesQuery.isLoading && profiles.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__mark" />
              <p>暂无 Profile</p>
            </div>
          )}

          {profilesQuery.isError && <p className="inline-error">{profilesQuery.error.message}</p>}
          {activate.isError && <p className="inline-error">{activate.error.message}</p>}
          {remove.isError && <p className="inline-error">{remove.error.message}</p>}
          {invokeNotice && (
            <div className="invoke-result">
              <span>调用结果</span>
              <p>{invokeNotice}</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
