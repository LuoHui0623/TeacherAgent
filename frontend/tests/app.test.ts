import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { messages } from '../constants/messages';
import { settingsMenuItems } from '../modules/settings/settingsMenu';
import { sideNavItems } from '../shared/sideNavItems';
import { agentRoles } from '../services/settings/agentProfileService';
import { useWorkbenchStore } from '../services/workbenchStore';

describe('frontend smoke', () => {
  it('exposes the app title', () => {
    expect(messages.app.title).toBe('TeacherAgent');
  });

  it('exposes the agent role list', () => {
    expect(agentRoles).toEqual(['tutor', 'curriculum']);
  });

  it('moves user profile out of primary navigation and into Settings', () => {
    expect('profile' in messages.nav).toBe(false);
    expect(sideNavItems.some((item) => item.key === 'profile')).toBe(false);
    expect(settingsMenuItems.map((item) => item.label)).toEqual([
      '模型配置',
      '用户画像',
      '个性化美化',
    ]);
  });

  it('keeps module styles colocated outside the global stylesheet', () => {
    const moduleStyles = [
      '../modules/settings/AgentProfileModule.css',
      '../modules/bookshelf/BookshelfModule.css',
      '../modules/learning-zone/LearningZoneModule.css',
    ];

    for (const path of moduleStyles) {
      expect(existsSync(new URL(path, import.meta.url))).toBe(true);
    }

    const globalCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    expect(globalCss).not.toMatch(/\.(settings-page|bookshelf-page|reader-page|sandbox-block)\b/);
  });

  it('toggles the collapsed sidebar state', () => {
    const initial = useWorkbenchStore.getState().sidebarCollapsed;

    useWorkbenchStore.getState().toggleSidebar();
    expect(useWorkbenchStore.getState().sidebarCollapsed).toBe(!initial);

    useWorkbenchStore.getState().toggleSidebar();
    expect(useWorkbenchStore.getState().sidebarCollapsed).toBe(initial);
  });

  it('requires an id on every button declaration', () => {
    const roots = ['../modules', '../shared'].map((path) =>
      fileURLToPath(new URL(path, import.meta.url)),
    );
    const files = roots.flatMap(_walkTsx);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const tags = source.match(/<(?:button|Button)\b[\s\S]*?>/g) ?? [];

      for (const tag of tags) {
        expect(tag, `${file} 中的按钮缺少 id`).toMatch(/\bid=/);
      }
    }
  });
});

function _walkTsx(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = `${root}/${entry}`;
    if (statSync(path).isDirectory()) return _walkTsx(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

