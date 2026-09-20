import { useState } from 'react';

import { AgentProfileModule } from './AgentProfileModule';
import { PersonalizationPanel } from './PersonalizationPanel';
import { settingsMenuItems, type SettingsPanel } from './settingsMenu';
import { UserProfilePanel } from './UserProfilePanel';
import './SettingsModule.css';

export function SettingsModule() {
  const [activePanel, setActivePanel] = useState<SettingsPanel>('model-config');

  return (
    <section className="settings-workspace">
      <aside className="settings-menu">
        <header>
          <span>Settings</span>
          <h1>设置</h1>
        </header>
        <nav aria-label="设置菜单">
          {settingsMenuItems.map(({ key, label, description, icon: Icon }) => {
            const selected = key === activePanel;
            return (
              <button
                key={key}
                id={`settings-menu-${key}`}
                type="button"
                className={`settings-menu__item ${selected ? 'is-selected' : ''}`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => setActivePanel(key)}
              >
                <span className="settings-menu__icon">
                  <Icon size={18} weight={selected ? 'fill' : 'regular'} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="settings-workspace__content">
        {activePanel === 'model-config' && <AgentProfileModule />}
        {activePanel === 'user-profile' && <UserProfilePanel />}
        {activePanel === 'personalization' && <PersonalizationPanel />}
      </div>
    </section>
  );
}
