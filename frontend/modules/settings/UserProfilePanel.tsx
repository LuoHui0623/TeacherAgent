import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowCounterClockwiseIcon,
  ClockCounterClockwiseIcon,
  EyeIcon,
  FloppyDiskIcon,
  PlusIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { domId } from '../../shared/ids';
import { Button, Modal } from '../../shared/ui';
import {
  diffProfileVersions,
  findMissingCoreSections,
  insertProfileSection,
} from '../../services/settings/profileGuardrails';
import {
  listUserProfileVersions,
  restoreUserProfileVersion,
  saveUserProfile,
  type UserProfileCatalog,
  type UserProfileVersion,
} from '../../services/settings/userProfileService';
import './UserProfilePanel.css';

const PROFILE_QUERY_KEY = ['user-profile-versions'] as const;

export function UserProfilePanel() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: listUserProfileVersions,
    retry: false,
  });
  const current = profileQuery.data?.current ?? null;
  const versions = profileQuery.data?.versions ?? [];

  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const [diffVersion, setDiffVersion] = useState<UserProfileVersion | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<UserProfileVersion | null>(null);
  const draft = draftOverride ?? current?.content ?? '';

  const saveMutation = useMutation({
    mutationFn: () => saveUserProfile(draft),
    onSuccess: (saved) => {
      setDraftOverride(null);
      queryClient.setQueryData<UserProfileCatalog>(PROFILE_QUERY_KEY, (previous) => ({
        current: saved,
        versions: [
          saved,
          ...(previous?.versions ?? []).filter((version) => version.id !== saved.id),
        ].slice(0, 3),
      }));
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => restoreUserProfileVersion(versionId),
    onSuccess: (saved) => {
      setRestoreVersion(null);
      setDraftOverride(null);
      queryClient.setQueryData<UserProfileCatalog>(PROFILE_QUERY_KEY, (previous) => ({
        current: saved,
        versions: [
          saved,
          ...(previous?.versions ?? []).filter((version) => version.id !== saved.id),
        ].slice(0, 3),
      }));
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });

  const missingCoreSections = findMissingCoreSections(draft);
  const isDirty = draftOverride !== null && draft !== (current?.content ?? '');
  const diffLines = diffProfileVersions(
    current?.content ?? '',
    diffVersion?.content ?? '',
  );

  return (
    <section className="settings-page user-profile-page">
      <header className="settings-page__header motion-enter">
        <div>
          <p className="page-kicker">Settings / Learner Profile</p>
          <h1 className="page-title">用户画像</h1>
          <p className="page-subtitle">编辑当前画像 Markdown，保存后自动生成新版本。</p>
        </div>

        <div className="settings-page__actions">
          <Button
            id="settings-user-profile-revert"
            variant="secondary"
            disabled={!isDirty || saveMutation.isPending}
            onClick={() => setDraftOverride(null)}
            leadingIcon={<ArrowCounterClockwiseIcon size={16} />}
          >
            撤销更改
          </Button>
          <Button
            id="settings-user-profile-save"
            disabled={!isDirty || saveMutation.isPending}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            leadingIcon={<FloppyDiskIcon size={16} weight="fill" />}
          >
            保存画像
          </Button>
        </div>
      </header>

      {profileQuery.isLoading ? (
        <section className="profile-panel profile-panel--loading motion-enter">正在加载画像…</section>
      ) : profileQuery.isError ? (
        <section className="profile-panel profile-panel--error motion-enter">
          <WarningCircleIcon size={20} weight="duotone" />
          <span>{profileQuery.error.message}</span>
        </section>
      ) : (
        <div className="profile-workspace-grid motion-enter motion-delay-1">
          <section className="profile-editor-card">
            <div className="profile-card-heading">
              <div>
                <span className="profile-card-kicker">Markdown</span>
                <h2>当前画像</h2>
              </div>
              <span className={`profile-save-state ${isDirty ? 'is-dirty' : 'is-saved'}`}>
                {isDirty ? '未保存' : '已保存'}
              </span>
            </div>

            <textarea
              id="settings-user-profile-editor"
              className="profile-editor"
              value={draft}
              onChange={(event) => setDraftOverride(event.target.value)}
              spellCheck={false}
              placeholder="# 用户画像\n\n## 主修技术\n"
              aria-label="用户画像 Markdown 编辑器"
            />

            {missingCoreSections.length > 0 ? (
              <div className="profile-guardrail">
                <div className="profile-guardrail__message">
                  <WarningCircleIcon size={17} weight="duotone" />
                  <span>
                    核心分区缺失或标题已改动：{missingCoreSections.join('、')}。这不阻止保存。
                  </span>
                </div>
                <div className="profile-guardrail__actions">
                  {missingCoreSections.map((section) => (
                    <Button
                      key={section}
                      id={domId('settings', 'user-profile', 'insert', section)}
                      variant="secondary"
                      size="sm"
                      leadingIcon={<PlusIcon size={13} weight="bold" />}
                      onClick={() =>
                        setDraftOverride(insertProfileSection(draft, section))
                      }
                    >
                      插入 {section}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="profile-guardrail-ok">核心分区完整。</p>
            )}

            {saveMutation.isError ? (
              <p className="inline-error">{saveMutation.error.message}</p>
            ) : null}
          </section>

          <aside className="profile-history-card">
            <div className="profile-card-heading">
              <div>
                <span className="profile-card-kicker">Versions</span>
                <h2>历史版本</h2>
              </div>
              <ClockCounterClockwiseIcon size={20} weight="duotone" />
            </div>

            {versions.length === 0 ? (
              <div className="profile-history-empty">
                暂无画像版本。保存后会自动生成第一条版本记录。
              </div>
            ) : (
              <ol className="profile-version-list">
                {versions.map((version) => {
                  const isCurrent = version.id === current?.id;
                  return (
                    <li key={version.id} className={isCurrent ? 'is-current' : ''}>
                      <div className="profile-version-meta">
                        <strong>{isCurrent ? '当前版本' : '历史版本'}</strong>
                        <time>{version.created_at}</time>
                      </div>
                      <code>{version.id}</code>
                      <div className="profile-version-actions">
                        <Button
                          id={domId('settings', 'user-profile', 'diff', version.id)}
                          variant="secondary"
                          size="sm"
                          leadingIcon={<EyeIcon size={13} />}
                          onClick={() => setDiffVersion(version)}
                        >
                          查看差异
                        </Button>
                        {!isCurrent ? (
                          <Button
                            id={domId('settings', 'user-profile', 'restore', version.id)}
                            variant="text-ghost"
                            size="sm"
                            disabled={isDirty || restoreMutation.isPending}
                            title={isDirty ? '请先保存或撤销未保存修改' : '复制此版本为新版本'}
                            onClick={() => setRestoreVersion(version)}
                          >
                            恢复
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {restoreMutation.isError ? (
              <p className="inline-error">{restoreMutation.error.message}</p>
            ) : null}
          </aside>
        </div>
      )}

      <Modal
        id="settings-user-profile-diff-modal"
        open={diffVersion !== null}
        title="版本差异"
        description="对比当前版本与所选历史版本。"
        onClose={() => setDiffVersion(null)}
        footer={
          <Button
            id="settings-user-profile-diff-close"
            variant="secondary"
            onClick={() => setDiffVersion(null)}
          >
            关闭
          </Button>
        }
      >
        {diffLines.length === 0 ? (
          <p className="profile-diff-empty">两个版本内容一致。</p>
        ) : (
          <div className="profile-diff" aria-label="版本差异">
            {diffLines.map((line, index) => (
              <div key={`${line.kind}-${index}`} className={`profile-diff__line is-${line.kind}`}>
                <span aria-hidden="true">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span>
                <code>{line.text || ' '}</code>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        id="settings-user-profile-restore-modal"
        open={restoreVersion !== null}
        title="恢复画像版本"
        description="恢复会复制所选历史版本为新版本，不会删除现有历史。"
        onClose={() => setRestoreVersion(null)}
        footer={
          <>
            <Button
              id="settings-user-profile-restore-cancel"
              variant="secondary"
              onClick={() => setRestoreVersion(null)}
            >
              取消
            </Button>
            <Button
              id="settings-user-profile-restore-confirm"
              loading={restoreMutation.isPending}
              onClick={() => {
                if (restoreVersion) restoreMutation.mutate(restoreVersion.id);
              }}
            >
              确认恢复
            </Button>
          </>
        }
      >
        <pre className="profile-restore-preview">{restoreVersion?.content || '（空画像）'}</pre>
      </Modal>
    </section>
  );
}
